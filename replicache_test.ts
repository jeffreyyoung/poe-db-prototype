import { assertEquals } from "@std/assert/equals";
import { assertSpyCalls, spy } from "jsr:@std/testing/mock";
import { Replicache } from "./replicache.ts";
import { createTestClient } from "./replicache-utils/network/TestNetworkClient.ts";
import { createServer } from "./backend/replicache_server_core.ts";

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

const testClient = createTestClient({})

Deno.test("test", async () => {
    try {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
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


Deno.test("subscriptions", async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    })
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
    await sleep(500)
    assertSpyCalls(testSubscription, 2)
})

Deno.test("subscription with multiple keys", async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    })
    await rep.hasCompletedInitialPull()
    const testSubscription = spy((res) => { console.log("subscription called!!")})

    rep.subscribe(async (tx) => {
        const keys = await tx.scan({ prefix: "meow/" }).keys().toArray();
        return keys
    }, testSubscription);
    await sleep(10);
    assertSpyCalls(testSubscription, 1)
    assertEquals(testSubscription.calls[0].args[0], [])

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/1", value: "test" });
    await sleep(100)
    console.log("testSubscription", testSubscription.calls.map((c) => c.args))
    assertEquals(testSubscription.calls[1].args[0], ["meow/1"])
    // called once for local mutation, and once for real result
    assertSpyCalls(testSubscription, 2)

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/2", value: "test" });
    await sleep(100)
    assertEquals(testSubscription.calls[2].args[0], ["meow/1", "meow/2"])
    assertSpyCalls(testSubscription, 3)

    // @ts-ignore
    await rep.mutate.setValue({ key: "notmeow/3", value: "test" });
    await sleep(100)
    assertSpyCalls(testSubscription, 3)
})


Deno.test("mutation_ids", async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    });
    console.log("about to mutate1" )
    // @ts-ignore
    await rep.mutate.setValue({ key: "test", value: "test" })
    await rep.push();
    await rep.pull();
    assertEquals(rep.debug().lastMutationId, 1, "mutation id should be 1")

    console.log("about to mutate2" )
    // @ts-ignore
    await rep.mutate.setValue({ key: "test", value: "test2" })
    console.log("about to push2" )
    await rep.push();
    console.log("about to pull2" )
    await rep.pull();
    assertEquals(rep.debug().lastMutationId, 2, "mutation id should be 2")
})


Deno.test("This one should fail because certain things are not cleaned up", () => {
    assertEquals(true, true, "yay");
})