/**
 * Example: Multi-Trigger Workflow
 * 
 * A workflow can have multiple triggers. When any trigger fires, the same
 * playlist runs. You can discriminate between triggers using event.triggerIdent.
 * 
 * This file demonstrates:
 * - Adding multiple triggers to a workflow
 * - Discriminating events by triggerIdent
 * - Type-safe access to different payload shapes
 */

import { Workflow } from "../../src";
import { WebhookTrigger } from "../triggers/01-simple-trigger";
import { ScheduleTrigger } from "../triggers/02-custom-payloads";
import { FetchTask } from "../tasks/01-simple-task";
import { LogTask, NotifyTask } from "../tasks/03-error-handling";

// =============================================================================
// CREATE TRIGGERS
// =============================================================================

const webhookTrigger = new WebhookTrigger();
const scheduleTrigger = new ScheduleTrigger(5000); // 5 second interval

// =============================================================================
// MULTI-TRIGGER WORKFLOW
// =============================================================================

/**
 * A data pipeline that can be triggered by either:
 * - Webhooks (real-time events)
 * - Schedules (periodic polling)
 * 
 * The playlist handles both event types using triggerIdent discrimination.
 */
const dataPipeline = Workflow.create()
    // Add multiple triggers - any one can fire events
    .addTrigger(webhookTrigger)
    .addTrigger(scheduleTrigger)
    
    // Retry configuration applies to all events
    .retryDelayMs(500)
    .retryLimit(3)
    
    .setPlaylist(p => p
        // Log the incoming event - discriminate by trigger type
        .addTask(new LogTask("logEvent"))
        .input((event) => {
            // TypeScript knows event can be from either trigger
            // Use triggerIdent to discriminate
            if (event.triggerIdent === "webhook") {
                // TypeScript narrows: event.data is WebhookPayload
                return {
                    action: "webhook_received",
                    metadata: { 
                        endpoint: event.data.endpoint,
                        payload: event.data.data
                    }
                };
            } else {
                // TypeScript narrows: event.data is SchedulePayload
                return {
                    action: "schedule_triggered",
                    metadata: { 
                        scheduleName: event.data.scheduleName,
                        triggeredAt: event.data.triggeredAt.toISOString()
                    }
                };
            }
        })
        
        // Fetch data - URL depends on trigger type
        .addTask(new FetchTask("fetchData"))
        .input((event) => {
            if (event.triggerIdent === "webhook") {
                // Webhook: fetch the specific endpoint
                return { url: `https://api.example.com${event.data.endpoint}` };
            } else {
                // Schedule: fetch the scheduled data endpoint
                return { url: "https://api.example.com/scheduled-data" };
            }
        })
        
        // Send notification with results
        .addTask(new NotifyTask("notify"))
        .input((event, outputs) => {
            const fetchOk = outputs.fetchData && outputs.fetchData.isOk();
            const logId = outputs.logEvent && outputs.logEvent.isOk()
                ? outputs.logEvent.logId
                : "unknown";
            
            // Customize message based on trigger type
            let message: string;
            if (event.triggerIdent === "webhook") {
                message = `Webhook ${event.data.endpoint} processed [${logId}]`;
            } else {
                message = `Schedule "${event.data.scheduleName}" completed [${logId}]`;
            }
            
            return {
                message,
                level: fetchOk ? "info" : "error"
            };
        })
    );

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Multi-Trigger Workflow");
    console.log("=".repeat(60) + "\n");

    // Start the workflow
    dataPipeline.start({
        callback: (source, outputs) => {
            console.log("\n[Callback] Event processed from:", source.triggerIdent);
        }
    });

    // -------------------------------------------------------------------------
    // Simulate webhook events
    // -------------------------------------------------------------------------
    console.log("--- Simulating Webhook Events ---\n");
    
    webhookTrigger.simulateWebhook({
        endpoint: "/users/123",
        data: { action: "update" }
    });
    await sleep(200);

    webhookTrigger.simulateWebhook({
        endpoint: "/orders/456",
        data: { action: "create" }
    });
    await sleep(200);

    // -------------------------------------------------------------------------
    // Simulate schedule events
    // -------------------------------------------------------------------------
    console.log("\n--- Simulating Schedule Events ---\n");
    
    scheduleTrigger.simulateTick("daily-sync");
    await sleep(200);

    scheduleTrigger.simulateTick("hourly-cleanup");
    await sleep(200);

    // -------------------------------------------------------------------------
    // Mixed events
    // -------------------------------------------------------------------------
    console.log("\n--- Mixed Events (interleaved) ---\n");
    
    webhookTrigger.simulateWebhook({
        endpoint: "/products/789",
        data: { action: "inventory_update" }
    });
    
    scheduleTrigger.simulateTick("real-time-metrics");
    
    webhookTrigger.simulateWebhook({
        endpoint: "/analytics/track",
        data: { event: "page_view" }
    });

    // Give time for all events to process
    await sleep(500);

    // Note: Workflows run indefinitely once started.
    // In a real app, the process would keep running.
    // For this demo, we exit after processing the events.
    console.log("\n[Main] Demo complete. (Workflow continues in background)");

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("\n--- Key Takeaways ---");
    console.log("1. Use .addTrigger() multiple times to add triggers");
    console.log("2. Use event.triggerIdent to discriminate event sources");
    console.log("3. TypeScript narrows the event.data type automatically");
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
