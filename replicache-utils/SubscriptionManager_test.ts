import { assertEquals } from "@std/assert/equals";
import { createStore, Store } from "./Store.ts";
import { assertSpyCalls, assertSpyCall, spy } from "jsr:@std/testing/mock";
import { createSubscriptionManager } from "./SubscriptionManager.ts";
import { sleep } from "./sleep.ts";

Deno.test("test subscriptions basic", async () => {
    const store = createStore();
    const onChangeSpy = spy(() => {})
    const subscriptionManager = createSubscriptionManager(store, () => Promise.resolve(), "client1");

    subscriptionManager.subscribe(async (tx) => {
        const totalKeys = await tx.scan({ prefix: "" }).keys().toArray();
        return totalKeys.length;
    }, onChangeSpy);

    await sleep(0);
    assertSpyCalls(onChangeSpy, 1);
    assertSpyCall(onChangeSpy, 0, {
        args: [0]
    });

    store.kv.set("test", { value: "meow", mutation_id: 1 })
    subscriptionManager.notifySubscribers(new Set(["test"]));
    await sleep(0);
    assertSpyCalls(onChangeSpy, 2);
    assertSpyCall(onChangeSpy, 1, {
        args: [1]
    });

    store.kv.set("test", { value: "meow2", mutation_id: 2 })
    subscriptionManager.notifySubscribers(new Set(["test"]));
    await sleep(0);
    // should not be called again since nothing changed
    assertSpyCalls(onChangeSpy, 2);
});

Deno.test("test scanned keys in subscription", async () => {
    const store = createStore();
    const subscriptionManager = createSubscriptionManager(store, () => Promise.resolve(), "client1");
    const onChangeSpy = spy(() => {})
    subscriptionManager.subscribe(async (tx) => {
        return tx.scan({ prefix: "todos/" }).keys().toArray();
    }, onChangeSpy);
    await sleep(0);
    assertSpyCalls(onChangeSpy, 1);
    assertSpyCall(onChangeSpy, 0, {
        args: [[]]
    });

    store.kv.set("todos/1", { value: "meow", mutation_id: 1 })
    subscriptionManager.notifySubscribers(new Set(["todos/1"]));
    await sleep(0);
    assertSpyCalls(onChangeSpy, 2);
    assertSpyCall(onChangeSpy, 1, {
        args: [["todos/1"]]
    });


    store.kv.set("todos/2", { value: "meow2", mutation_id: 2 })
    subscriptionManager.notifySubscribers(new Set(["todos/2"]));
    await sleep(0);
    assertSpyCalls(onChangeSpy, 3);
    assertSpyCall(onChangeSpy, 2, {
        args: [["todos/1", "todos/2"]]
    });

    // should not be called if the value of the key changed but the keys in the prefix are the same
    store.kv.set("todos/1", { value: "meow3", mutation_id: 3 })
    subscriptionManager.notifySubscribers(new Set(["todos/1"]));
    await sleep(0);
    assertSpyCalls(onChangeSpy, 3);


    // should not be called if something outside of the prefix changed
    store.kv.set("other/1", { value: "meow4", mutation_id: 4 })
    subscriptionManager.notifySubscribers(new Set(["other/1"]));
    await sleep(0);
    assertSpyCalls(onChangeSpy, 3);
});


Deno.test("values changed in prefix", async () => {
    const store = createStore();
    const subscriptionManager = createSubscriptionManager(store, () => Promise.resolve(), "client1");
    const onChangeSpy = spy(() => {})
    subscriptionManager.subscribe(async (tx) => {
        return tx.scan({ prefix: "todos/" }).values().toArray();
    }, onChangeSpy);
    await sleep(0);
    assertSpyCalls(onChangeSpy, 1);
    assertSpyCall(onChangeSpy, 0, {
        args: [[]]
    });
})