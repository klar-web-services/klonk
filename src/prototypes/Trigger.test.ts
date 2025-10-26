import { describe, expect, it, vi } from "vitest";
import { Trigger, type TriggerEvent } from "./Trigger";

type Payload = { message: string };
type Ident = "mock";

class TestTrigger extends Trigger<Ident, Payload> {
  public start = vi.fn(async () => {
    this.pushEvent({ message: "started" });
  });

  public stop = vi.fn(async () => {
    this.pushEvent({ message: "stopped" });
  });

  public emit(payload: Payload): void {
    this.pushEvent(payload);
  }

  public bufferedCount(): number {
    return this.queue.length;
  }
}

describe("Trigger", () => {
  it("wraps data with the trigger ident when emitting events", () => {
    const trigger = new TestTrigger("mock", 5);
    trigger.emit({ message: "hello" });
    const event = trigger.poll();
    expect(event).toEqual<TriggerEvent<Ident, Payload>>({
      triggerIdent: "mock",
      data: { message: "hello" }
    });
  });

  it("returns null when no events are queued", () => {
    const trigger = new TestTrigger("mock");
    expect(trigger.poll()).toBeNull();
  });

  it("drops oldest events when the queue hits capacity", () => {
    const trigger = new TestTrigger("mock", 2);
    trigger.emit({ message: "first" });
    trigger.emit({ message: "second" });
    trigger.emit({ message: "third" });

    expect(trigger.bufferedCount()).toBe(2);
    const first = trigger.poll();
    expect(first?.data.message).toBe("second");
    const second = trigger.poll();
    expect(second?.data.message).toBe("third");
    expect(trigger.poll()).toBeNull();
    expect(trigger.bufferedCount()).toBe(0);
  });

  it("lets concrete implementations enqueue events during start/stop", async () => {
    const trigger = new TestTrigger("mock");
    await trigger.start();
    await trigger.stop();

    const startEvent = trigger.poll();
    const stopEvent = trigger.poll();

    expect(startEvent?.data.message).toBe("started");
    expect(stopEvent?.data.message).toBe("stopped");
    expect(trigger.poll()).toBeNull();
  });
});
