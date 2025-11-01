import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
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

  it("prefers insertion order when weights are equal and multiple conditions are true", async () => {
    const node = StateNode.create<StateData>().setIdent("chooser-eq");
    const first = StateNode.create<StateData>().setIdent("first");
    const second = StateNode.create<StateData>().setIdent("second");

    node.transitions = [
      { to: first, weight: 1, condition: async () => true },
      { to: second, weight: 1, condition: async () => true },
    ];

    const next = await node.next({ log: [] });
    expect(next).toBe(first);
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

  it("sets ident when provided", () => {
    const machine = Machine.create<StateData>();
    machine.addState(createState("only", "only"), { initial: true });

    machine.finalize({ ident: "custom-ident" });
    expect(machine.ident).toBe("custom-ident");
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

  // it("throws if start is invoked before the machine is finalized", async () => {
  //   const machine = Machine.create<StateData>();
  //   machine.addState(createState("only", "only"), { initial: true });
  //   const stateData: StateData = { log: [] };
  //   await expect(machine.start(stateData)).rejects.toThrow("Cannot start a machine that is not finalized.");
  // });

  // it("throws if start is invoked without an initial state", async () => {
  //   const machine = Machine.create<StateData>();
  //   machine.finalized = true;
  //   const stateData: StateData = { log: [] };
  //   await expect(machine.start(stateData)).rejects.toThrow("Cannot start a machine without an initial state.");
  // });

  it("throws if run is invoked before the machine is finalized", async () => {
    const machine = Machine.create<StateData>();
    machine.addState(createState("only", "only"), { initial: true });
    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData, { mode: "any" })).rejects.toThrow("Cannot run a machine that is not finalized.");
  });

  it("throws if run is invoked without an initial state", async () => {
    const machine = Machine.create<StateData>();
    machine.finalized = true;
    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData, { mode: "any" })).rejects.toThrow("Cannot run a machine without an initial state.");
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
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["start", "middle", "end"]);
  });

  it("completes immediately when the initial state has no transitions", async () => {
    const lone = createState("lone", "lone");
    const machine = Machine.create<StateData>();
    machine.addState(lone, { initial: true });
    machine.finalize({ ident: "single" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData, { mode: "any" });
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
    await machine.run(stateData, { mode: "any" });
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

    await machine.run(stateData, { mode: "any" });
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
    await machine.run(stateData, { mode: "any" });
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
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["start", "middle"]);
  });

  // it("allows start() to tick through transitions on an interval", async () => {
  //   vi.useFakeTimers();

  //   const first = createState("first", "first");
  //   first.addTransition({
  //     to: "second",
  //     condition: async (state) => state.ready === true,
  //     weight: 1,
  //   });

  //   const second = createState("second", "second");

  //   const machine = Machine.create<StateData>();
  //   machine.addState(first, { initial: true }).addState(second);
  //   machine.finalize({ ident: "start-loop" });

  //   const stateData: StateData = { log: [], ready: false };
  //   await machine.start(stateData, { interval: 5 });
  //   expect(stateData.log).toEqual(["first"]);

  //   stateData.ready = true;
  //   await vi.advanceTimersByTimeAsync(5);

  //   expect(stateData.log).toEqual(["first", "second"]);
  // });

  it("stops and propagates errors when a task throws", async () => {
    const machine = Machine.create<StateData>();
    const start = createState("start", "start");
    const throwingState = StateNode.create<StateData>().setIdent("throwing");
    const playlist = new Playlist<{}, StateData>();
    vi.spyOn(playlist, "run").mockImplementation(async () => {
      throw new Error("Task failed!");
    });
    throwingState.setPlaylist(playlist);

    start.addTransition({ to: "throwing", condition: async () => true, weight: 1 });

    machine.addState(start, { initial: true }).addState(throwingState).finalize();

    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData, { mode: "any" })).rejects.toThrow("Task failed!");
  });

  // it("uses the default interval when none is provided", async () => {
  //   vi.useFakeTimers();

  //   const first = createState("first", "first");
  //   first.addTransition({
  //     to: "second",
  //     condition: async (state) => state.ready === true,
  //     weight: 1,
  //   });
  //   const second = createState("second", "second");

  //   const machine = Machine.create<StateData>();
  //   machine.addState(first, { initial: true }).addState(second);
  //   machine.finalize({ ident: "default-interval" });

  //   const stateData: StateData = { log: [], ready: false };
  //   await machine.start(stateData);
  //   expect(stateData.log).toEqual(["first"]);

  //   stateData.ready = true;
  //   await vi.advanceTimersByTimeAsync(1000);
  //   expect(stateData.log).toEqual(["first", "second"]);
  // });

  it("resolves the internal sleep helper", async () => {
    vi.useFakeTimers();
    const machine = Machine.create<StateData>();
    const promise = (machine as any).sleep(25);
    await vi.advanceTimersByTimeAsync(25);
    await promise;
  });
});

describe("Machine logger injection", () => {
  it("addLogger is a no-op when no initial state is set", () => {
    const machine = Machine.create<StateData>();
    const dummyLogger = {
      info: () => {},
      error: () => {},
      debug: () => {},
      fatal: () => {},
      warn: () => {},
      trace: () => {},
    } as any;
    machine.addLogger(dummyLogger);
  });

  it("addLogger handles nodes whose transitions are undefined", () => {
    const machine = Machine.create<StateData>();
    const blank = StateNode.create<StateData>().setIdent("blank");
    (blank as any).transitions = undefined;
    machine.initialState = blank;

    const dummyLogger = {
      info: () => {},
      error: () => {},
      debug: () => {},
      fatal: () => {},
      warn: () => {},
      trace: () => {},
    } as any;

    machine.addLogger(dummyLogger);
    expect((blank as any).logger).toBe(dummyLogger);
  });

  it("addLogger propagates to all reachable states after finalize", async () => {
    const machine = Machine.create<StateData>();
    const a = createState("a", "a");
    const b = createState("b", "b");
    a.addTransition({ to: "b", condition: async () => true, weight: 1 });
    // duplicate transition to exercise visited duplicate path
    a.addTransition({ to: "b", condition: async () => true, weight: 2 });
    // self-loop to exercise false branch in traversal push condition
    b.addTransition({ to: "b", condition: async () => true, weight: 1 });
    machine.addState(a, { initial: true }).addState(b).finalize({ ident: "logger-test" });

    const collected: any[] = [];
    const dummyLogger = {
      info: (...args: any[]) => collected.push(["info", ...args]),
      error: () => {},
      debug: () => {},
      fatal: () => {},
      warn: () => {},
      trace: () => {},
    } as any;

    machine.addLogger(dummyLogger);

    // State loggers should be set to dummyLogger
    const all = getAllStates(machine);
    expect((all[0] as any).logger).toBe(dummyLogger);
    expect((all[1] as any).logger).toBe(dummyLogger);
  });
});

describe("Machine 'run' method with options", () => {
  type RunTestStateData = { log: string[]; counter: number; goToLeaf: boolean };

  // Creates a state that just logs its label
  const createRunTestState = (ident: string, label: string) => {
    const node = StateNode.create<RunTestStateData>().setIdent(ident);
    const playlist = new Playlist<{}, RunTestStateData>();
    vi.spyOn(playlist, "run").mockImplementation(async (state) => {
      state.log.push(label);
      return {} as any;
    });
    node.setPlaylist(playlist);
    return node;
  };

  // Creates a state that logs and increments a counter
  const createIncrementingState = (ident: string, label: string) => {
    const node = StateNode.create<RunTestStateData>().setIdent(ident);
    const playlist = new Playlist<{}, RunTestStateData>();
    vi.spyOn(playlist, "run").mockImplementation(async (state) => {
      state.log.push(label);
      state.counter = (state.counter || 0) + 1;
      return {} as any;
    });
    node.setPlaylist(playlist);
    return node;
  };

  let machine: Machine<RunTestStateData>;

  beforeEach(() => {
    machine = Machine.create<RunTestStateData>();
    const stateA = createRunTestState("A", "A");
    const stateB = createIncrementingState("B", "B");
    const stateC = createRunTestState("C", "C");
    const stateD = createRunTestState("D", "D");
    const stateE = createRunTestState("E", "E");
    const stateF = createRunTestState("F", "F (leaf)");

    stateA.addTransition({ to: "B", condition: async () => true, weight: 1 });
    stateB.addTransition({ to: "C", condition: async () => true, weight: 1 });
    stateC.addTransition({ to: "B", condition: async (state) => state.counter < 3, weight: 3 });
    stateC.addTransition({ to: "F", condition: async (state) => state.counter >= 3 && state.goToLeaf, weight: 2 });
    stateC.addTransition({ to: "D", condition: async (state) => state.counter >= 3 && !state.goToLeaf, weight: 1 });
    stateD.addTransition({ to: "E", condition: async () => true, weight: 1 });
    stateE.addTransition({ to: "A", condition: async () => true, weight: 1 });

    machine
      .addState(stateA, { initial: true })
      .addState(stateB)
      .addState(stateC)
      .addState(stateD)
      .addState(stateE)
      .addState(stateF)
      .finalize();
  });

  it("mode: 'leaf' stops at a leaf node", async () => {
    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: true };
    await machine.run(stateData, { mode: "leaf" });
    expect(stateData.log.at(-1)).toBe("F (leaf)");
    expect(stateData.counter).toBe(3);
  });

  it("mode: 'roundtrip' stops when returning to the initial state", async () => {
    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "roundtrip" });
    expect(stateData.log).toEqual(["A", "B", "C", "B", "C", "B", "C", "D", "E"]);
    expect(stateData.counter).toBe(3);
  });

  it("mode: 'any' stops on roundtrip for a looping machine", async () => {
    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A", "B", "C", "B", "C", "B", "C", "D", "E"]);
    expect(stateData.counter).toBe(3);
  });

  it("mode: 'any' stops on a leaf if that is the first terminal condition", async () => {
    const machine = Machine.create<RunTestStateData>();
    const stateA = createRunTestState("A", "A (leaf)");
    machine.addState(stateA, { initial: true }).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A (leaf)"]);
  });

  it("mode: 'roundtrip' ignores a leaf node to complete the trip", async () => {
    const machine = Machine.create<RunTestStateData>();
    const stateA = createRunTestState("A", "A");
    const stateB = createRunTestState("B", "B (leaf)"); // Will be ignored
    stateA.addTransition({ to: "A", condition: async () => true, weight: 1 });
    machine.addState(stateA, { initial: true }).addState(stateB).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "roundtrip" });
    expect(stateData.log).toEqual(["A"]);
  });

  it("mode: 'leaf' ignores a roundtrip to stop at a leaf", async () => {
    const machine = Machine.create<RunTestStateData>();
    const stateA = createRunTestState("A", "A");
    const stateB = createRunTestState("B", "B (leaf)");
    stateA.addTransition({ to: "B", condition: async () => true, weight: 2 });
    stateA.addTransition({ to: "A", condition: async () => true, weight: 1 }); // roundtrip path
    machine.addState(stateA, { initial: true }).addState(stateB).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "leaf" });
    expect(stateData.log).toEqual(["A", "B (leaf)"]);
  });

  it("mode: 'any' stops when all states are visited", async () => {
    const machine = Machine.create<RunTestStateData>();
    const stateA = createRunTestState("A", "A");
    const stateB = createRunTestState("B", "B");
    stateA.addTransition({ to: "B", condition: async () => true, weight: 1 });
    machine.addState(stateA, { initial: true }).addState(stateB).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A", "B"]);
  });

  it("mode: 'infinitely' does not stop at a leaf when retries are disabled", async () => {
    const machine = Machine.create<RunTestStateData>();
    const leaf = createRunTestState("leaf", "leaf").preventRetry();
    machine.addState(leaf, { initial: true }).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    // Should not stop at the leaf check, but will stop because retries are disabled
    await machine.run(stateData, { mode: "infinitely" });
    expect(stateData.log).toEqual(["leaf"]);
  });

  it("mode: 'infinitely' does not stop on roundtrip", async () => {
    const machine = Machine.create<RunTestStateData>();
    const a = createRunTestState("A", "A");
    const b = createRunTestState("B", "B");
    a.addTransition({ to: "B", condition: async () => true, weight: 1 });
    b.addTransition({ to: "A", condition: async () => true, weight: 1 });

    machine.addState(a, { initial: true }).addState(b).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "infinitely", stopAfter: 2, interval: 1 });
    // We should have completed A -> B -> A (but stopAfter returns after second transition)
    expect(stateData.log[0]).toBe("A");
    expect(stateData.log[1]).toBe("B");
  });

  it("mode: 'any' continues loop without sleeping (non-infinitely path)", async () => {
    const machine = Machine.create<RunTestStateData>();
    const a = createRunTestState("A", "A");
    const b = createRunTestState("B", "B");
    const c = createRunTestState("C", "C");
    const d = createRunTestState("D", "D");
    a.addTransition({ to: "B", condition: async () => true, weight: 1 });
    b.addTransition({ to: "C", condition: async () => true, weight: 1 });
    c.addTransition({ to: "D", condition: async () => true, weight: 1 });

    machine.addState(a, { initial: true }).addState(b).addState(c).addState(d).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A", "B", "C", "D"]);
  });

  it("mode: 'infinitely' uses default interval when not provided", async () => {
    const machine = Machine.create<RunTestStateData>();
    const a = createRunTestState("A", "A");
    const b = createRunTestState("B", "B");
    a.addTransition({ to: "B", condition: async () => true, weight: 1 });
    b.addTransition({ to: "A", condition: async () => true, weight: 1 });

    machine.addState(a, { initial: true }).addState(b).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    const sleepSpy = vi.spyOn(machine as any, "sleep").mockResolvedValue(undefined);

    // With stopAfter counting states entered (including initial), use 3 to ensure a sleep occurs
    await machine.run(stateData, { mode: "infinitely", stopAfter: 3 });

    expect(sleepSpy).toHaveBeenCalled();
    // default interval is 1000ms
    expect(sleepSpy.mock.calls.some(([ms]) => ms === 1000)).toBe(true);

    sleepSpy.mockRestore();
  });

  it("stopAfter option is respected", async () => {
    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "infinitely", stopAfter: 5, interval: 1 });
    // Counting states entered: A(1) -> B(2) -> C(3) -> B(4) -> C(5)
    expect(stateData.log).toEqual(["A", "B", "C", "B", "C"]);
    expect(stateData.counter).toBe(2);
  });

  it("stopAfter=0 stops before entering the initial state", async () => {
    const m = Machine.create<RunTestStateData>();
    const a = createRunTestState("A", "A");
    m.addState(a, { initial: true }).finalize();

    const data: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(data, { mode: "any", stopAfter: 0 });
    expect(data.log).toEqual([]);
  });

  it("stopAfter=1 stops right after entering the initial state", async () => {
    const m = Machine.create<RunTestStateData>();
    const a = createRunTestState("A", "A");
    const b = createRunTestState("B", "B");
    a.addTransition({ to: "B", condition: async () => true, weight: 1 });

    m.addState(a, { initial: true }).addState(b).finalize();

    const data: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(data, { mode: "any", stopAfter: 1 });
    expect(data.log).toEqual(["A"]);
  });

  it("honors stopAfter inside the retry loop (no starvation)", async () => {
    const machine = Machine.create<RunTestStateData>();
    const a = createRunTestState("A", "A");
    const b = createRunTestState("B", "B");
    const c = createRunTestState("C", "C");

    a.addTransition({ to: "B", condition: async () => true, weight: 1 });
    b.addTransition({ to: "C", condition: async () => true, weight: 1 });
    // C cannot transition anywhere, but has retry enabled by default
    c.addTransition({ to: "A", condition: async () => false, weight: 1 });

    machine.addState(a, { initial: true }).addState(b).addState(c).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "infinitely", stopAfter: 2, interval: 1 });
    // Counting states entered including initial; stop after entering the second state
    expect(stateData.log).toEqual(["A", "B"]);
  });

  it("treats maxRetries = 0 as zero allowed retries", async () => {
    const machine = Machine.create<RunTestStateData>();
    const start = createRunTestState("start", "start");
    start.retryDelayMs(1).retryLimit(0);
    start.addTransition({ to: "next", condition: async () => false, weight: 1 });
    const next = createRunTestState("next", "next");

    machine.addState(start, { initial: true }).addState(next).finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["start"]);
  });

  // it("throws when start is called twice", async () => {
  //   vi.useFakeTimers();

  //   const a = createRunTestState("A", "A");
  //   const b = createRunTestState("B", "B");
  //   a.addTransition({ to: "B", condition: async (s) => s.goToLeaf, weight: 1 });
  //   const m = Machine.create<RunTestStateData>();
  //   m.addState(a, { initial: true }).addState(b).finalize();

  //   const data: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
  //   await m.start(data, { interval: 5 });
  //   await expect(m.start(data, { interval: 5 })).rejects.toThrow("already started");
  // });
});
