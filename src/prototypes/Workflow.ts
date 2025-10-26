import { Playlist } from "./Playlist"
import { Trigger, type TriggerEvent } from "./Trigger"

/**
 * Connects one or more `Trigger`s to a `Playlist`.
 * When a trigger emits an event, the playlist runs with that event as `source`.
 *
 * - Add triggers with `addTrigger`.
 * - Configure the playlist using `setPlaylist(p => p.addTask(...))`.
 * - Start polling with `start`, optionally receiving a callback when a run completes.
 *
 * See README Code Examples for building a full workflow.
 *
 * @template AllTriggerEvents - Union of all trigger event shapes in this workflow.
 * @template TAllOutputs - Aggregated outputs map shape produced by the playlist.
 * @template TPlaylist - Concrete playlist type or `null` before configuration.
 */
export class Workflow<
        AllTriggerEvents extends TriggerEvent<string, any>,
        TAllOutputs extends Record<string, any>,
        TPlaylist extends Playlist<TAllOutputs, AllTriggerEvents> | null
> {
    playlist: TPlaylist;
    triggers: Trigger<string, any>[];

    constructor(triggers: Trigger<string, any>[], playlist: TPlaylist) {
        this.triggers = triggers;
        this.playlist = playlist;
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
    ): Workflow<AllTriggerEvents | TriggerEvent<TIdent, TData>,
                TAllOutputs,
                Playlist<TAllOutputs, AllTriggerEvents | TriggerEvent<TIdent, TData>> | null
               >{
        const newTriggers = [...this.triggers, trigger] as Trigger<string, AllTriggerEvents | TriggerEvent<TIdent, TData>>[];
        const newPlaylist = this.playlist as Playlist<TAllOutputs, AllTriggerEvents | TriggerEvent<TIdent, TData>> | null;

        return new Workflow(newTriggers, newPlaylist)
    }

    /**
     * Configure the playlist by providing a builder that starts from an empty
     * `Playlist<{}, AllTriggerEvents>` and returns your fully configured playlist.
     *
     * This method ensures type inference flows from your tasks and idents into
     * the resulting `TBuilderOutputs` map used by the workflow's callback.
     *
     * @template TBuilderOutputs - Aggregated outputs map (deduced from your tasks).
     * @template TFinalPlaylist - Concrete playlist type returned by the builder.
     * @param builder - Receives an empty playlist and must return a configured one.
     * @returns A new Workflow with the concrete playlist and output types.
     */
    setPlaylist<
        TBuilderOutputs extends Record<string, any>,
        TFinalPlaylist extends Playlist<TBuilderOutputs, AllTriggerEvents>
    >(
        builder: (p: Playlist<{}, AllTriggerEvents>) => TFinalPlaylist
    ): Workflow<AllTriggerEvents, TBuilderOutputs, TFinalPlaylist> {
        const initialPlaylist = new Playlist<{}, AllTriggerEvents>();
        const finalPlaylist = builder(initialPlaylist);
        return new Workflow(this.triggers, finalPlaylist);
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
        callback?: (source: AllTriggerEvents, outputs: TAllOutputs) => any 
    } = {}): Promise<void> {
        if (!this.playlist) {
            throw new Error("Cannot start a workflow without a playlist.");
        }

        for (const trigger of this.triggers) {
            await trigger.start();
        }

        const runTick = async () => {
            for (const trigger of this.triggers) {
                const event = trigger.poll();
                if (event) {
                    try {
                        const outputs = await this.playlist!.run(event as AllTriggerEvents);
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
    public static create(): Workflow<never, {}, null> {
        return new Workflow<never, {}, null>([], null);
    }
}
