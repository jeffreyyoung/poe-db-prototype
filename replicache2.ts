/**
 * Repli-Cache: A Replicache-compatible client with custom internals
 */
import type {
    Mutation,
    PullResponse,
    PushResponse,
    Operation,
    PushRequest,
    PokeResult,
    Patch,
  } from "./server-types.ts";
  const baseURL = "https://jeffreyyoung-replicache_backend_fork1.web.val.run";
  // @ts-ignore
  import Ably from "https://esm.sh/ably";
  
  let ably: Ably.Realtime | null = null;
  export function getAbly() {
    if (!ably) {
      ably = new Ably.Realtime(
        "frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM"
      );
      ably.connection.once("connected", () => {
        console.log("Connected to Ably!");
      });
    }
    return ably;
  }
  
  export async function pullFromServer(
    spaceName: string,
    afterMutationId: number
  ): Promise<PullResponse> {
    const response = await fetch(
      `${baseURL}/pull/${spaceName}?afterMutationId=${afterMutationId}`
    );
    if (!response.ok) {
      throw new Error(`Failed to pull from ${spaceName}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log("pulled", data.patches.length);
    return data;
  }
  
  function collapseMutations(mutations: Mutation[]): Mutation {
    const kvUpdates = new Map<string, Mutation["operations"][number]>();
    for (const m of mutations) {
      for (const operation of m.operations) {
        kvUpdates.set(operation.key, operation);
      }
    }
    const mutation: Mutation = {
      id: Math.floor(Math.random() * 9999999),
      name: "stuf",
      args: { hi: "bye" } as any,
      operations: Array.from(kvUpdates.values()),
    };
    return mutation;
  }
  
  export async function pushToServer(
    spaceName: string,
    mutations: Mutation[]
  ): Promise<PushResponse> {
    const pushRequest: PushRequest = {
      mutations: mutations.map((m) => ({
        ...m,
        operations: [],
      })),
      operations: collapseMutations(mutations).operations,
    };
    const response = await fetch(`${baseURL}/push/${spaceName}`, {
      method: "POST",
      body: JSON.stringify(pushRequest),
    });
    if (!response.ok) {
      throw new Error(`Failed to push to ${spaceName}: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  }
  
  export class Replicache {
    /**
     * local cache of key-values on server.
     */
    kv: Map<string, { value: any; mutation_id: number }> = new Map();
  
    /**
     * { local_mutation_id: number, params: any, kvUpdates: Map<string, any> }[]
     */
    pendingMutations: (Mutation & {
      status: "waiting" | "pending" | "pushed";
      kvUpdates: Map<string, any>;
    })[] = [];
  
    latestMutationId = 0;
  
    pull: () => Promise<unknown>;
    push: () => Promise<unknown>;
    /**
     * each time we run a subscription, we keep track of the keys that were accessed
     */
    #subscriptions = new Map<
      (
        tx: ReturnType<typeof Replicache.prototype.createReadTransaction>
      ) => Promise<any>,
      {
        keysReadOnLastExecution: Set<string>;
        onQueryCbChanged: (res: any) => void;
      }
    >();
  
    options: {
      spaceID: string;
      mutators: Record<
        string,
        (
          tx: ReturnType<typeof Replicache.prototype.createWriteTransaction>,
          params: any
        ) => Promise<any>
      >;
    };
    constructor(options: typeof Replicache.prototype.options) {
      this.options = options;
      this.pull = throttle(this.#doPull.bind(this), 300, true);
      this.push = throttle(this.#doPush.bind(this), 300, true);
      this.#startPolling();
      this.#listenForPokes();
    }
  
    #listenForPokes() {
      const self = this;
      // Check if we're in a test environment
      if (typeof Deno !== "undefined") {
        console.log("Skipping Ably subscription in test environment");
        return;
      }
      const channel = getAbly().channels.get(this.options.spaceID);
      channel.subscribe("poke", (message) => {
        console.log("poke", message);
        if (!message.data) {
          console.log("no poke data");
          this.pull();
          return;
        }
        const pokeResult: PokeResult = message.data;
        const maxMutationId = Math.max(...pokeResult.mutationIds);
        const minMutationId = Math.min(...pokeResult.mutationIds);
        if (minMutationId !== self.latestMutationId + 1) {
          // we need to pull
          self.pull();
          return;
        }
        // we can just apply the mutations and skip pulling
        self.pendingMutations = self.pendingMutations.filter(
          (m) => !pokeResult.localMutationIds.includes(m.id)
        );
        const changedKeys = self.#applyPatches(pokeResult.patches);
        self.latestMutationId = maxMutationId;
        self.fireSubscriptions(changedKeys);
      });
    }
  
    async #startPolling() {
      if (typeof Deno !== "undefined") {
        console.log("Skipping Ably subscription in test environment");
        return;
      }
      while (true) {
        await this.pull().catch((e) => {
          console.error("Error polling", e);
        });
        await sleep(20_000);
      }
    }
  
    pullQueue = Promise.resolve();
  
    async query(
      cb: (
        tx: ReturnType<typeof Replicache.prototype.createReadTransaction>
      ) => Promise<any>
    ) {
      const tx = this.createReadTransaction();
      const result = await cb(tx);
      return result;
    }
  
    async subscribe(
      queryCb: (
        tx: ReturnType<typeof Replicache.prototype.createReadTransaction>
      ) => Promise<any>,
      onQueryCbChanged: (res: any) => void
    ) {
      if (typeof queryCb !== "function") {
        throw new Error("The first argument of rep.subscribe must be a function");
      }
      if (typeof onQueryCbChanged !== "function") {
        throw new Error(
          "The second argument of rep.subscribe must be a function"
        );
      }
      this.#subscriptions.set(queryCb, {
        keysReadOnLastExecution: new Set(),
        onQueryCbChanged,
      });
      await this.#runAndUpdateSubscription(queryCb, new Set());
      return () => {
        this.#subscriptions.delete(queryCb);
      };
    }
  
    #shouldNotifySubscription(
      observedKeys: Set<string>,
      changedKeys: Set<string>
    ) {
      for (const key of changedKeys) {
        if (observedKeys.has(key)) {
          return true;
        }
      }
      return false;
    }
  
    async #runAndUpdateSubscription(
      cb: (
        tx: ReturnType<typeof Replicache.prototype.createReadTransaction>
      ) => Promise<any>,
      changedKeys: Set<string>
    ) {
      const tx = this.createReadTransaction();
      const info = this.#subscriptions.get(cb);
      if (!info) {
        throw new Error("Subscription not found");
      }
      try {
        // check if sets are equal
        const result = await cb(tx);
        if (
          this.#shouldNotifySubscription(
            new Set([...info.keysReadOnLastExecution, ...tx._getReadKeys()]),
            changedKeys
          )
        ) {
          info.onQueryCbChanged(result);
        }
      } catch (e) {
        console.error("Error querying", e);
      }
      info.keysReadOnLastExecution = new Set(tx._getReadKeys());
    }
  
    fireSubscriptions(changedKeys: Set<string>) {
      for (const cb of this.#subscriptions.keys()) {
        const observedKeys = Array.from(
          this.#subscriptions.get(cb)?.keysReadOnLastExecution || []
        );
        if (!observedKeys) {
          // this should never happen
          return;
        }
        this.#runAndUpdateSubscription(cb, changedKeys);
      }
    }
  
    #applyPatches(patches: Patch[]): Set<string> {
      const changedKeys = new Set<string>();
      for (const patch of patches) {
        if (patch.op === "set") {
          this.kv.set(patch.key, {
            value: patch.value,
            mutation_id: patch.mutationId,
          });
        } else if (patch.op === "del") {
          this.kv.delete(patch.key);
        }
        changedKeys.add(patch.key);
      }
      return changedKeys;
    }
  
    async #doPull() {
      console.log("starting pull");
      const result = await pullFromServer(
        this.options.spaceID,
        this.latestMutationId
      );
      const patches = result.patches;
      const changedKeys = this.#applyPatches(patches);
      this.latestMutationId = result.lastMutationId;
      this.pendingMutations = this.pendingMutations.filter(
        (m) => m.status !== "pushed"
      );
      this.fireSubscriptions(changedKeys);
    }
  
    _isPendingMutationCompleted(mutation: {
      resultingMutationId: number | null;
    }) {
      return (
        mutation.resultingMutationId !== null &&
        mutation.resultingMutationId <= this.latestMutationId
      );
    }
  
    async #get(key: string) {
      const pendingKv = this.pendingMutations.findLast((mutation) =>
        mutation.kvUpdates.has(key)
      );
      if (pendingKv) {
        return pendingKv.kvUpdates.get(key);
      }
      return this.kv.get(key)?.value;
    }
  
    async #has(key: string) {
      const value = await this.#get(key);
      return Boolean(value);
    }
  
    getMutationIdForKey(key: string) {
      if (!this.kv.has(key)) {
        return null;
      }
      const value = this.kv.get(key);
      return value?.mutation_id;
    }
  
    async #isEmpty() {
      return (
        this.kv.size === 0 &&
        this.pendingMutations.every((mutation) => mutation.kvUpdates.size === 0)
      );
    }
  
    #getKeys(): Set<string> {
      const keySet = new Set([
        ...this.kv.keys(),
        ...this.pendingMutations.flatMap((mutation) =>
          Array.from(mutation.kvUpdates.keys())
        ),
      ]);
      return keySet;
    }
  
    async #size() {
      return this.#getKeys().size;
    }
  
    // https://doc.replicache.dev/api/interfaces/ReadTransaction
    createReadTransaction() {
      const self = this;
      const accessedKeys = new Set<string>();
      const tx = {
        async get(key: string) {
          accessedKeys.add(key);
          return self.#get(key);
        },
        async has(key: string) {
          accessedKeys.add(key);
          return self.#has(key);
        },
        async isEmpty() {
          return self.#isEmpty();
        },
        async size() {
          return self.#size();
        },
        scan(options: { prefix?: string; start?: string; limit?: number }) {
          // https://doc.replicache.dev/api/#scanindexoptions
          const keySet = self.#getKeys();
          const keys = Array.from(keySet);
          keys.sort();
          const prefix = options.prefix || "";
          const startKey = options.start;
          const limit = options.limit || Infinity;
          let resultKeys = keys.filter((key) => key.startsWith(prefix));
          if (startKey) {
            resultKeys = resultKeys.slice(resultKeys.indexOf(startKey));
          }
          resultKeys = resultKeys.slice(0, limit);
          for (const key of resultKeys) {
            accessedKeys.add(key);
          }
          return new ScanResult(resultKeys, (key) => tx.get(key));
        },
        _getReadKeys() {
          return Array.from(accessedKeys);
        },
      };
      return tx;
    }
  
    createWriteTransaction() {
      const self = this;
      const writeOperations: Operation[] = [];
      const tx = {
        ...self.createReadTransaction(),
        async set(key: string, value: any) {
          writeOperations.push({ op: "set", key, value });
        },
        async put(key: string, value: any) {
          tx.set(key, value);
        },
        async delete(key: string) {
          writeOperations.push({ op: "set", key, value: null });
        },
        async del(key: string) {
          writeOperations.push({ op: "set", key, value: null });
        },
        _getOperations(): Operation[] {
          return [...writeOperations];
        },
      };
      return tx;
    }
  
    localMutationQueue = Promise.resolve();
  
    async #doMutation(mutatorName: string, params: any, localMutationId: number) {
      // this is how we ensure the local mutations are executed in order
      this.localMutationQueue = this.localMutationQueue
        .catch(() => {})
        .then(async () => {
          const tx = this.createWriteTransaction();
          const result = await this.options.mutators[mutatorName](tx, params);
          const kvUpdates = new Map();
          for (const op of tx._getOperations()) {
            if (op.op === "set") {
              kvUpdates.set(op.key, op.value);
            }
            if (op.op === "del") {
              kvUpdates.delete(op.key);
            }
          }
          this.pendingMutations.push({
            id: localMutationId,
            args: params,
            kvUpdates,
            name: mutatorName,
            operations: tx._getOperations(),
            status: "waiting",
          });
          this.fireSubscriptions(new Set(kvUpdates.keys()));
          setTimeout(() => {
            this.push();
          }, 100);
          return result;
        });
      return this.localMutationQueue;
    }
  
    get mutate() {
      return new Proxy(
        {},
        {
          get: (_target, mutatorName) => {
            if (typeof mutatorName !== "string") {
              throw new Error(`Mutator name must be a string`);
            }
  
            if (!this.options.mutators[mutatorName]) {
              throw new Error(`Mutator not found: ${mutatorName}`);
            }
  
            return (args: any) => {
              return this.#doMutation(
                mutatorName,
                args,
                Math.floor(Math.random() * 9999999)
              );
            };
          },
        }
      );
    }
  
    async #doPush() {
      console.log("starting push", this.pendingMutations.length);
      const mutations = this.pendingMutations.filter(
        (m) => m.status !== "pushed"
      );
      mutations.forEach((m) => (m.status = "pending"));
      if (mutations.length === 0) {
        return;
      }
      try {
        const start = Date.now();
        await pushToServer(this.options.spaceID, mutations);
        const timeInMs = Date.now() - start;
        console.log("pushed", mutations.length, "mutations in", timeInMs, "ms");
        mutations.forEach((m) => (m.status = "pushed"));
      } catch (e) {
        console.error("Error pushing mutations", e);
        // roll back the mutations since this errored...
        // in real world we would retry
        this.pendingMutations = this.pendingMutations.filter(
          (mutation) => !mutations.includes(mutation)
        );
      }
    }
  }
  
  class ScanResult {
    resultKeysPromise: Promise<string[]>;
    readKey: (key: string) => Promise<any>;
    constructor(resultKeys: string[], readKey: (key: string) => Promise<any>) {
      this.readKey = readKey;
      this.resultKeysPromise = Promise.all(
        resultKeys.map(async (key) => {
          const value = await readKey(key);
          if (value === null) {
            return null;
          }
          return key;
        })
      ).then((keys) => keys.filter((key) => key !== null) as string[]);
    }
  
    // The default AsyncIterable implementation (same as values)
    [Symbol.asyncIterator]() {
      return this.values();
    }
  
    // Async iterator over values
    values() {
      let index = 0;
      const keysPromise = this.resultKeysPromise;
      const self = this;
  
      // Create an async iterator that also has a toArray method
      const iterator = {
        async next() {
          const results = await keysPromise;
          if (index < results.length) {
            const key = results[index++];
            const value = await self.readKey(key);
            return { value, done: false };
          }
          return { done: true };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
        // toArray method for AsyncIterableIteratorToArray
        async toArray() {
          const results = await keysPromise;
          return Promise.all(
            results.map(async (item) => await self.readKey(item))
          );
        },
      };
  
      return iterator;
    }
  
    // Async iterator over keys
    keys() {
      let index = 0;
      const keysPromise = this.resultKeysPromise;
  
      const iterator = {
        async next() {
          const resultKeys = await keysPromise;
          if (index < resultKeys.length) {
            return { value: resultKeys[index++], done: false };
          }
          return { done: true };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
        // toArray method for AsyncIterableIteratorToArray
        async toArray() {
          const resultKeys = await keysPromise;
          return resultKeys;
        },
      };
  
      return iterator;
    }
  
    // Async iterator over entries [key, value]
    entries() {
      let index = 0;
      const keysPromise = this.resultKeysPromise;
      const readKey = this.readKey;
  
      const iterator = {
        async next() {
          const resultKeys = await keysPromise;
          if (index < resultKeys.length) {
            const key = resultKeys[index++];
            const value = await readKey(key);
            return { value: [key, value], done: false };
          }
          return { done: true };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
        // toArray method for AsyncIterableIteratorToArray
        async toArray() {
          const resultKeys = await keysPromise;
          return Promise.all(
            resultKeys.map(async (key) => [key, await readKey(key)])
          );
        },
      };
  
      return iterator;
    }
  
    // Returns all values as an array
    async toArray() {
      const resultKeys = await this.resultKeysPromise;
      const readKey = this.readKey;
      return Promise.all(resultKeys.map(async (key) => await readKey(key)));
    }
  }
  
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  function throttle<T>(func: () => Promise<T>, ms: number, trailing = false) {
    let lastCall = 0;
    let timeoutId: number | null = null;
    let currentPromise: Promise<T> | null = null;
    let isThrottled = false;
  
    return async () => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;
  
      // If we're within the throttle period
      if (timeSinceLastCall < ms) {
        isThrottled = true;
  
        // If trailing is enabled, schedule a call after the throttle period
        if (trailing) {
          // Clear any existing timeout
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
  
          // Set a new timeout to call the function after the throttle period
          timeoutId = setTimeout(() => {
            timeoutId = null;
            lastCall = Date.now();
            isThrottled = false;
            currentPromise = func();
            currentPromise.finally(() => {
              currentPromise = null;
            });
          }, ms - timeSinceLastCall) as unknown as number;
        }
  
        // Return the current promise if it exists, otherwise null
        return currentPromise;
      }
  
      // If we're outside the throttle period, call the function immediately
      lastCall = now;
      isThrottled = false;
      currentPromise = func();
      currentPromise.finally(() => {
        currentPromise = null;
      });
      return currentPromise;
    };
  }
  
  export default Replicache;
  