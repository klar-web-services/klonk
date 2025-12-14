import { describe, expect, expectTypeOf, it, vi } from "vitest";
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

type Urgency = "low" | "normal" | "critical";
type NotifyInput = { title: string; message: string; urgency?: Urgency };
type NotifyOutput = null;
type NotifyIdent = "notify";

// Realistic "app-style" task + literal union input field
type Model = "openai/gpt-5" | "openai/gpt-5.2";

type OpenRouterClient = {
  basicTextInference(args: { inputText: string; instructions?: string; model: Model }): Promise<string>;
};

type TABasicTextInferenceInput = {
  inputText: string;
  instructions?: string;
  model: Model;
};

type TABasicTextInferenceOutput = {
  text: string;
};

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

class NotifyTask extends Task<NotifyInput, NotifyOutput, NotifyIdent> {
  constructor() {
    super("notify");
  }

  async validateInput(): Promise<boolean> {
    return true;
  }

  async run(): Promise<Railroad<NotifyOutput>> {
    return { success: true, data: null };
  }
}

class TABasicTextInference<IdentType extends string> extends Task<
  TABasicTextInferenceInput,
  TABasicTextInferenceOutput,
  IdentType
> {
  constructor(ident: IdentType, public client: OpenRouterClient) {
    super(ident);
    if (!this.client) {
      throw new Error("[TABasicTextInference] An OpenRouter client instance is required.");
    }
  }

  async validateInput(input: TABasicTextInferenceInput): Promise<boolean> {
    if (!input.inputText || !input.model) return false;
    return true;
  }

  async run(input: TABasicTextInferenceInput): Promise<Railroad<TABasicTextInferenceOutput>> {
    try {
      const result = await this.client.basicTextInference({
        inputText: input.inputText,
        instructions: input.instructions,
        model: input.model,
      });

      return { success: true, data: { text: result } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
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

  it("preserves literal unions in input builders (no widening)", () => {
    const playlist = new Playlist<{}, Source>().addTask(new NotifyTask(), (source) => {
      if (source.start > 0) {
        return { title: "ok", message: "ok", urgency: "low" };
      }
      return { title: "bad", message: "bad", urgency: "critical" };
    });

    // If `addTask` breaks contextual typing, the builder return ends up as `{ urgency: string }`
    // and this assertion will fail at compile time.
    type Outputs = Awaited<ReturnType<typeof playlist.run>>;
    expectTypeOf<Outputs>().toEqualTypeOf<{ notify: Railroad<null> }>();
  });

  it("preserves literal unions in a realistic generic Task input (model union)", async () => {
    const client: OpenRouterClient = {
      async basicTextInference() {
        return "ok";
      },
    };

    const playlist = new Playlist<{}, Source>().addTask(new TABasicTextInference("refine", client), (state, _outputs) => {
      if (state.start > 0) {
        const input: TABasicTextInferenceInput = {
          inputText: `start=${state.start}`,
          model: "openai/gpt-5.2",
          instructions: "Refine this prompt",
        };
        return input;
      }

      const input: TABasicTextInferenceInput = {
        inputText: `start=${state.start}`,
        model: "openai/gpt-5",
        instructions: "Refine this prompt",
      };
      return input;
    });

    const outputs = await playlist.run({ start: 1 });
    expect(outputs.refine.success).toBe(true);
    if (outputs.refine.success) {
      expect(outputs.refine.data.text).toBe("ok");
    }
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
