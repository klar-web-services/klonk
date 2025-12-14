<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/KLONK_white.png">
    <source media="(prefers-color-scheme: light)" srcset="./.github/assets/KLONK_black.png">
    <img alt="Klonk Logo" src="./.github/assets/KLONK_black.png">
  </picture>
</p>


[klonk.dev](https://klonk.dev)

![npm version](https://img.shields.io/npm/v/@fkws/klonk)
![npm downloads](https://img.shields.io/npm/dm/@fkws/klonk)
[![codecov](https://codecov.io/gh/klar-web-services/klonk/branch/main/graph/badge.svg?token=2R145SOCWH)](https://codecov.io/gh/klar-web-services/klonk)
---

![License](https://img.shields.io/github/license/klar-web-services/klonk)

*A code-first, type-safe automation engine for TypeScript.*

## Introduction

Klonk is a code-first, type-safe automation engine. It provides composable primitives to build workflows and state machines with autocomplete and type inference. If you've ever wanted to build event-driven automations or a stateful agent in code, with all the benefits of TypeScript, Klonk is for you.

![Skip to code examples ->](https://github.com/klar-web-services/klonk?tab=readme-ov-file#code-examples)

The two main features are **Workflows** and **Machines**.

- **Workflows**: Combine triggers with a series of tasks (a `Playlist`) to automate processes. Example: "when a file is added to Dropbox, parse it, and create an entry in Notion."
- **Machines**: Finite state machines where each state has its own `Playlist` of tasks and conditional transitions to other states. Useful for agents, multi-step processes, or systems with stateful logic.

## Installation

```bash
bun add @fkws/klonk
# or
npm i @fkws/klonk
```

### Compatibility

| Requirement | Support |
|-------------|---------|
| **Runtimes** | Node.js 18+, Bun 1.0+, Deno (via npm specifier, best-effort) |
| **Module** | ESM (native) and CJS (via bundled `/dist`) |
| **TypeScript** | 5.0+ (required for full type inference) |
| **Dependencies** | Zero runtime dependencies |

**Status:** Pre-1.0, API may change between minor versions. Aiming for stability by 1.0.

## Quickstart

Copy-paste this to see Klonk in action. One trigger, two tasks, fully typed outputs:

```typescript
import { Task, Trigger, Workflow, Railroad, isOk } from "@fkws/klonk";

// 1. Define two simple tasks
class FetchUser<I extends string> extends Task<{ userId: string }, { name: string; email: string }, I> {
  async validateInput(input: { userId: string }) { return !!input.userId; }
  async run(input: { userId: string }): Promise<Railroad<{ name: string; email: string }>> {
    if (input.userId !== "123") return { success: false, error: new Error("User not found") };
    return { success: true, data: { name: "Alice", email: "alice@example.com" } };
  }
}

class SendEmail<I extends string> extends Task<{ to: string; subject: string }, { sent: boolean }, I> {
  async validateInput(input: { to: string; subject: string }) { return !!input.to; }
  async run(input: { to: string; subject: string }): Promise<Railroad<{ sent: boolean }>> {
    console.log(`📧 Sending "${input.subject}" to ${input.to}`);
    return { success: true, data: { sent: true } };
  }
}

// 2. Create a trigger (fires once with a userId)
class ManualTrigger<I extends string> extends Trigger<I, { userId: string }> {
  async start() { this.pushEvent({ userId: "123" }); }
  async stop() {}
}

// 3. Wire it up: trigger → playlist with typed outputs
const workflow = Workflow.create()
  .addTrigger(new ManualTrigger("manual"))
  .setPlaylist(p => p
    .addTask(new FetchUser("fetch-user"))
    .input((source) => ({ userId: source.data.userId }))  // ← source.data is typed!

    .addTask(new SendEmail("send-email"))
    .input((source, outputs) => {
      // outputs["fetch-user"] is typed as Railroad<{ name, email }> | null
      const user = outputs["fetch-user"];
      if (!user || !isOk(user)) return null;  // skip if failed
      return { to: user.data.email, subject: `Welcome, ${user.data.name}!` };
    })
  );

workflow.start({ callback: (src, out) => console.log("✅ Done!", out) });
```

**What you just saw:**
- `source.data.userId` is typed from the trigger
- `outputs["fetch-user"]` is typed by the task's ident string literal
- `user.data.email` is narrowed after the `isOk()` check

## TypeScript Magic Moment

Klonk's type inference isn't marketing. Here's proof:

```typescript
import { Machine } from "@fkws/klonk";

// Declare states upfront → autocomplete for ALL transitions
const machine = Machine.create<{ count: number }>()
  .withStates<"idle" | "processing" | "done">()  // ← These drive autocomplete
  .addState("idle", node => node
    .setPlaylist(p => p/* ... */)
    .addTransition({
      to: "processing",  // ← Type "pro" and your IDE suggests "processing"
      condition: async () => true,
      weight: 1
    })
    // @ts-expect-error - "typo-state" is not a valid state
    .addTransition({ to: "typo-state", condition: async () => true, weight: 1 })
  , { initial: true });
```

The `withStates<...>()` pattern means **you can't transition to a state that doesn't exist**. TypeScript catches it at compile time, not runtime.

## Core Concepts

Klonk has a few concepts that work together.

### Task

A `Task` is the smallest unit of work. It's an abstract class with two main methods you need to implement:
- `validateInput(input)`: Runtime validation of the task's input (on top of strong typing).
- `run(input)`: Executes the task's logic.

Tasks use a `Railroad` return type - a discriminated union for handling success and error states without throwing exceptions. Inspired by Rust's `Result<T, E>` type, it comes with familiar helper functions like `unwrap()`, `unwrapOr()`, and more.

### Railroad (Rust-inspired Result Type)

`Railroad<T>` is Klonk's version of Rust's `Result<T, E>`. It's a discriminated union that forces you to handle both success and error cases:

```typescript
type Railroad<T> = 
    | { success: true, data: T }
    | { success: false, error: Error }
```

#### Helper Functions

Klonk provides Rust-inspired helper functions for working with `Railroad`:

```typescript
import { unwrap, unwrapOr, unwrapOrElse, isOk, isErr } from "@fkws/klonk";

// unwrap: Get data or throw error (like Rust's .unwrap())
const data = unwrap(result);  // Returns T or throws

// unwrapOr: Get data or return a default value
const data = unwrapOr(result, defaultValue);  // Returns T

// unwrapOrElse: Get data or compute a fallback from the error
const data = unwrapOrElse(result, (err) => computeFallback(err));

// isOk / isErr: Type guards for narrowing
if (isOk(result)) {
    console.log(result.data);  // TypeScript knows it's success
}
if (isErr(result)) {
    console.log(result.error);  // TypeScript knows it's error
}
```

#### Why Railroad?

The name "Railroad" comes from Railway Oriented Programming, where success travels the "happy path" and errors get shunted to the "error track". Combined with TypeScript's type narrowing, you get explicit error handling without exceptions. If you like Rust's `Result`, you'll feel at home.

### Playlist

A `Playlist` is a sequence of `Tasks` executed in order. Each task has access to the outputs of all previous tasks, in a fully type-safe way. You build a `Playlist` by chaining `.addTask().input()` calls:

```typescript
import { isOk } from "@fkws/klonk";

playlist
    .addTask(new FetchTask("fetch"))
    .input((source) => ({ url: source.targetUrl }))
    .addTask(new ParseTask("parse"))
    .input((source, outputs) => ({
        // Use isOk for Rust-style type narrowing!
        html: outputs.fetch && isOk(outputs.fetch) ? outputs.fetch.data.body : ""
    }))
```

> **Note**: If you forget to call `.input()`, TypeScript will show an error mentioning `TaskInputRequired` - this is your hint that you need to provide the input builder!

#### Skipping Tasks

Need to conditionally skip a task? Just return `null` from the input builder:

```typescript
import { isOk } from "@fkws/klonk";

playlist
    .addTask(new NotifyTask("notify"))
    .input((source, outputs) => {
        // Skip notification if previous task failed - using isOk!
        if (!outputs.fetch || !isOk(outputs.fetch)) {
            return null;  // Task will be skipped!
        }
        return { message: "Success!", level: "info" };
    })
```

When a task is skipped:
- Its output in the `outputs` map is `null` (not a `Railroad`)
- The playlist continues to the next task
- Subsequent tasks can check `if (outputs.notify === null)` to know it was skipped

This gives you Rust-like `Option` semantics using TypeScript's native `null` - no extra types needed!

#### Task Retries

When a task fails (`success: false`), it can be automatically retried. Retry behavior is configured on the `Machine` state or `Workflow`:

```typescript
// On a Machine state:
Machine.create<MyState>()
    .addState("fetch-data", node => node
        .setPlaylist(p => p.addTask(...))
        .retryDelayMs(500)   // Retry every 500ms
        .retryLimit(3)       // Max 3 retries, then throw
    )

// On a Workflow:
Workflow.create()
    .addTrigger(myTrigger)
    .retryDelayMs(1000)      // Retry every 1s (default)
    .retryLimit(5)           // Max 5 retries
    .setPlaylist(p => p.addTask(...))

// Disable retries entirely:
node.preventRetry()  // Task failures throw immediately
```

Default behavior: infinite retries at 1000ms delay. This is designed for long-running daemons and background workers where resilience matters. **For request/response contexts** (APIs, CLIs, one-shot scripts), set `.retryLimit(n)` to cap attempts or use `.preventRetry()` to fail fast.

### Trigger

A `Trigger` is what kicks off a `Workflow`. It's an event source. Klonk can be extended with triggers for anything: file system events, webhooks, new database entries, messages in a queue, etc.

### Workflow

A `Workflow` connects one or more `Triggers` to a `Playlist`. When a trigger fires an event, the workflow runs the playlist, passing the event data as the initial input. This allows you to create powerful, event-driven automations.

### Machine

A `Machine` is a finite state machine. You build it by declaring all state identifiers upfront with `.withStates<...>()`, then adding states with `.addState()`:

```typescript
Machine.create<MyStateData>()
    .withStates<"idle" | "running" | "complete">()  // Declare all states
    .addState("idle", node => node
        .setPlaylist(p => p.addTask(...).input(...))
        .addTransition({ to: "running", condition: ..., weight: 1 })  // Autocomplete!
    , { initial: true })
    .addState("running", node => node...)
    .finalize({ ident: "my-machine" });
```

Each state has:
1. A `Playlist` that runs when the machine enters that state.
2. A set of conditional `Transitions` to other states (with autocomplete!).
3. Retry rules for failed tasks and when no transition is available.

The `Machine` carries a mutable `stateData` object that can be read from and written to by playlists and transition conditions throughout its execution.

#### Machine run modes
- **any**: Runs until the first terminal condition occurs (leaf state, roundtrip to the initial state, or all reachable states visited).
- **leaf**: Runs until a leaf state (no transitions) is reached.
- **roundtrip**: Runs until it transitions back to the initial state.
- **infinitely**: Continues running indefinitely, sleeping between iterations (`interval` ms, default 1000). Use `stopAfter` to cap total states entered.

Notes:
- `stopAfter` counts states entered, including the initial state. For example, `stopAfter: 1` will run the initial state's playlist once and then stop; `stopAfter: 0` stops before entering the initial state.
- Transition retries are independent of `stopAfter`. A state can retry its transition condition (with optional delay) without affecting the `stopAfter` count until a state transition actually occurs.
- Task retries use the same settings as transition retries. If a task fails and retries are enabled, it will retry until success or the limit is reached.

## Features

- **Type-Safe & Autocompleted**: Klonk uses TypeScript's inference so the inputs and outputs of every step are strongly typed. You'll know at compile time if your logic is sound.
- **Code-First**: Define your automations directly in TypeScript. No YAML, no drag-and-drop UIs.
- **Composable & Extensible**: The core primitives (`Task`, `Trigger`) are simple abstract classes, so you can create your own reusable components.
- **Flexible Execution**: `Machines` run with configurable modes via `run(state, options)`: `any`, `leaf`, `roundtrip`, or `infinitely` (with optional `interval`).

## Klonkworks: Pre-built Components

Coming soon(ish)! Klonkworks will be a collection of pre-built Tasks, Triggers, and integrations that connect to various services, so you don't have to build everything from scratch.

## Code Examples

<details>
<summary><b>Creating a Task</b></summary>

Here's how you create a custom `Task`. This task uses an AI client to perform text inference.

```typescript
import { Railroad, Task } from "@fkws/klonk";
import { OpenRouterClient } from "./common/OpenrouterClient"
import { Model } from "./common/models";

type TABasicTextInferenceInput = {
    inputText: string;
    instructions?: string;
    model: Model;
};

type TABasicTextInferenceOutput = {
    text: string;
};

// A Task is a generic class. You provide the Input, Output, and an Ident (a unique string literal for the task).
export class TABasicTextInference<IdentType extends string> extends Task<
    TABasicTextInferenceInput,  // Input Type
    TABasicTextInferenceOutput, // Output Type
    IdentType                   // Ident Type (string literal for type-safe output keys)
> {
    constructor(ident: IdentType, public client: OpenRouterClient) {
        super(ident);
        if (!this.client) {
            throw new Error("[TABasicTextInference] An IOpenRouter client instance is required.");
        }
    }

    // validateInput is for runtime validation of the data your task receives.
    async validateInput(input: TABasicTextInferenceInput): Promise<boolean> {
        if (!input.inputText || !input.model) {
            return false;
        }
        return true;
    }

    // The core logic of your task. It must return a Railroad type.
    async run(input: TABasicTextInferenceInput): Promise<Railroad<TABasicTextInferenceOutput>> {
        try {
            const result = await this.client.basicTextInference({
                inputText: input.inputText,
                instructions: input.instructions,
                model: input.model
            });
            // On success, return a success object with your data.
            return {
                success: true,
                data: { text: result }
            };
        } catch (error) {
            // On failure, return an error object.
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }
}
```
</details>

<details>
<summary><b>Creating a Trigger</b></summary>

Here's an example of a custom `Trigger`. This trigger fires on a given interval and pushes the current date as its event data.

```typescript
import { Trigger } from '@fkws/klonk';

// A simple trigger that fires every `intervalMs` with the current date.
// You define the shape of the data the trigger will provide, in this case `{ now: Date }`.
export class IntervalTrigger<TIdent extends string> extends Trigger<TIdent, { now: Date }> {
    private intervalId: NodeJS.Timeout | null = null;

    constructor(ident: TIdent, private intervalMs: number) {
        super(ident); // Pass the unique identifier to the parent constructor.
    }

    // The start method is called by the Workflow to begin listening for events.
    async start(): Promise<void> {
        if (this.intervalId) return; // Prevent multiple intervals.

        this.intervalId = setInterval(() => {
            // When an event occurs, use pushEvent to add it to the internal queue.
            this.pushEvent({ now: new Date() });
        }, this.intervalMs);
    }

    // The stop method cleans up any resources, like intervals or open connections.
    async stop(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
```
</details>

<details>
<summary><b>Building a Workflow</b></summary>

Workflows work well for event-driven automations. This example triggers when a new invoice PDF is added to a Dropbox folder, parses the invoice, and creates a new item in a Notion database.

Notice the fluent `.addTask(task).input(builder)` syntax - each task's input builder has access to `source` (trigger data) and `outputs` (all previous task results), with full type inference!

```typescript
import { z } from 'zod';
import { Workflow, isOk } from '@fkws/klonk';

// The following example requires tasks, integrations and a trigger.
// Soon, you will be able to import these from @fkws/klonkworks.
import { TACreateNotionDatabaseItem, TANotionGetTitlesAndIdsForDatabase, TAParsePdfAi, TADropboxDownloadFile } from '@fkws/klonkworks/tasks';
import { INotion, IOpenRouter, IDropbox } from '@fkws/klonkworks/integrations';
import { TRDropboxFileAdded } from '@fkws/klonkworks/triggers';

// Providers and clients are instantiated as usual.
const notionProvider = new INotion({ apiKey: process.env.NOTION_API_KEY! });
const openrouterProvider = new IOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const dropboxProvider = new IDropbox({
    appKey: process.env.DROPBOX_APP_KEY!,
    appSecret: process.env.DROPBOX_APP_SECRET!,
    refreshToken: process.env.DROPBOX_REFRESH_KEY!
});

// Start building a workflow.
const workflow = Workflow.create()
    .addTrigger(
        new TRDropboxFileAdded("dropbox-trigger", {
            client: dropboxProvider,
            folderPath: process.env.DROPBOX_INVOICES_FOLDER_PATH ?? "",
        })
    )
    .setPlaylist(p => p
        // Get payees from Notion
        .addTask(new TANotionGetTitlesAndIdsForDatabase("get-payees", notionProvider))
        .input((source, outputs) => ({
            database_id: process.env.NOTION_PAYEES_DATABASE_ID!
        }))

        // Get expense types from Notion
        .addTask(new TANotionGetTitlesAndIdsForDatabase("get-expense-types", notionProvider))
        .input((source, outputs) => ({
            database_id: process.env.NOTION_EXPENSE_TYPES_DATABASE_ID!
        }))

        // Download the invoice PDF from Dropbox
        .addTask(new TADropboxDownloadFile("download-invoice-pdf", dropboxProvider))
        .input((source, outputs) => {
            // The `source` object contains the trigger ident for discrimination
            if (source.triggerIdent === "dropbox-trigger") {
                return { file_metadata: source.data }
            }
            throw new Error(`Trigger ${source.triggerIdent} not implemented`);
        })

        // Parse the PDF with AI
        .addTask(new TAParsePdfAi("parse-invoice", openrouterProvider))
        .input((source, outputs) => {
            // Access outputs of previous tasks - fully typed!
            // Check for null (skipped) and success
            const downloadResult = outputs['download-invoice-pdf'];
            if (!downloadResult || !isOk(downloadResult)) {
                throw downloadResult?.error ?? new Error('Failed to download invoice PDF');
            }

            const payeesResult = outputs['get-payees'];
            if (!payeesResult || !isOk(payeesResult)) {
                throw payeesResult?.error ?? new Error('Failed to load payees');
            }

            const expenseTypesResult = outputs['get-expense-types'];
            if (!expenseTypesResult || !isOk(expenseTypesResult)) {
                throw expenseTypesResult?.error ?? new Error('Failed to load expense types');
            }

            return {
                pdf: downloadResult.data.file,
                instructions: "Extract data from the invoice",
                schema: z.object({
                    payee: z.enum(payeesResult.data.map(p => p.id) as [string, ...string[]])
                        .describe("The payee id"),
                    total: z.number()
                        .describe("The total amount"),
                    invoice_date: z.string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .describe("Date as YYYY-MM-DD"),
                    expense_type: z.enum(expenseTypesResult.data.map(e => e.id) as [string, ...string[]])
                        .describe("The expense type id")
                })
            }
        })

        // Create the invoice entry in Notion
        .addTask(new TACreateNotionDatabaseItem("create-notion-invoice", notionProvider))
        .input((source, outputs) => {
            const invoiceResult = outputs['parse-invoice'];
            if (!invoiceResult || !isOk(invoiceResult)) {
                throw invoiceResult?.error ?? new Error('Failed to parse invoice');
            }
            const invoiceData = invoiceResult.data;
            return {
                database_id: process.env.NOTION_INVOICES_DATABASE_ID!,
                properties: {
                    'Name': { 'title': [{ 'text': { 'content': 'Invoice' } }] },
                    'Payee': { 'relation': [{ 'id': invoiceData.payee }] },
                    'Total': { 'number': invoiceData.total },
                    'Invoice Date': { 'date': { 'start': invoiceData.invoice_date } },
                    'Expense Type': { 'relation': [{ 'id': invoiceData.expense_type }] }
                }
            }
        })
    );

// Run the workflow
console.log('[WCreateNotionInvoiceFromFile] Starting workflow...');
workflow.start({
    callback: (source, outputs) => {
        console.log('[WCreateNotionInvoiceFromFile] Workflow completed');
        console.dir({ source, outputs }, { depth: null });
    }
});
```
</details>

<details>
<summary><b>Building a Machine</b></summary>

`Machines` work well for stateful agents. This example shows an AI agent that takes a user's query, refines it, performs a web search, and generates a response.

The `Machine` manages a `StateData` object. Each `StateNode`'s `Playlist` can modify this state, and the `Transitions` between states use it to decide which state to move to next.

```typescript
import { Machine, isOk } from "@fkws/klonk"
import { OpenRouterClient } from "./tasks/common/OpenrouterClient" 
import { Model } from "./tasks/common/models"
import { TABasicTextInference } from "./tasks/TABasicTextInference"
import { TASearchOnline } from "./tasks/TASearchOnline"

type StateData = {
    input: string;
    output?: string;
    model?: Model;
    refinedInput?: string;
    searchTerm?: string;
    searchResults?: {
        results: {
            url: string;
            title: string;
            content: string;
            raw_content?: string;
            score: string;
        }[];
        query: string;
        answer?: string;
        images?: string[];
        follow_up_questions?: string[];
        response_time: string;
    };
    finalResponse?: string;
}

const client = new OpenRouterClient(process.env.OPENROUTER_API_KEY!)

const webSearchAgent = Machine
    .create<StateData>()
    // Declare all states upfront for transition autocomplete
    .withStates<"refine_and_extract" | "search_web" | "generate_response">()
    .addState("refine_and_extract", node => node
        .setPlaylist(p => p
            // Refine the user's input
            .addTask(new TABasicTextInference("refine", client))
            .input((state, outputs) => ({
                inputText: state.input,
                model: state.model ?? "openai/gpt-5.2",
                instructions: `You are a prompt refiner. Refine the prompt to improve LLM performance. 
                               Break down by Intent, Mood, and Instructions. Do NOT answer - ONLY refine.`
            }))

            // Extract search terms from refined input
            .addTask(new TABasicTextInference("extract_search_terms", client))
            .input((state, outputs) => ({
                inputText: `Original: ${state.input}\n\nRefined: ${outputs.refine && isOk(outputs.refine) ? outputs.refine.data.text : state.input}`,
                model: state.model ?? "openai/gpt-5.2",
                instructions: `Extract one short web search query from the user request and refined prompt.`
            }))

            // Update state with results - using isOk for type narrowing
            .finally((state, outputs) => {
                if (outputs.refine && isOk(outputs.refine)) {
                    state.refinedInput = outputs.refine.data.text;
                }
                if (outputs.extract_search_terms && isOk(outputs.extract_search_terms)) {
                    state.searchTerm = outputs.extract_search_terms.data.text;
                }
            })
        )
        .retryLimit(3) // Retry up to 3 times if no transition available
        .addTransition({
            to: "search_web",  // Autocomplete works!
            condition: async (state) => !!state.searchTerm,
            weight: 2 // Higher weight = higher priority
        })
        .addTransition({
            to: "generate_response",  // Autocomplete works!
            condition: async () => true, // Fallback
            weight: 1
        })
    , { initial: true })

    .addState("search_web", node => node
        .setPlaylist(p => p
            .addTask(new TASearchOnline("search"))
            .input((state, outputs) => ({
                query: state.searchTerm!
            }))
            .finally((state, outputs) => {
                if (outputs.search && isOk(outputs.search)) {
                    state.searchResults = outputs.search.data;
                }
            })
        )
        .addTransition({
            to: "generate_response",
            condition: async () => true,
            weight: 1
        })
    )

    .addState("generate_response", node => node
        .setPlaylist(p => p
            .addTask(new TABasicTextInference("generate_response", client))
            .input((state, outputs) => ({
                inputText: state.input,
                model: state.model ?? "openai/gpt-5.2",
                instructions: `You received a user request and refined prompt. 
                               ${state.searchResults ? 'Search results are also available.' : ''}
                               Write a professional response.`
            }))
            .finally((state, outputs) => {
                state.finalResponse = outputs.generate_response && isOk(outputs.generate_response)
                    ? outputs.generate_response.data.text
                    : "Sorry, an error occurred: " + (outputs.generate_response?.error ?? "unknown");
            })
        )
    )
    .addLogger(pino()) // Optional: Add structured logging (pino recommended)
    .finalize({ ident: "web-search-agent" });

// ------------- EXECUTION -------------

const state: StateData = {
    input: "How do I update AMD graphic driver?",
    model: "openai/gpt-5.2-mini"
};

// Run until it completes a roundtrip to the initial state
const finalState = await webSearchAgent.run(state, { mode: 'roundtrip' });

console.log(finalState.finalResponse);
// The original state object is also mutated:
console.log(state.finalResponse);
```
</details>

## Type System

Klonk's type system is minimal. Here's how it works:

### Core Types

| Type | Parameters | Purpose |
|------|------------|---------|
| `Task<Input, Output, Ident>` | Input shape, output shape, string literal ident | Base class for all tasks |
| `Railroad<Output>` | Success data type | Discriminated union for success/error results (like Rust's `Result`) |
| `Playlist<AllOutputs, Source>` | Accumulated output map, source data type | Ordered task sequence with typed chaining |
| `Trigger<Ident, Data>` | String literal ident, event payload type | Event source for workflows |
| `Workflow<Events>` | Union of trigger event types | Connects triggers to playlists |
| `Machine<StateData, AllStateIdents>` | Mutable state shape, union of state idents | Finite state machine with typed transitions |
| `StateNode<StateData, Ident, AllStateIdents>` | State shape, this node's ident, all valid transition targets | Individual state with playlist and transitions |

### Railroad Helper Functions

| Function | Signature | Behavior |
|----------|-----------|----------|
| `unwrap(r)` | `Railroad<T> → T` | Returns data or throws error |
| `unwrapOr(r, default)` | `Railroad<T>, T → T` | Returns data or default value |
| `unwrapOrElse(r, fn)` | `Railroad<T>, (E) → T → T` | Returns data or result of fn(error) |
| `isOk(r)` | `Railroad<T> → boolean` | Type guard for success case |
| `isErr(r)` | `Railroad<T> → boolean` | Type guard for error case |

### How Output Chaining Works

When you add a task to a playlist, Klonk extends the output type:

```typescript
// Start with empty outputs
Playlist<{}, Source>
    .addTask(new FetchTask("fetch")).input(...)
// Now outputs include: { fetch: Railroad<FetchOutput> | null }
Playlist<{ fetch: Railroad<FetchOutput> | null }, Source>
    .addTask(new ParseTask("parse")).input(...)  
// Now outputs include both: { fetch: ..., parse: Railroad<ParseOutput> | null }
```

The `| null` accounts for the possibility that a task was skipped (when its input builder returns `null`). This is why you'll check for null before using `isOk()` - for example: `outputs.fetch && isOk(outputs.fetch)`. TypeScript then narrows the type so you can safely access `.data`!

This maps cleanly to Rust's types:
| Rust | Klonk (TypeScript) |
|------|-------------------|
| `Option<T>` | `T \| null` |
| `Result<T, E>` | `Railroad<T>` |
| `Option<Result<T, E>>` | `Railroad<T> \| null` |
