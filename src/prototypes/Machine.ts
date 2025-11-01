import { randomUUID } from "crypto";
import { Playlist } from "./Playlist";

export type Logger = {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    fatal: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    trace: (...args: any[]) => void;
    child?: (bindings: Record<string, unknown>) => Logger;
}

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
    ident: string;
    tempTransitions?: {to: string, condition: (stateData: TStateData) => Promise<boolean>, weight: number}[];
    retry: false | number;
    maxRetries: false | number;
    logger?: Logger;

    /**
     * Create a `StateNode`.
     *
     * @param transitions - The resolved transitions from this node.
     * @param playlist - The playlist to run when the node is entered.
     */
    constructor(transitions: Transition<TStateData>[], playlist: Playlist<any, TStateData>) {
        this.transitions = transitions;
        this.playlist = playlist;
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
        const logger = (this.logger?.child?.({ path: "StateNode.next", state: this.ident }) ?? this.logger)
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
    private started: boolean = false
    private tickTimer: any | null = null;
    
    /**
     * Compute the set of reachable states starting from the initial state.
     * Used by `run` to determine completion once all states have been visited.
     *
     * @returns An array of reachable `StateNode`s.
     */
    private getAllStates(): StateNode<TStateData>[] {
        const logger = (this.logger?.child?.({ path: "machine.getAllStates" }) ?? this.logger)
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
        ident,
    }: {
        ident?: string,
    } = {}): Machine<TStateData> {
        const logger = (this.logger?.child?.({ path: "machine.finalize", instance: this.ident }) ?? this.logger)

        if (!this.initialState || this.statesToCreate.length === 0) {
            logger?.error({ phase: 'error' }, "Finalization failed: no initial state or states to create")
            throw new Error("Cannot finalize a machine without an initial state or states to create.");
        }

        if (ident) {
            this.ident = ident
        } else {
            this.ident = randomUUID()
        }

        logger?.info({ phase: "start"}, `Finalizing machine ${this.ident}...`)

        const registry = new Map<string, StateNode<TStateData>>();
        logger?.info({ phase: "progress"}, `Building state registry...`)
        for (const s of this.statesToCreate) {
            // Propagate logger to states for internal logging
            s.logger = this.logger;
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
        const logger = (this.logger?.child?.({ path: "machine.addState", instance: this.ident }) ?? this.logger)
        logger?.info({ phase: 'start', state: state.ident, isInitial: !!options.initial }, 'Adding state')
        this.statesToCreate.push(state);
        if (options.initial) {
            this.initialState = state;
        }
        logger?.info({ phase: 'end', state: state.ident }, 'State added')
        return this;
    }

    /**
     * Attach a logger to this machine. If the machine has an initial state set,
     * the logger will be propagated to all currently reachable states.
     */
    public addLogger(logger: Logger): Machine<TStateData> {
        this.logger = logger;
        if (this.initialState) {
            const visited = new Set<string>();
            const stack: StateNode<TStateData>[] = [this.initialState];
            while (stack.length > 0) {
                const node = stack.pop()!;
                if (!node.ident || visited.has(node.ident)) continue;
                visited.add(node.ident);
                node.logger = logger;
                for (const tr of node.transitions || []) {
                    if (tr.to && tr.to.ident && !visited.has(tr.to.ident)) {
                        stack.push(tr.to);
                    }
                }
            }
        }
        return this;
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
    public async run(stateData: TStateData, options: RunOptions): Promise<TStateData> {
        const logger = (this.logger?.child?.({ path: "machine.run", instance: this.ident }) ?? this.logger)
        logger?.info({ phase: 'start', options }, 'Running machine...')

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
        let transitionsCount = 0;

        // If stopAfter is explicitly 0, do not even enter the initial state
        if (options.stopAfter !== undefined && options.stopAfter === 0) {
            logger?.info({ phase: 'end', reason: 'stopAfter', count: transitionsCount }, 'Stop condition met.')
            return stateData;
        }

        let current = this.initialState;
        logger?.info({ phase: 'progress', state: current.ident }, 'Set initial state. Running playlist.')
        await current.playlist.run(stateData);
        transitionsCount = 1;
        visitedIdents.add(current.ident);

        // Check stopAfter after entering the initial state
        if (options.stopAfter !== undefined && transitionsCount >= options.stopAfter) {
            logger?.info({ phase: 'end', reason: 'stopAfter', count: transitionsCount }, 'Stop condition met.')
            return stateData;
        }

        while (true) {

            if ((!current.transitions || current.transitions.length === 0)) {
                // This is a terminal condition for all modes except 'infinitely'.
                // In 'infinitely' mode, it will just keep retrying.
                if (options.mode !== 'infinitely') {
                    logger?.info({ phase: 'end', state: current.ident, reason: 'leaf' }, 'Stop condition met.')
                    return stateData;
                }
            }

            let next = await current.next(stateData);
            if (!next) {
                const retryDelay = current.retry;
                if (retryDelay === false) {
                    logger?.info({ phase: 'end', state: current.ident, reason: 'no-transition-no-retry' }, 'Stop condition met.')
                    return stateData;
                }

                let retries = 0;
                logger?.info({ phase: 'progress', state: current.ident, retryDelay }, 'No next state, beginning retry logic.')
                while (!next) {
                    if (current.maxRetries !== false && retries >= current.maxRetries) {
                        logger?.warn({ phase: 'end', state: current.ident, retries, reason: 'retries-exhausted' }, 'Stop condition met.')
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
            }

            // This should not be null here due to the retry logic returning on failure.
            const resolvedNext = next!;

            if (resolvedNext === this.initialState) {
                if (options.mode !== 'infinitely') {
                    logger?.info({ phase: 'end', reason: 'roundtrip' }, 'Stop condition met.')
                    return stateData;
                }
            }

            logger?.info({ phase: 'progress', from: current.ident, to: resolvedNext.ident }, 'Transitioning state.')
            current = resolvedNext;
            await current.playlist.run(stateData);
            visitedIdents.add(current.ident);
            transitionsCount++;

            // Check stopAfter immediately after entering a state
            if (options.stopAfter !== undefined && transitionsCount >= options.stopAfter) {
                logger?.info({ phase: 'end', reason: 'stopAfter', count: transitionsCount }, 'Stop condition met.')
                return stateData;
            }

            if (visitedIdents.size >= allStates.length) {
                if (options.mode === 'any') {
                    logger?.info({ phase: 'end', reason: 'all-visited' }, 'Stop condition met.')
                    return stateData;
                }
            }

            if (options.mode === 'infinitely') {
                await this.sleep(options.interval ?? 1000);
            }
        }
    }
}

export type RunOptions = {
    stopAfter?: number;
} & (
    | { mode: "any" }
    | { mode: "leaf" }
    | { mode: "roundtrip" }
    | { mode: "infinitely"; interval?: number }
 );
