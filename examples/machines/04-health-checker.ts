/**
 * Example: Health Checker Machine (Full Example)
 * 
 * This is a complete, real-world example of a state machine that:
 * - Iterates through a list of URLs
 * - Fetches and parses each one
 * - Tracks results in state data
 * - Sends a summary notification when done
 * 
 * Demonstrates:
 * - Complex state data management
 * - Self-transitions (looping)
 * - Conditional transitions based on state
 * - Using .finally() to update state between iterations
 * - Multiple tasks per state
 */

import { Machine, isOk, unwrapOr } from "../../src";
import { FetchTask, FetchOutput } from "../tasks/01-simple-task";
import { ParseHtmlTask } from "../tasks/02-validation";
import { LogTask, NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// STATE DATA TYPE
// =============================================================================

type HealthCheckState = {
    /** URLs to check */
    urls: string[];
    
    /** Current position in the URL list */
    currentIndex: number;
    
    /** Results for each URL */
    results: Array<{
        url: string;
        healthy: boolean;
        title?: string;
        statusCode?: number;
    }>;
};

// =============================================================================
// HEALTH CHECKER MACHINE
// =============================================================================

const healthCheckMachine = Machine
    .create<HealthCheckState>()
    .withStates<"check-url" | "complete">()
    
    // -------------------------------------------------------------------------
    // State: check-url (loops for each URL)
    // -------------------------------------------------------------------------
    .addState("check-url", node => node
        .setPlaylist(p => p
            // Fetch the current URL
            .addTask(new FetchTask("fetch"))
            .input((state) => ({
                url: state.urls[state.currentIndex]
            }))
            
            // Parse the response
            .addTask(new ParseHtmlTask("parse"))
            .input((state, outputs) => {
                // Use unwrapOr for clean fallback
                const defaultFetch: FetchOutput = { statusCode: 0, body: "" };
                const fetchData = outputs.fetch 
                    ? unwrapOr(outputs.fetch, defaultFetch)
                    : defaultFetch;
                return { html: fetchData.body };
            })
            
            // Log the check result
            .addTask(new LogTask("log"))
            .input((state, outputs) => ({
                action: "url_checked",
                metadata: {
                    url: state.urls[state.currentIndex],
                    index: state.currentIndex,
                    total: state.urls.length,
                    fetchSuccess: outputs.fetch ? isOk(outputs.fetch) : false,
                    parseSuccess: outputs.parse ? isOk(outputs.parse) : false,
                    title: outputs.parse && isOk(outputs.parse) 
                        ? outputs.parse.data.title 
                        : null,
                    linkCount: outputs.parse && isOk(outputs.parse) 
                        ? outputs.parse.data.links.length 
                        : 0
                }
            }))
            
            // Update state with results
            .finally((state, outputs) => {
                const fetchOk = outputs.fetch && isOk(outputs.fetch);
                const parseOk = outputs.parse && isOk(outputs.parse);
                const healthy = fetchOk && parseOk;
                
                state.results.push({
                    url: state.urls[state.currentIndex],
                    healthy: healthy ?? false,
                    title: outputs.parse && isOk(outputs.parse) ? outputs.parse.data.title : undefined,
                    statusCode: outputs.fetch && isOk(outputs.fetch) ? outputs.fetch.data.statusCode : undefined
                });
                
                // Move to next URL
                state.currentIndex++;
            })
        )
        
        // Transition: More URLs to check → loop back
        .addTransition({
            to: "check-url",  // Self-transition!
            condition: async (state) => state.currentIndex < state.urls.length,
            weight: 2  // Higher priority - check this first
        })
        
        // Transition: All URLs checked → complete
        .addTransition({
            to: "complete",
            condition: async (state) => state.currentIndex >= state.urls.length,
            weight: 1
        })
        
        // Retry if transitions fail
        .retryLimit(3)
        .retryDelayMs(500)
    , { initial: true })
    
    // -------------------------------------------------------------------------
    // State: complete (terminal)
    // -------------------------------------------------------------------------
    .addState("complete", node => node
        .setPlaylist(p => p
            // Send summary notification
            .addTask(new NotifyTask("notify"))
            .input((state) => {
                const healthyCount = state.results.filter(r => r.healthy).length;
                const totalCount = state.results.length;
                const allHealthy = healthyCount === totalCount;
                
                return {
                    message: `Health check complete: ${healthyCount}/${totalCount} URLs healthy`,
                    level: allHealthy ? "info" : "warn"
                };
            })
            
            // Log detailed results
            .addTask(new LogTask("logResults"))
            .input((state) => ({
                action: "health_check_complete",
                metadata: {
                    summary: {
                        total: state.results.length,
                        healthy: state.results.filter(r => r.healthy).length,
                        unhealthy: state.results.filter(r => !r.healthy).length
                    },
                    results: state.results
                }
            }))
        )
        // Terminal state - don't retry if notification fails
        .preventRetry()
    )
    
    .finalize({ ident: "health-checker" });

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Health Checker Machine (Full Example)");
    console.log("=".repeat(60) + "\n");

    // Initialize state
    const state: HealthCheckState = {
        urls: [
            "https://example.com",
            "https://example.org",
            "https://example.net",
            "https://test.example.com"
        ],
        currentIndex: 0,
        results: []
    };

    console.log("URLs to check:", state.urls);
    console.log("");

    // Run the machine until it reaches the terminal state
    await healthCheckMachine.run(state, { mode: "leaf" });

    // -------------------------------------------------------------------------
    // Display results
    // -------------------------------------------------------------------------
    console.log("\n" + "=".repeat(60));
    console.log("HEALTH CHECK RESULTS");
    console.log("=".repeat(60) + "\n");

    for (const result of state.results) {
        const status = result.healthy ? "✅ HEALTHY" : "❌ UNHEALTHY";
        console.log(`${status}: ${result.url}`);
        if (result.title) {
            console.log(`         Title: ${result.title}`);
        }
        if (result.statusCode) {
            console.log(`         Status: ${result.statusCode}`);
        }
    }

    const healthyCount = state.results.filter(r => r.healthy).length;
    console.log(`\nTotal: ${healthyCount}/${state.results.length} healthy`);

    // -------------------------------------------------------------------------
    // State Flow Visualization
    // -------------------------------------------------------------------------
    console.log("\n--- State Flow ---");
    console.log("┌─────────────┐");
    console.log("│  check-url  │◄──────┐");
    console.log("│             │       │");
    console.log("│ • fetch     │       │ more URLs");
    console.log("│ • parse     │       │ to check");
    console.log("│ • log       │───────┘");
    console.log("│ • finally() │");
    console.log("└──────┬──────┘");
    console.log("       │ all done");
    console.log("       ▼");
    console.log("┌─────────────┐");
    console.log("│  complete   │");
    console.log("│             │");
    console.log("│ • notify    │");
    console.log("│ • log       │");
    console.log("└─────────────┘");
}

main().catch(console.error);
