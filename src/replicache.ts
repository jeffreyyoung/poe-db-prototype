/**
 * Replicache: A Replicache-compatible client with custom internals
 */
import type {
  Mutation,
  PullResponse,
  PushResponse,
  Operation,
} from "./server_types.ts";
const defaultBaseUrl = "https://jeffreyyoung-replicachebackendv2.web.val.run";
// @ts-ignore
import Ably from "https://esm.sh/ably";

const ably = new Ably.Realtime(
  "frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM"
);

ably.connection.once("connected", () => {
  console.log("Connected to Ably!");
});

export async function pullFromServer(
  baseUrl: string,
  spaceName: string,
  afterMutationId: number
): Promise<PullResponse> {
  console.log("pulling from server", spaceName, afterMutationId);
  const response = await fetch(
    `${baseUrl}/pull/${spaceName}?afterMutationId=${afterMutationId}`
  );
  if (!response.ok) {
    throw new Error(`Failed to pull from ${spaceName}: ${response.statusText}`);
  }
  const data = await response.json();
  console.log("pulled", data);
  return data;
}

function combineMutations(mutations: Mutation[]): Mutation {
  const kvUpdates = new Map<string, Mutation["operations"][number]>();
  for (const mutation of mutations) {
    for (const operation of mutation.operations) {
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
  baseUrl: string,
  spaceName: string,
  mutations: Mutation[]
): Promise<PushResponse> {
  const response = await fetch(`${baseUrl}/push/${spaceName}`, {
    method: "POST",
    body: JSON.stringify({ mutations: [combineMutations(mutations)] }),
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
    pushThrottleMs: number;
    baseUrl: string;
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
    if (!this.options.pushThrottleMs) {
      this.options.pushThrottleMs = 500;
    }
    this.#startPolling();
    this.#listenForPokes();
  }

  #listenForPokes() {
    const channel = ably.channels.get(this.options.spaceID);
    channel.subscribe("poke", (message) => {
      console.log("poke", message);
      this.pull();
    });
  }

  async #startPolling() {
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
    console.log("subscribe", queryCb, onQueryCbChanged);
    if (typeof queryCb !== "function") {
      throw new Error("queryCb must be a function");
    }
    if (typeof onQueryCbChanged !== "function") {
      throw new Error("onQueryCbChanged must be a function");
    }
    console.log("added a subscription");
    this.#subscriptions.set(queryCb, {
      keysReadOnLastExecution: new Set(),
      onQueryCbChanged,
    });
    await this.#runAndUpdateSubscription(queryCb, new Set());
    return () => {
      console.log("removed a subscription");
      this.#subscriptions.delete(queryCb);
    };
  }

  #shouldNotifySubscription(
    observedKeys: Set<string>,
    changedKeys: Set<string>
  ) {
    if (observedKeys.size === 0) {
      return true;
    }

    for (const key of observedKeys) {
      if (!changedKeys.has(key)) {
        return true;
      }
    }
    for (const key of changedKeys) {
      if (!observedKeys.has(key)) {
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
          info.keysReadOnLastExecution,
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

  async pull() {
    this.pullQueue = this.pullQueue
      .catch((e) => {
        console.error("Error pulling", e);
      })
      .then(async () => {
        const result = await pullFromServer(
          this.options.baseUrl || defaultBaseUrl,
          this.options.spaceID,
          this.latestMutationId
        );
        console.log("pulled", result), this.latestMutationId;
        const patches = result.patches;
        const changedKeys = new Set<string>();
        console.log("patches", patches);
        for (const patch of patches) {
          if (patch.op === "set") {
            console.log("adding patch", patch);
            this.kv.set(patch.key, {
              value: patch.value,
              mutation_id: patch.mutationId,
            });
          } else if (patch.op === "del") {
            this.kv.delete(patch.key);
          }
          changedKeys.add(patch.key);
        }
        this.latestMutationId = result.lastMutationId;
        this.pendingMutations = this.pendingMutations.filter(
          (m) => m.status !== "pushed"
        );
        this.fireSubscriptions(changedKeys);
      })
      .catch((e) => {
        console.error("Error pulling", e);
      });
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
    const pendingKv = this.pendingMutations.find((mutation) =>
      mutation.kvUpdates.has(key)
    );
    if (pendingKv) {
      return pendingKv.kvUpdates.get(key);
    }
    return this.kv.get(key)?.value;
  }

  async #has(key: string) {
    const value = await this.#get(key);
    console.log("has", key, value);
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
        return new ScanResult(resultKeys, (key) => tx.get(key), (key) => self.#has(key));
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

  #doMutation(mutatorName: string, params: any, localMutationId: number) {
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
          this.#push();
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

  #pushQueue = Promise.resolve();

  async #push() {
    this.#pushQueue = this.#pushQueue
      .catch((e) => {
        console.error("Error pushing mutations", e);
      })
      .then(async () => {
        const mutations = this.pendingMutations.filter(
          (m) => m.status !== "pushed"
        );
        mutations.forEach((m) => (m.status = "pending"));
        if (mutations.length === 0) {
          return;
        }
        try {
          await pushToServer(this.options.baseUrl || defaultBaseUrl, this.options.spaceID, mutations);
          mutations.forEach((m) => (m.status = "pushed"));
        } catch (e) {
          console.error("Error pushing mutations", e);
          // roll back the mutations since this errored...
          // in real world we would retry
          this.pendingMutations = this.pendingMutations.filter(
            (mutation) => !mutations.includes(mutation)
          );
        }
      })
      .catch((e) => {
        // todo: retry
        console.error("Error pushing mutations", e);
      });
  }
}

class ScanResult {
  resultKeysPromise: Promise<string[]>;
  readKey: (key: string) => Promise<any>;
  peak: (key: string) => Promise<boolean>;
  constructor(resultKeys: string[], readKey: (key: string) => Promise<any>, peak: (key: string) => Promise<boolean>) {
    this.readKey = readKey;
    this.peak = peak;
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
    const self = this;
    let index = 0;
    const keysPromise = this.resultKeysPromise;

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

export default Replicache;
