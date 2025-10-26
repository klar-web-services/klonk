import { afterEach, describe, expect, it, vi } from "vitest";
import { Machine, StateNode } from "./Machine";
import { Playlist } from "./Playlist";

type StateData = {
  log: string[];
  ready?: boolean;
};

const createLoggingPlaylist = (label: string) => {
  const playlist = new Playlist<{}, StateData>();
  vi.spyOn(playlist, "run").mockImplementation(async (state) => {
    state.log.push(label);
    return {} as any;
  });
  return playlist;
};

const createState = (ident: string, label: string) => {
  const node = StateNode.create<StateData>().setIdent(ident);
  node.setPlaylist(createLoggingPlaylist(label));
  return node;
};

const getAllStates = (machine: Machine<StateData>) => (machine as any).getAllStates() as StateNode<StateData>[];

afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("StateNode", () => {
  it("sorts transitions by weight and ignores throwing conditions", async () => {
    const source = StateNode.create<StateData>().setIdent("source");
    const target = StateNode.create<StateData>().setIdent("target");

    source.transitions = [
      {
        to: target,
        weight: 5,
        condition: async () => {
          throw new Error("boom");
        },
      },
      {
        to: target,
        weight: 1,
        condition: async () => true,
      },
    ];

    const next = await source.next({ log: [] });
    expect(next).toBe(target);
  });

  it("supports configuring playlists via a builder function", async () => {
    const node = StateNode.create<StateData>().setIdent("builder");
    const builder = vi.fn((p: Playlist<{}, StateData>) => {
      vi.spyOn(p, "run").mockResolvedValue({} as any);
      return p;
    });

    const returned = node.setPlaylist(builder);
    expect(returned).toBe(node);
    expect(builder).toHaveBeenCalled();
    await node.playlist.run({ log: [] });
  });

  it("returns null when node has no transitions", () => {
    const node = StateNode.create<StateData>().setIdent("solo");
    (node as any).transitions = undefined;
    expect(node.getByIdent("ghost")).toBeNull();
  });

  it("finds nested nodes by ident", () => {
    const root = StateNode.create<StateData>().setIdent("root");
    const child = StateNode.create<StateData>().setIdent("child");
    const leaf = StateNode.create<StateData>().setIdent("leaf");

    root.transitions = [{ to: child, weight: 1, condition: async () => true }];
    child.transitions = [{ to: leaf, weight: 1, condition: async () => true }];

    expect(root.getByIdent("leaf")).toBe(leaf);
    expect(root.getByIdent("missing")).toBeNull();
  });

  it("next returns null when there are no transitions", async () => {
    const node = StateNode.create<StateData>().setIdent("lonely");
    (node as any).transitions = undefined;
    expect(await node.next({ log: [] })).toBeNull();
  });

  it("falls back to insertion order when transition weights are missing", async () => {
    const node = StateNode.create<StateData>().setIdent("chooser");
    const first = StateNode.create<StateData>().setIdent("first");
    const second = StateNode.create<StateData>().setIdent("second");
    node.transitions = [
      { to: first, weight: undefined, condition: async () => false },
      { to: second, weight: undefined, condition: async () => true },
    ];

    const next = await node.next({ log: [] });
    expect(next).toBe(second);
  });

  it("avoids infinite recursion when nodes form a cycle", () => {
    const a = StateNode.create<StateData>().setIdent("a");
    const b = StateNode.create<StateData>().setIdent("b");
    a.transitions = [{ to: b, weight: 1, condition: async () => false }];
    b.transitions = [{ to: a, weight: 1, condition: async () => false }];

    expect(a.getByIdent("ghost")).toBeNull();
  });
});

describe("Machine", () => {
  it("requires an initial state before finalizing", () => {
    const machine = Machine.create<StateData>();
    const lone = createState("lone", "lone");
    machine.addState(lone);

    expect(() => machine.finalize()).toThrow("Cannot finalize a machine without an initial state or states to create.");
  });

  it("rejects duplicate state identifiers", () => {
    const machine = Machine.create<StateData>();
    const first = createState("dup", "first");
    const second = createState("dup", "second");

    machine.addState(first, { initial: true });
    machine.addState(second);

    expect(() => machine.finalize()).toThrow("Duplicate state ident 'dup'.");
  });

  it("enables verbose logging when requested", () => {
    const machine = Machine.create<StateData>();
    machine.addState(createState("only", "only"), { initial: true });

    machine.finalize({ ident: "verbose", verbose: true });
    expect(machine.ident).toBe("verbose");
  });

  it("throws when a state is missing an ident during finalization", () => {
    const machine = Machine.create<StateData>();
    const unnamed = StateNode.create<StateData>();
    machine.addState(unnamed, { initial: true });

    expect(() => machine.finalize()).toThrow("State missing ident.");
  });

  it("throws when a transition points to an unknown state", () => {
    const machine = Machine.create<StateData>();
    const start = createState("start", "start");
    start.addTransition({ to: "ghost", condition: async () => true, weight: 1 });
    machine.addState(start, { initial: true });

    expect(() => machine.finalize()).toThrow("State 'ghost' not found.");
  });

  it("throws if start is invoked before the machine is finalized", async () => {
    const machine = Machine.create<StateData>();
    machine.addState(createState("only", "only"), { initial: true });
    const stateData: StateData = { log: [] };
    await expect(machine.start(stateData)).rejects.toThrow("Cannot start a machine that is not finalized.");
  });

  it("throws if start is invoked without an initial state", async () => {
    const machine = Machine.create<StateData>();
    machine.finalized = true;
    const stateData: StateData = { log: [] };
    await expect(machine.start(stateData)).rejects.toThrow("Cannot start a machine without an initial state.");
  });

  it("throws if run is invoked before the machine is finalized", async () => {
    const machine = Machine.create<StateData>();
    machine.addState(createState("only", "only"), { initial: true });
    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData)).rejects.toThrow("Cannot run a machine that is not finalized.");
  });

  it("throws if run is invoked without an initial state", async () => {
    const machine = Machine.create<StateData>();
    machine.finalized = true;
    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData)).rejects.toThrow("Cannot run a machine without an initial state.");
  });

  it("getAllStates returns an empty array when no initial state is set", () => {
    const machine = Machine.create<StateData>();
    expect(getAllStates(machine)).toEqual([]);
  });

  it("getAllStates skips nodes without identifiers", () => {
    const machine = Machine.create<StateData>();
    const blank = StateNode.create<StateData>(); // ident remains empty
    (blank as any).transitions = undefined;
    machine.initialState = blank;
    expect(getAllStates(machine)).toEqual([]);
  });

  it("getAllStates traverses unique reachable states", () => {
    const start = createState("start", "start");
    const loop = createState("loop", "loop");
    start.addTransition({ to: "loop", condition: async () => true, weight: 1 });
    // duplicate transition to exercise visited branch
    start.addTransition({ to: "loop", condition: async () => true, weight: 2 });

    const machine = Machine.create<StateData>();
    machine.addState(start, { initial: true }).addState(loop);
    machine.finalize({ ident: "graph" });

    const states = getAllStates(machine);
    expect(states.map((state) => state.ident)).toEqual(["start", "loop"]);
  });

  it("getAllStates handles nodes whose transitions are undefined", () => {
    const machine = Machine.create<StateData>();
    const start = StateNode.create<StateData>().setIdent("start");
    (start as any).transitions = undefined;
    machine.initialState = start;
    expect(getAllStates(machine).map((state) => state.ident)).toEqual(["start"]);
  });

  it("runs playlists while transitioning until it reaches a leaf", async () => {
    const start = createState("start", "start");
    start.addTransition({ to: "middle", condition: async () => true, weight: 1 });

    const middle = createState("middle", "middle");
    middle.addTransition({ to: "end", condition: async () => true, weight: 1 });

    const end = createState("end", "end");

    const machine = Machine.create<StateData>();
    machine.addState(start, { initial: true }).addState(middle).addState(end);
    machine.finalize({ ident: "happy-path" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData);
    expect(stateData.log).toEqual(["start", "middle", "end"]);
  });

  it("completes immediately when the initial state has no transitions", async () => {
    const lone = createState("lone", "lone");
    const machine = Machine.create<StateData>();
    machine.addState(lone, { initial: true });
    machine.finalize({ ident: "single" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData);
    expect(stateData.log).toEqual(["lone"]);
  });

  it("respects preventRetry when no transitions are available", async () => {
    const start = createState("start", "start");
    start.preventRetry();
    start.addTransition({ to: "second", condition: async () => false, weight: 1 });
    const second = createState("second", "second");

    const machine = Machine.create<StateData>();
    machine.addState(start, { initial: true }).addState(second);
    machine.finalize({ ident: "no-retry" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData);
    expect(stateData.log).toEqual(["start"]);
  });

  it("retries until a transition becomes available", async () => {
    const start = createState("start", "start");
    start.retryDelayMs(1).retryLimit(3);
    start.addTransition({
      to: "finish",
      condition: async (state) => state.ready === true,
      weight: 1,
    });
    const finish = createState("finish", "finish");

    const machine = Machine.create<StateData>();
    machine.addState(start, { initial: true }).addState(finish);
    machine.finalize({ ident: "retry-success" });

    const stateData: StateData = { log: [], ready: false };
    const sleepSpy = vi.spyOn(machine as any, "sleep").mockImplementation(async () => {
      stateData.ready = true;
    });

    await machine.run(stateData);
    expect(stateData.log).toEqual(["start", "finish"]);
    expect(sleepSpy).toHaveBeenCalled();
    sleepSpy.mockRestore();
  });

  it("stops once the retry limit is exhausted", async () => {
    const start = createState("start", "start");
    start.retryDelayMs(1).retryLimit(2);
    start.addTransition({
      to: "finish",
      condition: async () => false,
      weight: 1,
    });

    const finish = createState("finish", "finish");

    const machine = Machine.create<StateData>();
    machine.addState(start, { initial: true }).addState(finish);
    machine.finalize({ ident: "retry-limit" });

    const stateData: StateData = { log: [] };
    const sleepSpy = vi.spyOn(machine as any, "sleep").mockResolvedValue(undefined);
    await machine.run(stateData);
    expect(stateData.log).toEqual(["start"]);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    sleepSpy.mockRestore();
  });

  it("returns when a transition loops back to the initial state", async () => {
    const start = createState("start", "start");
    start.addTransition({ to: "middle", condition: async () => true, weight: 2 });
    const middle = createState("middle", "middle");
    middle.addTransition({ to: "start", condition: async () => true, weight: 1 });
    const extra = createState("extra", "extra");
    start.addTransition({ to: "extra", condition: async () => false, weight: 1 });

    const machine = Machine.create<StateData>();
    machine.addState(start, { initial: true }).addState(middle).addState(extra);
    machine.finalize({ ident: "loop" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData);
    expect(stateData.log).toEqual(["start", "middle"]);
  });

  it("allows start() to tick through transitions on an interval", async () => {
    vi.useFakeTimers();

    const first = createState("first", "first");
    first.addTransition({
      to: "second",
      condition: async (state) => state.ready === true,
      weight: 1,
    });

    const second = createState("second", "second");

    const machine = Machine.create<StateData>();
    machine.addState(first, { initial: true }).addState(second);
    machine.finalize({ ident: "start-loop" });

    const stateData: StateData = { log: [], ready: false };
    await machine.start(stateData, { interval: 5 });
    expect(stateData.log).toEqual(["first"]);

    stateData.ready = true;
    await vi.advanceTimersByTimeAsync(5);

    expect(stateData.log).toEqual(["first", "second"]);
  });

  it("uses the default interval when none is provided", async () => {
    vi.useFakeTimers();

    const first = createState("first", "first");
    first.addTransition({
      to: "second",
      condition: async (state) => state.ready === true,
      weight: 1,
    });
    const second = createState("second", "second");

    const machine = Machine.create<StateData>();
    machine.addState(first, { initial: true }).addState(second);
    machine.finalize({ ident: "default-interval" });

    const stateData: StateData = { log: [], ready: false };
    await machine.start(stateData);
    expect(stateData.log).toEqual(["first"]);

    stateData.ready = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(stateData.log).toEqual(["first", "second"]);
  });

  it("resolves the internal sleep helper", async () => {
    vi.useFakeTimers();
    const machine = Machine.create<StateData>();
    const promise = (machine as any).sleep(25);
    await vi.advanceTimersByTimeAsync(25);
    await promise;
  });
});
