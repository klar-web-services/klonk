import { describe, expect, it, vi, afterEach } from "vitest";
import { Workflow } from "./Workflow";
import { Playlist } from "./Playlist";
import { Trigger, type TriggerEvent } from "./Trigger";

type Payload = { value: number };
type Ident = "workflow-trigger";

class TestTrigger extends Trigger<Ident, Payload> {
  public start = vi.fn(async () => {});
  public stop = vi.fn(async () => {});

  constructor(ident: Ident) {
    super(ident);
  }

  emit(payload: Payload): void {
    this.pushEvent(payload);
  }
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Workflow", () => {
  it("adds triggers immutably", () => {
    const trigger = new TestTrigger("workflow-trigger");
    const base = Workflow.create();
    const extended = base.addTrigger(trigger);

    expect(base.triggers).toHaveLength(0);
    expect(extended.triggers).toEqual([trigger]);
  });

  it("configures retry settings with preventRetry", () => {
    const workflow = Workflow.create()
      .addTrigger(new TestTrigger("workflow-trigger"))
      .preventRetry();
    
    expect(workflow.retry).toBe(false);
    expect(workflow.maxRetries).toBe(false); // unchanged
  });

  it("configures retry settings with retryDelayMs", () => {
    const workflow = Workflow.create()
      .addTrigger(new TestTrigger("workflow-trigger"))
      .retryDelayMs(500);
    
    expect(workflow.retry).toBe(500);
    expect(workflow.maxRetries).toBe(false); // unchanged
  });

  it("configures retry settings with retryLimit", () => {
    const workflow = Workflow.create()
      .addTrigger(new TestTrigger("workflow-trigger"))
      .retryLimit(3);
    
    expect(workflow.retry).toBe(1000); // unchanged default
    expect(workflow.maxRetries).toBe(3);
  });

  it("chains retry configuration methods", () => {
    const workflow = Workflow.create()
      .addTrigger(new TestTrigger("workflow-trigger"))
      .retryDelayMs(250)
      .retryLimit(5);
    
    expect(workflow.retry).toBe(250);
    expect(workflow.maxRetries).toBe(5);
  });

  it("configures playlists via the builder", () => {
    const workflow = Workflow.create().addTrigger(new TestTrigger("workflow-trigger"));
    const playlist = new Playlist<{}, TriggerEvent<Ident, Payload>>();

    const configured = workflow.setPlaylist(() => playlist);
    expect(configured.playlist).toBe(playlist);
  });

  it("throws if start is called before configuring a playlist", async () => {
    const workflow = Workflow.create().addTrigger(new TestTrigger("workflow-trigger"));
    await expect(workflow.start()).rejects.toThrow("Cannot start a workflow without a playlist.");
  });

  it("polls triggers and runs the playlist with callback notifications", async () => {
    vi.useFakeTimers();

    const trigger = new TestTrigger("workflow-trigger");
    const workflow = Workflow.create().addTrigger(trigger);
    let capturedPlaylist: Playlist<{ result: string }, TriggerEvent<Ident, Payload>>;

    const configured = workflow.setPlaylist((p) => {
      capturedPlaylist = p as Playlist<{ result: string }, TriggerEvent<Ident, Payload>>;
      vi.spyOn(capturedPlaylist, "run").mockResolvedValue({ result: "done" });
      return capturedPlaylist;
    });

    const callback = vi.fn();
    const callbackPromise = new Promise<[TriggerEvent<Ident, Payload>, { result: string }]>((resolve) => {
      callback.mockImplementation((event, outputs) => {
        resolve([event, outputs]);
      });
    });

    trigger.emit({ value: 42 });
    await configured.start({ interval: 25, callback });

    const [eventArg, outputsArg] = await callbackPromise;
    expect(trigger.start).toHaveBeenCalledTimes(1);
    expect(capturedPlaylist!.run).toHaveBeenCalledWith(eventArg, {
      retryDelay: 1000,
      maxRetries: false
    });
    expect(eventArg).toEqual<TriggerEvent<Ident, Payload>>({
      triggerIdent: "workflow-trigger",
      data: { value: 42 },
    });
    expect(outputsArg).toEqual({ result: "done" });

    await vi.advanceTimersByTimeAsync(25);
  });

  it("processes events even when no callback is supplied", async () => {
    vi.useFakeTimers();

    const trigger = new TestTrigger("workflow-trigger");
    const workflow = Workflow.create().addTrigger(trigger);
    let capturedPlaylist: Playlist<{ done: boolean }, TriggerEvent<Ident, Payload>>;

    const configured = workflow.setPlaylist((p) => {
      capturedPlaylist = p as Playlist<{ done: boolean }, TriggerEvent<Ident, Payload>>;
      return capturedPlaylist;
    });

    const runPromise = new Promise<void>((resolve) => {
      vi.spyOn(configured.playlist!, "run").mockImplementation(async () => {
        resolve();
        return { done: true };
      });
    });

    trigger.emit({ value: 7 });
    await configured.start({ interval: 20 });
    await runPromise;
    await vi.advanceTimersByTimeAsync(20);
    expect(capturedPlaylist!.run).toHaveBeenCalled();
  });

  it("logs errors when playlist execution fails", async () => {
    vi.useFakeTimers();

    const trigger = new TestTrigger("workflow-trigger");
    const workflow = Workflow.create().addTrigger(trigger);
    const configured = workflow.setPlaylist((p) => {
      vi.spyOn(p, "run").mockRejectedValue(new Error("boom"));
      return p;
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const errorPromise = new Promise<void>((resolve) => {
      errorSpy.mockImplementationOnce(() => {
        resolve();
      });
    });

    trigger.emit({ value: -1 });
    await configured.start({ interval: 10 });
    await errorPromise;

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[Workflow] Error during playlist execution"), expect.any(Error));
    errorSpy.mockRestore();
  });
});
