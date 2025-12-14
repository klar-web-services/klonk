/**
 * Example: Trigger with Custom Payloads
 * 
 * This example shows a different trigger type with its own payload shape.
 * When multiple triggers feed a workflow, TypeScript can discriminate
 * between them using the triggerIdent field.
 */

import { Trigger } from "../../src";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/** Schedule trigger payload - different from webhook payload */
export type SchedulePayload = { 
    scheduleName: string; 
    triggeredAt: Date;
};

// =============================================================================
// TRIGGER IMPLEMENTATION
// =============================================================================

/**
 * ScheduleTrigger: Fires events on a schedule.
 * 
 * In a real implementation, this would:
 * - Parse cron expressions or intervals
 * - Use setInterval or a scheduling library
 * - Fire events at the specified times
 * 
 * The "schedule" ident distinguishes this from other triggers.
 */
export class ScheduleTrigger extends Trigger<"schedule", SchedulePayload> {
    private intervalId: NodeJS.Timeout | null = null;

    constructor(private intervalMs: number = 60000) {
        super("schedule");
    }

    async start(): Promise<void> {
        console.log(`[ScheduleTrigger] Started scheduler (${this.intervalMs}ms interval)`);
        
        // In a real implementation, you'd set up actual intervals:
        // this.intervalId = setInterval(() => {
        //     this.pushEvent({ scheduleName: "default", triggeredAt: new Date() });
        // }, this.intervalMs);
    }

    async stop(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log("[ScheduleTrigger] Stopped scheduler");
    }

    /**
     * Simulate a scheduled tick (for demo purposes).
     */
    simulateTick(name: string): void {
        console.log(`[ScheduleTrigger] Tick: "${name}"`);
        this.pushEvent({ 
            scheduleName: name, 
            triggeredAt: new Date() 
        });
    }
}

// =============================================================================
// COMPARING PAYLOAD TYPES
// =============================================================================

// Import the webhook trigger to show the difference
import { WebhookTrigger, WebhookPayload } from "./01-simple-trigger";

/**
 * Demonstrates how TypeScript discriminates between trigger payloads.
 */
function handleEvent(event: 
    | { triggerIdent: "webhook"; data: WebhookPayload }
    | { triggerIdent: "schedule"; data: SchedulePayload }
): void {
    // TypeScript narrows the type based on triggerIdent
    if (event.triggerIdent === "webhook") {
        // TypeScript knows: event.data is WebhookPayload
        console.log(`Webhook event for endpoint: ${event.data.endpoint}`);
    } else {
        // TypeScript knows: event.data is SchedulePayload
        console.log(`Schedule event "${event.data.scheduleName}" at ${event.data.triggeredAt}`);
    }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Trigger with Custom Payloads (ScheduleTrigger)");
    console.log("=".repeat(60) + "\n");

    // Create both triggers
    const webhookTrigger = new WebhookTrigger();
    const scheduleTrigger = new ScheduleTrigger(5000);

    await webhookTrigger.start();
    await scheduleTrigger.start();

    // Simulate events from both triggers
    console.log("\n--- Simulating events from different triggers ---\n");
    
    webhookTrigger.simulateWebhook({
        endpoint: "/api/users",
        data: { userId: 1 }
    });

    scheduleTrigger.simulateTick("hourly-cleanup");
    scheduleTrigger.simulateTick("daily-report");

    // Process events and discriminate by type
    console.log("\n--- Processing events with type discrimination ---\n");
    
    // Poll from webhook trigger
    let webhookEvent;
    while ((webhookEvent = webhookTrigger.poll()) !== null) {
        handleEvent(webhookEvent);
    }

    // Poll from schedule trigger
    let scheduleEvent;
    while ((scheduleEvent = scheduleTrigger.poll()) !== null) {
        handleEvent(scheduleEvent);
    }

    await webhookTrigger.stop();
    await scheduleTrigger.stop();
}

main().catch(console.error);
