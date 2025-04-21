import { assertEquals } from "@std/assert/equals";
import ReplicacheCore from "./createReplicacheCore.ts";
import { sleep } from "./sleep.ts";
import { createSubscriptionSpy } from "./testHelpers.ts";
import { runMutator } from "./sandbox/mutatorRunner.ts";

Deno.test("basic queries work", async () => {
  const core = new ReplicacheCore({
    mutators: {
      setKey: async (tx, { key, value }) => {
        tx.set(key, value);
      },
    },
  });

  assertEquals(await core.query((tx) => tx.get("test")), undefined);
  await core.mutate("setKey", { key: "test", value: "test" }, 555);
  assertEquals(await core.query((tx) => tx.get("test")), "test");
});

Deno.test("reactivity works with conditional logic", async () => {
  const core = new ReplicacheCore({
    mutators: {
      async transferMoney(
        tx,
        { amount, from, to }: { amount: number; from: string; to: string }
      ) {
        const fromBalance = (await tx.get(`balance/${from}`)) ?? 0;
        if (fromBalance < amount) {
          return false;
        }
        const toBalance = (await tx.get(`balance/${to}`)) ?? 0;
        tx.set(`balance/${from}`, fromBalance - amount);
        tx.set(`balance/${to}`, toBalance + amount);
        return true;
      },
      setBalance: async (tx, { name, balance }) => {
        await tx.set(`balance/${name}`, balance);
      },
    },
  });

  const onJimBalanceChanged = createSubscriptionSpy(core, (tx) => tx.get("balance/jim"))
  const onPamBalanceChanged = createSubscriptionSpy(core, (tx) => tx.get("balance/pam"))

  await onJimBalanceChanged.assertCallCount(1)
  await onJimBalanceChanged.assertLastCallArgs([undefined])
  await onPamBalanceChanged.assertCallCount(1)
  await onPamBalanceChanged.assertLastCallArgs([undefined])

  await core.mutate(
    "transferMoney",
    { amount: 10, from: "jim", to: "pam" },
    555
  );
  await sleep(0);
  await onJimBalanceChanged.assertCallCount(1)
  await onPamBalanceChanged.assertCallCount(1)

  await core.mutate("setBalance", { name: "jim", balance: 5 }, 556);
  await sleep(10);
  assertEquals(await core.query((tx) => tx.get("balance/jim")), 5);
  await sleep(0);
  // await sleep(0);
  await onJimBalanceChanged.assertCallCount(2)
  await onJimBalanceChanged.assertLastCallArgs([5])
  await onPamBalanceChanged.assertCallCount(1)

  // amount is too high for the transfer to happen
  await core.mutate(
    "transferMoney",
    { amount: 10, from: "jim", to: "pam" },
    557
  );
  await sleep(0);
  // the value in the key still didn't change...
  // so no one should be notified
  await onJimBalanceChanged.assertCallCount(2)
  await onPamBalanceChanged.assertCallCount(1)

  // now transfer will happen
  await core.mutate(
    "transferMoney",
    { amount: 1, from: "jim", to: "pam" },
    558
  );
  await sleep(0);
  await onJimBalanceChanged.assertCallCount(3)
  await onPamBalanceChanged.assertCallCount(2)
  await onJimBalanceChanged.assertLastCallArgs([4])
  await onPamBalanceChanged.assertLastCallArgs([1])
});

Deno.test("scanning works in a subscription", async () => {
  const rep = new ReplicacheCore({
    mutators: {
      setKeys: async (tx, kvs: Record<string, any>) => {
        for (const [key, value] of Object.entries(kvs)) {
          await tx.set(key, value);
        }
      },
    },
  });

  const todoKeysSpy = createSubscriptionSpy(rep, (tx) => tx.scan({prefix: "todos/" }).keys().toArray())
  await todoKeysSpy.assertCallCount(1)
  await todoKeysSpy.assertLastCallArgs([[]])

  const todoValuesSpy = createSubscriptionSpy(rep, (tx) => tx.scan({prefix: "todos/" }).values().toArray())
  await todoValuesSpy.assertCallCount(1)
  await todoValuesSpy.assertLastCallArgs([[]])

  const usersSpy = createSubscriptionSpy(rep, (tx) => tx.scan({prefix: "users/" }).values().toArray())
  await usersSpy.assertCallCount(1)
  await usersSpy.assertLastCallArgs([[]])


  await rep.mutate("setKeys", { "todos/1": "hi" }, 555);
  // new todo key, so both todo subs are called
  await todoKeysSpy.assertCallCount(2);
  await todoValuesSpy.assertCallCount(2);
  // no new users, so users sub is not called
  await usersSpy.assertCallCount(1);

  await rep.mutate("setKeys", { "todos/1": "yay", "users/1": "jim" }, 556);
  // no new todo key, so todo keys sub is not called
  await todoKeysSpy.assertCallCount(2);
  // the value of a todo changed, so todo values sub is called
  await todoValuesSpy.assertCallCount(3);
  // a new user was added, so users sub is called
  await usersSpy.assertCallCount(2);

})




Deno.test("process pull works", async () => {
  const rep = new ReplicacheCore({
    mutators: {
      setKeys: async (tx, kvs: Record<string, any>) => {
        for (const [key, value] of Object.entries(kvs)) {
          await tx.set(key, value);
        }   
      },
    },
  });

  await rep.mutate("setKeys", { "todos/1": "hi" }, 555);
  await sleep(10);
  assertEquals(await rep.query((tx) => tx.get("todos/1")), "hi");
  const todoKeysSpy = createSubscriptionSpy(rep, (tx) => tx.scan({prefix: "todos/" }).keys().toArray())
  await todoKeysSpy.assertLastCallArgs([["todos/1"]])
  await todoKeysSpy.assertCallCount(1)
  const todoValuesSpy = createSubscriptionSpy(rep, (tx) => tx.scan({prefix: "todos/" }).values().toArray())
  await todoValuesSpy.assertLastCallArgs([["hi"]])
  await todoValuesSpy.assertCallCount(1)

  await rep.processPullResult({
    patches: [
        {
            op: "set",
            key: "todos/1",
            value: "yay",
            mutationId: 556,
        }
    ],
    lastMutationId: 556,
  }, [555])

  await sleep(10);
  assertEquals(await rep.query((tx) => tx.get("todos/1")), "yay");
  await todoKeysSpy.assertCallCount(1);
  await todoValuesSpy.assertCallCount(2);
  await todoValuesSpy.assertLastCallArgs([["yay"]]);
});

Deno.test("entries works", async () => {
    
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

    const entriesSpy = createSubscriptionSpy(rep, (tx) => tx.scan({prefix: "words/" }).entries().toArray())
    await entriesSpy.assertCallCount(1)
    await entriesSpy.assertLastCallArgs([[]])

    await rep.mutate("setKeys", { "words/1": "first" }, 555);
    await entriesSpy.assertCallCount(2);
    await entriesSpy.assertLastCallArgs([[["words/1", "first"]]])

    await rep.mutate("setKeys", { "words/1": "first (changed)" }, 556);
    await entriesSpy.assertCallCount(3);
    await entriesSpy.assertLastCallArgs([[["words/1", "first (changed)"]]])

    await rep.mutate("setKeys", { "words/2": "yay" }, 557);
    await entriesSpy.assertCallCount(4);
    await entriesSpy.assertLastCallArgs([[["words/1", "first (changed)"], ["words/2", "yay"]]])

    await rep.mutate("setKeys", { "words/1": "first (changed again)" }, 558);
    await entriesSpy.assertCallCount(5);
    await entriesSpy.assertLastCallArgs([[["words/1", "first (changed again)"], ["words/2", "yay"]]])


    await rep.mutate("setKeys", { "not/in/subscription": "ok" }, 559)
    await entriesSpy.assertCallCount(5)


    await rep.mutate("deleteKey", "words/1", 560)
    await entriesSpy.assertCallCount(6);
    await entriesSpy.assertLastCallArgs([[["words/2", "yay"]]])
})


Deno.test("serialized mutators", async () => {
  const rep = new ReplicacheCore({
    mutators: {
      jimSays: async (tx, arg) => {
        const jimSays = await tx.get("jimSays");

        return tx.set("pamSays", jimSays);
      },
      async hello(tx, arg) {
        return tx.set(`hello/${arg.name}`, "hi");
      },
    },
  });

  
  const result = await runMutator({
    mutatorName: "jimSays",
    args: {},
    serializedMutatorFnString: rep.getSerializedFunctionString("jimSays"),
    databaseEntries: [["jimSays", "hi"]]
  })
  assertEquals(result.result, "success")
  assertEquals(result.changedEntries, [["pamSays", "hi"]])
});

Deno.test("serialized mutators 2", async () => {
  return;
  const rep = new ReplicacheCore({
    mutators: {
      jimSays: async (tx, arg) => {
        const jimSays = await tx.get("jimSays");

        return tx.set("pamSays", jimSays);
      },
      async hello(tx, arg) {
        return tx.set(`hello/${arg.name}`, "hi");
      },
    },
  });

  const result2 = await runMutator({
    mutatorName: "hello",
    args: { name: "joe", age: 20 },
    serializedMutatorFnString: rep.getSerializedFunctionString("hello"),
    databaseEntries: [["hello/joe", "hi"]]
  })
  assertEquals(result2.result, "success")
  assertEquals(result2.changedEntries, [["hello/joe", "hi"]])
});