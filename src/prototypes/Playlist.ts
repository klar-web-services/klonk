import { Task, Railroad } from "./Task"

/**
 * @internal Internal assembly type that couples a task with its input builder.
 */
interface TaskBundle {
    task: Task<any, any, string>
    builder: (source: any, outputs: any) => any
}

/**
 * Options for controlling task retry behavior during playlist execution.
 */
export type PlaylistRunOptions = {
    /** Delay in ms between retries, or false to disable retries (fail immediately on task failure). */
    retryDelay?: number | false
    /** Maximum number of retries per task, or false for unlimited retries. */
    maxRetries?: number | false
}

/**
 * Returned by `Playlist.addTask()` - you must call `.input()` to provide the task's input builder.
 * 
 * If you see this type in an error message, it means you forgot to call `.input()` after `.addTask()`.
 */
export interface TaskInputRequired<
    TInput,
    TOutput,
    TIdent extends string,
    AllOutputTypes extends Record<string, any>,
    SourceType
> {
    /**
     * Provide the input builder for this task.
     * The builder receives the source and outputs from previous tasks.
     * 
     * Return `null` to skip this task - its output will be `null` in the outputs map.
     */
    input(builder: (source: SourceType, outputs: AllOutputTypes) => TInput | null): 
        Playlist<AllOutputTypes & { [K in TIdent]: Railroad<TOutput> | null }, SourceType>
}

/**
 * An ordered sequence of Tasks executed with strong type inference.
 *
 * As tasks are added via `.addTask`, their outputs are merged into the
 * accumulated `AllOutputTypes` map using the task's `ident` as a key. The
 * next task's input builder receives both the original `source` and the
 * strongly-typed `outputs` from all previous tasks.
 *
 * Typical sources:
 * - Workflow: the trigger event object.
 * - Machine: the current mutable state object.
 *
 * See README Code Examples for how to chain tasks and consume outputs.
 *
 * @template AllOutputTypes - Map of task idents to their `Railroad<Output>` results.
 * @template SourceType - The source object provided to `run`.
 */
export class Playlist<
        AllOutputTypes extends Record<string, any>,
        SourceType = unknown
    > {
    /**
     * Internal list of task + builder pairs in the order they will run.
     */
    bundles: TaskBundle[]

    /**
     * Optional finalizer invoked after all tasks complete (successfully or not).
     */
    finalizer?: (source: SourceType, outputs: Record<string, any>) => void | Promise<void>

    constructor(bundles: TaskBundle[] = [], finalizer?: (source: SourceType, outputs: Record<string, any>) => void | Promise<void>) {
        this.bundles = bundles;
        this.finalizer = finalizer;
    }

    /**
     * Append a task to the end of the playlist.
     * 
     * Returns an object with an `input` method that accepts a builder function.
     * The builder receives the source and all previous task outputs, and must
     * return the input shape required by the task.
     *
     * @example
     * playlist
     *     .addTask(new MyTask("myTask"))
     *     .input((source, outputs) => ({ value: source.startValue }))
     *     .addTask(new AnotherTask("another"))
     *     .input((source, outputs) => ({ 
     *         prev: outputs.myTask.success ? outputs.myTask.data : null 
     *     }))
     *
     * @template TInput - Input type required by the task.
     * @template TOutput - Output type produced by the task.
     * @template TIdent - The task's identifier (string literal).
     * @param task - The task instance to add.
     * @returns An object with an `input` method for providing the builder.
     */
    addTask<
        TInput,
        TOutput,
        const TIdent extends string
    >(
        task: Task<TInput, TOutput, TIdent>
    ): TaskInputRequired<TInput, TOutput, TIdent, AllOutputTypes, SourceType> {
        return {
            input: (builder: (source: SourceType, outputs: AllOutputTypes) => TInput) => {
                const bundle: TaskBundle = { task, builder: builder as any };
                const newBundles = [...this.bundles, bundle];
                return new Playlist(newBundles, this.finalizer)
            }
        }
    }

    /**
     * Register a callback to run after the playlist finishes. Use this hook to
     * react to the last task or to adjust machine state before a transition.
     *
     * Note: The callback receives the strongly-typed `outputs` and `source` objects.
     *
     * @param finalizer - Callback executed once after all tasks complete.
     * @returns This playlist for chaining.
     */
    finally(finalizer: (source: SourceType, outputs: AllOutputTypes) => void | Promise<void>): this {
        this.finalizer = finalizer as unknown as (source: SourceType, outputs: Record<string, any>) => void | Promise<void>;
        return this;
    }

    /**
     * Sleep helper for retry delays.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute all tasks in order, building each task's input via its builder
     * and storing each result under the task's ident in the outputs map.
     * If a builder returns `null`, the task is skipped and its output is `null`.
     * If a task's `validateInput` returns false, execution stops with an error.
     * 
     * When a task fails (`success: false`):
     * - If `retryDelay` is false, throws immediately
     * - Otherwise, retries after `retryDelay` ms until success or `maxRetries` exhausted
     * - If `maxRetries` is exhausted, throws an error
     *
     * @param source - The source object for this run (e.g., trigger event or machine state).
     * @param options - Optional retry settings for failed tasks.
     * @returns The aggregated, strongly-typed outputs map.
     */
    async run(source: SourceType, options: PlaylistRunOptions = {}): Promise<AllOutputTypes> {
        const { retryDelay = 1000, maxRetries = false } = options;
        const outputs: Record<string, any> = {};
    
        for (const bundle of this.bundles) {
            const input = bundle.builder(source, outputs);
            
            // Skip task if builder returns null
            if (input === null) {
                outputs[bundle.task.ident] = null;
                continue;
            }
            
            const isValid = await bundle.task.validateInput(input);
            if (!isValid) {
                throw new Error(`Input validation failed for task '${bundle.task.ident}'`);
            }

            let result = await bundle.task.run(input);
            
            // Retry logic for failed tasks
            if (!result.success) {
                // If retries are disabled, fail immediately
                if (retryDelay === false) {
                    throw result.error ?? new Error(`Task '${bundle.task.ident}' failed and retries are disabled`);
                }
                
                let retries = 0;
                while (!result.success) {
                    // Check if we've exhausted retries
                    if (maxRetries !== false && retries >= maxRetries) {
                        throw result.error ?? new Error(`Task '${bundle.task.ident}' failed after ${retries} retries`);
                    }
                    
                    await this.sleep(retryDelay);
                    retries++;
                    
                    // Re-run the task (input might depend on outputs, but for retries we use same input)
                    result = await bundle.task.run(input);
                }
            }
            
            outputs[bundle.task.ident] = result;
        }
        if (this.finalizer) {
            await this.finalizer(source, outputs);
        }
        return outputs as AllOutputTypes;
    }
}
