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
        console.error("Failed to push to", spaceId, pushRequest, response.statusText);
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

// replicache-utils/debugLogger.ts
function debugLogger() {
  if (typeof window === "undefined") {
    return;
  }
  let logPanel = null;
  let logContent = null;
  let isExpanded = false;
  let autoScroll = true;
  let isPinned = false;
  const loadJsonFormatter = () => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/json-formatter-js@2.3.4/dist/json-formatter.umd.min.js";
    script.async = true;
    document.head.appendChild(script);
    return new Promise((resolve) => {
      script.onload = resolve;
    });
  };
  function createLogPanel() {
    if (logPanel) return;
    logPanel = document.createElement("div");
    logPanel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: 200px;
            height: 30px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            border-radius: 4px;
            overflow: hidden;
            transition: all 0.3s ease;
            z-index: 9999;
            font-family: monospace;
            font-size: 12px;
        `;
    const header = document.createElement("div");
    header.style.cssText = `
            padding: 5px;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        `;
    const title = document.createElement("span");
    title.textContent = "Debug Logs";
    header.appendChild(title);
    const pinButton = document.createElement("button");
    pinButton.textContent = "\u{1F4CC}";
    pinButton.style.cssText = `
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            padding: 2px 5px;
        `;
    pinButton.onclick = (e) => {
      e.stopPropagation();
      isPinned = !isPinned;
      pinButton.style.color = isPinned ? "#4CAF50" : "#fff";
      if (isPinned) {
        isExpanded = true;
        logPanel.style.width = "400px";
        logPanel.style.height = "75vh";
      } else {
        isExpanded = false;
        logPanel.style.width = "200px";
        logPanel.style.height = "30px";
      }
    };
    header.appendChild(pinButton);
    logContent = document.createElement("div");
    logContent.style.cssText = `
            padding: 5px;
            height: calc(75vh - 30px);
            overflow-y: auto;
            scroll-behavior: smooth;
        `;
    logPanel.appendChild(header);
    logPanel.appendChild(logContent);
    document.body.appendChild(logPanel);
    logPanel.addEventListener("mouseenter", () => {
      if (!isPinned) {
        isExpanded = true;
        logPanel.style.width = "400px";
        logPanel.style.height = "75vh";
      }
    });
    logPanel.addEventListener("mouseleave", () => {
      if (!isPinned) {
        isExpanded = false;
        logPanel.style.width = "200px";
        logPanel.style.height = "30px";
      }
    });
  }
  function getTypeColor(type) {
    switch (type) {
      case "info":
        return "#4CAF50";
      case "warn":
        return "#FFC107";
      case "error":
        return "#F44336";
      case "debug":
        return "#2196F3";
      default:
        return "#fff";
    }
  }
  function formatArgs(args) {
    const container = document.createElement("div");
    container.style.marginTop = "4px";
    args.forEach((arg) => {
      const argContainer = document.createElement("div");
      argContainer.style.marginLeft = "8px";
      if (typeof arg === "object" && arg !== null) {
        const formatter = new JSONFormatter(arg, 1, {
          hoverPreviewEnabled: true,
          hoverPreviewArrayCount: 100,
          hoverPreviewFieldCount: 5,
          theme: "dark",
          animateOpen: true,
          animateClose: true
        });
        argContainer.appendChild(formatter.render());
      } else {
        argContainer.textContent = String(arg);
      }
      container.appendChild(argContainer);
    });
    return container;
  }
  async function log(type, message, ...args) {
    if (!logPanel) {
      createLogPanel();
      await loadJsonFormatter();
    }
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.style.cssText = `
            margin-bottom: 4px;
            padding: 2px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;
    const typeSpan = document.createElement("span");
    typeSpan.textContent = `[${type.toUpperCase()}]`;
    typeSpan.style.color = getTypeColor(type);
    typeSpan.style.marginRight = "4px";
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `[${timestamp}]`;
    timeSpan.style.color = "#888";
    timeSpan.style.marginRight = "4px";
    const messageSpan = document.createElement("span");
    messageSpan.textContent = message;
    logEntry.appendChild(typeSpan);
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    if (args.length > 0) {
      logEntry.appendChild(formatArgs(args));
    }
    logContent.appendChild(logEntry);
    if (autoScroll) {
      logContent.scrollTop = logContent.scrollHeight;
    }
  }
  return {
    info: (message, ...args) => log("info", message, ...args),
    warn: (message, ...args) => log("warn", message, ...args),
    error: (message, ...args) => log("error", message, ...args),
    debug: (message, ...args) => log("debug", message, ...args)
  };
}
var logger = debugLogger();

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
      logger?.warn(`/poke - out of order poke... triggering pull - poke contained mutations${pokeResult.mutationIds.join(", ")} - Current client mutation id: ${this.latestMutationId} -- poke contained ${pokeResult.patches.length} patches`);
      console.log(
        `pulling from server because the mutation id of the poke: ${minMutationId} is to far beyond the latest client mutation id: ${this.latestMutationId}`
      );
      return { shouldPull: true, localMutationIds: pokeResult.localMutationIds };
    }
    logger?.info(`/poke - in order poke... applying ${pokeResult.patches.length} patches - poke contained mutations${pokeResult.mutationIds.join(", ")} - Current client mutation id: ${this.latestMutationId}`);
    console.log(`applying ${pokeResult.patches.length} patches`);
    this.removeCompletedLocalMutations(pokeResult.localMutationIds);
    const changedKeys = this.#applyPatches(pokeResult.patches);
    this.latestMutationId = maxMutationId;
    this.#subscriptionManager.notifySubscribers(changedKeys);
    return { shouldPull: false, localMutationIds: pokeResult.localMutationIds };
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
  #_debugLocalMutationIdToStartTime = /* @__PURE__ */ new Map();
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
        const { shouldPull, localMutationIds } = this.#core.processPokeResult(poke);
        if (shouldPull) {
          this.#enqueuePull();
        }
        localMutationIds.forEach((id) => {
          const startTime = this.#_debugLocalMutationIdToStartTime.get(id);
          if (!startTime) {
            return;
          }
          const endTime = Date.now();
          const duration = endTime - startTime;
          logger?.info(`/TIME ${duration}ms - local mutation ${id} took ${duration}ms to run locally and then receive server result. Result had ${poke.patches.length} patches`);
        });
      },
      pullDelay: options.pullDelay ?? 100,
      pushDelay: options.pushDelay ?? 100
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
    let pullStart = Date.now();
    try {
      const result = await this.#networkClient.pull({
        spaceId: this.#spaceId,
        afterMutationId: this.#core.latestMutationId
      });
      let pullEnd = Date.now();
      logger?.info(`/pull - success (${pullEnd - pullStart}ms) - Pulled ${result.patches.length} patches. Updated keys: ${result.patches.map((p) => p.key).join(", ")}`);
      this.#core.processPullResult(result, this.#core.store.pendingMutations.filter((m) => m.status !== "waiting").map((m) => m.mutation.id));
    } catch (e) {
      let pullEnd = Date.now();
      logger?.error(`/pull - failed (${pullEnd - pullStart}ms) - Error: ${e}`);
    }
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
            this.#_debugLocalMutationIdToStartTime.set(localMutationId, Date.now());
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
    let pushStart = Date.now();
    try {
      await this.#networkClient.push({
        mutations: notYetPushed.map((m) => m.mutation)
      });
      notYetPushed.forEach((m) => m.status = "pushed");
      let pushEnd = Date.now();
      logger?.info(`/push - success (${pushEnd - pushStart}ms) - Pushed mutations: ${notYetPushed.map((m) => m.mutation.id).join(", ")} mutations. Updated keys: ${notYetPushed.map((m) => m.kvUpdates.keys()).flat().join(", ")}`);
    } catch (e) {
      console.error("Error pushing mutations", e);
      let pushEnd = Date.now();
      logger?.error(`/push - failed (${pushEnd - pushStart}ms) - Rolling back ${notYetPushed.length} mutations. Updated keys: ${notYetPushed.map((m) => m.kvUpdates.keys()).flat().join(", ")}. Error: ${e}`);
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
