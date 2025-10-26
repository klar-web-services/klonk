/**
 * Event object produced by a `Trigger` and consumed by a `Workflow`.
 *
 * - `triggerIdent` lets a workflow that has multiple triggers disambiguate the source.
 * - `data` is the trigger-specific payload (e.g., webhook body, file metadata, etc.).
 *
 * @template IdentType - Trigger identifier (use a string literal).
 * @template T - Payload type emitted by this trigger.
 */
export type TriggerEvent<IdentType extends string, T> = {
    triggerIdent: IdentType;
    data: T;
}

/**
 * @internal Small FIFO queue used by Triggers to buffer events.
 */
class EventQueue<TEventType> {
    queue: TEventType[] = [];
    constructor(public size: number) {}

    push(item: TEventType): void {
        if (this.queue.length + 1 > this.size) {
            this.queue.shift()
        }
        this.queue.push(item);
    }

    shift(): TEventType | undefined {
        return this.queue.shift()
    }
    get length(): number {
        return this.queue.length
    }
}

export abstract class Trigger<IdentType extends string, TData> {
    public readonly ident: IdentType;
    protected readonly queue: EventQueue<TriggerEvent<IdentType, TData>>

    /**
     * Base class for event sources that feed Workflows.
     * Implementations should acquire resources in `start` and release them in `stop`.
     * Use `pushEvent` to enqueue new events; Workflows poll with `poll`.
     *
     * @param ident - Unique identifier for this trigger (use a string literal).
     * @param queueSize - Max events buffered (oldest are dropped when at capacity). Default: 50.
     */
    constructor(ident: IdentType, queueSize: number = 50) {
        this.ident = ident
        this.queue = new EventQueue(queueSize)
    }

    /**
     * Start the trigger (e.g., register webhooks, start intervals, open sockets).
     */
    public abstract start(): Promise<void>;

    /**
     * Stop the trigger and release any resources.
     */
    public abstract stop(): Promise<void>;

    /**
     * Enqueue an event for consumption by a Workflow.
     * Protected to avoid manual emission from outside trigger implementations.
     *
     * @param data - Event payload emitted by this trigger.
     */
    protected pushEvent(data: TData): void {
        this.queue.push({
            triggerIdent: this.ident,
            data: data,
        });
    }

    /**
     * Retrieve the next event in the buffer (or null if none available).
     * Workflows call this in their polling loop.
     */
    poll(): TriggerEvent<IdentType, TData> | null {
        const event = this.queue.shift();
        return event ?? null;
    }
}
