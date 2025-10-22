export type TriggerEvent<IdentType extends string, T> = {
    triggerIdent: IdentType;
    data: T;
}

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

    constructor(ident: IdentType, queueSize: number = 50) {
        this.ident = ident
        this.queue = new EventQueue(queueSize)
    }

    public abstract start(): Promise<void>;

    public abstract stop(): Promise<void>;

    protected pushEvent(data: TData): void {
        this.queue.push({
            triggerIdent: this.ident,
            data: data,
        });
    }

    poll(): TriggerEvent<IdentType, TData> | null {
        const event = this.queue.shift();
        return event ?? null;
    }
}