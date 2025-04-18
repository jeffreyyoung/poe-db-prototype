import { assertEquals } from "@std/assert/equals";
import { Replicache } from "./replicache.ts";
import { app } from "./server.ts";

Deno.test("test", async () => {
    const port = Math.floor(Math.random()*9999)
    const server = Deno.serve({ port }, app.fetch)

    const rep = new Replicache({
        baseUrl: `http://localhost:${server.addr.port}`,
        spaceID: "test"+Math.floor(Math.random()*9999999),
        pushThrottleMs: 1000,
        mutators: {
            set: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
    })

    for (let i = 0; i < 10; i++) {
        // @ts-ignore
        rep.mutate.set({ key: "test"+i, value: "test"+i })
    }

    await sleep(1000)

    for (let i = 0; i < 10; i++) {
        const value = await rep.query((tx) => tx.get("test"+i))
        assertEquals(value, "test"+i)
    }

})


function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}