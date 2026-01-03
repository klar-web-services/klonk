/**
 * Example: Task Input Validation
 * 
 * This example shows how to implement robust input validation in tasks.
 * The validateInput() method runs BEFORE run() and should return false
 * if the input is invalid, preventing execution.
 */

import { Task } from "../../src";
import { Result } from "@fkws/klonk-result";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Input type for ParseHtmlTask */
export type ParseInput = { html: string };

/** Output type for ParseHtmlTask */
export type ParseOutput = { title: string; links: string[] };

// =============================================================================
// TASK IMPLEMENTATION
// =============================================================================

/**
 * ParseHtmlTask: Parses HTML content and extracts metadata.
 * 
 * Demonstrates validation patterns:
 * - Check for required fields
 * - Validate content format/length
 * - Return false to reject invalid input
 */
export class ParseHtmlTask<TIdent extends string> extends Task<ParseInput, ParseOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    /**
     * Validate that we have actual HTML content to parse.
     * You can add more sophisticated checks here.
     */
    async validateInput(input: ParseInput): Promise<boolean> {
        // Check that html exists and is not empty
        if (!input.html || input.html.length === 0) {
            return false;
        }
        
        // Could add more validation:
        // - Check for valid HTML structure
        // - Verify encoding
        // - Check maximum size limits
        
        return true;
    }

    async run(input: ParseInput): Promise<Result<ParseOutput>> {
        console.log(`[ParseHtmlTask] Parsing HTML (${input.html.length} chars)`);
        
        // Simulated parsing - in reality you'd use a DOM parser
        return new Result({
            success: true,
            data: { 
                title: "Example Page", 
                links: ["/about", "/contact"] 
            }
        });
    }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Task Input Validation (ParseHtmlTask)");
    console.log("=".repeat(60) + "\n");

    const parseTask = new ParseHtmlTask("parser");

    // Test with valid input
    console.log("--- Testing with valid input ---");
    const validInput = { html: "<html><body>Hello</body></html>" };
    const isValid = await parseTask.validateInput(validInput);
    console.log("Valid input accepted:", isValid);
    
    if (isValid) {
        const result = await parseTask.run(validInput);
        if (result.isOk()) {
            console.log("Parsed title:", result.title);
            console.log("Found links:", result.links);
        }
    }

    // Test with invalid input (empty string)
    console.log("\n--- Testing with invalid input (empty) ---");
    const invalidInput = { html: "" };
    const isInvalid = await parseTask.validateInput(invalidInput);
    console.log("Empty input rejected:", !isInvalid);

    // Test with invalid input (missing field)
    console.log("\n--- Testing with invalid input (undefined) ---");
    const missingInput = { html: undefined as unknown as string };
    const isMissing = await parseTask.validateInput(missingInput);
    console.log("Undefined input rejected:", !isMissing);
}

main().catch(console.error);
