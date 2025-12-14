/**
 * Example: Railroad (Rust-inspired Result Type)
 * 
 * Railroad<T> is Klonk's version of Rust's Result<T, E>. It's a discriminated
 * union that forces you to handle both success and error cases:
 * 
 *   type Railroad<T> = 
 *       | { success: true, data: T }
 *       | { success: false, error: Error }
 * 
 * This file demonstrates all the helper functions for working with Railroad.
 */

import { Railroad, unwrap, unwrapOr, unwrapOrElse, isOk, isErr } from "../../src";
import { FetchTask, FetchOutput } from "../tasks/01-simple-task";

// =============================================================================
// HELPER FUNCTIONS OVERVIEW
// =============================================================================

/**
 * | Function        | Rust Equivalent    | Behavior                          |
 * |-----------------|--------------------|------------------------------------|
 * | isOk(r)         | r.is_ok()          | Type guard for success case        |
 * | isErr(r)        | r.is_err()         | Type guard for error case          |
 * | unwrap(r)       | r.unwrap()         | Returns data or throws error       |
 * | unwrapOr(r, d)  | r.unwrap_or(d)     | Returns data or default value      |
 * | unwrapOrElse(r, fn) | r.unwrap_or_else(fn) | Returns data or computed fallback |
 */

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Railroad (Rust-inspired Result Handling)");
    console.log("=".repeat(60) + "\n");

    const fetchTask = new FetchTask("fetch");
    
    // Create a successful result
    const successResult = await fetchTask.run({ url: "https://example.com" });
    
    // Create an error result for demonstration
    const errorResult: Railroad<FetchOutput> = {
        success: false,
        error: new Error("Network timeout")
    };

    // -------------------------------------------------------------------------
    // isOk() and isErr() - Type Guards
    // -------------------------------------------------------------------------
    console.log("--- isOk() and isErr(): Type Guards ---\n");
    
    if (isOk(successResult)) {
        // TypeScript knows: successResult.data exists
        console.log("✅ isOk(success) = true");
        console.log("   Status code:", successResult.data.statusCode);
    }
    
    if (isErr(errorResult)) {
        // TypeScript knows: errorResult.error exists
        console.log("✅ isErr(error) = true");
        console.log("   Error message:", errorResult.error.message);
    }

    // -------------------------------------------------------------------------
    // unwrap() - Get Data or Throw
    // -------------------------------------------------------------------------
    console.log("\n--- unwrap(): Get Data or Throw ---\n");
    
    // Success case - returns data
    try {
        const data = unwrap(successResult);
        console.log("✅ unwrap(success) returned data:", data.statusCode);
    } catch (e) {
        console.log("❌ unwrap(success) threw (unexpected)");
    }

    // Error case - throws
    try {
        unwrap(errorResult);
        console.log("❌ unwrap(error) should have thrown");
    } catch (e) {
        console.log("✅ unwrap(error) threw as expected:", (e as Error).message);
    }

    // -------------------------------------------------------------------------
    // unwrapOr() - Get Data or Default
    // -------------------------------------------------------------------------
    console.log("\n--- unwrapOr(): Get Data or Default ---\n");
    
    const defaultValue: FetchOutput = { statusCode: 0, body: "fallback content" };
    
    // Success case - returns actual data
    const fromSuccess = unwrapOr(successResult, defaultValue);
    console.log("✅ unwrapOr(success, default):", fromSuccess.statusCode, "(actual)");
    
    // Error case - returns default
    const fromError = unwrapOr(errorResult, defaultValue);
    console.log("✅ unwrapOr(error, default):", fromError.statusCode, "(fallback)");

    // -------------------------------------------------------------------------
    // unwrapOrElse() - Get Data or Compute Fallback
    // -------------------------------------------------------------------------
    console.log("\n--- unwrapOrElse(): Get Data or Compute Fallback ---\n");
    
    // Compute fallback from the error
    const computed = unwrapOrElse(errorResult, (err) => ({
        statusCode: 500,
        body: `Error occurred: ${err.message}`
    }));
    console.log("✅ unwrapOrElse(error, fn):");
    console.log("   Status:", computed.statusCode);
    console.log("   Body:", computed.body);

    // -------------------------------------------------------------------------
    // Practical Pattern: Chaining with isOk
    // -------------------------------------------------------------------------
    console.log("\n--- Practical Pattern: Conditional Logic ---\n");
    
    function processResult(result: Railroad<FetchOutput>): string {
        if (isOk(result)) {
            return `Success! Got ${result.data.body.length} bytes`;
        }
        if (isErr(result)) {
            return `Failed: ${result.error.message}`;
        }
        return "Unknown state"; // Should never reach here
    }

    console.log("Process success:", processResult(successResult));
    console.log("Process error:", processResult(errorResult));

    // -------------------------------------------------------------------------
    // Why Railroad? (vs try/catch)
    // -------------------------------------------------------------------------
    console.log("\n--- Why Railroad? ---\n");
    console.log("1. Errors are values, not thrown exceptions");
    console.log("2. TypeScript forces you to handle both cases");
    console.log("3. Familiar patterns if you know Rust's Result<T, E>");
    console.log("4. Composable with Playlist output chaining");
}

main().catch(console.error);
