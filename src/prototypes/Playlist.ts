import { Task, Railroad } from "./Task"

/**
 * Function used to build the input for a Task from the Playlist context.
 *
 * @template SourceType - The source object passed to `run` (e.g., trigger event or machine state).
 * @template AllOutputTypes - Accumulated outputs from previously executed tasks.
 * @template TaskInputType - Concrete input type required by the target Task.
 */
type InputBuilder<SourceType, AllOutputTypes, TaskInputType> = (source: SourceType, outputs: AllOutputTypes) => TaskInputType

/**
 * @internal Internal assembly type that couples a task with its input builder.
 */
interface Machine<SourceType, AllOutputTypes, TaskInputType, TaskOutputType, IdentType extends string> {
	task: Task<TaskInputType, TaskOutputType, IdentType>
	builder: InputBuilder<SourceType, AllOutputTypes, TaskInputType>
}

/**
 * Prevent TypeScript from inferring `T` from a builder argument so that the
 * task definition remains the source of truth. Useful for preserving safety
 * when chaining `.addTask` calls.
 */
type NoInfer<T> = [T][T extends any ? 0 : never]

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
    machines: Machine<any, any, any, any, string>[]

    /**
     * Optional finalizer invoked after all tasks complete (successfully or not).
     */
    finalizer?: (source: SourceType, outputs: Record<string, any>) => void | Promise<void>

    constructor(machines: Machine<any, any, any, any, string>[] = [], finalizer?: (source: SourceType, outputs: Record<string, any>) => void | Promise<void>) {
        this.machines = machines;
        this.finalizer = finalizer;
    }

    /**
     * Append a task to the end of the playlist.
     *
     * The task's `ident` is used as a key in the aggregated `outputs` object made
     * available to subsequent builders. The value under that key is the task's
     * `Railroad<Output>` result, enabling type-safe success/error handling.
     *
     * @template TaskInputType - Input required by the task.
     * @template TaskOutputType - Output produced by the task.
     * @template IdentType - The task's ident (string literal recommended).
     * @param task - The task instance to run at this step.
     * @param builder - Function that builds the task input from `source` and prior `outputs`.
     * @returns A new Playlist with the output map extended to include this task's result.
     */
    addTask<
        TaskInputType,
        TaskOutputType,
        const IdentType extends string
    >(
		task: Task<TaskInputType, TaskOutputType, IdentType> & { ident: IdentType },
		builder: (source: SourceType, outputs: AllOutputTypes) => NoInfer<TaskInputType>
    ): Playlist<AllOutputTypes & { [K in IdentType]: Railroad<TaskOutputType> }, SourceType> {
        const machine = { task, builder: builder as any };
        const newMachines = [...this.machines, machine];
        return new Playlist<AllOutputTypes & { [K in IdentType]: Railroad<TaskOutputType> }, SourceType>(newMachines, this.finalizer)
    }

    /**
     * Register a callback to run after the playlist finishes. Use this hook to
     * react to the last task or to adjust machine state before a transition.
     *
     * Note: The callback receives the strongly-typed `outputs` object.
     *
     * @param finalizer - Callback executed once after all tasks complete.
     * @returns This playlist for chaining.
     */
    finally(finalizer: (source: SourceType, outputs: AllOutputTypes) => void | Promise<void>): this {
        this.finalizer = finalizer as unknown as (source: SourceType, outputs: Record<string, any>) => void | Promise<void>;
        return this;
    }

    /**
     * Execute all tasks in order, building each task's input via its builder
     * and storing each result under the task's ident in the outputs map.
     * If a task's `validateInput` returns false, execution stops with an error.
     *
     * @param source - The source object for this run (e.g., trigger event or machine state).
     * @returns The aggregated, strongly-typed outputs map.
     */
    async run(source: SourceType): Promise<AllOutputTypes> {
        const outputs: Record<string, any> = {};
    
        for (const machine of this.machines) {
            const input = machine.builder(source, outputs);
            
            const isValid = await machine.task.validateInput(input);
            if (!isValid) {
                throw new Error(`Input validation failed for task '${machine.task.ident}'`);
            }

            const result = await machine.task.run(input);
            outputs[machine.task.ident] = result;
        }
        if (this.finalizer) {
            await this.finalizer(source, outputs);
        }
        return outputs as AllOutputTypes;
    }
}
