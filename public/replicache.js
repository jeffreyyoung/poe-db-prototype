var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _subscriptions, _Replicache_instances, listenForPokes_fn, startPolling_fn, shouldNotifySubscription_fn, runAndUpdateSubscription_fn, get_fn, has_fn, isEmpty_fn, getKeys_fn, size_fn, doMutation_fn, _pushQueue, push_fn;
console.log("huh???");
const baseURL = "https://jeffreyyoung-replicachebackendv2.web.val.run";
import Ably from "https://esm.sh/ably";
const ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");
ably.connection.once("connected", () => {
  console.log("Connected to Ably!");
});
async function pullFromServer(spaceName, afterMutationId) {
  console.log("pulling from server", spaceName, afterMutationId);
  const response = await fetch(`${baseURL}/pull/${spaceName}?afterMutationId=${afterMutationId}`);
  if (!response.ok) {
    throw new Error(`Failed to pull from ${spaceName}: ${response.statusText}`);
  }
  const data = await response.json();
  console.log("pulled", data);
  return data;
}
async function pushToServer(spaceName, mutations) {
  // collapse mutations into a single mutation
  const response = await fetch(`${baseURL}/push/${spaceName}`, {
    method: "POST",
    body: JSON.stringify({ mutations })
  });
  if (!response.ok) {
    throw new Error(`Failed to push to ${spaceName}: ${response.statusText}`);
  }
  const data = await response.json();
  return data;
}
class Replicache {
  constructor(options) {
    __privateAdd(this, _Replicache_instances);
    /**
     * local cache of key-values on server.
     */
    __publicField(this, "kv", /* @__PURE__ */ new Map());
    /**
     * { local_mutation_id: number, params: any, kvUpdates: Map<string, any> }[]
     */
    __publicField(this, "pendingMutations", []);
    __publicField(this, "latestMutationId", 0);
    /**
     * each time we run a subscription, we keep track of the keys that were accessed
     */
    __privateAdd(this, _subscriptions, /* @__PURE__ */ new Map());
    __publicField(this, "options");
    __publicField(this, "pullQueue", Promise.resolve());
    __publicField(this, "localMutationQueue", Promise.resolve());
    __privateAdd(this, _pushQueue, Promise.resolve());
    this.options = options;
    __privateMethod(this, _Replicache_instances, startPolling_fn).call(this);
    __privateMethod(this, _Replicache_instances, listenForPokes_fn).call(this);
  }
  async query(cb) {
    const tx = this.createReadTransaction();
    const result = await cb(tx);
    return result;
  }
  async subscribe(queryCb, onQueryCbChanged) {
    console.log("subscribe", queryCb, onQueryCbChanged);
    if (typeof queryCb !== "function") {
      throw new Error("queryCb must be a function");
    }
    if (typeof onQueryCbChanged !== "function") {
      throw new Error("onQueryCbChanged must be a function");
    }
    console.log("added a subscription");
    __privateGet(this, _subscriptions).set(queryCb, { keysReadOnLastExecution: /* @__PURE__ */ new Set(), onQueryCbChanged });
    await __privateMethod(this, _Replicache_instances, runAndUpdateSubscription_fn).call(this, queryCb, /* @__PURE__ */ new Set());
    return () => {
      console.log("removed a subscription");
      __privateGet(this, _subscriptions).delete(queryCb);
    };
  }
  fireSubscriptions(changedKeys) {
    for (const cb of __privateGet(this, _subscriptions).keys()) {
      const observedKeys = Array.from(__privateGet(this, _subscriptions).get(cb)?.keysReadOnLastExecution || []);
      if (!observedKeys) {
        return;
      }
      __privateMethod(this, _Replicache_instances, runAndUpdateSubscription_fn).call(this, cb, changedKeys);
    }
  }
  async pull() {
    this.pullQueue = this.pullQueue.catch((e) => {
      console.error("Error pulling", e);
    }).then(async () => {
      const result = await pullFromServer(this.options.spaceID, this.latestMutationId);
      console.log("pulled", result), this.latestMutationId;
      const patches = result.patches;
      const changedKeys = /* @__PURE__ */ new Set();
      console.log("patches", patches);
      for (const patch of patches) {
        if (patch.op === "set") {
          console.log("adding patch", patch);
          this.kv.set(patch.key, { value: patch.value, mutation_id: patch.mutationId });
        } else if (patch.op === "del") {
          this.kv.delete(patch.key);
        }
        changedKeys.add(patch.key);
      }
      this.latestMutationId = result.lastMutationId;
      this.pendingMutations = this.pendingMutations.filter((m) => m.status !== "pushed");
      this.fireSubscriptions(changedKeys);
    }).catch((e) => {
      console.error("Error pulling", e);
    });
  }
  _isPendingMutationCompleted(mutation) {
    return mutation.resultingMutationId !== null && mutation.resultingMutationId <= this.latestMutationId;
  }
  getMutationIdForKey(key) {
    if (!this.kv.has(key)) {
      return null;
    }
    const value = this.kv.get(key);
    return value?.mutation_id;
  }
  // https://doc.replicache.dev/api/interfaces/ReadTransaction
  createReadTransaction() {
    const self = this;
    const accessedKeys = /* @__PURE__ */ new Set();
    const tx = {
      async get(key) {
        var _a;
        accessedKeys.add(key);
        return __privateMethod(_a = self, _Replicache_instances, get_fn).call(_a, key);
      },
      async has(key) {
        var _a;
        accessedKeys.add(key);
        return __privateMethod(_a = self, _Replicache_instances, has_fn).call(_a, key);
      },
      async isEmpty() {
        var _a;
        return __privateMethod(_a = self, _Replicache_instances, isEmpty_fn).call(_a);
      },
      async size() {
        var _a;
        return __privateMethod(_a = self, _Replicache_instances, size_fn).call(_a);
      },
      scan(options) {
        var _a;
        const keySet = __privateMethod(_a = self, _Replicache_instances, getKeys_fn).call(_a);
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
  get mutate() {
    return new Proxy({}, {
      get: (target, mutatorName) => {
        if (typeof mutatorName !== "string") {
          throw new Error(`Mutator name must be a string`);
        }
        if (!this.options.mutators[mutatorName]) {
          throw new Error(`Mutator not found: ${mutatorName}`);
        }
        return (args) => {
          return __privateMethod(this, _Replicache_instances, doMutation_fn).call(this, mutatorName, args, Math.floor(Math.random() * 9999999));
        };
      }
    });
  }
}
_subscriptions = new WeakMap();
_Replicache_instances = new WeakSet();
listenForPokes_fn = function() {
  const channel = ably.channels.get(this.options.spaceID);
  channel.subscribe("poke", (message) => {
    console.log("poke", message);
    this.pull();
  });
};
startPolling_fn = async function() {
  while (true) {
    await this.pull().catch((e) => {
      console.error("Error polling", e);
    });
    await sleep(2e4);
  }
};
shouldNotifySubscription_fn = function(observedKeys, changedKeys) {
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
};
runAndUpdateSubscription_fn = async function(cb, changedKeys) {
  const tx = this.createReadTransaction();
  const info = __privateGet(this, _subscriptions).get(cb);
  if (!info) {
    throw new Error("Subscription not found");
  }
  try {
    const result = await cb(tx);
    if (__privateMethod(this, _Replicache_instances, shouldNotifySubscription_fn).call(this, info.keysReadOnLastExecution, changedKeys)) {
      info.onQueryCbChanged(result);
    }
  } catch (e) {
    console.error("Error querying", e);
  }
  info.keysReadOnLastExecution = new Set(tx._getReadKeys());
};
get_fn = async function(key) {
  const pendingKv = this.pendingMutations.find((mutation) => mutation.kvUpdates.has(key));
  if (pendingKv) {
    return pendingKv.kvUpdates.get(key);
  }
  return this.kv.get(key)?.value;
};
has_fn = async function(key) {
  const value = await __privateMethod(this, _Replicache_instances, get_fn).call(this, key);
  console.log("has", key, value);
  return Boolean(value);
};
isEmpty_fn = async function() {
  return this.kv.size === 0 && this.pendingMutations.every((mutation) => mutation.kvUpdates.size === 0);
};
getKeys_fn = function() {
  const keySet = /* @__PURE__ */ new Set([...this.kv.keys(), ...this.pendingMutations.flatMap((mutation) => Array.from(mutation.kvUpdates.keys()))]);
  return keySet;
};
size_fn = async function() {
  return __privateMethod(this, _Replicache_instances, getKeys_fn).call(this).size;
};
doMutation_fn = async function(mutatorName, params, localMutationId) {
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
      __privateMethod(this, _Replicache_instances, push_fn).call(this);
    }, 100);
    return result;
  });
  return this.localMutationQueue;
};
_pushQueue = new WeakMap();
push_fn = async function() {
  __privateSet(this, _pushQueue, __privateGet(this, _pushQueue).catch((e) => {
    console.error("Error pushing mutations", e);
  }).then(async () => {
    const mutations = this.pendingMutations.filter((m) => m.status !== "pushed");
    mutations.forEach((m) => m.status = "pending");
    if (mutations.length === 0) {
      return;
    }
    try {
      const response = await pushToServer(this.options.spaceID, mutations);
      mutations.forEach((m) => m.status = "pushed");
    } catch (e) {
      console.error("Error pushing mutations", e);
      this.pendingMutations = this.pendingMutations.filter((mutation) => !mutations.includes(mutation));
    }
  }).catch((e) => {
    console.error("Error pushing mutations", e);
  }));
};
class ScanResult {
  constructor(resultKeys, readKey) {
    __publicField(this, "resultKeysPromise");
    __publicField(this, "readKey");
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
    const iterator = {
      async next() {
        const results = await keysPromise;
        if (index < results.length) {
          const key = results[index++];
          const value = await this.readKey(key);
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
        return Promise.all(results.map(async (item) => await this.readKey(item)));
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
var replicache_default = Replicache;
export {
  Replicache,
  replicache_default as default,
  pullFromServer,
  pushToServer
};
