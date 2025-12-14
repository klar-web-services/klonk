/**
 * Example: Skipping Tasks Conditionally
 * 
 * Sometimes you want to skip a task based on some condition. In Klonk,
 * you can skip a task by returning `null` from its input builder.
 * 
 * This file demonstrates:
 * - Returning null to skip a task
 * - Checking if a task was skipped (outputs.x === null)
 * - Conditional workflows based on input flags
 */

import { Playlist, isOk } from "../../src";
import { LogTask, NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// PLAYLIST WITH SKIPPABLE TASKS
// =============================================================================

type ProcessSource = {
    /** Whether to send a notification */
    shouldNotify: boolean;
    /** The message to process */
    message: string;
};

/**
 * A playlist where the notification task is conditionally skipped.
 * 
 * When shouldNotify is false, the notify task is skipped entirely.
 * Skipped tasks have null in their output slot.
 */
const conditionalPlaylist = new Playlist<{}, ProcessSource>()
    // Task 1: Always log the start
    .addTask(new LogTask("logStart"))
    .input((source) => ({
        action: "process_started",
        metadata: { 
            message: source.message,
            notificationRequested: source.shouldNotify 
        }
    }))

    // Task 2: Conditionally skip notification
    .addTask(new NotifyTask("notify"))
    .input((source, outputs) => {
        // Return null to skip this task!
        if (!source.shouldNotify) {
            console.log("[Playlist] Skipping notification (not requested)");
            return null;
        }
        
        // Access previous output for the notification
        const logId = outputs.logStart && isOk(outputs.logStart) 
            ? outputs.logStart.data.logId 
            : "unknown";
        
        return {
            message: `${source.message} (logged as ${logId})`,
            level: "info"
        };
    })

    // Task 3: Log completion and check if notification was skipped
    .addTask(new LogTask("logEnd"))
    .input((source, outputs) => {
        // Check if the notify task was skipped
        const wasSkipped = outputs.notify === null;
        
        // If not skipped, check if it succeeded
        const notificationSent = !wasSkipped && outputs.notify && isOk(outputs.notify);
        
        return {
            action: "process_complete",
            metadata: {
                notificationRequested: source.shouldNotify,
                notificationSkipped: wasSkipped,
                notificationSent: notificationSent,
                // Access notification time if it was sent
                notifiedAt: outputs.notify && isOk(outputs.notify) ? outputs.notify.data.sentAt : null
            }
        };
    });

// =============================================================================
// SKIP BASED ON PREVIOUS TASK RESULT
// =============================================================================

type FetchSource = {
    url: string;
    fallbackOnError: boolean;
};

/**
 * Skip a task based on whether a previous task succeeded.
 */
const skipOnErrorPlaylist = new Playlist<{}, FetchSource>()
    .addTask(new LogTask("log"))
    .input((source) => ({
        action: "fetching",
        metadata: { url: source.url }
    }))

    // Skip notification if logging failed AND fallback is disabled
    .addTask(new NotifyTask("notify"))
    .input((source, outputs) => {
        const logSucceeded = outputs.log && isOk(outputs.log);
        
        // Skip if log failed and we don't want fallback
        if (!logSucceeded && !source.fallbackOnError) {
            console.log("[Playlist] Skipping notification (log failed, no fallback)");
            return null;
        }
        
        return {
            message: logSucceeded 
                ? `Logged successfully` 
                : `Log failed but sending notification anyway`,
            level: logSucceeded ? "info" : "warn"
        };
    });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Skipping Tasks Conditionally");
    console.log("=".repeat(60) + "\n");

    // --- Run with notification enabled ---
    console.log("--- With notification enabled ---\n");
    
    const result1 = await conditionalPlaylist.run({ 
        shouldNotify: true, 
        message: "Hello, World!" 
    });
    
    console.log("\nOutputs:");
    console.log("  notify:", result1.notify === null ? "SKIPPED" : "sent");
    if (result1.notify && isOk(result1.notify)) {
        console.log("  sentAt:", result1.notify.data.sentAt);
    }

    // --- Run with notification disabled ---
    console.log("\n--- With notification disabled ---\n");
    
    const result2 = await conditionalPlaylist.run({ 
        shouldNotify: false, 
        message: "Hello, World!" 
    });
    
    console.log("\nOutputs:");
    console.log("  notify:", result2.notify === null ? "SKIPPED (null)" : "sent");

    // --- Type safety demonstration ---
    console.log("\n--- Type Safety ---\n");
    console.log("When a task is skipped, its output is `null`, not `undefined`.");
    console.log("This is similar to Rust's Option<T>:");
    console.log("  • null = task was skipped (Option::None)");
    console.log("  • Railroad<T> = task ran (Option::Some(Result<T, E>))");
}

main().catch(console.error);
