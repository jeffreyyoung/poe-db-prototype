/**
 * Repli-Cache: A Replicache-compatible client with custom internals
 */
import { createReadTransaction, ScanArg } from "./createReadTransaction.ts";
import { createWriteTransaction } from "./createWriteTransaction.ts";
import { observePrefix, ObservePrefixOnChange } from "./observePrefix.ts";
import type { PullResponse, PokeResult, Patch } from "./server-types.ts";
import { createStoreSnapshot, Store } from "./Store.ts";
import { createSubscriptionManager } from "./SubscriptionManager.ts";

/**
 * This class has no network related code.  It handles all core logic.  Anything that directly interacts with the store
 * should be defined here.
 */
export class ReplicacheCore {
  store: Store = {
    kv: new Map(),
    pendingMutations: [],
  };

  latestMutationId = 0;
  #clientId = Date.now() + Math.random().toString(36).substring(2, 15);

  /**
   * each time we run a subscription, we keep track of the keys that were accessed
   */
  #subscriptionManager = createSubscriptionManager(this.store);
  options: {
    mutators: Record<
      string,
      (
        tx: ReturnType<typeof createWriteTransaction>,
        params: any
      ) => Promise<any>
    >;
  };
  constructor(options: typeof ReplicacheCore.prototype.options) {
    this.options = options;
  }

  processPokeResult(pokeResult: PokeResult): { shouldPull: boolean } {
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
    // we can just apply the mutations and skip pulling
    this.removeCompletedLocalMutations(pokeResult.localMutationIds);
    const changedKeys = this.#applyPatches(pokeResult.patches);
    this.latestMutationId = maxMutationId;
    this.#subscriptionManager.notifySubscribers(changedKeys);
    return { shouldPull: false };
  }

  removeCompletedLocalMutations(completedLocalMutationIds: number[]) {
    const completedSet = new Set(completedLocalMutationIds);
    this.store.pendingMutations = this.store.pendingMutations.filter(
      (m) => !completedSet.has(m.mutation.id)
    );
  }

  processPullResult(pullResponse: PullResponse, completedLocalMutationIds: number[]) {
    const patches = pullResponse.patches;
    const changedKeys = this.#applyPatches(patches);
    this.latestMutationId = pullResponse.lastMutationId;
    this.removeCompletedLocalMutations(completedLocalMutationIds);
    this.#subscriptionManager.notifySubscribers(changedKeys);
  }

  getClientId() {
    return Promise.resolve(this.#clientId);
  }

  async mutate(
    mutatorName: string,
    args: any,
    localMutationId: number
  ) {
    const snapshot = createStoreSnapshot(this.store);
    const tx = createWriteTransaction(snapshot);
    const result = await this.options.mutators[mutatorName](tx, args);
    const kvUpdates = new Map();
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
        name: mutatorName,
      },
      kvUpdates,
      status: "waiting",
    });
    this.#subscriptionManager.notifySubscribers(new Set(kvUpdates.keys()))
    return result;
  }

  async query(
    cb: (tx: ReturnType<typeof createReadTransaction>) => Promise<any>
  ) {
    const tx = createReadTransaction(this.store);
    const result = await cb(tx);
    return result;
  }

  subscribe(
    queryCb: (tx: ReturnType<typeof createReadTransaction>) => Promise<any>,
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
    return this.#subscriptionManager.subscribe(queryCb, onQueryCbChanged);
  }

  observeEntries(scanArg: ScanArg, onChange: ObservePrefixOnChange) {
    return observePrefix(this, scanArg, onChange);
  }

  #applyPatches(patches: Patch[]): Set<string> {
    const changedKeys = new Set<string>();
    for (const patch of patches) {
      if (patch.op === "set") {
        this.store.kv.set(patch.key, {
          value: patch.value,
          mutation_id: patch.mutationId,
        });
      } else if (patch.op === "del") {
        this.store.kv.delete(patch.key);
      }
      changedKeys.add(patch.key);
    }
    return changedKeys;
  }
}


export default ReplicacheCore;
