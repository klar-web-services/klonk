import { Task, Railroad } from "./Task"

type InputBuilder<SourceType, AllOutputTypes, TaskInputType> = (source: SourceType, outputs: AllOutputTypes) => TaskInputType

interface Machine<SourceType, AllOutputTypes, TaskInputType, TaskOutputType, IdentType extends string> {
	task: Task<TaskInputType, TaskOutputType, IdentType>
	builder: InputBuilder<SourceType, AllOutputTypes, TaskInputType>
}

// Prevents TypeScript from inferring T from the builder argument, ensuring
// the task parameter is the source of truth for the input type.
type NoInfer<T> = [T][T extends any ? 0 : never]

export class Playlist<
        AllOutputTypes extends Record<string, any>,
        SourceType = unknown
    > {
    machines: Machine<any, any, any, any, string>[]
    finalizer?: (source: SourceType, outputs: Record<string, any>) => void | Promise<void>

    constructor(machines: Machine<any, any, any, any, string>[] = [], finalizer?: (source: SourceType, outputs: Record<string, any>) => void | Promise<void>) {
        this.machines = machines;
        this.finalizer = finalizer;
    }

    addTask<
        TaskInputType,
        TaskOutputType,
        const IdentType extends string
    >(
		task: Task<TaskInputType, TaskOutputType, IdentType> & { ident: IdentType },
		builder: (source: SourceType, outputs: AllOutputTypes) => NoInfer<TaskInputType>
    ): Playlist<AllOutputTypes & { [K in IdentType]: Railroad<TaskOutputType> }, SourceType> {
        const machine = { task, builder: builder as any };
        const newMachines = [...this.machines, machine];
        return new Playlist<AllOutputTypes & { [K in IdentType]: Railroad<TaskOutputType> }, SourceType>(newMachines, this.finalizer)
    }

    finally(finalizer: (source: SourceType, outputs: AllOutputTypes) => void | Promise<void>): this {
        this.finalizer = finalizer as unknown as (source: SourceType, outputs: Record<string, any>) => void | Promise<void>;
        return this;
    }

    async run(source: SourceType): Promise<AllOutputTypes> {
        const outputs: Record<string, any> = {};
    
        for (const machine of this.machines) {
            const input = machine.builder(source, outputs);
            
            const isValid = await machine.task.validateInput(input);
            if (!isValid) {
                throw new Error(`Input validation failed for task '${machine.task.ident}'`);
            }

            const result = await machine.task.run(input);
            outputs[machine.task.ident] = result;
        }
        if (this.finalizer) {
            await this.finalizer(source, outputs);
        }
        return outputs as AllOutputTypes;
    }
}