import pino, { type Logger } from "pino";
import { Playlist } from "./Playlist";
import { randomUUID } from "crypto";

/**
 * @internal Shared pino logger used when verbose output is enabled.
 */
let glogger: Logger | null = null

/**
 * A weighted, conditional edge to a target state.
 * Transitions are evaluated in descending `weight` order, then by insertion order.
 *
 * @template TStateData - Mutable state shared across the machine.
 */
type Transition<TStateData> = {
    /** Target state node, resolved during `finalize`. */
    to: StateNode<TStateData> | null;
    /** Async predicate that decides whether to take this transition. */
    condition: (stateData: TStateData) => Promise<boolean>;
    /** Higher values are tried first; defaults to 0. */
    weight?: number;
}
  
/**
 * A node in the finite state machine.
 * Each node owns a `Playlist` that is executed upon entering the node and
 * contains weighted conditional transitions to other nodes.
 *
 * @template TStateData - The shape of the external mutable state carried through the machine.
 */
export class StateNode<TStateData> {
    transitions?: Transition<TStateData>[];
    playlist: Playlist<any, TStateData>;
    timeToNextTick: number;
    ident: string;
    tempTransitions?: {to: string, condition: (stateData: TStateData) => Promise<boolean>, weight: number}[];
    retry: false | number;
    maxRetries: false | number;

    /**
     * Create a `StateNode`.
     *
     * @param transitions - The resolved transitions from this node.
     * @param playlist - The playlist to run when the node is entered.
     */
    constructor(transitions: Transition<TStateData>[], playlist: Playlist<any, TStateData>) {
        this.transitions = transitions;
        this.playlist = playlist;
        this.timeToNextTick = 1000;
        this.ident = "";
        this.retry = 1000;
        this.maxRetries = false;
    }

    /**
     * Convenience factory for a new `StateNode` with no transitions and an empty playlist.
     *
     * @template TStateData
     * @returns A new, unconfigured `StateNode`.
     */
    public static create<TStateData>(): StateNode<TStateData> {
        return new StateNode<TStateData>([], new Playlist<any, TStateData>());
    }

    /**
     * Queue a transition to be resolved later during machine finalization.
     * Use the target node `ident` instead of a direct reference; it will be
     * resolved to a node instance by the machine.
     *
     * @param to - Target state `ident`.
     * @param condition - Async predicate that decides if the transition should fire.
     * @param weight - Higher weight wins when multiple conditions are true; ties keep insertion order.
     * @returns This node for chaining.
     */
    public addTransition({to, condition, weight}: {to: string, condition: (stateData: TStateData) => Promise<boolean>, weight: number}): StateNode<TStateData> {
        if (!this.tempTransitions) {
            this.tempTransitions = [];
        }

        this.tempTransitions?.push({to, condition, weight});
        return this;
    }

    /**
     * Set or build the playlist that runs when entering this node.
     *
     * Overload 1: supply an already constructed `Playlist`.
     * Overload 2: supply a builder function receiving an empty `Playlist` and returning a configured one.
     *
     * @param arg - Either a `Playlist` instance or a builder function that returns one.
     * @returns This node for chaining.
     */
    public setPlaylist(playlist: Playlist<any, TStateData>): StateNode<TStateData>;
    public setPlaylist<
        TBuilderOutputs extends Record<string, any>,
        TFinalPlaylist extends Playlist<TBuilderOutputs, TStateData>
    >(
        builder: (p: Playlist<{}, TStateData>) => TFinalPlaylist
    ): StateNode<TStateData>;
    public setPlaylist(arg: any): StateNode<TStateData> {
        if (typeof arg === "function") {
            const initial = new Playlist<{}, TStateData>();
            const finalPlaylist = arg(initial);
            this.playlist = finalPlaylist as unknown as Playlist<any, TStateData>;
            return this;
        }
        this.playlist = arg as Playlist<any, TStateData>;
        return this;
    }

    /**
     * Disable retry behavior for this node during `Machine.run` when no transition is available.
     *
     * @returns This node for chaining.
     */
    public preventRetry(): StateNode<TStateData> {
        this.retry = false;
        return this;
    }

    /**
     * Set the delay between retry attempts for this node during `Machine.run`.
     *
     * @param delayMs - Delay in milliseconds between retries.
     * @returns This node for chaining.
     */
    public retryDelayMs(delayMs: number): StateNode<TStateData> {
        this.retry = delayMs;
        return this;
    }

    /**
     * Set the maximum number of retries for this node during `Machine.run`.
     * Use `preventRetry()` to disable retries entirely.
     *
     * @param maxRetries - Maximum number of retry attempts before giving up.
     * @returns This node for chaining.
     */
    public retryLimit(maxRetries: number): StateNode<TStateData> {
        this.maxRetries = maxRetries;
        return this;
    }

    /**
     * Assign a unique identifier for this node. Required for transition resolution.
     *
     * @param ident - Unique node identifier.
     * @returns This node for chaining.
     */
    public setIdent(ident: string): StateNode<TStateData> {
        this.ident = ident;
        return this;
    }

    /**
     * Depth-first search for a node by `ident` within the reachable subgraph from this node.
     *
     * @param ident - Identifier to search for.
     * @param visited - Internal cycle-prevention list; callers can ignore.
     * @returns The matching node or `null` if not found.
     */
    public getByIdent(ident: string, visited: string[] = []): StateNode<TStateData> | null {
        if (this.ident === ident) {
            return this;
        }
        if (visited.includes(this.ident)) {
            return null;
        }
        visited.push(this.ident);
        if (this.transitions) {
            for (const transition of this.transitions) {
              const found = transition.to?.getByIdent(ident, visited);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Evaluate transitions and select the next node.
     * Transitions are considered in order of descending weight, with insertion order as a tie-breaker.
     *
     * @param data - Current external state used by transition conditions.
     * @returns The next node if a condition passes; otherwise `null`.
     */
    async next(data: TStateData): Promise<StateNode<TStateData> | null> {
        const logger = glogger?.child({ path: "StateNode.next", state: this.ident })
        logger?.info({ phase: 'start' }, "Evaluating next state")
        const sorted = [...(this.transitions || [])]
            .map((t, i) => ({ t, i }))
            .sort((a, b) => (b.t.weight ?? 0) - (a.t.weight ?? 0) || a.i - b.i);
      
        for (const { t } of sorted) {
            try {
                if (await t.condition(data)) {
                    logger?.info({ phase: 'end', nextState: t.to?.ident }, "Condition met, transitioning")
                    return t.to;
                }
            } catch (err) {
                logger?.error({ phase: 'error', error: err }, "Transition condition failed")
            }
        }
        logger?.info({ phase: 'end', nextState: null }, "No condition met, no transition")
        return null;
    }
}
  
/**
 * A finite state machine that coordinates execution of `StateNode` playlists
 * and transitions between them based on async conditions.
 *
 * @template TStateData - The shape of the external mutable state carried through the machine.
 */
export class Machine<TStateData> {
    public initialState: StateNode<TStateData> | null = null;
    statesToCreate: StateNode<TStateData>[] = [];
    private currentState: StateNode<TStateData> | null = null;
    finalized: boolean = false;
    logger?: Logger
    ident?: string
    
    /**
     * Compute the set of reachable states starting from the initial state.
     * Used by `run` to determine completion once all states have been visited.
     *
     * @returns An array of reachable `StateNode`s.
     */
    private getAllStates(): StateNode<TStateData>[] {
        const logger = glogger?.child({ path: "machine.getAllStates" })
        logger?.info({ phase: "start"}, "Gathering all states...")
        if (!this.initialState) return [];
        const visited = new Set<string>();
        const result: StateNode<TStateData>[] = [];
        const stack: StateNode<TStateData>[] = [this.initialState];
        
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (!node.ident || visited.has(node.ident)) continue;
            visited.add(node.ident);
            result.push(node);
            for (const tr of node.transitions || []) {
                if (tr.to && tr.to.ident && !visited.has(tr.to.ident)) {
                    stack.push(tr.to);
                }
            }
        }
        logger?.info({ phase: "end"}, "States gathered")
        return result;
    }

    /**
     * Sleep helper used for retry delays.
     *
     * @param ms - Milliseconds to wait.
     * @returns A promise that resolves after the delay.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Convenience factory for a new `Machine`.
     *
     * @template TStateData
     * @returns A new unfinalized machine instance.
     */
    public static create<TStateData>(): Machine<TStateData> {
        return new Machine<TStateData>()
    }

    /**
     * Finalize the machine by resolving state transitions and locking configuration.
     * Must be called before `start` or `run`.
     *
     * @param options - Finalization options.
     * @param options.verbose - Enable pino logging for the machine lifecycle.
     * @param options.ident - Optional fixed identifier; if omitted, a UUID is generated.
     * @returns This machine for chaining.
     * @throws If there is no initial state, no states have been added, a state is missing an ident, or idents are duplicated.
     */
    public finalize({
        verbose,
        ident,
    }: {
        verbose?: boolean,
        ident?: string,
    } = {}): Machine<TStateData> {
        const logger = glogger?.child({ path: "machine.finalize", instance: this.ident })

        if (!this.initialState || this.statesToCreate.length === 0) {
            logger?.error({ phase: 'error' }, "Finalization failed: no initial state or states to create")
            throw new Error("Cannot finalize a machine without an initial state or states to create.");
        }

        if (ident) {
            this.ident = ident
        } else {
            this.ident = randomUUID()
        }

        if (verbose) glogger = pino();
        logger?.info("Logging enabled.")

        logger?.info({ phase: "start"}, `Finalizing machine ${this.ident}...`)

        const registry = new Map<string, StateNode<TStateData>>();
        logger?.info({ phase: "progress"}, `Building state registry...`)
        for (const s of this.statesToCreate) {
            if (!s.ident) {
                logger?.error({ phase: 'error' }, "Finalization failed: state missing ident")
                throw new Error("State missing ident.");
            }
            if (registry.has(s.ident)) {
                logger?.error({ phase: 'error', state: s.ident }, "Finalization failed: duplicate state ident")
                throw new Error(`Duplicate state ident '${s.ident}'.`);
            }
            registry.set(s.ident, s);
        }
        logger?.info({ phase: "progress", count: registry.size }, `State registry built.`)


        logger?.info({ phase: "progress"}, `Resolving transitions...`)
        for (const state of this.statesToCreate) {
            state.transitions = [];
            for (const tr of state.tempTransitions || []) {
                const toNode = registry.get(tr.to);
                if (!toNode) {
                    logger?.error({ phase: 'error', from: state.ident, to: tr.to }, "Finalization failed: target state not found")
                    throw new Error(`State '${tr.to}' not found.`);
                }
                state.transitions.push({ to: toNode, condition: tr.condition, weight: tr.weight });
            }
            state.tempTransitions = undefined;
        }
        logger?.info({ phase: "progress"}, `Transitions resolved.`)

        this.statesToCreate = [];
        this.finalized = true;
        logger?.info({ phase: "end"}, `Machine ${this.ident} finalized.`)
        return this
    }

    /**
     * Add a state to the machine.
     *
     * @param state - The state node to add.
     * @param options - Options controlling how the state is added.
     * @param options.initial - If true, marks this state as the initial state.
     * @returns This machine for chaining.
     */
    public addState(state: StateNode<TStateData>, options: { initial?: boolean } = {}): Machine<TStateData> {
        const logger = glogger?.child({ path: "machine.addState", instance: this.ident })
        logger?.info({ phase: 'start', state: state.ident, isInitial: !!options.initial }, 'Adding state')
        this.statesToCreate.push(state);
        if (options.initial) {
            this.initialState = state;
        }
        logger?.info({ phase: 'end', state: state.ident }, 'State added')
        return this;
    }

    /**
     * Start the machine in a repeated tick loop. Executes the current state's playlist,
     * evaluates transitions, and schedules the next tick with `setTimeout`.
     * The method returns immediately after initializing the loop.
     *
     * @param stateData - Mutable external state provided to playlists and transition conditions.
     * @param options - Start options.
     * @param options.interval - Tick interval in milliseconds (default 1000ms).
     * @returns A promise that resolves once the loop has been initiated.
     * @throws If the machine has not been finalized or no initial state is set.
     */
    public async start(stateData: TStateData, options?: { interval?: number }): Promise<void> {
        const logger = glogger?.child({ path: "machine.start", instance: this.ident })
        logger?.info({ phase: 'start' }, 'Starting machine...')
        if (!this.finalized) {
            logger?.error({ phase: 'error' }, 'Machine not finalized')
            throw new Error("Cannot start a machine that is not finalized.");
        }
        if (!this.initialState) {
            logger?.error({ phase: 'error' }, 'No initial state')
            throw new Error("Cannot start a machine without an initial state.");
        }

        const interval = options?.interval ?? 1000;
        logger?.info({ phase: 'progress', interval }, 'Machine interval set')

        if (!this.currentState) {
            this.currentState = this.initialState;
            logger?.info({ phase: 'progress', state: this.currentState.ident }, 'Set initial state. Running playlist.')
            await this.currentState.playlist.run(stateData);
            logger?.info({ phase: 'progress', state: this.currentState.ident }, 'Initial playlist run complete.')
        }

        const tick = async () => {
            const tickLogger = logger?.child({ path: 'machine.tick' })
            tickLogger?.info({ phase: 'start', state: this.currentState!.ident }, 'Tick.')
            const next = await this.currentState!.next(stateData);
            if (next) {
                tickLogger?.info({ phase: 'progress', from: this.currentState!.ident, to: next.ident }, 'Transitioning state.')
                this.currentState = next;
                await this.currentState.playlist.run(stateData);
                tickLogger?.info({ phase: 'progress', state: this.currentState.ident }, 'Playlist run complete.')
            } else {
                tickLogger?.info({ phase: 'progress', state: this.currentState!.ident }, 'No next state.')
            }
            setTimeout(tick, interval);
        };

        tick();
        logger?.info({ phase: 'end' }, 'Machine started, tick loop initiated.')
    }

    /**
     * Run the machine synchronously until it reaches a terminal condition:
     * - A leaf state (no transitions)
     * - No transition and retries disabled
     * - Retry limit exhausted
     * - Returning to the initial state
     * - All reachable states have been visited
     *
     * @param stateData - Mutable external state provided to playlists and transition conditions.
     * @returns A promise that resolves once the run completes.
     * @throws If the machine has not been finalized or no initial state is set.
     */
    public async run(stateData: TStateData): Promise<TStateData> {
        const logger = glogger?.child({ path: "machine.run", instance: this.ident })
        logger?.info({ phase: 'start' }, 'Running machine...')
        if (!this.finalized) {
            logger?.error({ phase: 'error' }, 'Machine not finalized')
            throw new Error("Cannot run a machine that is not finalized.");
        }
        if (!this.initialState) {
            logger?.error({ phase: 'error' }, 'No initial state')
            throw new Error("Cannot run a machine without an initial state.");
        }

        const allStates = this.getAllStates();
        const visitedIdents = new Set<string>();

        let current = this.initialState;
        logger?.info({ phase: 'progress', state: current.ident }, 'Set initial state. Running playlist.')
        await current.playlist.run(stateData);
        visitedIdents.add(current.ident);

        while (true) {
            if (!current.transitions || current.transitions.length === 0) {
                logger?.info({ phase: 'end', state: current.ident }, 'Reached leaf node, run complete.')
                return stateData;
            }

            let next = await current.next(stateData);
            if (!next) {
                const retryDelay = current.retry;
                if (!retryDelay) {
                    logger?.info({ phase: 'end', state: current.ident }, 'No next state and retries disabled, run complete.')
                    return stateData;
                }

                let retries = 0;
                logger?.info({ phase: 'progress', state: current.ident, retryDelay }, 'No next state, beginning retry logic.')
                while (!next) {
                    if (current.maxRetries && retries >= current.maxRetries) {
                        logger?.warn({ phase: 'end', state: current.ident, retries }, 'Retry limit exhausted, run complete.')
                        return stateData;
                    }
                    await this.sleep(retryDelay as number);
                    logger?.info({ phase: 'progress', state: current.ident, attempt: retries + 1 }, 'Retrying to find next state.')
                    next = await current.next(stateData);
                    if (next) {
                        logger?.info({ phase: 'progress', state: current.ident, nextState: next.ident }, 'Retry successful.')
                        break;
                    }
                    retries++;
                }
                if (!next) {
                    logger?.info({ phase: 'end' }, 'No next state after retries, run complete.')
                    return stateData;
                }
            }

            if (next === this.initialState) {
                logger?.info({ phase: 'end' }, 'Next state is initial state, run complete.')
                return stateData;
            }

            logger?.info({ phase: 'progress', from: current.ident, to: next.ident }, 'Transitioning state.')
            current = next;
            await current.playlist.run(stateData);
            if (current.ident) visitedIdents.add(current.ident);

            if (visitedIdents.size >= allStates.length) {
                logger?.info({ phase: 'end' }, 'All reachable states visited, run complete.')
                return stateData;
            }
        }
        return stateData;
    }
}
