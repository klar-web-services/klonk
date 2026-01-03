# Klonk Examples

A guided tour of Klonk's features, from simple to advanced.

## Running Examples

```bash
bun run examples/tasks/01-simple-task.ts
```

## Learning Path

Start with the foundational primitives, then move to composed constructs:

```
tasks/ → triggers/ → playlists/ → workflows/ → machines/
```

---

## 1. Tasks (Atomic Primitive)

Tasks are the smallest unit of work. Start here.

| File | What You'll Learn |
|------|-------------------|
| [`01-simple-task.ts`](tasks/01-simple-task.ts) | Create a basic task with `run()` and `validateInput()` |
| [`02-validation.ts`](tasks/02-validation.ts) | Input validation patterns |
| [`03-error-handling.ts`](tasks/03-error-handling.ts) | Returning errors, enum inputs, `Record<string, unknown>` |
| [`04-flaky-task.ts`](tasks/04-flaky-task.ts) | Tasks that fail intentionally (for retry demos) |

## 2. Triggers (Atomic Primitive)

Triggers are event sources that kick off workflows.

| File | What You'll Learn |
|------|-------------------|
| [`01-simple-trigger.ts`](triggers/01-simple-trigger.ts) | Create a basic trigger with `start()`, `stop()`, `pushEvent()` |
| [`02-custom-payloads.ts`](triggers/02-custom-payloads.ts) | Different payload shapes, type discrimination |

## 3. Playlists (Composed)

Playlists chain tasks together with typed output access.

| File | What You'll Learn |
|------|-------------------|
| [`01-basic-chaining.ts`](playlists/01-basic-chaining.ts) | Chain tasks, access `source` and `outputs` |
| [`02-error-handling.ts`](playlists/02-error-handling.ts) | Handle task failures with `isOk`, `unwrapOr` |
| [`03-skipping-tasks.ts`](playlists/03-skipping-tasks.ts) | Skip tasks by returning `null` |
| [`04-finally-hook.ts`](playlists/04-finally-hook.ts) | Run side effects after all tasks with `.finally()` |
| [`05-retry-behavior.ts`](playlists/05-retry-behavior.ts) | Automatic retries for failed tasks |

## 4. Workflows (Composed)

Workflows connect triggers to playlists for event-driven automation.

| File | What You'll Learn |
|------|-------------------|
| [`01-basic-workflow.ts`](workflows/01-basic-workflow.ts) | Single trigger, `start()`, callbacks |
| [`02-multi-trigger.ts`](workflows/02-multi-trigger.ts) | Multiple triggers, `triggerIdent` discrimination |

## 5. Machines (Composed)

Machines are finite state machines with typed transitions.

| File | What You'll Learn |
|------|-------------------|
| [`01-simple-machine.ts`](machines/01-simple-machine.ts) | Two states, one transition, `withStates()` |
| [`02-transitions.ts`](machines/02-transitions.ts) | Conditional transitions, weights, self-loops |
| [`03-run-modes.ts`](machines/03-run-modes.ts) | `leaf`, `roundtrip`, `any`, `infinitely` modes |
| [`04-health-checker.ts`](machines/04-health-checker.ts) | Full example: URL health checker with loops |

---

## Import Pattern

These examples import from `../../src` for development. In your own projects, import from the published package (and `Result` from `@fkws/klonk-result`):

```typescript
import { Task, Playlist, Machine } from "@fkws/klonk";
import { Result } from "@fkws/klonk-result";
```
