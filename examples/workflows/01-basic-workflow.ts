/**
 * Example: Basic Workflow
 * 
 * A Workflow connects Triggers to Playlists. When a trigger fires an event,
 * the workflow runs the playlist with that event as the source.
 * 
 * This file demonstrates:
 * - Creating a workflow with Workflow.create()
 * - Adding a trigger with .addTrigger()
 * - Setting a playlist with .setPlaylist()
 * - Starting and processing events
 */
import { Result } from "@fkws/klonk-result";

import { Workflow } from "../../src";
import { WebhookTrigger } from "../triggers/01-simple-trigger";
import { FetchTask } from "../tasks/01-simple-task";
import { LogTask } from "../tasks/03-error-handling";

// =============================================================================
// WORKFLOW DEFINITION
// =============================================================================

// Create a trigger instance
const webhookTrigger = new WebhookTrigger();

/**
 * Build a workflow:
 * 1. Add a trigger (event source)
 * 2. Configure retry behavior
 * 3. Set the playlist (what to do when events arrive)
 */
const myWorkflow = Workflow.create()
    // Add the trigger - this is what fires events
    .addTrigger(webhookTrigger)
    
    // Configure retry behavior (optional)
    .retryDelayMs(500)    // Wait 500ms between retries
    .retryLimit(3)        // Max 3 retry attempts
    
    // Define the playlist that processes each event
    .setPlaylist(p => p
        // Log the incoming event
        .addTask(new LogTask("logEvent"))
        .input((event) => ({
            // event.data contains the trigger payload (WebhookPayload)
            // event.triggerIdent is "webhook" (the trigger's ident)
            action: "webhook_received",
            metadata: {
                triggerIdent: event.triggerIdent,
                endpoint: event.data.endpoint,
                payload: event.data.data
            }
        }))
        
        // Fetch data based on the webhook
        .addTask(new FetchTask("fetch"))
        .input((event) => ({
            // Use event data to construct the URL
            url: `https://api.example.com${event.data.endpoint}`
        }))
        
        // Log the result
        .addTask(new LogTask("logResult"))
        .input((event, outputs) => {
            const fetchOk = outputs.fetch && outputs.fetch.isOk();
            const statusCode = outputs.fetch && outputs.fetch.isOk() ? outputs.fetch.statusCode : 0;
            
            return {
                action: "webhook_processed",
                metadata: {
                    endpoint: event.data.endpoint,
                    success: fetchOk,
                    statusCode
                }
            };
        })
    );

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Basic Workflow");
    console.log("=".repeat(60) + "\n");

    // -------------------------------------------------------------------------
    // Method 1: Manual event processing (for demonstration)
    // -------------------------------------------------------------------------
    console.log("--- Manual Event Processing ---\n");
    
    // Simulate receiving a webhook
    webhookTrigger.simulateWebhook({
        endpoint: "/users/123",
        data: { action: "profile_updated", userId: 123 }
    });

    // Poll the event and process it manually
    const event = webhookTrigger.poll();
    if (event && myWorkflow.playlist) {
        console.log("Processing event:", event.triggerIdent);
        await myWorkflow.playlist.run(event);
    }

    // -------------------------------------------------------------------------
    // Method 2: Using workflow.start() with callback
    // -------------------------------------------------------------------------
    console.log("\n--- Using workflow.start() ---\n");
    
    // Start the workflow - this will:
    // 1. Call trigger.start()
    // 2. Begin polling for events
    // 3. Run the playlist for each event
    // 4. Call the callback with results
    
    myWorkflow.start({
        callback: (source, outputs) => {
            console.log("\n[Workflow Callback] Event processed!");
            console.log("  Trigger:", source.triggerIdent);
            console.log("  Endpoint:", source.data.endpoint);
            const logResult = outputs.logResult as Result<{ logId: string }> | null;
            console.log("  Log result:", logResult && logResult.isOk()
                ? logResult.logId 
                : "failed");
        }
    });

    // Simulate more webhooks arriving
    await sleep(100);
    webhookTrigger.simulateWebhook({
        endpoint: "/orders/456",
        data: { action: "order_created", orderId: 456 }
    });

    await sleep(200);
    webhookTrigger.simulateWebhook({
        endpoint: "/products/789",
        data: { action: "inventory_updated", productId: 789 }
    });

    // Give time for events to process
    await sleep(500);

    // Note: Workflows run indefinitely once started.
    // In a real app, the process would keep running.
    // For this demo, we exit after processing the events.
    console.log("\n[Main] Demo complete. (Workflow continues in background)");
    process.exit(0);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
