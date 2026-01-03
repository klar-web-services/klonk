import { describe, expect, expectTypeOf, it } from "vitest";
import { Task } from "./Task";
import { Result } from "@fkws/klonk-result";

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

  async run(input: Input): Promise<Result<Output>> {
    if (!(await this.validateInput(input))) {
      return new Result({ success: false, error: new Error("Input must be a non-negative number") });
    }
    return new Result({ success: true, data: { doubled: input.value * 2 } });
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

  it("returns a Result success result when run with valid input", async () => {
    const task = new MathTask();
    const result = await task.run({ value: 2 });
    expect(result.unwrap()).toEqual({ doubled: 4 });
    expectTypeOf(result).toEqualTypeOf<Result<Output>>();
  });

  it("returns a Result failure when input is invalid", async () => {
    const task = new MathTask();
    const result = await task.run({ value: -5 });
    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected the task to fail validation for negative numbers.");
    }
    // Narrowing should allow access to .error
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toMatch(/non-negative/);
  });
});

