import { assertEquals } from "@std/assert/equals";
import { assertSpyCalls, spy } from "jsr:@std/testing/mock";
import { Replicache } from "./replicache.ts";
import { createQueuedTestClient, createTestClient } from "./replicache-utils/network/TestNetworkClient.ts";

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
    await rep.hasCompletedInitialPull()
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
    assertSpyCalls(testSubscription, 3)

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/2", value: "test" });
    await sleep(100)
    assertEquals(testSubscription.calls[3].args[0], ["meow/1", "meow/2"])
    assertSpyCalls(testSubscription, 4)

    // @ts-ignore
    await rep.mutate.setValue({ key: "notmeow/3", value: "test" });
    await sleep(100)
    assertSpyCalls(testSubscription, 4)
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

Deno.test("subscriptions are not invoked until initial pull is complete", async () => { 
    const testClient = createTestClient({})
    const rep = new Replicache({
        spaceID: "test123",
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    })
    // @ts-ignore
    await rep.mutate.setValue({ key: "test", value: "testResult" })
    await rep.push();
    await rep.pull();
    // make a different client
    const rep2 = new Replicache({
        spaceID: "test123",
        mutators: {
            setValue: async (tx, { key, value }) => {   
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    })
    const testSubscription = spy((res) => { console.log("subscription called!!")})

    rep2.subscribe((tx) => tx.get("test"), testSubscription)
    await sleep(100)
    assertSpyCalls(testSubscription, 1)
    assertEquals(testSubscription.calls[0].args[0], "testResult")
});


Deno.test("test subscriptions with controlled pull", async () => {
    const [testClient, controller] = createQueuedTestClient()
    const rep = new Replicache({
        spaceID: "test123",
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    });
    const testSubscription = spy((res) => { console.log("subscription called!!")})
    rep.subscribe((tx) => tx.get("my_favorite_food"), testSubscription)
    assertEquals(controller.queuedPulls.length, 1);
    let isResolved = false;
    rep.hasCompletedInitialPull().then(() => {
        isResolved = true;
    });
    await sleep(100)
    assertSpyCalls(testSubscription, 0);
    assertEquals(isResolved, false);
    controller.flushPulls();
    await sleep(100)
    assertEquals(isResolved, true);
    assertSpyCalls(testSubscription, 1);

    assertEquals(controller.queuedPulls.length, 0);
    assertEquals(controller.queuedPushes.length, 0);
    assertEquals(controller.queuedPokes.length, 0);
    console.log("mutating")
    // @ts-ignore
    await rep.mutate.setValue({ key: "my_favorite_food", value: { food: "hot dogs" } })
    await sleep(100)
    console.log("mutated")
    assertEquals(controller.queuedPushes.length, 1);
    assertEquals(controller.queuedPokes.length, 0);
    assertEquals(controller.queuedPulls.length, 0);
    // subscription should be called with optimistic result
    assertSpyCalls(testSubscription, 2);
    assertEquals(testSubscription.calls[1].args[0], { food: "hot dogs" });
    await controller.flushPushes();
    await sleep(100)
    assertEquals(controller.queuedPushes.length, 0);
    assertEquals(controller.queuedPokes.length, 1);
    assertEquals(controller.queuedPulls.length, 0);
    assertSpyCalls(testSubscription, 2);

    await controller.flushPokes();
    await sleep(100)
    assertEquals(controller.queuedPokes.length, 0);
    assertEquals(controller.queuedPulls.length, 0);
    assertSpyCalls(testSubscription, 3);
    assertEquals(testSubscription.calls[2].args[0], { food: "hot dogs" });

    assertEquals(controller.queuedPulls.length, 0);
    assertEquals(controller.queuedPushes.length, 0);
    assertEquals(controller.queuedPokes.length, 0);
});


Deno.test("query shouldn't resolve until pull is complete", async () => {
    const [testClient, controller] = createQueuedTestClient()
    const rep = new Replicache({
        spaceID: "test123",
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
        networkClient: testClient
    });
    const testSubscription = spy((res) => { console.log("subscription called!!")})
    rep.subscribe((tx) => tx.get("my_favorite_food"), testSubscription)
    assertEquals(controller.queuedPulls.length, 1);
    let isResolved = false;
    rep.query((tx) => tx.get("my_favorite_food")).then(() => {
        isResolved = true;
    });
    await sleep(100)
    assertEquals(isResolved, false);
    controller.flushPulls();
    await sleep(100)
    assertEquals(isResolved, true);
});

Deno.test("query should resolve with initial pull result", async () => {
    const client = createTestClient({})
    const createRep = () => {
        return new Replicache({
            spaceID: "test123",
            mutators: {
                setValue: async (tx, { key, value }) => {
                    await tx.set(key, value)
                }
            },
            networkClient: client
        })
    }
    const rep1 = createRep()
    // @ts-ignore
    await rep1.mutate.setValue({ key: "my_favorite_food", value: { food: "hot dogs" } })
    await rep1.push()
    await sleep(10);
    const rep2 = createRep()
    await rep2.pull()

    assertEquals(await rep2.query((tx) => tx.get("my_favorite_food")), { food: "hot dogs" });
})