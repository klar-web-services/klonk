![Klonk](./.github/assets/KLONK_white.png)

---

![npm version](https://img.shields.io/npm/v/@fkws/klonk)
![npm downloads](https://img.shields.io/npm/dm/@fkws/klonk)
[![codecov](https://codecov.io/gh/klar-web-services/klonk/branch/main/graph/badge.svg?token=2R145SOCWH)](https://codecov.io/gh/klar-web-services/klonk)
---

![License](https://img.shields.io/github/license/klar-web-services/klonk)

*A code-first, type-safe automation engine for TypeScript.*

## Introduction
Klonk is a code-first, type-safe automation engine designed with developer experience as a top priority. It provides powerful, composable primitives to build complex workflows and state machines with world-class autocomplete and type inference. If you've ever wanted to build event-driven automations or a stateful agent, but in code, with all the benefits of TypeScript, Klonk is for you.

![Code](./.github/assets/blurry.png)
![Skip to code examples ->](https://github.com/klar-web-services/klonk?tab=readme-ov-file#code-examples)

The two main features are **Workflows** and **Machines**.

- **Workflows**: Combine triggers with a series of tasks (a `Playlist`) to automate processes. Perfect for event-driven automation, like "when a file is added to Dropbox, parse it, and create an entry in Notion."
- **Machines**: Create finite state machines where each state has its own `Playlist` of tasks and conditional transitions to other states. Ideal for building agents, multi-step processes, or any system with complex, stateful logic.

## Installation
```bash
bun add @fkws/klonk
# or
npm i @fkws/klonk
```

## Core Concepts

At the heart of Klonk are a few key concepts that work together.

### Task
A `Task` is the smallest unit of work. It's an abstract class with two main methods you need to implement:
- `validateInput(input)`: Runtime validation of the task's input (on top of strong typing).
- `run(input)`: Executes the task's logic.

Tasks use a `Railroad` return type, which is a simple way to handle success and error states without throwing exceptions. You can also use it for the rest of your application.

### Playlist
A `Playlist` is a sequence of `Tasks` that are executed in order. The magic of a `Playlist` is that each task has access to the outputs of all the tasks that ran before it, in a fully type-safe way. You build a `Playlist` by chaining `.addTask()` calls.

### Trigger
A `Trigger` is what kicks off a `Workflow`. It's an event source. Klonk can be extended with triggers for anything: file system events, webhooks, new database entries, messages in a queue, etc.

### Workflow
A `Workflow` connects one or more `Triggers` to a `Playlist`. When a trigger fires an event, the workflow runs the playlist, passing the event data as the initial input. This allows you to create powerful, event-driven automations.

### Machine
A `Machine` is a finite state machine. It's made up of `StateNode`s. Each `StateNode` represents a state and has two key components:
1.  A `Playlist` that runs when the machine enters that state.
2.  A set of conditional `Transitions` to other states.
3.  Retry rules for when a transition fails to resolve.

The `Machine` carries a mutable `stateData` object that can be read from and written to by playlists and transition conditions throughout its execution.

## Features
- **Type-Safe & Autocompleted**: Klonk leverages TypeScript's inference to provide a world-class developer experience. The inputs and outputs of every step are strongly typed, so you'll know at compile time if your logic is sound.
- **Code-First**: Define your automations directly in TypeScript. No YAML, no drag-and-drop UIs. Just the full power of a real programming language.
- **Composable & Extensible**: The core primitives (`Task`, `Trigger`) are simple abstract classes, making it easy to create your own reusable components and integrations.
- **Flexible Execution**: `Machines` can be run synchronously to completion (`run`) for request/response style work, or started as a long-running background process (`start`).

## Klonkworks: Pre-built Components
Coming soon(ish)! Klonkworks will be a large collection of pre-built Tasks, Triggers, and integrations. This will allow you to quickly assemble powerful automations that connect to a wide variety of services, often without needing to build your own components from scratch.

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
    TABasicTextInferenceInput,  // These type parameters are part of the secret sauce typing system Klonk uses.
    TABasicTextInferenceOutput, // Input Type, Output Type, Ident Type
    IdentType
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
                success: true, // Railroad is a simple result type
                data: {
                    text: result
                }
            };
        } catch (error) {
            // On failure, return an error object. The next Task's input builder will react to this.
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
            // When an event occurs, use pushEvent to add it to the internal queue for the workflow to poll.
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

Workflows are perfect for event-driven automations. This example creates a workflow that triggers when a new invoice PDF is added to a Dropbox folder. It then parses the invoice and creates a new item in a Notion database.

Notice how the `builder` function for each task (`(source, outputs) => { ... }`) has access to the initial `source` data (from the trigger) and the `outputs` of all previous tasks. Klonk automatically infers the types for `source` and `outputs`!

```typescript
import { z } from 'zod';
import { Workflow } from '@fkws/klonk';

// The following example requires a lot of tasks, integrations and a trigger.
// Soon, you will be able to import these from @fkws/klonkworks.
import { TACreateNotionDatabaseItem, TANotionGetTitlesAndIdsForDatabase, TAParsePdfAi, TADropboxDownloadFile } from '@fkws/klonkworks/tasks';
import { INotion, IOpenRouter, IDropbox } from '@fkws/klonkworks/integrations';
import { TRDropboxFileAdded } from '@fkws/klonkworks/triggers';

// Providers and clients are instantiated as usual.
const notionProvider = new INotion({apiKey: process.env.NOTION_API_KEY!});
const openrouterProvider = new IOpenRouter({apiKey: process.env.OPENROUTER_API_KEY!});
const dropboxProvider = new IDropbox({
    appKey: process.env.DROPBOX_APP_KEY!,
    appSecret: process.env.DROPBOX_APP_SECRET!,
    refreshToken: process.env.DROPBOX_REFRESH_KEY!
});

// Start building a workflow.
const workflow = Workflow.create().addTrigger(
    // A workflow is initiated by one or more triggers.
    new TRDropboxFileAdded("dropbox-trigger", {
        client: dropboxProvider,
        folderPath: process.env.DROPBOX_INVOICES_FOLDER_PATH ?? "",
    })
).setPlaylist(p => p // Builder function allows complex types to be assembled!
    .addTask( // .addTask() adds a task to the playlist.
        new TANotionGetTitlesAndIdsForDatabase("get-payees", notionProvider),
        // The second argument to addTask builds the input for that task.
        // `source` is the data from the trigger, `outputs` contains all previous task outputs.
        (source, outputs) => {
            return { database_id: process.env.NOTION_PAYEES_DATABASE_ID!}
        }
    ).addTask(
        new TANotionGetTitlesAndIdsForDatabase("get-expense-types", notionProvider),
        (source, outputs) => { // Type inference works for source and outputs!
            return { database_id: process.env.NOTION_EXPENSE_TYPES_DATABASE_ID!}
        }
    ).addTask(
        new TADropboxDownloadFile("download-invoice-pdf", dropboxProvider),
        (source, outputs) => {
            // The `source` object contains the trigger ident, so you can handle multiple triggers.
            if (source.triggerIdent == "dropbox-trigger") {
                return { file_metadata: source.data}
            } else {
                throw new Error(`Trigger ${source.triggerIdent} is not implemented for task download-invoice-pdf.`)
            }
        }
    ).addTask(
        new TAParsePdfAi("parse-invoice", openrouterProvider),
        (source, outputs) => {
            // Access the outputs of previous tasks via the `outputs` object.
            // The keys are the idents you provided to the tasks.
            const downloadResult = outputs['download-invoice-pdf'];
            if (!downloadResult.success) {
                throw downloadResult.error ?? new Error('Failed to download invoice PDF');
            }

            const payeesResult = outputs['get-payees'];
            if (!payeesResult.success) {
                throw payeesResult.error ?? new Error('Failed to load payees');
            }

            const expenseTypesResult = outputs['get-expense-types'];
            if (!expenseTypesResult.success) {
                throw expenseTypesResult.error ?? new Error('Failed to load expense types');
            }

            const payees = payeesResult.data;
            const expenseTypes = expenseTypesResult.data;

            return {
                pdf: downloadResult.data.file,
                instructions: "Extract data from the invoice",
                schema: z.object({
                    payee: z.enum(payees.map(p => p.id) as [string, ...string[]])
                        .describe("The payee id of the invoice according to this map: " + JSON.stringify(payees, null, 2)),
                    total: z.number()
                        .describe("The total amount of the invoice."),
                    invoice_date: z.string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .describe("The date of the invoice as an ISO 8601 string (YYYY-MM-DD)."),
                    expense_type: z.enum(expenseTypes.map(e => e.id) as [string, ...string[]])
                        .describe("The expense type id of the invoice according to this map: " + JSON.stringify(expenseTypes, null, 2))
                })
            }
        }
    ).addTask(
        new TACreateNotionDatabaseItem("create-notion-invoice", notionProvider),
        (source, outputs) => {
            const invoiceResult = outputs['parse-invoice'];
            if (!invoiceResult.success) {
                throw invoiceResult.error ?? new Error('Failed to parse invoice');
            }
            const invoiceData = invoiceResult.data;
            const properties = {
                'Name': { 'title': [{ 'text': { 'content': 'Invoice' } }] },
                'Payee': { 'relation': [{ 'id': invoiceData.payee }] },
                'Total': { 'number': invoiceData.total },
                'Invoice Date': { 'date': { 'start': invoiceData.invoice_date } },
                'Expense Type': { 'relation': [{ 'id': invoiceData.expense_type }] }
            };
            return {
                database_id: process.env.NOTION_INVOICES_DATABASE_ID!,
                properties: properties
            }
        }
    )
)

// Run the workflow
console.log('[WCreateNotionInvoiceFromFile] Starting workflow...');
// .start() begins the workflow's trigger polling loop.
workflow.start({
    // The callback is executed every time the playlist successfully completes.
    callback: (source, outputs) => {
        console.log('[WCreateNotionInvoiceFromFile] Workflow completed');
        console.dir({
            source,
            outputs
        }, { depth: null });
    }
});
```
</details>

<details>
<summary><b>Building a Machine</b></summary>

`Machines` are ideal for building complex, stateful agents. This example shows a simple AI agent that takes a user's query, refines it, performs a web search, and then generates a final response.

The `Machine` manages a `StateData` object. Each `StateNode`'s `Playlist` can modify this state, and the `Transitions` between states can use it to decide which state to move to next.

```typescript
import { Machine, StateNode } from "@fkws/klonk"
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
            raw_content?: string | undefined;
            score: string;
        }[];
        query: string;
        answer?: string | undefined;
        images?: string[] | undefined;
        follow_up_questions?: string[] | undefined;
        response_time: string;
    },
    finalResponse?: string;
}

const client = new OpenRouterClient(process.env.OPENROUTER_API_KEY!)

const webSearchAgent = Machine
    .create<StateData>()
    .addState(StateNode
        .create<StateData>()
        .setIdent("refine_and_extract")
        .setPlaylist(p => p // Builder function allows complex types to be assembled!
            .addTask(new TABasicTextInference("refine", client),
                (state, outputs) => { // This function constructs the INPUT of the task from the state and outputs of previous tasks
                    const input = state.input;
                    const model = state.model ? state.model : "openai/gpt-5"
                    const instructions = `You are a prompt refiner. Any prompts you receive, you will refine to improve LLM performance. Break down the prompt by Intent, Mood, and Instructions. Do NOT reply or answer the user's message! ONLY refine the prompt.`;
                    return {
                        inputText: input,
                        model: model,
                        instructions: instructions
                    }
                })
            .addTask(new TABasicTextInference("extract_search_terms", client),
                (state, outputs) => {
                    const input = `Original request: ${state.input}\n\nRefined prompt: ${state.refinedInput}`;
                    const model = state.model ? state.model : "openai/gpt-5"
                    const instructions = `You will receive the original user request AND an LLM refined version of the prompt. Please use both to extract one short web search query that will retrieve useful results.`;
                    return {
                        inputText: input,
                        model: model,
                        instructions: instructions
                    }
                })
            .finally((state, outputs) => { // The finally block allows the playlist to react to the last task and to modify state data before the run ends.
                if (outputs.refine.success) {
                    state.refinedInput = outputs.refine.data.text
                } else {
                    state.refinedInput = "Sorry, an error occurred: " + outputs.refine.error
                }

                if (outputs.extract_search_terms.success) {
                    state.searchTerm = outputs.extract_search_terms.data.text
                }
            }))
        .retryLimit(3) // Simple retry rule setters. Also includes .preventRetry() to disable retries entirely and .retryDelayMs(delayMs) to set the delay between retries. Default is infinite retries at 1000ms delay.
        .addTransition({
            to: "search_web", // Transitions refer to states by their ident.
            condition: async (stateData: StateData) => stateData.searchTerm ? true : false,
            weight: 2 // Weight determines the order in which transitions are tried. Higher weight = higher priority.
        })
        .addTransition({
            to: "generate_response",
            condition: async (stateData: StateData) => true,
            weight: 1
        }),
        { initial: true } // The machine needs an initial state.
    )
    .addState(StateNode.create<StateData>()
        .setIdent("search_web")
        .setPlaylist(p => p
            .addTask(new TASearchOnline("search"),
            (state, outputs) => {
                return {
                    query: state.searchTerm! // We are sure that the searchTerm is not undefined because of the transition condition.
                }
            })
            .finally((state, outputs) => {
                if(outputs.search.success) {
                    state.searchResults = outputs.search.data
                }
            }))
        .addTransition({
            to: "generate_response",
            condition: async (stateData: StateData) => true,
            weight: 1
        })
    )
    .addState(StateNode.create<StateData>()
        .setIdent("generate_response")
        .setPlaylist(p => p
            .addTask(new TABasicTextInference("generate_response", client),
            (state, outputs) => {
                return {
                    inputText: state.input,
                    model: state.model ? state.model : "openai/gpt-5",
                    instructions: "You will receive a user request and a refined prompt. There may also be search results. Based on the information, please write a professional response to the user's request."
                }
            })
            .finally((state, outputs) => {
                if(outputs.generate_response.success) {
                    state.finalResponse = outputs.generate_response.data.text
                }
                else {
                    state.finalResponse = "Sorry, an error occurred: " + outputs.generate_response.error
                }
            })
    ))
    .finalize({ // Finalize your machine to make it ready to run. Verbose machines emit JSON logs. If you don't provide an ident, a uuidv4 will be generated for it.
        verbose: true,
        ident: "web-search-agent"
    })

// ------------- EXECUTION: -------------

const state: StateData = { // The state object is mutable and is passed to the machine and playlists.
    input: "How do I update AMD graphic driver?",
    model: "openai/gpt-4o-mini"
}

// The .run() method executes the machine until it reaches a terminal state
// (leaf, failed, out of retries, looped back to initial state)
// and returns the final state. The original state object is also mutated.
const finalState = await webSearchAgent.run(state)

console.log(finalState.finalResponse) // The final state is returned.
// Or simply:
console.log(state.finalResponse) // original state object is also mutated.
```
</details>
