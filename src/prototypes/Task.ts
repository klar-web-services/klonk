import { Result } from "@fkws/klonk-result";

/**
 * Base class for all executable units in Klonk.
 * Implement `validateInput` for runtime checks and `run` for the actual work.
 *
 * The type parameters power Klonk's autocomplete across Playlists and Workflows:
 * - `InputType` is inferred at call sites when you build a Playlist.
 * - `OutputType` becomes available to subsequent tasks under this task's `ident`.
 * - `IdentType` should be a string literal to provide strongly-typed keys in outputs.
 *
 * See README Code Examples for end-to-end usage in Playlists and Machines.
 *
 * @template InputType - Runtime input shape expected by the task.
 * @template OutputType - Result shape produced by the task.
 * @template IdentType - Unique task identifier (use a string literal).
 */
export abstract class Task<InputType, OutputType, IdentType extends string> {
    /**
     * Unique identifier for the task. Also used as the key in Playlist outputs.
     */
    constructor(public ident: IdentType) {}

    /**
     * Optional runtime validation. Return `true` to proceed, `false` to fail fast.
     * Use this to complement static typing with data-level checks.
     *
     * @param input - The input object provided by the Playlist builder.
     * @returns Whether the input is valid for this task.
     */
    abstract validateInput(input: InputType): Promise<boolean>

    /**
     * Execute the task logic.
     * Return a `Railroad` to encode success or failure without throwing.
     *
     * @param input - The input object provided by the Playlist builder.
     * @returns A `Railroad` containing output data on success, or an error on failure.
     */
    abstract run(input: InputType): Promise<Result<OutputType>>
}