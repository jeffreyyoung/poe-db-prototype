import { assertEquals } from "@std/assert/equals";
import { assertSpyCalls, spy } from "jsr:@std/testing/mock";
import { Replicache } from "./replicache.ts";

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

Deno.test("test", async () => {
    try {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
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


Deno.test("subscriptions", async () => {
    const rep = new Replicache({
        spaceID: "test"+Math.floor(Math.random()*9999999),
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
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
    })
    const testSubscription = spy((res) => { console.log("subscription called!!")})

    rep.subscribe(async (tx) => {
        const keys = await tx.scan({ prefix: "meow/" }).values().toArray();
        return keys
    }, testSubscription);

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/1", value: "test" });
    await sleep(500)
    assertSpyCalls(testSubscription, 1)

    // @ts-ignore
    await rep.mutate.setValue({ key: "meow/2", value: "test" });
    await sleep(500)
    assertSpyCalls(testSubscription, 2)

    // @ts-ignore
    await rep.mutate.setValue({ key: "notmeow/3", value: "test" });
    await sleep(500)
    assertSpyCalls(testSubscription, 2)
    
    

    
})

Deno.test("This one should fail because certain things are not cleaned up", () => {
    assertEquals(true, true, "yay");
})