import { hashMutators } from "./hash.ts";

Deno.test("hashMutators", () => {
    const mutators = {
        addTodo: async (yay: any, args: any) => {
            await yay.set(`todos/${args.id}`, args.title)
        }
    }
    const hash = hashMutators(mutators);
    console.log("here is the hash", hash);
})