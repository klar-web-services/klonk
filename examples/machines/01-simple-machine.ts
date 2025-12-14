/**
 * Example: Simple Machine (State Machine)
 * 
 * A Machine is a finite state machine. Each state has:
 * - A Playlist that runs when entering the state
 * - Transitions to other states (with conditions)
 * 
 * This file demonstrates the simplest possible machine:
 * - Two states: "start" and "done"
 * - One transition: start → done
 */

import { Machine } from "../../src";
import { LogTask, NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// STATE DATA TYPE
// =============================================================================

/**
 * StateData is a mutable object that persists across state transitions.
 * Tasks and transitions can read and modify it.
 */
type CounterState = {
    count: number;
    message: string;
};

// =============================================================================
// SIMPLE MACHINE
// =============================================================================

const simpleMachine = Machine
    // Create machine with state data type
    .create<CounterState>()
    
    // Declare ALL state identifiers upfront
    // This enables autocomplete for transitions!
    .withStates<"start" | "done">()
    
    // Add the initial state
    .addState("start", node => node
        // Each state has a playlist
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input((state) => ({
                action: "machine_started",
                metadata: { 
                    initialCount: state.count,
                    message: state.message
                }
            }))
            
            // Use .finally() to update state data
            .finally((state, outputs) => {
                state.count += 1;
                console.log(`[finally] Count incremented to ${state.count}`);
            })
        )
        
        // Add a transition to the next state
        .addTransition({
            to: "done",  // ← Autocomplete works here!
            condition: async () => true,  // Always transition
            weight: 1
        })
    , { initial: true })  // Mark as initial state
    
    // Add the "done" state (terminal - no transitions)
    .addState("done", node => node
        .setPlaylist(p => p
            .addTask(new NotifyTask("notify"))
            .input((state) => ({
                message: `Machine complete! Final count: ${state.count}`,
                level: "info"
            }))
        )
        // No transitions = terminal state (machine stops here)
    )
    
    // Finalize with an identifier
    .finalize({ ident: "simple-counter" });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Simple Machine (Two States)");
    console.log("=".repeat(60) + "\n");

    // Create the initial state data
    const state: CounterState = {
        count: 0,
        message: "Hello from the machine!"
    };

    console.log("Initial state:", state);
    console.log("");

    // Run the machine
    // Mode "leaf" runs until reaching a state with no transitions
    const finalState = await simpleMachine.run(state, { mode: "leaf" });

    console.log("\n--- Machine Complete ---");
    console.log("Final state:", finalState);
    
    // Note: The original state object is also mutated
    console.log("Original state (mutated):", state);

    // -------------------------------------------------------------------------
    // State Flow Visualization
    // -------------------------------------------------------------------------
    console.log("\n--- State Flow ---");
    console.log("┌─────────┐");
    console.log("│  start  │ ← initial state");
    console.log("│ (runs   │");
    console.log("│ playlist)│");
    console.log("└────┬────┘");
    console.log("     │ transition (always)");
    console.log("     ▼");
    console.log("┌─────────┐");
    console.log("│  done   │ ← terminal state");
    console.log("│ (runs   │");
    console.log("│ playlist)│");
    console.log("└─────────┘");
}

main().catch(console.error);
