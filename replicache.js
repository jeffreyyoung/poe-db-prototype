// replicache-utils/throttlePromise.ts
function throttle(func, ms, trailing = false) {
  let lastCall = 0;
  let timeoutId = null;
  let currentPromise = null;
  let isThrottled = false;
  return Object.assign(async function() {
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
  }, {
    getCurrentPromise: () => currentPromise
  });
}

// replicache-utils/isTest.ts
function isTest() {
  return typeof Deno !== "undefined";
}

// replicache-utils/NetworkClientValTown.ts
import Ably from "https://esm.sh/ably";
var ably = null;
function getAbly() {
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
var createValTownNetworkClient = ({
  spaceId,
  onPoke
}) => {
  const baseURL = "https://jeffreyyoung-replicache_backend_fork1.web.val.run";
  if (!isTest()) {
    const ably2 = getAbly();
    const channel = ably2.channels.get(spaceId);
    channel.subscribe("poke", (message) => {
      onPoke(message.data);
    });
  }
  return {
    pull: async ({ spaceId: spaceId2, afterMutationId }) => {
      const pullStart = Date.now();
      const response = await fetch(
        `${baseURL}/pull/${spaceId2}?afterMutationId=${afterMutationId}`
      );
      const pullEnd = Date.now();
      if (!response.ok) {
        throw new Error(
          `Failed to pull from ${spaceId2}: ${response.statusText}`
        );
      }
      const data = await response.json();
      console.log(
        "pulled",
        data.patches.length,
        "patches in",
        pullEnd - pullStart,
        "ms",
        isTest() ? null : data
      );
      return data;
    },
    push: async (args) => {
      const mutations = args.mutations;
      const pushRequest = {
        mutations: mutations.map((m) => ({
          ...m,
          operations: []
        })),
        operations: collapseMutations(mutations).operations
      };
      const pushStart = Date.now();
      const response = await fetch(`${baseURL}/push/${spaceId}`, {
        method: "POST",
        body: JSON.stringify(pushRequest)
      });
      const pushEnd = Date.now();
      const timeInMs = pushEnd - pushStart;
      if (!response.ok) {
        throw new Error(`Failed to push to ${spaceId}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("pushed", mutations.length, "mutations in", timeInMs, "ms", ...isTest() ? [] : ["request", pushRequest, "response", data]);
      return data;
    }
  };
};
function collapseMutations(mutations) {
  const kvUpdates = /* @__PURE__ */ new Map();
  for (const m of mutations) {
    for (const operation of m.operations) {
      kvUpdates.set(operation.key, operation);
    }
  }
  const mutation = {
    id: Math.floor(Math.random() * 9999999),
    name: mutations.at(0)?.name ?? "stuf",
    args: mutations.at(0)?.args ?? { hi: "bye" },
    operations: Array.from(kvUpdates.values())
  };
  return mutation;
}

// replicache-utils/Store.ts
function createStoreSnapshot(store) {
  return {
    kv: new Map(store.kv),
    pendingMutations: store.pendingMutations.map((mutation) => ({
      ...mutation,
      kvUpdates: new Map(mutation.kvUpdates)
    }))
  };
}
function get(store, key) {
  for (let i = 0; i < store.pendingMutations.length; i++) {
    const mutation = store.pendingMutations.at(store.pendingMutations.length - 1 - i);
    if (mutation && mutation.kvUpdates.has(key)) {
      return mutation.kvUpdates.get(key);
    }
  }
  return store.kv.get(key)?.value;
}
function has(store, key) {
  const value = get(store, key);
  return value !== void 0 && value !== null;
}
function keys(store) {
  const keySet = /* @__PURE__ */ new Set();
  for (const key of store.kv.keys()) {
    keySet.add(key);
  }
  for (const mutation of store.pendingMutations) {
    mutation.kvUpdates.forEach((_, key) => keySet.add(key));
  }
  for (const key of keySet) {
    if (!has(store, key)) {
      keySet.delete(key);
    }
  }
  return keySet;
}

// replicache-utils/createReadTransaction.ts
function scanArgToObject(arg) {
  if (typeof arg === "string") {
    return { prefix: arg };
  }
  return arg;
}
function createReadTransaction(store, clientID) {
  const _readKeys = /* @__PURE__ */ new Set();
  const _scannedKeys = /* @__PURE__ */ new Set();
  const readValue = (key) => {
    _readKeys.add(key);
    return get(store, key);
  };
  const tx = {
    clientID,
    _readKeys,
    _scannedKeys,
    get(key) {
      return Promise.resolve(readValue(key));
    },
    has(key) {
      _readKeys.add(key);
      return Promise.resolve(has(store, key));
    },
    isEmpty() {
      const keySet = keys(store);
      return Promise.resolve(keySet.size === 0);
    },
    scan(arg) {
      const { start, prefix, limit } = scanArgToObject(arg);
      const keySet = keys(store);
      let keys2 = Array.from(keySet).sort();
      if (prefix) {
        keys2 = keys2.filter((key) => key.startsWith(prefix));
      }
      if (start) {
        keys2 = handleStart(keys2, start);
      }
      if (limit) {
        keys2 = keys2.slice(0, limit);
      }
      const getNthKey = (index) => {
        _scannedKeys.add(keys2[index]);
        return keys2[index];
      };
      async function getEntry(key) {
        return [key, await readValue(key)];
      }
      return {
        keys: () => withToArray(keyAsyncIterable(getNthKey, keys2.length)),
        values: () => withToArray(mapAsyncIterator(keyAsyncIterable(getNthKey, keys2.length), readValue)),
        entries: () => withToArray(mapAsyncIterator(keyAsyncIterable(getNthKey, keys2.length), getEntry)),
        [Symbol.asyncIterator]() {
          return mapAsyncIterator(keyAsyncIterable(getNthKey, keys2.length), readValue);
        }
      };
    }
  };
  return tx;
}
function handleStart(keys2, start) {
  if (!start) {
    return keys2;
  }
  let startIndex = keys2.indexOf(start.key);
  if (startIndex === -1) {
    return keys2;
  }
  if (start.exclusive) {
    return keys2.slice(startIndex + 1);
  }
  return keys2.slice(startIndex);
}
function keyAsyncIterable(getNthKey, totalKeys) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: async () => {
          if (index < totalKeys) {
            const key = getNthKey(index);
            index++;
            return { value: key, done: false };
          }
          return { value: void 0, done: true };
        }
      };
    }
  };
}
function withToArray(asyncIterable) {
  asyncIterable.toArray = async () => {
    const results = [];
    for await (const result of asyncIterable) {
      results.push(result);
    }
    return results;
  };
  return asyncIterable;
}
async function* mapAsyncIterator(asyncIterator, mapFn) {
  for await (const value of asyncIterator) {
    yield mapFn(value);
  }
}

// replicache-utils/createWriteTransaction.ts
function createWriteTransaction(store, clientID) {
  const tx = createReadTransaction(store, clientID);
  const writeOperations = [];
  return {
    ...tx,
    set(key, value) {
      writeOperations.push({ op: "set", key, value });
      return Promise.resolve();
    },
    put(key, value) {
      writeOperations.push({ op: "set", key, value });
      return Promise.resolve();
    },
    delete(key) {
      writeOperations.push({ op: "set", key, value: null });
      return Promise.resolve();
    },
    del(key) {
      writeOperations.push({ op: "set", key, value: null });
      return Promise.resolve();
    },
    _writeOperations: writeOperations
  };
}

// replicache-utils/observePrefix.ts
function observePrefix(rep, scanArg, onChange) {
  let lastEntries = [];
  return rep.subscribe(async (tx) => {
    const entries = await tx.scan(scanArg).entries().toArray();
    return entries;
  }, (entries) => {
    const oldMap = new Map(lastEntries);
    const newMap = new Map(entries);
    const added = entries.filter(([key]) => !oldMap.has(key));
    const removed = lastEntries.filter(([key]) => !newMap.has(key));
    const changed = entries.filter(([key, value]) => oldMap.has(key) && oldMap.get(key) !== value);
    lastEntries = entries;
    onChange(entries, { added, removed, changed });
  });
}

// replicache-utils/SubscriptionManager.ts
function createSubscriptionManager(store, clientID) {
  const subscriptions = /* @__PURE__ */ new Map();
  async function _runQuery(queryFn) {
    const tx = createReadTransaction(store, clientID);
    const result = await queryFn(tx);
    return { result, tx };
  }
  async function maybeNotify(queryFn, changedKeys) {
    const lastRun = subscriptions.get(queryFn);
    if (!lastRun) {
      return;
    }
    const { result, tx } = await _runQuery(queryFn);
    subscriptions.set(queryFn, {
      onResultChanged: lastRun.onResultChanged,
      lastReadTransaction: tx,
      lastResult: result
    });
    if (lastRun.lastResult === result) {
      return;
    }
    for (const key of changedKeys) {
      if (tx._readKeys.has(key)) {
        lastRun.onResultChanged(result);
        return;
      }
    }
    if (!areSetsEqual(lastRun.lastReadTransaction._scannedKeys, tx._scannedKeys)) {
      lastRun.onResultChanged(result);
      return;
    }
    return;
  }
  return {
    subscribe(queryFn, onChanged) {
      _runQuery(queryFn).then(({ result, tx }) => {
        subscriptions.set(queryFn, {
          onResultChanged: onChanged,
          lastReadTransaction: tx,
          lastResult: result
        });
        onChanged(result);
      });
      return () => {
        subscriptions.delete(queryFn);
      };
    },
    notifySubscribers(changedKeys) {
      for (const cb of subscriptions.keys()) {
        maybeNotify(cb, changedKeys);
      }
    }
  };
}
function areSetsEqual(setA, setB) {
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

// replicache-utils/createReplicacheCore.ts
var ReplicacheCore = class {
  store = {
    kv: /* @__PURE__ */ new Map(),
    pendingMutations: []
  };
  latestMutationId = 0;
  #clientId = "client" + Date.now() + Math.random().toString(36).substring(2, 15);
  /**
   * each time we run a subscription, we keep track of the keys that were accessed
   */
  #subscriptionManager = createSubscriptionManager(this.store, this.#clientId);
  options;
  constructor(options) {
    this.options = options;
  }
  getSerializedFunctionString(mutatorName) {
    const mutator = this.options.mutators[mutatorName];
    if (!mutator) {
      throw new Error(`Mutator ${mutatorName} not found`);
    }
    const str = mutator.toString();
    const funcStr = `{ invoke: ${str} }`;
    console.log("funcStr!!!", funcStr);
    return funcStr;
  }
  processPokeResult(pokeResult) {
    console.log("received a poke", pokeResult.mutationIds, pokeResult);
    const maxMutationId = Math.max(...pokeResult.mutationIds);
    const minMutationId = Math.min(...pokeResult.mutationIds);
    if (minMutationId !== this.latestMutationId + 1) {
      console.log(
        `pulling from server because the mutation id of the poke: ${minMutationId} is to far beyond the latest client mutation id: ${this.latestMutationId}`
      );
      return { shouldPull: true };
    }
    console.log(`applying ${pokeResult.patches.length} patches`);
    this.removeCompletedLocalMutations(pokeResult.localMutationIds);
    const changedKeys = this.#applyPatches(pokeResult.patches);
    this.latestMutationId = maxMutationId;
    this.#subscriptionManager.notifySubscribers(changedKeys);
    return { shouldPull: false };
  }
  removeCompletedLocalMutations(completedLocalMutationIds) {
    const completedSet = new Set(completedLocalMutationIds);
    this.store.pendingMutations = this.store.pendingMutations.filter(
      (m) => !completedSet.has(m.mutation.id)
    );
  }
  processPullResult(pullResponse, completedLocalMutationIds) {
    const patches = pullResponse.patches;
    const changedKeys = this.#applyPatches(patches);
    this.latestMutationId = pullResponse.lastMutationId;
    this.removeCompletedLocalMutations(completedLocalMutationIds);
    this.#subscriptionManager.notifySubscribers(changedKeys);
  }
  getClientId() {
    return Promise.resolve(this.#clientId);
  }
  getClientIdSync() {
    return this.#clientId;
  }
  async mutate(mutatorName, args, localMutationId) {
    const snapshot = createStoreSnapshot(this.store);
    const tx = createWriteTransaction(snapshot, this.#clientId);
    const result = await this.options.mutators[mutatorName](tx, args);
    const kvUpdates = /* @__PURE__ */ new Map();
    for (const op of tx._writeOperations) {
      if (op.op === "set") {
        kvUpdates.set(op.key, op.value);
      }
      if (op.op === "del") {
        kvUpdates.delete(op.key);
      }
    }
    this.store.pendingMutations.push({
      mutation: {
        id: localMutationId,
        args,
        operations: tx._writeOperations,
        name: mutatorName
      },
      kvUpdates,
      status: "waiting"
    });
    this.#subscriptionManager.notifySubscribers(new Set(kvUpdates.keys()));
    return result;
  }
  async query(cb) {
    const tx = createReadTransaction(this.store, this.#clientId);
    const result = await cb(tx);
    return result;
  }
  subscribe(queryCb, onQueryCbChanged) {
    if (typeof queryCb !== "function") {
      throw new Error("The first argument of rep.subscribe must be a function");
    }
    if (typeof onQueryCbChanged !== "function") {
      throw new Error(
        "The second argument of rep.subscribe must be a function"
      );
    }
    return this.#subscriptionManager.subscribe(queryCb, onQueryCbChanged);
  }
  observeEntries(scanArg, onChange) {
    return observePrefix(this, scanArg, onChange);
  }
  #applyPatches(patches) {
    const changedKeys = /* @__PURE__ */ new Set();
    for (const patch of patches) {
      if (patch.op === "set") {
        this.store.kv.set(patch.key, {
          value: patch.value,
          mutation_id: patch.mutationId
        });
      } else if (patch.op === "del") {
        this.store.kv.delete(patch.key);
      }
      changedKeys.add(patch.key);
    }
    return changedKeys;
  }
};
var createReplicacheCore_default = ReplicacheCore;

// replicache-utils/hash.ts
function simpleHash(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
function hashMutators(mutators) {
  return "mutators" + simpleHash(Object.entries(mutators).map(([key, value]) => key + value.toString()).join("_"));
}

// replicache.ts
var Replicache = class {
  #core;
  #enqueuePull;
  #enqueuePush;
  #networkClient;
  #spaceId;
  options;
  constructor(options) {
    this.options = options;
    this.#core = new createReplicacheCore_default(this.options);
    this.#enqueuePull = throttle(
      this.#doPull.bind(this),
      options.pullDelay ?? 50,
      true
    );
    this.#enqueuePush = throttle(
      this.#doPush.bind(this),
      options.pushDelay ?? 50,
      true
    );
    this.#startPolling();
    const createNetworkClient = this.options.networkClientFactory ?? createValTownNetworkClient;
    this.#spaceId = this.options.spaceID || "";
    if (!this.#spaceId) {
      this.#spaceId = "space" + hashMutators(this.options.mutators);
    }
    this.#networkClient = createNetworkClient({
      spaceId: this.#spaceId,
      onPoke: (poke) => {
        const { shouldPull } = this.#core.processPokeResult(poke);
        if (shouldPull) {
          this.#enqueuePull();
        }
      },
      pullDelay: options.pullDelay ?? 20,
      pushDelay: options.pushDelay ?? 20
    });
    if (typeof window !== "undefined") {
      this.#addToWindow();
    }
  }
  async pull() {
    await this.#enqueuePush.getCurrentPromise()?.catch(() => {
    });
    return await this.#enqueuePull();
  }
  debug() {
    return {
      lastMutationId: this.#core.latestMutationId
    };
  }
  push() {
    return this.#enqueuePush();
  }
  #addToWindow() {
    window.rep = this;
  }
  getClientId() {
    return this.#core.getClientId();
  }
  get clientID() {
    return this.#core.getClientIdSync();
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
  query(cb) {
    return this.#core.query(cb);
  }
  subscribe(queryCb, onQueryCbChanged) {
    if (typeof queryCb !== "function") {
      throw new Error("The first argument of rep.subscribe must be a function");
    }
    if (typeof onQueryCbChanged !== "function") {
      throw new Error(
        "The second argument of rep.subscribe must be a function"
      );
    }
    return this.#core.subscribe(queryCb, onQueryCbChanged);
  }
  async #doPull() {
    const result = await this.#networkClient.pull({
      spaceId: this.#spaceId,
      afterMutationId: this.#core.latestMutationId
    });
    this.#core.processPullResult(result, this.#core.store.pendingMutations.filter((m) => m.status !== "waiting").map((m) => m.mutation.id));
  }
  subscribeToScanEntries(scanArg, onChange) {
    return this.#core.observeEntries(scanArg, onChange);
  }
  observeEntries(prefix, onChange) {
    return this.#core.observeEntries({ prefix }, onChange);
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
          return async (args) => {
            const localMutationId = Math.floor(Math.random() * 9999999);
            await this.#core.mutate(mutatorName, args, localMutationId);
            this.push();
          };
        }
      }
    );
  }
  async #doPush() {
    console.log("starting push", this.#core.store.pendingMutations.length);
    const notYetPushed = this.#core.store.pendingMutations.filter(
      (m) => m.status === "waiting"
    );
    if (notYetPushed.length === 0) {
      return;
    }
    notYetPushed.forEach((m) => m.status = "pending");
    try {
      await this.#networkClient.push({
        mutations: notYetPushed.map((m) => m.mutation)
      });
      notYetPushed.forEach((m) => m.status = "pushed");
    } catch (e) {
      console.error("Error pushing mutations", e);
      this.#core.store.pendingMutations = this.#core.store.pendingMutations.filter(
        (m) => !notYetPushed.includes(m)
      );
    }
  }
  onChange(cb) {
    return this.subscribeToScanEntries({ prefix: "" }, (result, changes) => {
      cb({
        state: new Map(result),
        changes,
        clientId: this.#core.getClientIdSync()
      });
    });
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  Replicache
};
