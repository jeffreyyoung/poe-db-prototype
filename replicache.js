const baseURL = "https://jeffreyyoung-replicachebackendv2.web.val.run";
import Ably from "https://esm.sh/ably";
let ably = null;
export function getAbly() {
  if (!ably) {
    ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");
    ably.connection.once("connected", () => {
      console.log("Connected to Ably!");
    });
  }
  return ably;
}
export async function pullFromServer(spaceName, afterMutationId) {
  console.log("pulling from server", spaceName, afterMutationId);
  const response = await fetch(`${baseURL}/pull/${spaceName}?afterMutationId=${afterMutationId}`);
  if (!response.ok) {
    throw new Error(`Failed to pull from ${spaceName}: ${response.statusText}`);
  }
  const data = await response.json();
  console.log("pulled", data);
  return data;
}
function combineMutations(mutations) {
  const kvUpdates = /* @__PURE__ */ new Map();
  for (const mutation2 of mutations) {
    for (const operation of mutation2.operations) {
      kvUpdates.set(operation.key, operation);
    }
  }
  const mutation = {
    id: Math.floor(Math.random() * 9999999),
    name: "stuf",
    args: { "hi": "bye" },
    operations: Array.from(kvUpdates.values())
  };
  return mutation;
}
export async function pushToServer(spaceName, mutations) {
  const response = await fetch(`${baseURL}/push/${spaceName}`, {
    method: "POST",
    body: JSON.stringify({ mutations: [combineMutations(mutations)] })
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
  kv = /* @__PURE__ */ new Map();
  /**
   * { local_mutation_id: number, params: any, kvUpdates: Map<string, any> }[]
   */
  pendingMutations = [];
  latestMutationId = 0;
  pull;
  push;
  /**
   * each time we run a subscription, we keep track of the keys that were accessed
   */
  #subscriptions = /* @__PURE__ */ new Map();
  options;
  constructor(options) {
    this.options = options;
    this.pull = throttle(this.#doPull.bind(this), 300, true);
    this.push = throttle(this.#doPush.bind(this), 300, true);
    this.#startPolling();
    this.#listenForPokes();
  }
  #listenForPokes() {
    if (typeof Deno !== "undefined") {
      console.log("Skipping Ably subscription in test environment");
      return;
    }
    const channel = getAbly().channels.get(this.options.spaceID);
    channel.subscribe("poke", (message) => {
      console.log("poke", message);
      this.pull();
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
      await sleep(2e4);
    }
  }
  pullQueue = Promise.resolve();
  async query(cb) {
    const tx = this.createReadTransaction();
    const result = await cb(tx);
    return result;
  }
  async subscribe(queryCb, onQueryCbChanged) {
    if (typeof queryCb !== "function") {
      throw new Error("queryCb must be a function");
    }
    if (typeof onQueryCbChanged !== "function") {
      throw new Error("onQueryCbChanged must be a function");
    }
    this.#subscriptions.set(queryCb, { keysReadOnLastExecution: /* @__PURE__ */ new Set(), onQueryCbChanged });
    await this.#runAndUpdateSubscription(queryCb, /* @__PURE__ */ new Set());
    return () => {
      this.#subscriptions.delete(queryCb);
    };
  }
  #shouldNotifySubscription(observedKeys, changedKeys) {
    for (const key of changedKeys) {
      if (observedKeys.has(key)) {
        return true;
      }
    }
    return false;
  }
  async #runAndUpdateSubscription(cb, changedKeys) {
    const tx = this.createReadTransaction();
    const info = this.#subscriptions.get(cb);
    if (!info) {
      throw new Error("Subscription not found");
    }
    try {
      const result = await cb(tx);
      if (this.#shouldNotifySubscription(/* @__PURE__ */ new Set([...info.keysReadOnLastExecution, ...tx._getReadKeys()]), changedKeys)) {
        info.onQueryCbChanged(result);
      }
    } catch (e) {
      console.error("Error querying", e);
    }
    info.keysReadOnLastExecution = new Set(tx._getReadKeys());
  }
  fireSubscriptions(changedKeys) {
    for (const cb of this.#subscriptions.keys()) {
      const observedKeys = Array.from(this.#subscriptions.get(cb)?.keysReadOnLastExecution || []);
      if (!observedKeys) {
        return;
      }
      this.#runAndUpdateSubscription(cb, changedKeys);
    }
  }
  async #doPull() {
    console.log("starting pull");
    const result = await pullFromServer(this.options.spaceID, this.latestMutationId);
    const patches = result.patches;
    const changedKeys = /* @__PURE__ */ new Set();
    console.log("patches", patches);
    for (const patch of patches) {
      if (patch.op === "set") {
        this.kv.set(patch.key, { value: patch.value, mutation_id: patch.mutationId });
      } else if (patch.op === "del") {
        this.kv.delete(patch.key);
      }
      changedKeys.add(patch.key);
    }
    this.latestMutationId = result.lastMutationId;
    this.pendingMutations = this.pendingMutations.filter((m) => m.status !== "pushed");
    this.fireSubscriptions(changedKeys);
  }
  _isPendingMutationCompleted(mutation) {
    return mutation.resultingMutationId !== null && mutation.resultingMutationId <= this.latestMutationId;
  }
  async #get(key) {
    const pendingKv = this.pendingMutations.findLast((mutation) => mutation.kvUpdates.has(key));
    if (pendingKv) {
      return pendingKv.kvUpdates.get(key);
    }
    return this.kv.get(key)?.value;
  }
  async #has(key) {
    const value = await this.#get(key);
    return Boolean(value);
  }
  getMutationIdForKey(key) {
    if (!this.kv.has(key)) {
      return null;
    }
    const value = this.kv.get(key);
    return value?.mutation_id;
  }
  async #isEmpty() {
    return this.kv.size === 0 && this.pendingMutations.every((mutation) => mutation.kvUpdates.size === 0);
  }
  #getKeys() {
    const keySet = /* @__PURE__ */ new Set([...this.kv.keys(), ...this.pendingMutations.flatMap((mutation) => Array.from(mutation.kvUpdates.keys()))]);
    return keySet;
  }
  async #size() {
    return this.#getKeys().size;
  }
  // https://doc.replicache.dev/api/interfaces/ReadTransaction
  createReadTransaction() {
    const self = this;
    const accessedKeys = /* @__PURE__ */ new Set();
    const tx = {
      async get(key) {
        accessedKeys.add(key);
        return self.#get(key);
      },
      async has(key) {
        accessedKeys.add(key);
        return self.#has(key);
      },
      async isEmpty() {
        return self.#isEmpty();
      },
      async size() {
        return self.#size();
      },
      scan(options) {
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
      }
    };
    return tx;
  }
  createWriteTransaction() {
    const self = this;
    const writeOperations = [];
    const tx = {
      ...self.createReadTransaction(),
      async set(key, value) {
        writeOperations.push({ op: "set", key, value });
      },
      async put(key, value) {
        tx.set(key, value);
      },
      async delete(key) {
        writeOperations.push({ op: "set", key, value: null });
      },
      async del(key) {
        writeOperations.push({ op: "set", key, value: null });
      },
      _getOperations() {
        return [...writeOperations];
      }
    };
    return tx;
  }
  localMutationQueue = Promise.resolve();
  async #doMutation(mutatorName, params, localMutationId) {
    this.localMutationQueue = this.localMutationQueue.catch(() => {
    }).then(async () => {
      const tx = this.createWriteTransaction();
      const result = await this.options.mutators[mutatorName](tx, params);
      const kvUpdates = /* @__PURE__ */ new Map();
      for (const op of tx._getOperations()) {
        if (op.op === "set") {
          kvUpdates.set(op.key, op.value);
        }
        if (op.op === "del") {
          kvUpdates.delete(op.key);
        }
      }
      this.pendingMutations.push({ id: localMutationId, args: params, kvUpdates, name: mutatorName, operations: tx._getOperations(), status: "waiting" });
      this.fireSubscriptions(new Set(kvUpdates.keys()));
      setTimeout(() => {
        this.push();
      }, 100);
      return result;
    });
    return this.localMutationQueue;
  }
  get mutate() {
    return new Proxy({}, {
      get: (_target, mutatorName) => {
        if (typeof mutatorName !== "string") {
          throw new Error(`Mutator name must be a string`);
        }
        if (!this.options.mutators[mutatorName]) {
          throw new Error(`Mutator not found: ${mutatorName}`);
        }
        return (args) => {
          return this.#doMutation(mutatorName, args, Math.floor(Math.random() * 9999999));
        };
      }
    });
  }
  async #doPush() {
    console.log("starting push", this.pendingMutations);
    const mutations = this.pendingMutations.filter((m) => m.status !== "pushed");
    mutations.forEach((m) => m.status = "pending");
    if (mutations.length === 0) {
      return;
    }
    try {
      const start = Date.now();
      await pushToServer(this.options.spaceID, mutations);
      const timeInMs = Date.now() - start;
      console.log("pushed", mutations.length, "mutations in", timeInMs, "ms");
      mutations.forEach((m) => m.status = "pushed");
    } catch (e) {
      console.error("Error pushing mutations", e);
      this.pendingMutations = this.pendingMutations.filter((mutation) => !mutations.includes(mutation));
    }
  }
}
class ScanResult {
  resultKeysPromise;
  readKey;
  constructor(resultKeys, readKey) {
    this.readKey = readKey;
    this.resultKeysPromise = Promise.all(resultKeys.map(async (key) => {
      const value = await readKey(key);
      if (value === null) {
        return null;
      }
      return key;
    })).then((keys) => keys.filter((key) => key !== null));
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
        return Promise.all(results.map(async (item) => await self.readKey(item)));
      }
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
      }
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
        return Promise.all(resultKeys.map(async (key) => [key, await readKey(key)]));
      }
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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function throttle(func, ms, trailing = false) {
  let lastCall = 0;
  let timeoutId = null;
  let currentPromise = null;
  let isThrottled = false;
  return async () => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    if (timeSinceLastCall < ms) {
      isThrottled = true;
      if (trailing) {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          timeoutId = null;
          lastCall = Date.now();
          isThrottled = false;
          currentPromise = func();
          currentPromise.finally(() => {
            currentPromise = null;
          });
        }, ms - timeSinceLastCall);
      }
      return currentPromise;
    }
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
