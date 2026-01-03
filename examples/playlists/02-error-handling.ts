/**
 * Example: Error Handling in Playlists
 * 
 * This example demonstrates different patterns for handling task failures
 * within a playlist using Result methods:
 * - isOk() / isErr() for type guards
 * - Conditional logic for defaults and fallbacks
 */

import { Playlist } from "../../src";
import { FetchTask } from "../tasks/01-simple-task";
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
        if (outputs.fetch && outputs.fetch.isOk()) {
            // Direct access via proxy
            return { html: outputs.fetch.body };
        }
        // Fallback for failure
        return { html: "<html><body>Fetch failed</body></html>" };
    })
    
    .addTask(new LogTask("log"))
    .input((source, outputs) => ({
        action: "processed",
        metadata: {
            // Pattern: inline ternary with isOk
            fetchSuccess: outputs.fetch ? outputs.fetch.isOk() : false,
            parseSuccess: outputs.parse ? outputs.parse.isOk() : false,
            // Safe nested access
            title: outputs.parse && outputs.parse.isOk() ? outputs.parse.title : null
        }
    }));

// =============================================================================
// PATTERN 2: Manual Defaults (replacing unwrapOr)
// =============================================================================

/**
 * Cleaner when you have a simple default value.
 * Use ternary operator or helper function.
 */
const unwrapOrPatternPlaylist = new Playlist<{}, { url: string }>()
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.url }))
    
    .addTask(new ParseHtmlTask("parse"))
    .input((source, outputs) => {
        // Pattern: ternary default
        const body = (outputs.fetch && outputs.fetch.isOk())
            ? outputs.fetch.body
            : "<empty/>";
        
        return { html: body };
    })
    
    .addTask(new LogTask("log"))
    .input((source, outputs) => {
        const fetchOk = outputs.fetch && outputs.fetch.isOk();
        
        return {
            action: "processed",
            metadata: {
                statusCode: fetchOk ? outputs.fetch!.statusCode : 0,
                bodyLength: fetchOk ? outputs.fetch!.body.length : 0
            }
        };
    });

// =============================================================================
// PATTERN 3: Computed Fallbacks (replacing unwrapOrElse)
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
        let fetchData: { statusCode: number; body: string };
        
        if (outputs.fetch && outputs.fetch.isOk()) {
             fetchData = { statusCode: outputs.fetch.statusCode, body: outputs.fetch.body };
        } else if (outputs.fetch && outputs.fetch.isErr()) {
             fetchData = {
                statusCode: 500,
                body: `Error: ${outputs.fetch.error.message}`
             };
        } else {
             fetchData = { statusCode: 0, body: "No result" };
        }
        
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
        if (outputs.fetch && outputs.fetch.isErr()) {
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

    console.log("\n--- Pattern 2: Manual Defaults ---\n");
    await unwrapOrPatternPlaylist.run(source);

    console.log("\n--- Pattern 3: Computed Fallbacks ---\n");
    await unwrapOrElsePatternPlaylist.run(source);

    console.log("\n--- Pattern 4: isErr() Error Handling ---\n");
    await isErrPatternPlaylist.run(source);

    // Summary
    console.log("\n--- Pattern Summary ---");
    console.log("• isOk()/isErr(): Best for branching logic");
    console.log("• Ternary operators: Best for simple defaults");
    console.log("• if/else blocks: Best for complex fallbacks");
}

main().catch(console.error);
