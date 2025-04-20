import ReplicacheCore from "./createReplicacheCore.ts";
import { createObserverPrefixSpy } from "./testHelpers.ts";



Deno.test("observePrefix works", async () => {
    
    const rep = new ReplicacheCore({
      mutators: {
        setKeys: async (tx, kvs: Record<string, any>) => {
          for (const [key, value] of Object.entries(kvs)) {
            await tx.set(key, value);
          }   
        },
        deleteKey: async (tx, key: string) => {
          await tx.delete(key);
        }
      },
    });


    const entriesSpy = createObserverPrefixSpy(rep, "words/")
    await entriesSpy.assertCallCount(1)
    await entriesSpy.assertLastCallArgs([[], {added: [], removed: [], changed: []}])

    await rep.mutate("setKeys", { "words/1": "first" }, 555);
    await entriesSpy.assertCallCount(2);
    await entriesSpy.assertLastCallArgs([[["words/1", "first"]], {added: [["words/1", "first"]], removed: [], changed: []}])

    await rep.mutate("setKeys", { "words/1": "first (changed)" }, 556);
    await entriesSpy.assertCallCount(3);
    await entriesSpy.assertLastCallArgs([[["words/1", "first (changed)"]], {added: [], removed: [], changed: [["words/1", "first (changed)"]]}])

    await rep.mutate("setKeys", { "words/2": "yay" }, 557);
    await entriesSpy.assertCallCount(4);
    await entriesSpy.assertLastCallArgs([[["words/1", "first (changed)"], ["words/2", "yay"]], {added: [["words/2", "yay"]], removed: [], changed: []}])

    await rep.mutate("setKeys", { "words/1": "first (changed again)" }, 558);
    await entriesSpy.assertCallCount(5);
    await entriesSpy.assertLastCallArgs([[["words/1", "first (changed again)"], ["words/2", "yay"]], {added: [], removed: [], changed: [["words/1", "first (changed again)"]]}])


    await rep.mutate("setKeys", { "not/in/subscription": "ok" }, 559)
    await entriesSpy.assertCallCount(5)


    await rep.mutate("deleteKey", "words/1", 560)
    await entriesSpy.assertCallCount(6);
    await entriesSpy.assertLastCallArgs([[["words/2", "yay"]], {added: [], removed: [["words/1", "first (changed again)"]], changed: []}])
})