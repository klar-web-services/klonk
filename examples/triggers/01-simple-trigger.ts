/**
 * Example: Creating a Simple Trigger
 * 
 * A Trigger is an event source that kicks off Workflows. It's an abstract class with:
 * - start(): Begin listening for events
 * - stop(): Clean up resources
 * - pushEvent(data): Queue an event for processing
 * 
 * This file demonstrates the simplest possible trigger implementation.
 */

import { Trigger } from "../../src";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** The payload shape this trigger emits */
export type WebhookPayload = { 
    endpoint: string; 
    data: Record<string, unknown>;
};

// =============================================================================
// TRIGGER IMPLEMENTATION
// =============================================================================

/**
 * WebhookTrigger: Simulates receiving webhook events.
 * 
 * In a real implementation, this would:
 * - Start an HTTP server listening for POST requests
 * - Parse incoming webhook payloads
 * - Call pushEvent() for each valid webhook
 * 
 * The string literal "webhook" is the trigger's ident, used for
 * discriminating events when multiple triggers feed a workflow.
 */
export class WebhookTrigger extends Trigger<"webhook", WebhookPayload> {
    constructor() {
        super("webhook");
    }

    /**
     * Start the trigger. Called by Workflow.start().
     * In reality, you'd spin up an HTTP server here.
     */
    async start(): Promise<void> {
        console.log("[WebhookTrigger] Started listening for webhooks");
        // In a real implementation:
        // this.server = http.createServer(...)
        // this.server.listen(...)
    }

    /**
     * Stop the trigger and clean up resources.
     */
    async stop(): Promise<void> {
        console.log("[WebhookTrigger] Stopped");
        // In a real implementation:
        // await this.server?.close()
    }

    /**
     * Simulate receiving a webhook (for demo purposes).
     * In production, this would be called by your HTTP handler.
     */
    simulateWebhook(data: WebhookPayload): void {
        console.log(`[WebhookTrigger] Received webhook for ${data.endpoint}`);
        this.pushEvent(data);
    }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Simple Trigger (WebhookTrigger)");
    console.log("=".repeat(60) + "\n");

    const trigger = new WebhookTrigger();

    // Start the trigger
    await trigger.start();

    // Simulate some incoming webhooks
    console.log("\n--- Simulating incoming webhooks ---\n");
    
    trigger.simulateWebhook({
        endpoint: "/users/123/update",
        data: { name: "Alice", action: "profile_updated" }
    });

    trigger.simulateWebhook({
        endpoint: "/orders/456/created",
        data: { orderId: 456, total: 99.99 }
    });

    // Poll events from the queue
    console.log("\n--- Polling events from queue ---\n");
    
    let event;
    while ((event = trigger.poll()) !== null) {
        console.log("Polled event:", {
            triggerIdent: event.triggerIdent,
            endpoint: event.data.endpoint,
            data: event.data.data
        });
    }

    // Stop the trigger
    await trigger.stop();
}

main().catch(console.error);
