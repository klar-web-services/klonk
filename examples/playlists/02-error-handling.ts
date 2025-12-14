/**
 * Example: Error Handling in Playlists
 * 
 * This example demonstrates different patterns for handling task failures
 * within a playlist using Railroad helpers:
 * - isOk() / isErr() for type guards
 * - unwrapOr() for default values
 * - unwrapOrElse() for computed fallbacks
 */

import { Playlist, isOk, isErr, unwrapOr, unwrapOrElse } from "../../src";
import { FetchTask, FetchOutput } from "../tasks/01-simple-task";
import { ParseHtmlTask } from "../tasks/02-validation";
import { LogTask } from "../tasks/03-error-handling";

// =============================================================================
// PATTERN 1: Using isOk() for Type Guards
// =============================================================================

/**
 * Most common pattern - check success before accessing data.
 * TypeScript narrows the type automatically.
 */
const isOkPatternPlaylist = new Playlist<{}, { url: string }>()
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.url }))
    
    .addTask(new ParseHtmlTask("parse"))
    .input((source, outputs) => {
        // Pattern: isOk() check with fallback
        if (outputs.fetch && isOk(outputs.fetch)) {
            // TypeScript knows: outputs.fetch.data exists
            return { html: outputs.fetch.data.body };
        }
        // Fallback for failure
        return { html: "<html><body>Fetch failed</body></html>" };
    })
    
    .addTask(new LogTask("log"))
    .input((source, outputs) => ({
        action: "processed",
        metadata: {
            // Pattern: inline ternary with isOk
            fetchSuccess: outputs.fetch ? isOk(outputs.fetch) : false,
            parseSuccess: outputs.parse ? isOk(outputs.parse) : false,
            // Safe nested access
            title: outputs.parse && isOk(outputs.parse) ? outputs.parse.data.title : null
        }
    }));

// =============================================================================
// PATTERN 2: Using unwrapOr() for Defaults
// =============================================================================

/**
 * Cleaner when you have a simple default value.
 * No need for if/else blocks.
 */
const unwrapOrPatternPlaylist = new Playlist<{}, { url: string }>()
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.url }))
    
    .addTask(new ParseHtmlTask("parse"))
    .input((source, outputs) => {
        // Pattern: unwrapOr with default
        const defaultFetch: FetchOutput = { statusCode: 0, body: "<empty/>" };
        const fetchData = outputs.fetch 
            ? unwrapOr(outputs.fetch, defaultFetch)
            : defaultFetch;
        
        return { html: fetchData.body };
    })
    
    .addTask(new LogTask("log"))
    .input((source, outputs) => {
        // Pattern: nested unwrapOr for deep access
        const defaultFetch: FetchOutput = { statusCode: 0, body: "" };
        const fetchData = outputs.fetch 
            ? unwrapOr(outputs.fetch, defaultFetch)
            : defaultFetch;
        
        return {
            action: "processed",
            metadata: {
                statusCode: fetchData.statusCode,
                bodyLength: fetchData.body.length
            }
        };
    });

// =============================================================================
// PATTERN 3: Using unwrapOrElse() for Computed Fallbacks
// =============================================================================

/**
 * Best when you need to compute a fallback based on the error.
 */
const unwrapOrElsePatternPlaylist = new Playlist<{}, { url: string }>()
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.url }))
    
    .addTask(new LogTask("log"))
    .input((source, outputs) => {
        // Pattern: compute fallback from error
        const fetchData = outputs.fetch 
            ? unwrapOrElse(outputs.fetch, (err) => ({
                statusCode: 500,
                body: `Error: ${err.message}`
            }))
            : { statusCode: 0, body: "No result" };
        
        return {
            action: fetchData.statusCode >= 400 ? "fetch_error" : "fetch_success",
            metadata: {
                statusCode: fetchData.statusCode,
                bodyPreview: fetchData.body.substring(0, 100)
            }
        };
    });

// =============================================================================
// PATTERN 4: Using isErr() for Error-Specific Handling
// =============================================================================

/**
 * When you need to handle the error specifically.
 */
const isErrPatternPlaylist = new Playlist<{}, { url: string }>()
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.url }))
    
    .addTask(new LogTask("logError"))
    .input((source, outputs) => {
        // Pattern: Check for error and access error details
        if (outputs.fetch && isErr(outputs.fetch)) {
            return {
                action: "fetch_failed",
                metadata: {
                    url: source.url,
                    error: outputs.fetch.error.message,
                    stack: outputs.fetch.error.stack
                }
            };
        }
        return {
            action: "fetch_succeeded",
            metadata: { url: source.url }
        };
    });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Error Handling Patterns in Playlists");
    console.log("=".repeat(60) + "\n");

    const source = { url: "https://example.com" };

    // Run each pattern
    console.log("--- Pattern 1: isOk() Type Guards ---\n");
    await isOkPatternPlaylist.run(source);

    console.log("\n--- Pattern 2: unwrapOr() Defaults ---\n");
    await unwrapOrPatternPlaylist.run(source);

    console.log("\n--- Pattern 3: unwrapOrElse() Computed Fallbacks ---\n");
    await unwrapOrElsePatternPlaylist.run(source);

    console.log("\n--- Pattern 4: isErr() Error Handling ---\n");
    await isErrPatternPlaylist.run(source);

    // Summary
    console.log("\n--- Pattern Summary ---");
    console.log("• isOk()/isErr(): Best for branching logic");
    console.log("• unwrapOr(): Best for simple default values");
    console.log("• unwrapOrElse(): Best when fallback depends on error");
}

main().catch(console.error);
