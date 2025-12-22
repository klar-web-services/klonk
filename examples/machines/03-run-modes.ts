/**
 * Example: Machine Run Modes
 * 
 * Machines can run in different modes, controlling when they stop:
 * 
 * - "any": Stop at first terminal condition (leaf, roundtrip, or all visited)
 * - "leaf": Stop when reaching a state with no transitions
 * - "roundtrip": Stop when returning to the initial state
 * - "infinitely": Run forever (with optional stopAfter limit)
 */

import { Machine } from "../../src";
import { LogTask } from "../tasks/03-error-handling";

// =============================================================================
// STATE DATA
// =============================================================================

type CycleState = {
    visitCount: number;
    statesVisited: string[];
};

// =============================================================================
// MACHINE WITH CYCLE (for demonstrating run modes)
// =============================================================================

/**
 * A machine that cycles through states:
 * A → B → C → A (loops back to start)
 */
const cycleMachine = Machine
    .create<CycleState>()
    .withStates("A", "B", "C")
    
    .addState("A", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input((state) => ({
                action: "in_state_A",
                metadata: { visitCount: state.visitCount }
            }))
            .finally((state) => {
                state.visitCount++;
                state.statesVisited.push("A");
            })
        )
        .addTransition({
            to: "B",
            condition: async () => true,
            weight: 1
        })
    , { initial: true })
    
    .addState("B", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input((state) => ({
                action: "in_state_B",
                metadata: { visitCount: state.visitCount }
            }))
            .finally((state) => {
                state.visitCount++;
                state.statesVisited.push("B");
            })
        )
        .addTransition({
            to: "C",
            condition: async () => true,
            weight: 1
        })
    )
    
    .addState("C", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input((state) => ({
                action: "in_state_C",
                metadata: { visitCount: state.visitCount }
            }))
            .finally((state) => {
                state.visitCount++;
                state.statesVisited.push("C");
            })
        )
        // Cycle back to A!
        .addTransition({
            to: "A",
            condition: async () => true,
            weight: 1
        })
    )
    
    .finalize({ ident: "cycle-machine" });

// =============================================================================
// MACHINE WITH LEAF STATE (for demonstrating "leaf" mode)
// =============================================================================

const leafMachine = Machine
    .create<CycleState>()
    .withStates("start", "middle", "end")
    
    .addState("start", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input(() => ({ action: "start", metadata: {} }))
            .finally((state) => { state.statesVisited.push("start"); })
        )
        .addTransition({ to: "middle", condition: async () => true, weight: 1 })
    , { initial: true })
    
    .addState("middle", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input(() => ({ action: "middle", metadata: {} }))
            .finally((state) => { state.statesVisited.push("middle"); })
        )
        .addTransition({ to: "end", condition: async () => true, weight: 1 })
    )
    
    .addState("end", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input(() => ({ action: "end", metadata: {} }))
            .finally((state) => { state.statesVisited.push("end"); })
        )
        // No transitions = leaf state!
    )
    
    .finalize({ ident: "leaf-machine" });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Machine Run Modes");
    console.log("=".repeat(60) + "\n");

    // -------------------------------------------------------------------------
    // Mode: "leaf" - Stop at terminal state
    // -------------------------------------------------------------------------
    console.log('--- Mode: "leaf" ---');
    console.log("Runs until reaching a state with no transitions.\n");
    
    const leafState: CycleState = { visitCount: 0, statesVisited: [] };
    await leafMachine.run(leafState, { mode: "leaf" });
    
    console.log("States visited:", leafState.statesVisited);
    console.log("(Stopped at 'end' - no more transitions)\n");

    // -------------------------------------------------------------------------
    // Mode: "roundtrip" - Stop when returning to initial state
    // -------------------------------------------------------------------------
    console.log('--- Mode: "roundtrip" ---');
    console.log("Runs until transitioning back to the initial state.\n");
    
    const roundtripState: CycleState = { visitCount: 0, statesVisited: [] };
    await cycleMachine.run(roundtripState, { mode: "roundtrip" });
    
    console.log("States visited:", roundtripState.statesVisited);
    console.log("(Stopped when returning to 'A')\n");

    // -------------------------------------------------------------------------
    // Mode: "any" - Stop at first terminal condition
    // -------------------------------------------------------------------------
    console.log('--- Mode: "any" ---');
    console.log("Stops at: leaf state, roundtrip, or all states visited.\n");
    
    const anyState: CycleState = { visitCount: 0, statesVisited: [] };
    await cycleMachine.run(anyState, { mode: "any" });
    
    console.log("States visited:", anyState.statesVisited);
    console.log("(For cycle machine, stops on roundtrip)\n");

    // -------------------------------------------------------------------------
    // Mode: "infinitely" with stopAfter
    // -------------------------------------------------------------------------
    console.log('--- Mode: "infinitely" with stopAfter ---');
    console.log("Runs forever, but limited by stopAfter count.\n");
    
    const infiniteState: CycleState = { visitCount: 0, statesVisited: [] };
    await cycleMachine.run(infiniteState, { 
        mode: "infinitely",
        stopAfter: 7,    // Stop after entering 7 states
        interval: 50     // 50ms between iterations (for infinite mode)
    });
    
    console.log("States visited:", infiniteState.statesVisited);
    console.log(`(Stopped after ${infiniteState.statesVisited.length} state entries)\n`);

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("--- Run Mode Summary ---");
    console.log("| Mode        | Stops When                              |");
    console.log("|-------------|----------------------------------------|");
    console.log("| leaf        | Reaches state with no transitions      |");
    console.log("| roundtrip   | Returns to initial state               |");
    console.log("| any         | First of: leaf, roundtrip, all visited |");
    console.log("| infinitely  | Never (use stopAfter to limit)         |");
}

main().catch(console.error);
