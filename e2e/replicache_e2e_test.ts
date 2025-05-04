import { assertEquals } from "@std/assert/equals";
import { assertSpyCalls, spy } from "jsr:@std/testing/mock";
import { Replicache } from "../replicache.ts";

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

const e2eOps = {
    sanitizeResources: false,
    sanitizeOps: false,
}

const baseUrl = Deno.env.get("REPLICACHE_BASE_URL") || "https://poe-db-653909965599.us-central1.run.app"

Deno.test("test", e2eOps, async () => {
    try {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        baseUrl,
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
    })
    console.log("rep", rep)
    for (let i = 0; i < 10; i++) {
        console.log("mutate")
        // @ts-ignore
        await rep.mutate.setValue({ key: "test"+i, value: "test"+i })
    }
    for (let i = 0; i < 10; i++) {
        const value = await rep.query((tx) => tx.get("test"+i))
        assertEquals("test"+i, value)
    }
    for (let i = 0; i < 100; i++) {
        const value = "meow"+i
        // @ts-ignore
        await rep.mutate.setValue({ key: "meow", value: value })
        assertEquals(value, await rep.query((tx) => tx.get("meow")))
    }
    
    await rep.push();
    console.log("pushing")
    console.log("pulling")
    await rep.pull()
    console.log("pulled")
    } catch (e) {
        console.error("nooooo", e)
        assertEquals(true, false)
    }

})


Deno.test("subscriptions", e2eOps, async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        baseUrl,
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
    })
    await rep.hasCompletedInitialPull();
    const testSubscription = spy((res) => { console.log("subscription called!!")})

    rep.subscribe((tx) => tx.get("test"), testSubscription)
    // @ts-ignore
    await rep.mutate.setValue({ key: "test", value: "test" })
    // @ts-ignore
    await rep.mutate.setValue({ key: "test1", value: "test" })
    // @ts-ignore
    await rep.mutate.setValue({ key: "test1", value: "test" })
    // @ts-ignore
    await rep.mutate.setValue({ key: "test1", value: "test" })
    await rep.push()
    await rep.pull()
    await sleep(0)
    assertSpyCalls(testSubscription, 2)
})

Deno.test("subscription with multiple keys", e2eOps, async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        baseUrl,
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
    })
    const testSubscription = spy((res) => { console.log("subscription called!!")})

    rep.subscribe(async (tx) => {
        const keys = await tx.scan({ prefix: "meow/" }).values().toArray();
        return keys
    }, testSubscription);
    await rep.hasCompletedInitialPull();
    await sleep(100)
    assertSpyCalls(testSubscription, 1)

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/1", value: "test" });
    await sleep(500)
    assertSpyCalls(testSubscription, 3)

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/2", value: "test" });
    await sleep(500)
    assertSpyCalls(testSubscription, 5)

    // @ts-ignore
    await rep.mutate.setValue({ key: "notmeow/3", value: "test" });
    await sleep(500)
    assertSpyCalls(testSubscription, 5)
    await sleep(500)
})


Deno.test("mutation_ids", e2eOps, async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        baseUrl,
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
    });
    // @ts-ignore
    await rep.mutate.setValue({ key: "test", value: "test" })
    await rep.push();
    await rep.pull();
    assertEquals(rep.debug().lastMutationId, 1, "mutation id should be 1")

    // @ts-ignore
    await rep.mutate.setValue({ key: "test", value: "test2" })
    await rep.push();
    await rep.pull();
    assertEquals(rep.debug().lastMutationId, 2, "mutation id should be 2")
})


Deno.test("This one should fail because certain things are not cleaned up", e2eOps, () => {
    assertEquals(true, true, "yay");
})