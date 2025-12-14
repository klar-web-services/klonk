import { Playlist, type PlaylistRunOptions } from "./Playlist"
import { Trigger, type TriggerEvent } from "./Trigger"

/**
 * Connects one or more `Trigger`s to a `Playlist`.
 * When a trigger emits an event, the playlist runs with that event as `source`.
 *
 * - Add triggers with `addTrigger`.
 * - Configure the playlist using `setPlaylist(p => p.addTask(...))`.
 * - Configure retry behavior with `retryDelayMs`, `retryLimit`, or `preventRetry`.
 * - Start polling with `start`, optionally receiving a callback when a run completes.
 *
 * See README Code Examples for building a full workflow.
 *
 * @template AllTriggerEvents - Union of all trigger event shapes in this workflow.
 */
export class Workflow<AllTriggerEvents extends TriggerEvent<string, any>> {
    playlist: Playlist<any, AllTriggerEvents> | null;
    triggers: Trigger<string, any>[];
    retry: false | number;
    maxRetries: false | number;

    constructor(
        triggers: Trigger<string, any>[], 
        playlist: Playlist<any, AllTriggerEvents> | null,
        retry: false | number = 1000,
        maxRetries: false | number = false
    ) {
        this.triggers = triggers;
        this.playlist = playlist;
        this.retry = retry;
        this.maxRetries = maxRetries;
    }

    /**
     * Register a new trigger to feed events into the workflow.
     * The resulting workflow type widens its `AllTriggerEvents` union accordingly.
     *
     * @template TIdent - Trigger ident (string literal recommended).
     * @template TData - Payload type emitted by the trigger.
     * @param trigger - The trigger instance to add.
     * @returns A new Workflow instance with updated event type.
     */
    addTrigger<const TIdent extends string, TData>(
        trigger: Trigger<TIdent, TData>
    ): Workflow<AllTriggerEvents | TriggerEvent<TIdent, TData>> {
        const newTriggers = [...this.triggers, trigger];
        const newPlaylist = this.playlist as Playlist<any, AllTriggerEvents | TriggerEvent<TIdent, TData>> | null;
        return new Workflow(newTriggers, newPlaylist, this.retry, this.maxRetries)
    }

    /**
     * Disable retry behavior for failed tasks. Tasks that fail will throw immediately.
     *
     * @returns This workflow for chaining.
     */
    preventRetry(): Workflow<AllTriggerEvents> {
        return new Workflow(this.triggers, this.playlist, false, this.maxRetries);
    }

    /**
     * Set the delay between retry attempts for failed tasks.
     *
     * @param delayMs - Delay in milliseconds between retries.
     * @returns This workflow for chaining.
     */
    retryDelayMs(delayMs: number): Workflow<AllTriggerEvents> {
        return new Workflow(this.triggers, this.playlist, delayMs, this.maxRetries);
    }

    /**
     * Set the maximum number of retries for failed tasks.
     * Use `preventRetry()` to disable retries entirely.
     *
     * @param maxRetries - Maximum number of retry attempts before throwing.
     * @returns This workflow for chaining.
     */
    retryLimit(maxRetries: number): Workflow<AllTriggerEvents> {
        return new Workflow(this.triggers, this.playlist, this.retry, maxRetries);
    }

    /**
     * Configure the playlist by providing a builder that starts from an empty
     * `Playlist<{}, AllTriggerEvents>` and returns your fully configured playlist.
     *
     * @param builder - Receives an empty playlist and must return a configured one.
     * @returns A new Workflow with the configured playlist.
     */
    setPlaylist(
        builder: (p: Playlist<{}, AllTriggerEvents>) => Playlist<any, AllTriggerEvents>
    ): Workflow<AllTriggerEvents> {
        const initialPlaylist = new Playlist<{}, AllTriggerEvents>();
        const finalPlaylist = builder(initialPlaylist);
        return new Workflow(this.triggers, finalPlaylist, this.retry, this.maxRetries);
    }

    /**
     * Begin polling triggers and run the playlist whenever an event is available.
     * The loop uses `setTimeout` with the given `interval` and returns immediately.
     *
     * @param interval - Polling interval in milliseconds (default 5000ms).
     * @param callback - Optional callback executed after each successful playlist run.
     * @throws If called before a playlist is configured.
     */
    async start({interval = 5000, callback}: {
        interval?: number, 
        callback?: (source: AllTriggerEvents, outputs: Record<string, any>) => any 
    } = {}): Promise<void> {
        if (!this.playlist) {
            throw new Error("Cannot start a workflow without a playlist.");
        }

        for (const trigger of this.triggers) {
            await trigger.start();
        }

        const runOptions: PlaylistRunOptions = {
            retryDelay: this.retry,
            maxRetries: this.maxRetries
        };

        const runTick = async () => {
            for (const trigger of this.triggers) {
                const event = trigger.poll();
                if (event) {
                    try {
                        const outputs = await this.playlist!.run(event as AllTriggerEvents, runOptions);
                        if (callback) {
                            callback(event as AllTriggerEvents, outputs);
                        }
                    } catch (error) {
                        console.error(`[Workflow] Error during playlist execution for trigger '${event.triggerIdent}':`, error);
                    }
                }
            }
            setTimeout(runTick, interval);
        };

        runTick();
    }

    /**
     * Create a new, empty workflow. Add triggers and set a playlist before starting.
     */
    public static create(): Workflow<never> {
        return new Workflow<never>([], null);
    }
}
