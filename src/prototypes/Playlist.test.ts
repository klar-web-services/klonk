import { describe, expect, it, vi } from "vitest";
import { Playlist } from "./Playlist";
import { Task, type Railroad } from "./Task";

type Source = { start: number };

type DoubleInput = { value: number };
type DoubleOutput = { doubled: number };
type IncrementInput = { current: number };
type IncrementOutput = { incremented: number };

type DoubleIdent = "double";
type IncrementIdent = "increment";

type ValidationInput = { payload: string };
type ValidationOutput = { upper: string };
type ValidationIdent = "validator";

class DoublingTask extends Task<DoubleInput, DoubleOutput, DoubleIdent> {
  constructor() {
    super("double");
  }

  async validateInput(input: DoubleInput): Promise<boolean> {
    return Number.isFinite(input.value);
  }

  async run(input: DoubleInput): Promise<Railroad<DoubleOutput>> {
    return { success: true, data: { doubled: input.value * 2 } };
  }
}

class IncrementTask extends Task<IncrementInput, IncrementOutput, IncrementIdent> {
  constructor() {
    super("increment");
  }

  async validateInput(): Promise<boolean> {
    return true;
  }

  async run(input: IncrementInput): Promise<Railroad<IncrementOutput>> {
    return { success: true, data: { incremented: input.current + 1 } };
  }
}

class RejectingTask extends Task<ValidationInput, ValidationOutput, ValidationIdent> {
  constructor() {
    super("validator");
  }

  async validateInput(): Promise<boolean> {
    return false;
  }

  async run(): Promise<Railroad<ValidationOutput>> {
    return { success: true, data: { upper: "IGNORED" } };
  }
}

describe("Playlist", () => {
  it("chains tasks immutably and exposes prior outputs to builders", async () => {
    const base = new Playlist<{}, Source>();
    const withDouble = base.addTask(new DoublingTask(), (source) => ({ value: source.start }));
    const complete = withDouble.addTask(new IncrementTask(), (_, outputs) => {
      const doubleResult = outputs.double;
      if (!doubleResult.success) {
        throw new Error("Expected the doubling task to succeed");
      }
      return { current: doubleResult.data.doubled };
    });

    expect(base.bundles).toHaveLength(0);
    expect(withDouble.bundles).toHaveLength(1);
    expect(complete.bundles).toHaveLength(2);

    const result = await complete.run({ start: 3 });
    const doubleOut = result.double;
    if (!doubleOut.success) {
      throw new Error("Expected doubling task to succeed");
    }
    const incrementOut = result.increment;
    if (!incrementOut.success) {
      throw new Error("Expected increment task to succeed");
    }

    expect(doubleOut.data.doubled).toBe(6);
    expect(incrementOut.data.incremented).toBe(7);
  });

  it("invokes the finalizer exactly once with the original source and outputs", async () => {
    const finalizer = vi.fn();

    const playlist = new Playlist<{}, Source>()
      .addTask(new DoublingTask(), (source) => ({ value: source.start }))
      .finally((source, outputs) => finalizer(source, outputs));

    const source: Source = { start: 4 };
    const outputs = await playlist.run(source);
    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(finalizer).toHaveBeenCalledWith(source, outputs);
  });

  it("throws when a task fails validation and skips the finalizer", async () => {
    const finalizer = vi.fn();
    const playlist = new Playlist<{}, Source>()
      .addTask(new RejectingTask(), () => ({ payload: "anything" }))
      .finally(finalizer);

    await expect(playlist.run({ start: 1 })).rejects.toThrow("Input validation failed for task 'validator'");
    expect(finalizer).not.toHaveBeenCalled();
  });
});