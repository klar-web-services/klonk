/**
 * Example: Creating a Simple Task
 * 
 * A Task is the smallest unit of work in Klonk. It's an abstract class with:
 * - validateInput(input): Runtime validation of input data
 * - run(input): The core logic, returns a Railroad<Output> (success or error)
 * 
 * This file demonstrates the simplest possible task implementation.
 */

import { Task, Railroad } from "../../src";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Input type for FetchTask */
export type FetchInput = { url: string };

/** Output type for FetchTask */
export type FetchOutput = { statusCode: number; body: string };

// =============================================================================
// TASK IMPLEMENTATION
// =============================================================================

/**
 * FetchTask: A simple task that fetches data from a URL.
 * 
 * The generic parameter TIdent allows each instance to have a unique
 * string literal identifier, enabling type-safe output access in Playlists.
 */
export class FetchTask<TIdent extends string> extends Task<FetchInput, FetchOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    /**
     * Validate the input before running.
     * Return true if valid, false otherwise.
     */
    async validateInput(input: FetchInput): Promise<boolean> {
        return input.url.startsWith("http");
    }

    /**
     * Execute the task logic.
     * Returns a Railroad type: { success: true, data: T } or { success: false, error: Error }
     */
    async run(input: FetchInput): Promise<Railroad<FetchOutput>> {
        // In a real implementation, you'd use fetch() here
        console.log(`[FetchTask] Fetching ${input.url}`);
        
        return {
            success: true,
            data: { 
                statusCode: 200, 
                body: `<html>Content from ${input.url}</html>` 
            }
        };
    }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Simple Task (FetchTask)");
    console.log("=".repeat(60) + "\n");

    // Create an instance with a unique identifier
    const fetchTask = new FetchTask("my-fetch");

    // Validate input
    const isValid = await fetchTask.validateInput({ url: "https://example.com" });
    console.log("Input valid:", isValid);

    // Run the task
    const result = await fetchTask.run({ url: "https://example.com" });

    // Check the result
    if (result.success) {
        console.log("Success! Status code:", result.data.statusCode);
        console.log("Body preview:", result.data.body.substring(0, 50) + "...");
    } else {
        console.log("Error:", result.error.message);
    }
}

main().catch(console.error);
