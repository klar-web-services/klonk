import { Playlist } from "./Playlist"
import { Trigger, type TriggerEvent } from "./Trigger"

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

    public static create(): Workflow<never, {}, null> {
        return new Workflow<never, {}, null>([], null);
    }
}