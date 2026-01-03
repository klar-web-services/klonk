/**
 * Example: Basic Playlist Chaining
 * 
 * A Playlist is a sequence of Tasks executed in order. The key feature is that
 * each task has access to the outputs of ALL previous tasks, with full type safety.
 * 
 * This file demonstrates:
 * - Creating a playlist with .addTask().input()
 * - Accessing the source (initial input)
 * - Accessing outputs from previous tasks
 */

import { Playlist } from "../../src";
import { FetchTask } from "../tasks/01-simple-task";
import { ParseHtmlTask } from "../tasks/02-validation";
import { NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// PLAYLIST DEFINITION
// =============================================================================

/**
 * Define the source type - this is the initial input to the playlist.
 */
type MySource = { 
    targetUrl: string;
};

/**
 * Create a playlist that:
 * 1. Fetches a URL
 * 2. Parses the HTML
 * 3. Sends a notification with the result
 * 
 * Note the fluent .addTask().input() pattern - you MUST call .input() after
 * each .addTask(), otherwise TypeScript will show a TaskInputRequired error.
 */
const myPlaylist = new Playlist<{}, MySource>()
    // Task 1: Fetch the URL
    .addTask(new FetchTask("fetch"))
    .input((source) => ({
        // source is typed as MySource
        url: source.targetUrl
    }))

    // Task 2: Parse the HTML from the fetch result
    .addTask(new ParseHtmlTask("parse"))
    .input((source, outputs) => {
        // outputs is typed as { fetch: Result<FetchOutput> | null }
        // We need to check for success before accessing data
        const fetchResult = outputs["fetch"];
        
        if (fetchResult && fetchResult.isOk()) {
            return { html: fetchResult.body };
        }
        // Fallback if fetch failed
        return { html: "<html><body>Empty</body></html>" };
    })

    // Task 3: Send notification with results
    .addTask(new NotifyTask("notify"))
    .input((source, outputs) => {
        // Now outputs includes both fetch and parse results!
        const parseResult = outputs["parse"];
        
        const title = parseResult && parseResult.isOk() 
            ? parseResult.title 
            : "Unknown";
        
        return {
            message: `Processed ${source.targetUrl}: title="${title}"`,
            level: "info"
        };
    });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Basic Playlist Chaining");
    console.log("=".repeat(60) + "\n");

    // Run the playlist with initial source data
    const source: MySource = {
        targetUrl: "https://example.com"
    };

    console.log("Running playlist with source:", source);
    console.log("");

    // Execute the playlist
    const outputs = await myPlaylist.run(source);

    // The return value contains all task outputs, keyed by task ident
    console.log("\n--- Playlist Outputs ---\n");
    
    // Access outputs with full type safety
    if (outputs.fetch && outputs.fetch.isOk()) {
        console.log("fetch.statusCode:", outputs.fetch.statusCode);
    }
    
    if (outputs.parse && outputs.parse.isOk()) {
        console.log("parse.title:", outputs.parse.title);
        console.log("parse.links:", outputs.parse.links);
    }
    
    if (outputs.notify && outputs.notify.isOk()) {
        console.log("notify.sentAt:", outputs.notify.sentAt);
    }
}

main().catch(console.error);
