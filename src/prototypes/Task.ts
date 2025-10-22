export type Railroad<OutputType, ErrorType = Error> = {
    readonly success: true,
    readonly data: OutputType
} | {
    readonly success: false,
    readonly error: ErrorType
}

export abstract class Task<InputType, OutputType, IdentType extends string> {
    constructor(public ident: IdentType) {}
    abstract validateInput(input: InputType): Promise<boolean>
    abstract run(input: InputType): Promise<Railroad<OutputType>>
}