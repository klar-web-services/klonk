/**
 * Example: Playlist Retry Behavior
 * 
 * When a task fails (returns success: false), Klonk can automatically retry it.
 * Retry behavior is configured via options passed to playlist.run().
 * 
 * Default behavior: infinite retries at 1000ms delay.
 * This is designed for long-running daemons. For request/response contexts,
 * always set retryLimit or use preventRetry.
 */

import { Playlist } from "../../src";
import { FlakyTask } from "../tasks/04-flaky-task";
import { NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// PLAYLIST WITH FLAKY TASK
// =============================================================================

/**
 * A playlist that includes a flaky task (fails N times before succeeding).
 * The retry mechanism will automatically retry failed tasks.
 */
const retryPlaylist = new Playlist<{}, { maxFailures: number }>()
    .addTask(new FlakyTask("flaky"))
    .input((source) => ({ 
        maxFailures: source.maxFailures 
    }))
    
    .addTask(new NotifyTask("notify"))
    .input((source, outputs) => {
        const attempts = outputs.flaky && outputs.flaky.isOk() 
            ? outputs.flaky.attempts 
            : "?";
        
        return {
            message: `Task succeeded after ${attempts} attempt(s)`,
            level: "info"
        };
    });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Playlist Retry Behavior");
    console.log("=".repeat(60) + "\n");

    // -------------------------------------------------------------------------
    // Example 1: Retry with limit (recommended for most cases)
    // -------------------------------------------------------------------------
    console.log("--- Example 1: Limited Retries (maxRetries: 5) ---\n");
    console.log("Task will fail 2 times, then succeed.\n");
    
    await retryPlaylist.run(
        { maxFailures: 2 },
        { 
            retryDelay: 200,   // 200ms between retries
            maxRetries: 5      // Give up after 5 attempts
        }
    );

    // -------------------------------------------------------------------------
    // Example 2: Fast retries for quick recovery
    // -------------------------------------------------------------------------
    console.log("\n--- Example 2: Fast Retries (50ms delay) ---\n");
    console.log("Task will fail 3 times, then succeed.\n");
    
    // Create a fresh playlist instance to reset the flaky task
    const fastRetryPlaylist = new Playlist<{}, { maxFailures: number }>()
        .addTask(new FlakyTask("flaky"))
        .input((source) => ({ maxFailures: source.maxFailures }))
        .addTask(new NotifyTask("notify"))
        .input((source, outputs) => ({
            message: `Done after ${outputs.flaky && outputs.flaky.isOk() ? outputs.flaky.attempts : "?"} attempts`,
            level: "info"
        }));
    
    await fastRetryPlaylist.run(
        { maxFailures: 3 },
        { 
            retryDelay: 50,    // Very fast retries
            maxRetries: 10     // More attempts allowed
        }
    );

    // -------------------------------------------------------------------------
    // Example 3: What happens when retries are exhausted
    // -------------------------------------------------------------------------
    console.log("\n--- Example 3: Exhausted Retries ---\n");
    console.log("Task will fail 10 times, but we only allow 3 retries.\n");
    
    const exhaustedPlaylist = new Playlist<{}, { maxFailures: number }>()
        .addTask(new FlakyTask("flaky"))
        .input((source) => ({ maxFailures: source.maxFailures }));
    
    try {
        await exhaustedPlaylist.run(
            { maxFailures: 10 }, // Will fail 10 times
            { 
                retryDelay: 100,
                maxRetries: 3     // Only 3 attempts allowed
            }
        );
    } catch (error) {
        console.log("❌ Playlist threw after exhausting retries:");
        console.log("   Error:", (error as Error).message);
    }

    // -------------------------------------------------------------------------
    // Configuration Summary
    // -------------------------------------------------------------------------
    console.log("\n--- Retry Configuration Summary ---\n");
    console.log("Options passed to playlist.run(source, options):");
    console.log("  • retryDelay: number   - ms between retries (default: 1000)");
    console.log("  • maxRetries: number   - max attempts (default: Infinity)");
    console.log("");
    console.log("In Workflows and Machines, use:");
    console.log("  • .retryDelayMs(n)     - set retry delay");
    console.log("  • .retryLimit(n)       - set max retries");
    console.log("  • .preventRetry()      - disable retries entirely");
}

main().catch(console.error);
