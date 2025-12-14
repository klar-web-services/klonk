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

// Helper for tests that need a raw StateNode (internal testing)
const createState = <const TIdent extends string>(ident: TIdent, label: string) => {
  const node = new StateNode<StateData, TIdent>(ident);
  node.setPlaylist(createLoggingPlaylist(label));
  return node;
};

// Helper to create a Machine bypassing withStates requirement (for internal tests)
// Uses 'string' as the ident type to allow any ident
const createMachine = () => {
  return Machine.create<StateData>().withStates<string>();
};

const getAllStates = (machine: Machine<StateData, any>) => (machine as any).getAllStates() as StateNode<StateData>[];

afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("StateNode", () => {
  it("sorts transitions by weight and ignores throwing conditions", async () => {
    const source = new StateNode<StateData, "source">("source");
    const target = new StateNode<StateData, "target">("target");

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
    const node = new StateNode<StateData, "builder">("builder");
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
    const node = new StateNode<StateData, "solo">("solo");
    (node as any).transitions = undefined;
    expect(node.getByIdent("ghost")).toBeNull();
  });

  it("finds nested nodes by ident", () => {
    const root = new StateNode<StateData, "root">("root");
    const child = new StateNode<StateData, "child">("child");
    const leaf = new StateNode<StateData, "leaf">("leaf");

    root.transitions = [{ to: child, weight: 1, condition: async () => true }];
    child.transitions = [{ to: leaf, weight: 1, condition: async () => true }];

    expect(root.getByIdent("leaf")).toBe(leaf);
    expect(root.getByIdent("missing")).toBeNull();
  });

  it("next returns null when there are no transitions", async () => {
    const node = new StateNode<StateData, "lonely">("lonely");
    (node as any).transitions = undefined;
    expect(await node.next({ log: [] })).toBeNull();
  });

  it("falls back to insertion order when transition weights are missing", async () => {
    const node = new StateNode<StateData, "chooser">("chooser");
    const first = new StateNode<StateData, "first">("first");
    const second = new StateNode<StateData, "second">("second");
    node.transitions = [
      { to: first, weight: undefined, condition: async () => false },
      { to: second, weight: undefined, condition: async () => true },
    ];

    const next = await node.next({ log: [] });
    expect(next).toBe(second);
  });

  it("avoids infinite recursion when nodes form a cycle", () => {
    const a = new StateNode<StateData, "a">("a");
    const b = new StateNode<StateData, "b">("b");
    a.transitions = [{ to: b, weight: 1, condition: async () => false }];
    b.transitions = [{ to: a, weight: 1, condition: async () => false }];

    expect(a.getByIdent("ghost")).toBeNull();
  });

  it("prefers insertion order when weights are equal and multiple conditions are true", async () => {
    const node = new StateNode<StateData, "chooser-eq">("chooser-eq");
    const first = new StateNode<StateData, "first">("first");
    const second = new StateNode<StateData, "second">("second");

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
    const machine = createMachine();
    machine.addState("lone", n => n.setPlaylist(createLoggingPlaylist("lone")));

    expect(() => machine.finalize()).toThrow("Cannot finalize a machine without an initial state or states to create.");
  });

  it("rejects duplicate state identifiers", () => {
    const machine = createMachine();

    machine.addState("dup", n => n.setPlaylist(createLoggingPlaylist("first")), { initial: true });
    machine.addState("dup", n => n.setPlaylist(createLoggingPlaylist("second")));

    expect(() => machine.finalize()).toThrow("Duplicate state ident 'dup'.");
  });

  it("sets ident when provided", () => {
    const machine = createMachine();
    machine.addState("only", n => n.setPlaylist(createLoggingPlaylist("only")), { initial: true });

    machine.finalize({ ident: "custom-ident" });
    expect(machine.ident).toBe("custom-ident");
  });

  it("throws when a state is missing an ident during finalization", () => {
    const machine = createMachine();
    machine.addState("", n => n, { initial: true });

    expect(() => machine.finalize()).toThrow("State missing ident.");
  });

  it("throws when a transition points to an unknown state", () => {
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .addTransition({ to: "ghost", condition: async () => true, weight: 1 })
    , { initial: true });

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
    const machine = createMachine();
    machine.addState("only", n => n.setPlaylist(createLoggingPlaylist("only")), { initial: true });
    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData, { mode: "any" })).rejects.toThrow("Cannot run a machine that is not finalized.");
  });

  it("throws if run is invoked without an initial state", async () => {
    const machine = createMachine();
    machine.finalized = true;
    const stateData: StateData = { log: [] };
    await expect(machine.run(stateData, { mode: "any" })).rejects.toThrow("Cannot run a machine without an initial state.");
  });

  it("getAllStates returns an empty array when no initial state is set", () => {
    const machine = createMachine();
    expect(getAllStates(machine)).toEqual([]);
  });

  it("getAllStates skips nodes without identifiers", () => {
    const machine = createMachine();
    const blank = new StateNode<StateData, "">(""); // ident remains empty
    (blank as any).transitions = undefined;
    machine.initialState = blank;
    expect(getAllStates(machine)).toEqual([]);
  });

  it("getAllStates traverses unique reachable states", () => {
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .addTransition({ to: "loop", condition: async () => true, weight: 1 })
      .addTransition({ to: "loop", condition: async () => true, weight: 2 })
    , { initial: true });
    machine.addState("loop", n => n.setPlaylist(createLoggingPlaylist("loop")));
    machine.finalize({ ident: "graph" });

    const states = getAllStates(machine);
    expect(states.map((state) => state.ident)).toEqual(["start", "loop"]);
  });

  it("getAllStates handles nodes whose transitions are undefined", () => {
    const machine = createMachine();
    const start = new StateNode<StateData, "start">("start");
    (start as any).transitions = undefined;
    machine.initialState = start;
    expect(getAllStates(machine).map((state) => state.ident)).toEqual(["start"]);
  });

  it("runs playlists while transitioning until it reaches a leaf", async () => {
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .addTransition({ to: "middle", condition: async () => true, weight: 1 })
    , { initial: true });
    machine.addState("middle", n => n
      .setPlaylist(createLoggingPlaylist("middle"))
      .addTransition({ to: "end", condition: async () => true, weight: 1 })
    );
    machine.addState("end", n => n.setPlaylist(createLoggingPlaylist("end")));
    machine.finalize({ ident: "happy-path" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["start", "middle", "end"]);
  });

  it("completes immediately when the initial state has no transitions", async () => {
    const machine = createMachine();
    machine.addState("lone", n => n.setPlaylist(createLoggingPlaylist("lone")), { initial: true });
    machine.finalize({ ident: "single" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["lone"]);
  });

  it("respects preventRetry when no transitions are available", async () => {
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .preventRetry()
      .addTransition({ to: "second", condition: async () => false, weight: 1 })
    , { initial: true });
    machine.addState("second", n => n.setPlaylist(createLoggingPlaylist("second")));
    machine.finalize({ ident: "no-retry" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["start"]);
  });

  it("retries until a transition becomes available", async () => {
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .retryDelayMs(1)
      .retryLimit(3)
      .addTransition({ to: "finish", condition: async (state) => state.ready === true, weight: 1 })
    , { initial: true });
    machine.addState("finish", n => n.setPlaylist(createLoggingPlaylist("finish")));
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
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .retryDelayMs(1)
      .retryLimit(2)
      .addTransition({ to: "finish", condition: async () => false, weight: 1 })
    , { initial: true });
    machine.addState("finish", n => n.setPlaylist(createLoggingPlaylist("finish")));
    machine.finalize({ ident: "retry-limit" });

    const stateData: StateData = { log: [] };
    const sleepSpy = vi.spyOn(machine as any, "sleep").mockResolvedValue(undefined);
    await machine.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["start"]);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    sleepSpy.mockRestore();
  });

  it("returns when a transition loops back to the initial state (roundtrip mode)", async () => {
    const machine = createMachine();
    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .addTransition({ to: "middle", condition: async () => true, weight: 2 })
      .addTransition({ to: "extra", condition: async () => false, weight: 1 })
    , { initial: true });
    machine.addState("middle", n => n
      .setPlaylist(createLoggingPlaylist("middle"))
      .addTransition({ to: "start", condition: async () => true, weight: 1 })
    );
    machine.addState("extra", n => n.setPlaylist(createLoggingPlaylist("extra")));
    machine.finalize({ ident: "loop" });

    const stateData: StateData = { log: [] };
    await machine.run(stateData, { mode: "roundtrip" });
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
    const machine = createMachine();
    const throwingPlaylist = new Playlist<{}, StateData>();
    vi.spyOn(throwingPlaylist, "run").mockImplementation(async () => {
      throw new Error("Task failed!");
    });

    machine.addState("start", n => n
      .setPlaylist(createLoggingPlaylist("start"))
      .addTransition({ to: "throwing", condition: async () => true, weight: 1 })
    , { initial: true });
    machine.addState("throwing", n => n.setPlaylist(throwingPlaylist));
    machine.finalize();

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
    const machine = createMachine();
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
    const machine = createMachine();
    const blank = new StateNode<StateData, "blank">("blank");
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
    const machine = createMachine();
    machine.addState("a", n => n
      .setPlaylist(createLoggingPlaylist("a"))
      .addTransition({ to: "b", condition: async () => true, weight: 1 })
      .addTransition({ to: "b", condition: async () => true, weight: 2 })
    , { initial: true });
    machine.addState("b", n => n
      .setPlaylist(createLoggingPlaylist("b"))
      .addTransition({ to: "b", condition: async () => true, weight: 1 })
    );
    machine.finalize({ ident: "logger-test" });

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

  // Creates a playlist that just logs its label
  const createRunTestPlaylist = (label: string) => {
    const playlist = new Playlist<{}, RunTestStateData>();
    vi.spyOn(playlist, "run").mockImplementation(async (state) => {
      state.log.push(label);
      return {} as any;
    });
    return playlist;
  };

  // Creates a playlist that logs and increments a counter
  const createIncrementingPlaylist = (label: string) => {
    const playlist = new Playlist<{}, RunTestStateData>();
    vi.spyOn(playlist, "run").mockImplementation(async (state) => {
      state.log.push(label);
      state.counter = (state.counter || 0) + 1;
      return {} as any;
    });
    return playlist;
  };

  // Helper to create a machine for run tests
  const createRunTestMachine = () => {
    return Machine.create<RunTestStateData>().withStates<string>();
  };

  let machine: Machine<RunTestStateData, string>;

  beforeEach(() => {
    machine = createRunTestMachine();
    machine.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    machine.addState("B", n => n
      .setPlaylist(createIncrementingPlaylist("B"))
      .addTransition({ to: "C", condition: async () => true, weight: 1 })
    );
    machine.addState("C", n => n
      .setPlaylist(createRunTestPlaylist("C"))
      .addTransition({ to: "B", condition: async (state) => state.counter < 3, weight: 3 })
      .addTransition({ to: "F", condition: async (state) => state.counter >= 3 && state.goToLeaf, weight: 2 })
      .addTransition({ to: "D", condition: async (state) => state.counter >= 3 && !state.goToLeaf, weight: 1 })
    );
    machine.addState("D", n => n
      .setPlaylist(createRunTestPlaylist("D"))
      .addTransition({ to: "E", condition: async () => true, weight: 1 })
    );
    machine.addState("E", n => n
      .setPlaylist(createRunTestPlaylist("E"))
      .addTransition({ to: "A", condition: async () => true, weight: 1 })
    );
    machine.addState("F", n => n.setPlaylist(createRunTestPlaylist("F (leaf)")));
    machine.finalize();
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

  it("mode: 'any' stops on roundtrip (any terminal condition)", async () => {
    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await machine.run(stateData, { mode: "any" });
    // 'any' mode stops on ANY terminal condition, including roundtrip
    expect(stateData.log).toEqual(["A", "B", "C", "B", "C", "B", "C", "D", "E"]);
    expect(stateData.counter).toBe(3);
  });

  it("mode: 'any' stops on a leaf if that is the first terminal condition", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n.setPlaylist(createRunTestPlaylist("A (leaf)")), { initial: true });
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A (leaf)"]);
  });

  it("mode: 'roundtrip' ignores a leaf node to complete the trip", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "A", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n.setPlaylist(createRunTestPlaylist("B (leaf)")));
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "roundtrip" });
    expect(stateData.log).toEqual(["A"]);
  });

  it("mode: 'leaf' ignores a roundtrip to stop at a leaf", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 2 })
      .addTransition({ to: "A", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n.setPlaylist(createRunTestPlaylist("B (leaf)")));
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "leaf" });
    expect(stateData.log).toEqual(["A", "B (leaf)"]);
  });

  it("mode: 'leaf' continues through roundtrip to reach leaf state", async () => {
    // This test verifies the fix: leaf mode should NOT stop on roundtrip
    // Machine loops A -> B -> A (roundtrip!) -> B -> leaf after counter >= 2
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createIncrementingPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n
      .setPlaylist(createRunTestPlaylist("B"))
      .addTransition({ to: "leaf", condition: async (state) => state.counter >= 2, weight: 2 })
      .addTransition({ to: "A", condition: async () => true, weight: 1 })
    );
    m.addState("leaf", n => n.setPlaylist(createRunTestPlaylist("leaf")));
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "leaf" });
    // Path: A(counter=1) -> B -> A(counter=2, roundtrip!) -> B -> leaf
    // Before the fix, this would stop at ["A", "B"] due to roundtrip termination
    expect(stateData.log).toEqual(["A", "B", "A", "B", "leaf"]);
    expect(stateData.counter).toBe(2);
  });

  it("mode: 'any' stops when all states are visited", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n.setPlaylist(createRunTestPlaylist("B")));
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A", "B"]);
  });

  it("mode: 'infinitely' does not stop at a leaf when retries are disabled", async () => {
    const m = createRunTestMachine();
    m.addState("leaf", n => n.setPlaylist(createRunTestPlaylist("leaf")).preventRetry(), { initial: true });
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "infinitely" });
    expect(stateData.log).toEqual(["leaf"]);
  });

  it("mode: 'infinitely' does not stop on roundtrip", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n
      .setPlaylist(createRunTestPlaylist("B"))
      .addTransition({ to: "A", condition: async () => true, weight: 1 })
    );
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "infinitely", stopAfter: 2, interval: 1 });
    expect(stateData.log[0]).toBe("A");
    expect(stateData.log[1]).toBe("B");
  });

  it("mode: 'any' continues loop without sleeping (non-infinitely path)", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n
      .setPlaylist(createRunTestPlaylist("B"))
      .addTransition({ to: "C", condition: async () => true, weight: 1 })
    );
    m.addState("C", n => n
      .setPlaylist(createRunTestPlaylist("C"))
      .addTransition({ to: "D", condition: async () => true, weight: 1 })
    );
    m.addState("D", n => n.setPlaylist(createRunTestPlaylist("D")));
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "any" });
    expect(stateData.log).toEqual(["A", "B", "C", "D"]);
  });

  it("mode: 'infinitely' uses default interval when not provided", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n
      .setPlaylist(createRunTestPlaylist("B"))
      .addTransition({ to: "A", condition: async () => true, weight: 1 })
    );
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    const sleepSpy = vi.spyOn(m as any, "sleep").mockResolvedValue(undefined);

    await m.run(stateData, { mode: "infinitely", stopAfter: 3 });

    expect(sleepSpy).toHaveBeenCalled();
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
    const m = createRunTestMachine();
    m.addState("A", n => n.setPlaylist(createRunTestPlaylist("A")), { initial: true });
    m.finalize();

    const data: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(data, { mode: "any", stopAfter: 0 });
    expect(data.log).toEqual([]);
  });

  it("stopAfter=1 stops right after entering the initial state", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n.setPlaylist(createRunTestPlaylist("B")));
    m.finalize();

    const data: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(data, { mode: "any", stopAfter: 1 });
    expect(data.log).toEqual(["A"]);
  });

  it("honors stopAfter inside the retry loop (no starvation)", async () => {
    const m = createRunTestMachine();
    m.addState("A", n => n
      .setPlaylist(createRunTestPlaylist("A"))
      .addTransition({ to: "B", condition: async () => true, weight: 1 })
    , { initial: true });
    m.addState("B", n => n
      .setPlaylist(createRunTestPlaylist("B"))
      .addTransition({ to: "C", condition: async () => true, weight: 1 })
    );
    m.addState("C", n => n
      .setPlaylist(createRunTestPlaylist("C"))
      .addTransition({ to: "A", condition: async () => false, weight: 1 })
    );
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "infinitely", stopAfter: 2, interval: 1 });
    expect(stateData.log).toEqual(["A", "B"]);
  });

  it("treats maxRetries = 0 as zero allowed retries", async () => {
    const m = createRunTestMachine();
    m.addState("start", n => n
      .setPlaylist(createRunTestPlaylist("start"))
      .retryDelayMs(1)
      .retryLimit(0)
      .addTransition({ to: "next", condition: async () => false, weight: 1 })
    , { initial: true });
    m.addState("next", n => n.setPlaylist(createRunTestPlaylist("next")));
    m.finalize();

    const stateData: RunTestStateData = { log: [], counter: 0, goToLeaf: false };
    await m.run(stateData, { mode: "any" });
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
