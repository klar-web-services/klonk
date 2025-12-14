/**
 * Klonk Example - Demonstrating Tasks, Machines, and Workflows
 * 
 * This file shows how to:
 * 1. Create concrete Task implementations
 * 2. Chain tasks in a Playlist with typed outputs
 * 3. Use Playlists in a Machine (state machine)
 * 4. Use Playlists in a Workflow (trigger-based)
 */

import { Task, Railroad, Playlist, Machine, StateNode, Workflow, Trigger, TriggerEvent, unwrap, unwrapOr, unwrapOrElse, isOk, isErr } from "./src";

// =============================================================================
// TASK DEFINITIONS
// =============================================================================

/**
 * Task 1: Fetch data from a URL
 */
type FetchInput = { url: string };
type FetchOutput = { statusCode: number; body: string };

class FetchTask<TIdent extends string> extends Task<FetchInput, FetchOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(input: FetchInput): Promise<boolean> {
        return input.url.startsWith("http");
    }

    async run(input: FetchInput): Promise<Railroad<FetchOutput>> {
        // Simulated fetch
        console.log(`[FetchTask] Fetching ${input.url}`);
        return {
            success: true,
            data: { statusCode: 200, body: `<html>Content from ${input.url}</html>` }
        };
    }
}

/**
 * Task 2: Parse HTML content
 */
type ParseInput = { html: string };
type ParseOutput = { title: string; links: string[] };

class ParseHtmlTask<TIdent extends string> extends Task<ParseInput, ParseOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(input: ParseInput): Promise<boolean> {
        return input.html.length > 0;
    }

    async run(input: ParseInput): Promise<Railroad<ParseOutput>> {
        console.log(`[ParseHtmlTask] Parsing HTML (${input.html.length} chars)`);
        return {
            success: true,
            data: { title: "Example Page", links: ["/about", "/contact"] }
        };
    }
}

/**
 * Task 3: Send notification
 */
type NotifyInput = { message: string; level: "info" | "warn" | "error" };
type NotifyOutput = { sentAt: Date };

class NotifyTask<TIdent extends string> extends Task<NotifyInput, NotifyOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(input: NotifyInput): Promise<boolean> {
        return input.message.length > 0;
    }

    async run(input: NotifyInput): Promise<Railroad<NotifyOutput>> {
        console.log(`[NotifyTask] [${input.level.toUpperCase()}] ${input.message}`);
        return {
            success: true,
            data: { sentAt: new Date() }
        };
    }
}

/**
 * Task 4: Log to database
 */
type LogInput = { action: string; metadata: Record<string, unknown> };
type LogOutput = { logId: string };

class LogTask<TIdent extends string> extends Task<LogInput, LogOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(): Promise<boolean> {
        return true;
    }

    async run(input: LogInput): Promise<Railroad<LogOutput>> {
        const logId = `log_${Date.now()}`;
        console.log(`[LogTask] Logged "${input.action}" with id ${logId}`);
        return {
            success: true,
            data: { logId }
        };
    }
}

/**
 * Task 5: A flaky task that fails a few times before succeeding
 * Demonstrates the automatic retry behavior
 */
type FlakyInput = { maxFailures: number };
type FlakyOutput = { attempts: number };

let flakyAttempts = 0;

class FlakyTask<TIdent extends string> extends Task<FlakyInput, FlakyOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(): Promise<boolean> {
        return true;
    }

    async run(input: FlakyInput): Promise<Railroad<FlakyOutput>> {
        flakyAttempts++;
        if (flakyAttempts <= input.maxFailures) {
            console.log(`[FlakyTask] Attempt ${flakyAttempts} failed (will retry automatically)`);
            return {
                success: false,
                error: new Error(`Simulated failure ${flakyAttempts}/${input.maxFailures}`)
            };
        }
        console.log(`[FlakyTask] Attempt ${flakyAttempts} succeeded!`);
        const result = { attempts: flakyAttempts };
        flakyAttempts = 0; // Reset for next demo
        return { success: true, data: result };
    }
}

// =============================================================================
// RAILROAD EXAMPLE - Rust-inspired Result Handling
// =============================================================================

/**
 * Demonstrates the Railroad type and its helper functions.
 * Railroad is Klonk's version of Rust's Result<T, E>.
 */
async function runRailroadExample() {
    console.log("\n" + "=".repeat(60));
    console.log("RAILROAD EXAMPLE: Rust-inspired Result Handling");
    console.log("=".repeat(60) + "\n");

    const fetchTask = new FetchTask("fetch");
    
    // Successful result
    const successResult = await fetchTask.run({ url: "https://example.com" });
    
    // Using type guards (like Rust's match)
    if (isOk(successResult)) {
        console.log("✅ isOk() - Success! Status:", successResult.data.statusCode);
    }
    if (isErr(successResult)) {
        console.log("❌ isErr() - Error:", successResult.error.message);
    }

    // Using unwrap (like Rust's .unwrap() - panics/throws on error)
    try {
        const data = unwrap(successResult);
        console.log("✅ unwrap() - Got data:", data.statusCode);
    } catch (e) {
        console.log("❌ unwrap() threw:", e);
    }

    // Using unwrapOr (like Rust's .unwrap_or())
    const dataOrDefault = unwrapOr(successResult, { statusCode: 0, body: "fallback" });
    console.log("✅ unwrapOr() - Status:", dataOrDefault.statusCode);

    // Simulating an error result
    const errorResult: Railroad<FetchOutput> = {
        success: false,
        error: new Error("Network timeout")
    };

    // unwrapOr with error - returns default
    const fallbackData = unwrapOr(errorResult, { statusCode: 0, body: "fallback" });
    console.log("✅ unwrapOr(error) - Fallback status:", fallbackData.statusCode);

    // unwrapOrElse - compute fallback from error (like Rust's .unwrap_or_else())
    const computed = unwrapOrElse(errorResult, (err) => ({
        statusCode: 500,
        body: `Error occurred: ${err.message}`
    }));
    console.log("✅ unwrapOrElse() - Computed:", computed.body);

    // unwrap on error - throws!
    try {
        unwrap(errorResult);
    } catch (e) {
        console.log("✅ unwrap(error) threw as expected:", (e as Error).message);
    }
}

// =============================================================================
// SKIP EXAMPLE - Conditionally Skipping Tasks
// =============================================================================

/**
 * Demonstrates how to skip tasks by returning null from the input builder.
 * This is useful for conditional execution without needing a separate Option type.
 */
const skipDemoPlaylist = new Playlist<{}, { shouldNotify: boolean; message: string }>()
    // Always log the action
    .addTask(new LogTask("log"))
    .input((source) => ({
        action: "process_started",
        metadata: { shouldNotify: source.shouldNotify }
    }))
    // Conditionally skip notification if not requested
    .addTask(new NotifyTask("notify"))
    .input((source, outputs) => {
        // Return null to skip this task!
        if (!source.shouldNotify) {
            return null;
        }
        // Access previous output using isOk helper (Rust-style!)
        const logId = outputs.log && isOk(outputs.log) ? outputs.log.data.logId : "unknown";
        return {
            message: `${source.message} (logged as ${logId})`,
            level: "info"
        };
    })
    // Final logging - demonstrate checking if previous task was skipped
    .addTask(new LogTask("finalLog"))
    .input((source, outputs) => ({
        action: "process_complete",
        metadata: {
            notificationSent: outputs.notify !== null,
            // Type-safe access using isOk (Rust-style!)
            notifiedAt: outputs.notify && isOk(outputs.notify) ? outputs.notify.data.sentAt : null
        }
    }));

// =============================================================================
// MACHINE EXAMPLE - Website Health Checker State Machine
// =============================================================================

type HealthCheckState = {
    urls: string[];
    currentIndex: number;
    results: { url: string; healthy: boolean }[];
};

const healthCheckMachine = Machine
    .create<HealthCheckState>()
    .withStates<"check-url" | "complete">()
    .addState("check-url", node => node
        .setPlaylist(p => p
            // Fetch the current URL
            .addTask(new FetchTask("fetch"))
            .input((state) => ({
                url: state.urls[state.currentIndex]
            }))
            // Parse the response - using unwrapOr for clean fallback handling
            .addTask(new ParseHtmlTask("parse"))
            .input((state, outputs) => {
                // Using unwrapOr: get data or fallback (Rust-style!)
                const fetchData = outputs.fetch 
                    ? unwrapOr(outputs.fetch, { statusCode: 0, body: "" })
                    : { statusCode: 0, body: "" };
                return { html: fetchData.body };
            })
            // Log the result - using isOk for cleaner checks
            .addTask(new LogTask("log"))
            .input((state, outputs) => ({
                action: "url_checked",
                metadata: {
                    url: state.urls[state.currentIndex],
                    fetchSuccess: outputs.fetch ? isOk(outputs.fetch) : false,
                    parseSuccess: outputs.parse ? isOk(outputs.parse) : false,
                    // Access nested data using isOk (Rust-style type narrowing!)
                    title: outputs.parse && isOk(outputs.parse) ? outputs.parse.data.title : null,
                    linkCount: outputs.parse && isOk(outputs.parse) ? outputs.parse.data.links.length : 0
                }
            }))
            // Update state and notify
            .finally((state, outputs) => {
                const healthy = (outputs.fetch ? isOk(outputs.fetch) : false) && (outputs.parse ? isOk(outputs.parse) : false);
                state.results.push({
                    url: state.urls[state.currentIndex],
                    healthy
                });
                state.currentIndex++;
            })
        )
        .addTransition({
            to: "check-url",  // Autocomplete works here!
            condition: async (state) => state.currentIndex < state.urls.length,
            weight: 2
        })
        .addTransition({
            to: "complete",  // Autocomplete works here too!
            condition: async (state) => state.currentIndex >= state.urls.length,
            weight: 1
        })
    , { initial: true })
    .addState("complete", node => node
        .setPlaylist(p => p
            .addTask(new NotifyTask("notify"))
            .input((state) => {
                const healthyCount = state.results.filter(r => r.healthy).length;
                return {
                    message: `Health check complete: ${healthyCount}/${state.results.length} URLs healthy`,
                    level: healthyCount === state.results.length ? "info" : "warn"
                };
            })
        )
        .preventRetry()
    )
    .finalize({ ident: "health-checker" });

// =============================================================================
// WORKFLOW EXAMPLE - Event-Driven Data Pipeline
// =============================================================================

/**
 * Custom trigger that simulates webhook events
 */
type WebhookPayload = { endpoint: string; data: Record<string, unknown> };

class WebhookTrigger extends Trigger<"webhook", WebhookPayload> {
    constructor() {
        super("webhook");
    }

    async start(): Promise<void> {
        console.log("[WebhookTrigger] Started listening for webhooks");
    }

    async stop(): Promise<void> {
        console.log("[WebhookTrigger] Stopped");
    }

    // Simulate receiving a webhook
    simulateWebhook(data: WebhookPayload): void {
        this.pushEvent(data);
    }
}

/**
 * Custom trigger that simulates scheduled events
 */
type SchedulePayload = { scheduleName: string; triggeredAt: Date };

class ScheduleTrigger extends Trigger<"schedule", SchedulePayload> {
    constructor() {
        super("schedule");
    }

    async start(): Promise<void> {
        console.log("[ScheduleTrigger] Started scheduler");
    }

    async stop(): Promise<void> {
        console.log("[ScheduleTrigger] Stopped scheduler");
    }

    simulateTick(name: string): void {
        this.pushEvent({ scheduleName: name, triggeredAt: new Date() });
    }
}

const webhookTrigger = new WebhookTrigger();
const scheduleTrigger = new ScheduleTrigger();

const dataPipeline = Workflow
    .create()
    .addTrigger(webhookTrigger)
    .addTrigger(scheduleTrigger)
    .retryDelayMs(500)   // Retry failed tasks every 500ms
    .retryLimit(3)       // Give up after 3 retries
    .setPlaylist(p => p
        // Log the incoming event
        .addTask(new LogTask("logEvent"))
        .input((event) => {
            // Can discriminate on trigger type!
            if (event.triggerIdent === "webhook") {
                return {
                    action: "webhook_received",
                    metadata: { endpoint: event.data.endpoint }
                };
            } else {
                return {
                    action: "schedule_triggered",
                    metadata: { schedule: event.data.scheduleName }
                };
            }
        })
        // Fetch some data based on the event
        .addTask(new FetchTask("fetchData"))
        .input((event) => {
            if (event.triggerIdent === "webhook") {
                return { url: `https://api.example.com${event.data.endpoint}` };
            }
            return { url: "https://api.example.com/scheduled-data" };
        })
        // Parse the response - using isOk for cleaner checks
        .addTask(new ParseHtmlTask("parseData"))
        .input((event, outputs) => {
            // Chain outputs using isOk (Rust-style!)
            if (outputs.fetchData && isOk(outputs.fetchData)) {
                return { html: outputs.fetchData.data.body };
            }
            return { html: "<empty/>" };
        })
        // Send notification with combined results - using isOk throughout
        .addTask(new NotifyTask("notifyComplete"))
        .input((event, outputs) => {
            const fetchOk = outputs.fetchData ? isOk(outputs.fetchData) : false;
            const parseOk = outputs.parseData ? isOk(outputs.parseData) : false;
            
            // Full access using isOk for type narrowing (Rust-style!)
            const logId = outputs.logEvent && isOk(outputs.logEvent) ? outputs.logEvent.data.logId : "unknown";
            const statusCode = outputs.fetchData && isOk(outputs.fetchData) ? outputs.fetchData.data.statusCode : 0;
            const title = outputs.parseData && isOk(outputs.parseData) ? outputs.parseData.data.title : "N/A";

            return {
                message: `Pipeline complete [${logId}]: status=${statusCode}, title="${title}"`,
                level: fetchOk && parseOk ? "info" : "error"
            };
        })
    );

// =============================================================================
// RUNNING THE EXAMPLES
// =============================================================================

async function runMachineExample() {
    console.log("\n" + "=".repeat(60));
    console.log("MACHINE EXAMPLE: Website Health Checker");
    console.log("=".repeat(60) + "\n");

    const state: HealthCheckState = {
        urls: [
            "https://example.com",
            "https://example.org",
            "https://example.net"
        ],
        currentIndex: 0,
        results: []
    };

    await healthCheckMachine.run(state, { mode: "leaf" });

    console.log("\nFinal Results:", state.results);
}

async function runWorkflowExample() {
    console.log("\n" + "=".repeat(60));
    console.log("WORKFLOW EXAMPLE: Event-Driven Data Pipeline");
    console.log("=".repeat(60) + "\n");

    // Start the workflow (this would normally run in the background)
    // For demo purposes, we'll just simulate some events and run the playlist directly

    // Simulate a webhook event
    console.log("--- Simulating Webhook Event ---\n");
    webhookTrigger.simulateWebhook({
        endpoint: "/users/123",
        data: { action: "update" }
    });

    // Poll and process
    const webhookEvent = webhookTrigger.poll();
    if (webhookEvent && dataPipeline.playlist) {
        await dataPipeline.playlist.run(webhookEvent);
    }

    // Simulate a schedule event
    console.log("\n--- Simulating Schedule Event ---\n");
    scheduleTrigger.simulateTick("daily-sync");

    const scheduleEvent = scheduleTrigger.poll();
    if (scheduleEvent && dataPipeline.playlist) {
        await dataPipeline.playlist.run(scheduleEvent);
    }
}

async function runSkipExample() {
    console.log("\n" + "=".repeat(60));
    console.log("SKIP EXAMPLE: Conditionally Skipping Tasks");
    console.log("=".repeat(60) + "\n");

    // Run with notification enabled
    console.log("--- With notification enabled ---\n");
    const result1 = await skipDemoPlaylist.run({ shouldNotify: true, message: "Hello!" });
    console.log("Notify output:", result1.notify);

    // Run with notification skipped
    console.log("\n--- With notification skipped ---\n");
    const result2 = await skipDemoPlaylist.run({ shouldNotify: false, message: "Hello!" });
    console.log("Notify output:", result2.notify); // Will be null
}

async function runRetryExample() {
    console.log("\n" + "=".repeat(60));
    console.log("RETRY EXAMPLE: Automatic Task Retries");
    console.log("=".repeat(60) + "\n");

    // Create a playlist with a flaky task - it will fail twice then succeed
    const retryPlaylist = new Playlist<{}, {}>()
        .addTask(new FlakyTask("flaky"))
        .input(() => ({ maxFailures: 2 }))  // Fail first 2 attempts
        .addTask(new NotifyTask("notify"))
        .input((_, outputs) => ({
            message: `Task succeeded after ${outputs.flaky && isOk(outputs.flaky) ? outputs.flaky.data.attempts : '?'} attempts`,
            level: "info"
        }));

    // Run with retry settings: 100ms delay, max 5 retries
    console.log("Running playlist with retries enabled (100ms delay, max 5 retries)...\n");
    await retryPlaylist.run({}, { retryDelay: 100, maxRetries: 5 });
}

// Run all examples
async function main() {
    await runRailroadExample();
    await runSkipExample();
    await runRetryExample();
    await runMachineExample();
    await runWorkflowExample();
    
    console.log("\n" + "=".repeat(60));
    console.log("Examples complete!");
    console.log("=".repeat(60));
}

main().catch(console.error);
