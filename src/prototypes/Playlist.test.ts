import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Playlist } from "./Playlist";
import { Task, type Railroad } from "./Task";

// Helper to control when a flaky task succeeds
let flakyAttempts = 0;

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

type FlakyIdent = "flaky";

class FlakyTask extends Task<{ failUntilAttempt: number }, { result: string }, FlakyIdent> {
  constructor() {
    super("flaky");
  }

  async validateInput(): Promise<boolean> {
    return true;
  }

  async run(input: { failUntilAttempt: number }): Promise<Railroad<{ result: string }>> {
    flakyAttempts++;
    if (flakyAttempts < input.failUntilAttempt) {
      return { success: false, error: new Error(`Attempt ${flakyAttempts} failed`) };
    }
    return { success: true, data: { result: `Succeeded on attempt ${flakyAttempts}` } };
  }
}

class AlwaysFailingTask extends Task<{}, { result: string }, "failing"> {
  constructor() {
    super("failing");
  }

  async validateInput(): Promise<boolean> {
    return true;
  }

  async run(): Promise<Railroad<{ result: string }>> {
    return { success: false, error: new Error("Always fails") };
  }
}

describe("Playlist", () => {
  beforeEach(() => {
    flakyAttempts = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it("chains tasks immutably and exposes prior outputs to builders", async () => {
    const base = new Playlist<{}, Source>();
    const withDouble = base
      .addTask(new DoublingTask())
      .input((source) => ({ value: source.start }));
    const complete = withDouble
      .addTask(new IncrementTask())
      .input((_, outputs) => {
        const doubleResult = outputs.double;
        if (doubleResult === null || !doubleResult.success) {
          throw new Error("Expected the doubling task to succeed");
        }
        return { current: doubleResult.data.doubled };
      });

    expect(base.bundles).toHaveLength(0);
    expect(withDouble.bundles).toHaveLength(1);
    expect(complete.bundles).toHaveLength(2);

    const result = await complete.run({ start: 3 });
    const doubleOut = result.double;
    if (doubleOut === null || !doubleOut.success) {
      throw new Error("Expected doubling task to succeed");
    }
    const incrementOut = result.increment;
    if (incrementOut === null || !incrementOut.success) {
      throw new Error("Expected increment task to succeed");
    }

    expect(doubleOut.data.doubled).toBe(6);
    expect(incrementOut.data.incremented).toBe(7);
  });

  it("invokes the finalizer exactly once with the original source and outputs", async () => {
    const finalizer = vi.fn();

    const playlist = new Playlist<{}, Source>()
      .addTask(new DoublingTask())
      .input((source) => ({ value: source.start }))
      .finally((source, outputs) => finalizer(source, outputs));

    const source: Source = { start: 4 };
    const outputs = await playlist.run(source);
    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(finalizer).toHaveBeenCalledWith(source, outputs);
  });

  it("throws when a task fails validation and skips the finalizer", async () => {
    const finalizer = vi.fn();
    const playlist = new Playlist<{}, Source>()
      .addTask(new RejectingTask())
      .input(() => ({ payload: "anything" }))
      .finally(finalizer);

    await expect(playlist.run({ start: 1 })).rejects.toThrow("Input validation failed for task 'validator'");
    expect(finalizer).not.toHaveBeenCalled();
  });

  it("skips a task when builder returns null and continues with remaining tasks", async () => {
    const playlist = new Playlist<{}, Source>()
      .addTask(new DoublingTask())
      .input((source) => {
        // Skip doubling if start value is negative
        if (source.start < 0) return null;
        return { value: source.start };
      })
      .addTask(new IncrementTask())
      .input((_, outputs) => {
        // Use doubled value if available, otherwise use 0
        if (outputs.double === null) {
          return { current: 0 };
        }
        if (!outputs.double.success) {
          throw new Error("Expected the doubling task to succeed");
        }
        return { current: outputs.double.data.doubled };
      });

    // Run with positive value - doubling should happen
    const resultPositive = await playlist.run({ start: 5 });
    expect(resultPositive.double).not.toBeNull();
    if (resultPositive.double !== null && resultPositive.double.success) {
      expect(resultPositive.double.data.doubled).toBe(10);
    }
    if (resultPositive.increment !== null && resultPositive.increment.success) {
      expect(resultPositive.increment.data.incremented).toBe(11);
    }

    // Run with negative value - doubling should be skipped
    const resultNegative = await playlist.run({ start: -1 });
    expect(resultNegative.double).toBeNull();
    if (resultNegative.increment !== null && resultNegative.increment.success) {
      expect(resultNegative.increment.data.incremented).toBe(1); // 0 + 1
    }
  });

  it("retries a failed task until it succeeds", async () => {
    const playlist = new Playlist<{}, Source>()
      .addTask(new FlakyTask())
      .input(() => ({ failUntilAttempt: 3 })); // Fail first 2 attempts

    const sleepSpy = vi.spyOn(playlist as any, "sleep").mockResolvedValue(undefined);
    
    const result = await playlist.run({ start: 1 }, { retryDelay: 100 });
    
    expect(flakyAttempts).toBe(3); // Initial + 2 retries
    expect(result.flaky?.success).toBe(true);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(100);
  });

  it("throws immediately when retryDelay is false (preventRetry)", async () => {
    const playlist = new Playlist<{}, Source>()
      .addTask(new AlwaysFailingTask())
      .input(() => ({}));

    await expect(
      playlist.run({ start: 1 }, { retryDelay: false })
    ).rejects.toThrow("Always fails");
    
    expect(flakyAttempts).toBe(0); // AlwaysFailingTask doesn't use flakyAttempts
  });

  it("throws after maxRetries is exhausted", async () => {
    const playlist = new Playlist<{}, Source>()
      .addTask(new AlwaysFailingTask())
      .input(() => ({}));

    const sleepSpy = vi.spyOn(playlist as any, "sleep").mockResolvedValue(undefined);

    await expect(
      playlist.run({ start: 1 }, { retryDelay: 50, maxRetries: 3 })
    ).rejects.toThrow("Always fails");
    
    expect(sleepSpy).toHaveBeenCalledTimes(3);
  });

  it("uses default retry settings (infinite retries at 1000ms) when not specified", async () => {
    const playlist = new Playlist<{}, Source>()
      .addTask(new FlakyTask())
      .input(() => ({ failUntilAttempt: 2 })); // Fail first attempt only

    const sleepSpy = vi.spyOn(playlist as any, "sleep").mockResolvedValue(undefined);
    
    const result = await playlist.run({ start: 1 }); // No options = defaults
    
    expect(result.flaky?.success).toBe(true);
    expect(sleepSpy).toHaveBeenCalledWith(1000); // Default delay
  });
});