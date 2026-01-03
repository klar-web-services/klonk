/**
 * Example: The .finally() Hook
 * 
 * The .finally() method runs after all tasks complete, giving you access to:
 * - The source (initial input)
 * - All task outputs
 * 
 * This is useful for:
 * - Mutating external state (especially in Machines)
 * - Aggregating results
 * - Side effects that depend on all outputs
 * 
 * Note: .finally() is typically used in Machine states where you need to
 * update the machine's stateData based on task results.
 */

import { Playlist } from "../../src";
import { FetchTask } from "../tasks/01-simple-task";
import { ParseHtmlTask } from "../tasks/02-validation";
import { LogTask } from "../tasks/03-error-handling";

// =============================================================================
// EXTERNAL STATE TO MUTATE
// =============================================================================

/**
 * Simulates external state that we want to update after playlist completes.
 * In a Machine, this would be the stateData object.
 */
interface ProcessingState {
    processedUrls: string[];
    successCount: number;
    failureCount: number;
    lastTitle: string | null;
}

const state: ProcessingState = {
    processedUrls: [],
    successCount: 0,
    failureCount: 0,
    lastTitle: null
};

// =============================================================================
// PLAYLIST WITH .finally() HOOK
// =============================================================================

type Source = { url: string };

const playlistWithFinally = new Playlist<{}, Source>()
    // Fetch the URL
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.url }))

    // Parse the response
    .addTask(new ParseHtmlTask("parse"))
    .input((source, outputs) => {
        if (outputs.fetch && outputs.fetch.isOk()) {
            return { html: outputs.fetch.body };
        }
        return { html: "" };
    })

    // Log the result
    .addTask(new LogTask("log"))
    .input((source, outputs) => ({
        action: "url_processed",
        metadata: {
            url: source.url,
            fetchSuccess: outputs.fetch ? outputs.fetch.isOk() : false,
            parseSuccess: outputs.parse ? outputs.parse.isOk() : false
        }
    }))

    // .finally() - runs after all tasks complete
    .finally((source, outputs) => {
        console.log("\n[.finally()] Updating external state...");
        
        // Track processed URL
        state.processedUrls.push(source.url);
        
        // Update success/failure counts
        const fetchOk = outputs.fetch && outputs.fetch.isOk();
        const parseOk = outputs.parse && outputs.parse.isOk();
        
        if (fetchOk && parseOk) {
            state.successCount++;
        } else {
            state.failureCount++;
        }
        
        // Store the last parsed title
        if (outputs.parse && outputs.parse.isOk()) {
            state.lastTitle = outputs.parse.title;
        }
        
        console.log("[.finally()] State updated:", state);
    });

// =============================================================================
// MULTIPLE .finally() CALLS
// =============================================================================

/**
 * You can chain multiple .finally() calls - they run in order.
 */
const multipleFinally = new Playlist<{}, { value: number }>()
    .addTask(new LogTask("log"))
    .input((source) => ({
        action: "processing",
        metadata: { value: source.value }
    }))
    
    .finally((source, outputs) => {
        console.log("[finally 1] First hook - value:", source.value);
    })
    
    .finally((source, outputs) => {
        console.log("[finally 2] Second hook - logging succeeded:", 
            outputs.log ? outputs.log.isOk() : false);
    })
    
    .finally((source, outputs) => {
        console.log("[finally 3] Third hook - cleanup");
    });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: The .finally() Hook");
    console.log("=".repeat(60) + "\n");

    // Initial state
    console.log("Initial state:", state);
    console.log("");

    // Process multiple URLs
    console.log("--- Processing URL 1 ---\n");
    await playlistWithFinally.run({ url: "https://example.com" });

    console.log("\n--- Processing URL 2 ---\n");
    await playlistWithFinally.run({ url: "https://example.org" });

    console.log("\n--- Processing URL 3 ---\n");
    await playlistWithFinally.run({ url: "https://example.net" });

    // Show final aggregated state
    console.log("\n--- Final Aggregated State ---");
    console.log("Processed URLs:", state.processedUrls);
    console.log("Success count:", state.successCount);
    console.log("Failure count:", state.failureCount);
    console.log("Last title:", state.lastTitle);

    // Demonstrate multiple .finally() hooks
    console.log("\n--- Multiple .finally() Hooks ---\n");
    await multipleFinally.run({ value: 42 });
}

main().catch(console.error);
