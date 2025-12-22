/**
 * Example: Machine Transitions
 * 
 * This file demonstrates:
 * - Conditional transitions (based on state data)
 * - Multiple transitions with weights (priority)
 * - Self-transitions (looping)
 * - Retry configuration for transitions
 */

import { Machine } from "../../src";
import { LogTask, NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// STATE DATA TYPE
// =============================================================================

type ProcessingState = {
    items: string[];
    currentIndex: number;
    processed: string[];
    errors: string[];
};

// =============================================================================
// MACHINE WITH CONDITIONAL TRANSITIONS
// =============================================================================

const processingMachine = Machine
    .create<ProcessingState>()
    .withStates("process", "error", "complete")
    
    // -------------------------------------------------------------------------
    // Process state - loops until all items processed
    // -------------------------------------------------------------------------
    .addState("process", node => node
        .setPlaylist(p => p
            .addTask(new LogTask("log"))
            .input((state) => ({
                action: "processing_item",
                metadata: {
                    index: state.currentIndex,
                    item: state.items[state.currentIndex],
                    remaining: state.items.length - state.currentIndex - 1
                }
            }))
            
            .finally((state, outputs) => {
                const item = state.items[state.currentIndex];
                
                // Simulate: items starting with "bad" cause errors
                if (item.startsWith("bad")) {
                    state.errors.push(item);
                } else {
                    state.processed.push(item);
                }
                
                state.currentIndex++;
            })
        )
        
        // Transition 1: Go to error state if we hit too many errors
        .addTransition({
            to: "error",
            condition: async (state) => state.errors.length >= 2,
            weight: 3  // Highest priority - check first
        })
        
        // Transition 2: Go to complete when all items are done
        .addTransition({
            to: "complete",
            condition: async (state) => state.currentIndex >= state.items.length,
            weight: 2  // Medium priority
        })
        
        // Transition 3: Loop back to process more items
        .addTransition({
            to: "process",  // Self-transition!
            condition: async (state) => state.currentIndex < state.items.length,
            weight: 1  // Lowest priority - checked last
        })
        
        // Retry settings for when no transition is available
        .retryLimit(3)
        .retryDelayMs(100)
    , { initial: true })
    
    // -------------------------------------------------------------------------
    // Error state - too many failures
    // -------------------------------------------------------------------------
    .addState("error", node => node
        .setPlaylist(p => p
            .addTask(new NotifyTask("notify"))
            .input((state) => ({
                message: `Processing aborted! ${state.errors.length} errors: ${state.errors.join(", ")}`,
                level: "error"
            }))
        )
        // Terminal state - no transitions
        .preventRetry()  // Don't retry if notification fails
    )
    
    // -------------------------------------------------------------------------
    // Complete state - all items processed successfully
    // -------------------------------------------------------------------------
    .addState("complete", node => node
        .setPlaylist(p => p
            .addTask(new NotifyTask("notify"))
            .input((state) => ({
                message: `Processing complete! ${state.processed.length} items processed`,
                level: "info"
            }))
        )
        // Terminal state - no transitions
    )
    
    .finalize({ ident: "item-processor" });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Machine Transitions");
    console.log("=".repeat(60) + "\n");

    // -------------------------------------------------------------------------
    // Scenario 1: Successful processing
    // -------------------------------------------------------------------------
    console.log("--- Scenario 1: All items succeed ---\n");
    
    const successState: ProcessingState = {
        items: ["item1", "item2", "item3"],
        currentIndex: 0,
        processed: [],
        errors: []
    };

    await processingMachine.run(successState, { mode: "leaf" });
    
    console.log("\nFinal state:");
    console.log("  Processed:", successState.processed);
    console.log("  Errors:", successState.errors);

    // -------------------------------------------------------------------------
    // Scenario 2: Errors cause early termination
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 2: Too many errors ---\n");
    
    const errorState: ProcessingState = {
        items: ["item1", "bad-item1", "item2", "bad-item2", "item3"],
        currentIndex: 0,
        processed: [],
        errors: []
    };

    await processingMachine.run(errorState, { mode: "leaf" });
    
    console.log("\nFinal state:");
    console.log("  Processed:", errorState.processed);
    console.log("  Errors:", errorState.errors);

    // -------------------------------------------------------------------------
    // Transition Weight Explanation
    // -------------------------------------------------------------------------
    console.log("\n--- Transition Weights ---");
    console.log("Higher weight = higher priority (checked first)");
    console.log("");
    console.log("In 'process' state:");
    console.log("  weight=3: → error    (if errors >= 2)");
    console.log("  weight=2: → complete (if all done)");
    console.log("  weight=1: → process  (continue loop)");
    console.log("");
    console.log("The first matching transition is taken.");
}

main().catch(console.error);
