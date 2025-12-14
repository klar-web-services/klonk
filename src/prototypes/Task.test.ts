import { describe, expect, expectTypeOf, it } from "vitest";
import { Task, type Railroad, isOk, isErr, unwrap, unwrapOr, unwrapOrElse } from "./Task";

type Input = { value: number };
type Output = { doubled: number };
type Ident = "math_task";

class MathTask extends Task<Input, Output, Ident> {
  constructor() {
    super("math_task");
  }

  async validateInput(input: Input): Promise<boolean> {
    return Number.isFinite(input.value) && input.value >= 0;
  }

  async run(input: Input): Promise<Railroad<Output>> {
    if (!(await this.validateInput(input))) {
      return { success: false, error: new Error("Input must be a non-negative number") };
    }
    return { success: true, data: { doubled: input.value * 2 } };
  }
}

describe("Task", () => {
  it("keeps the provided ident on the instance", () => {
    const task = new MathTask();
    expect(task.ident).toBe("math_task");
  });

  it("allows subclasses to express validation rules", async () => {
    const task = new MathTask();
    await expect(task.validateInput({ value: 10 })).resolves.toBe(true);
    await expect(task.validateInput({ value: -1 })).resolves.toBe(false);
  });

  it("returns a Railroad success result when run with valid input", async () => {
    const task = new MathTask();
    const result = await task.run({ value: 2 });
    expect(result).toEqual({ success: true, data: { doubled: 4 } });
    expectTypeOf(result).toEqualTypeOf<Railroad<Output>>();
  });

  it("returns a Railroad failure when input is invalid", async () => {
    const task = new MathTask();
    const result = await task.run({ value: -5 });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected the task to fail validation for negative numbers.");
    }
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toMatch(/non-negative/);
  });
});

describe("Railroad helpers", () => {
  const okResult: Railroad<number> = { success: true, data: 42 };
  const errResult: Railroad<number> = { success: false, error: new Error("oops") };

  describe("isOk", () => {
    it("returns true for success", () => {
      expect(isOk(okResult)).toBe(true);
    });
    it("returns false for error", () => {
      expect(isOk(errResult)).toBe(false);
    });
    it("narrows type correctly", () => {
      if (isOk(okResult)) {
        expectTypeOf(okResult.data).toEqualTypeOf<number>();
      }
    });
  });

  describe("isErr", () => {
    it("returns false for success", () => {
      expect(isErr(okResult)).toBe(false);
    });
    it("returns true for error", () => {
      expect(isErr(errResult)).toBe(true);
    });
    it("narrows type correctly", () => {
      if (isErr(errResult)) {
        expectTypeOf(errResult.error).toEqualTypeOf<Error>();
      }
    });
  });

  describe("unwrap", () => {
    it("returns data for success", () => {
      expect(unwrap(okResult)).toBe(42);
    });
    it("throws for error", () => {
      expect(() => unwrap(errResult)).toThrow("oops");
    });
  });

  describe("unwrapOr", () => {
    it("returns data for success", () => {
      expect(unwrapOr(okResult, 0)).toBe(42);
    });
    it("returns default for error", () => {
      expect(unwrapOr(errResult, 0)).toBe(0);
    });
  });

  describe("unwrapOrElse", () => {
    it("returns data for success", () => {
      expect(unwrapOrElse(okResult, () => 0)).toBe(42);
    });
    it("calls function for error", () => {
      expect(unwrapOrElse(errResult, (e) => e.message.length)).toBe(4); // "oops".length
    });
  });
});
