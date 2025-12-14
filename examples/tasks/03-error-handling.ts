/**
 * Example: Task Error Handling & Complex Input Types
 * 
 * This example shows:
 * - Using enum types in task inputs (NotifyTask)
 * - Using Record<string, unknown> for flexible metadata (LogTask)
 * - Returning errors from tasks (success: false)
 */

import { Task, Railroad } from "../../src";

// =============================================================================
// NOTIFY TASK - Enum Input Types
// =============================================================================

/** Input with an enum field */
export type NotifyInput = { 
    message: string; 
    level: "info" | "warn" | "error";
};

export type NotifyOutput = { sentAt: Date };

/**
 * NotifyTask: Sends a notification with a severity level.
 * 
 * Demonstrates using TypeScript literal unions (enums) in inputs.
 * The type system ensures only valid levels can be passed.
 */
export class NotifyTask<TIdent extends string> extends Task<NotifyInput, NotifyOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(input: NotifyInput): Promise<boolean> {
        return input.message.length > 0;
    }

    async run(input: NotifyInput): Promise<Railroad<NotifyOutput>> {
        // Example of returning an error
        if (input.level === "error" && input.message.includes("CRITICAL")) {
            return {
                success: false,
                error: new Error("Critical errors require escalation - cannot send directly")
            };
        }

        console.log(`[NotifyTask] [${input.level.toUpperCase()}] ${input.message}`);
        return {
            success: true,
            data: { sentAt: new Date() }
        };
    }
}

// =============================================================================
// LOG TASK - Flexible Metadata with Record Types
// =============================================================================

/** Input with flexible metadata */
export type LogInput = { 
    action: string; 
    metadata: Record<string, unknown>;
};

export type LogOutput = { logId: string };

/**
 * LogTask: Logs an action with arbitrary metadata.
 * 
 * Demonstrates using Record<string, unknown> for flexible,
 * schema-less data that varies per use case.
 */
export class LogTask<TIdent extends string> extends Task<LogInput, LogOutput, TIdent> {
    constructor(ident: TIdent) {
        super(ident);
    }

    async validateInput(): Promise<boolean> {
        // Accept any input - metadata is flexible
        return true;
    }

    async run(input: LogInput): Promise<Railroad<LogOutput>> {
        const logId = `log_${Date.now()}`;
        console.log(`[LogTask] Logged "${input.action}" with id ${logId}`);
        console.log(`[LogTask] Metadata:`, JSON.stringify(input.metadata, null, 2));
        
        return {
            success: true,
            data: { logId }
        };
    }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("EXAMPLE: Error Handling & Complex Input Types");
    console.log("=".repeat(60) + "\n");

    // --- NotifyTask with different levels ---
    console.log("--- NotifyTask: Using enum input types ---\n");
    
    const notifyTask = new NotifyTask("notifier");

    // Info level
    const infoResult = await notifyTask.run({ 
        message: "User logged in", 
        level: "info" 
    });
    console.log("Info notification sent:", infoResult.success);

    // Warning level
    const warnResult = await notifyTask.run({ 
        message: "High memory usage", 
        level: "warn" 
    });
    console.log("Warn notification sent:", warnResult.success);

    // Error level that triggers a failure
    console.log("\n--- Triggering an error response ---\n");
    const errorResult = await notifyTask.run({ 
        message: "CRITICAL: System failure", 
        level: "error" 
    });
    
    if (!errorResult.success) {
        console.log("Task returned error:", errorResult.error.message);
    }

    // --- LogTask with flexible metadata ---
    console.log("\n--- LogTask: Flexible metadata ---\n");
    
    const logTask = new LogTask("logger");

    await logTask.run({
        action: "user_signup",
        metadata: {
            userId: 12345,
            email: "user@example.com",
            plan: "premium",
            referrer: null,
            features: ["feature-a", "feature-b"]
        }
    });
}

main().catch(console.error);
