import { describe, expect, expectTypeOf, it } from "vitest";
import { Task, type Railroad } from "./Task";

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
