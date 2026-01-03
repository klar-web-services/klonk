/**
 * Example: Flaky Task (for Retry Demonstrations)
 * 
 * This task intentionally fails a configurable number of times before
 * succeeding. It's useful for demonstrating Klonk's automatic retry behavior.
 * 
 * In real-world scenarios, this simulates:
 * - Network timeouts
 * - Rate-limited APIs
 * - Temporary service unavailability
 */

import { Task } from "../../src";
import { Result } from "@fkws/klonk-result";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type FlakyInput = { 
    /** How many times to fail before succeeding */
    maxFailures: number;
};

export type FlakyOutput = { 
    /** Total attempts it took to succeed */
    attempts: number;
};

// =============================================================================
// TASK IMPLEMENTATION
// =============================================================================

/**
 * FlakyTask: Fails N times, then succeeds.
 * 
 * Note: This uses instance-level state to track attempts.
 * Each instance maintains its own attempt counter.
 */
export class FlakyTask<TIdent extends string> extends Task<FlakyInput, FlakyOutput, TIdent> {
    private attempts = 0;

    constructor(ident: TIdent) {
        super(ident);
    }

    /** Reset the attempt counter (useful for re-running demos) */
    reset(): void {
        this.attempts = 0;
    }

    async validateInput(): Promise<boolean> {
        return true;
    }

    async run(input: FlakyInput): Promise<Result<FlakyOutput>> {
        this.attempts++;
        
        if (this.attempts <= input.maxFailures) {
            console.log(`[FlakyTask] Attempt ${this.attempts} failed (will retry automatically)`);
            return new Result({
                success: false,
                error: new Error(`Simulated failure ${this.attempts}/${input.maxFailures}`)
            });
        }
        
        console.log(`[FlakyTask] Attempt ${this.attempts} succeeded!`);
        const result = { attempts: this.attempts };
        
        return new Result({ 
            success: true, 
            data: result 
        });
    }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Flaky Task (Retry Behavior Demo)");
    console.log("=".repeat(60) + "\n");

    const flakyTask = new FlakyTask("flaky");

    console.log("--- Simulating 3 failures before success ---\n");
    
    // Manually simulate what Klonk's retry system does
    let result: Result<FlakyOutput>;
    let attemptCount = 0;
    const maxRetries = 5;
    
    do {
        attemptCount++;
        result = await flakyTask.run({ maxFailures: 3 });
        
        if (result.isErr() && attemptCount < maxRetries) {
            console.log(`  → Retrying in 100ms...\n`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } while (result.isErr() && attemptCount < maxRetries);

    console.log("\n--- Result ---");
    if (result.isOk()) {
        console.log(`Success after ${result.attempts} attempts`);
    } else {
        console.log(`Failed after ${attemptCount} retries:`, result.error.message);
    }

    // Reset for another demo
    console.log("\n--- Resetting and trying with fewer failures ---\n");
    flakyTask.reset();
    
    const quickResult = await flakyTask.run({ maxFailures: 0 });
    if (quickResult.isOk()) {
        console.log(`Succeeded immediately (${quickResult.attempts} attempt)`);
    }
}

main().catch(console.error);
