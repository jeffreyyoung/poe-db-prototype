/**
 * Repli-Cache: A Replicache-compatible client with custom internals
 */
import { ScanArg } from "./replicache-utils/createReadTransaction.ts";
import { createWriteTransaction } from "./replicache-utils/createWriteTransaction.ts";
import { throttle } from "./replicache-utils/throttlePromise.ts";
import { createValTownNetworkClient } from "./replicache-utils/NetworkClientValTown.ts";
import { NetworkClient, NetworkClientFactory } from "./replicache-utils/NetworkClient.ts";
import ReplicacheCore from "./replicache-utils/createReplicacheCore.ts";
import { ObservePrefixOnChange } from "./replicache-utils/observePrefix.ts";
import { ChangeSummary } from "./replicache-utils/replicache-types.ts";
import type { ReadTransaction, Replicache as ReplicacheType } from "./replicache-utils/replicache-types.ts";
import { hashMutators } from "./replicache-utils/hash.ts";
import { logger } from "./replicache-utils/debugLogger.ts";

export class Replicache implements ReplicacheType<Record<string, any>> {
  #core: ReplicacheCore;
  #enqueuePull: ReturnType<typeof throttle<unknown>>;
  #enqueuePush: ReturnType<typeof throttle<unknown>>;
  #networkClient: NetworkClient;
  #spaceId: string;
  options: {
    spaceID?: string;
    mutators: Record<
      string,
      (
        tx: ReturnType<typeof createWriteTransaction>,
        params: any
      ) => Promise<any>
    >;
    pushDelay?: number;
    pullDelay?: number;
    networkClientFactory?: NetworkClientFactory;
  };
  #_debugLocalMutationIdToStartTime = new Map<number, number>();
  constructor(options: typeof Replicache.prototype.options) {
    this.options = options;
    this.#core = new ReplicacheCore(this.options);
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
      this.#spaceId = 'space'+hashMutators(this.options.mutators);
    }

    this.#networkClient = createNetworkClient({
      spaceId: this.#spaceId,
      onPoke: (poke) => {
        const { shouldPull, localMutationIds } = this.#core.processPokeResult(poke);
        if (shouldPull) {
          this.#enqueuePull();
        }
        localMutationIds.forEach(id => {
          const startTime = this.#_debugLocalMutationIdToStartTime.get(id);
          if (!startTime) {
            return;
          }
          const endTime = Date.now();
          const duration = endTime - startTime;
          logger?.info(this.#core._loggerPrefix(), `/TIME ${duration}ms - local mutation ${id} took ${duration}ms to run locally and then receive server result. Result had ${poke.patches.length} patches`);
        });
      },
      pullDelay: options.pullDelay ?? 100,
      pushDelay: options.pushDelay ?? 100,
    });
    if (typeof window !== "undefined") {
      this.#addToWindow();
    }
  }

  async pull() {
    await this.#enqueuePush.getCurrentPromise()?.catch(() => {})
    return await this.#enqueuePull()
  }

  debug(): { lastMutationId: number } {
    return {
      lastMutationId: this.#core.latestMutationId,
    }
  }

  push() {
    return this.#enqueuePush()
  }

  #addToWindow() {
    // @ts-ignore
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
      await sleep(20_000);
    }
  }

  query(
    cb: (
      tx: ReadTransaction
    ) => Promise<any>
  ) {
    return this.#core.query(cb);
  }

  subscribe(
    queryCb: (
      tx: ReadTransaction
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
    return this.#core.subscribe(queryCb, onQueryCbChanged);
  }


  async #doPull() {
    let pullStart = Date.now();
    try {
    const result = await this.#networkClient.pull({
      spaceId: this.#spaceId,
      afterMutationId: this.#core.latestMutationId,
    });
    let pullEnd = Date.now();
    logger?.info(this.#core._loggerPrefix(), `/pull - success (${pullEnd - pullStart}ms) - Pulled ${result.patches.length} patches. Updated keys: ${result.patches.map(p => p.key).join(", ")}`)
    this.#core.processPullResult(result, this.#core.store.pendingMutations.filter(m => m.status !== "waiting").map(m => m.mutation.id));
  } catch (e) {
    let pullEnd = Date.now();
    logger?.error(this.#core._loggerPrefix(), `/pull - failed (${pullEnd - pullStart}ms) - Error: ${e}`)
  }
  }

  subscribeToScanEntries(scanArg: ScanArg, onChange: ObservePrefixOnChange) {
    return this.#core.observeEntries(scanArg, onChange);
  }

  observeEntries(prefix: string, onChange: ObservePrefixOnChange) {
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

          return async (args: any) => {
            const localMutationId = Math.floor(Math.random() * 9999999)
            this.#_debugLocalMutationIdToStartTime.set(localMutationId, Date.now());
            await this.#core.mutate(mutatorName, args, localMutationId)
            this.push() // push in background
          };
        },
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
    notYetPushed.forEach((m) => (m.status = "pending"));
    let pushStart = Date.now();
    try {
      
      await this.#networkClient.push({
        mutations: notYetPushed.map((m) => m.mutation)
      });
      // now the pushed mutations are in push state
      notYetPushed.forEach((m) => (m.status = "pushed"));
      let pushEnd = Date.now();
      logger?.info(this.#core._loggerPrefix(), `/push - success (${pushEnd - pushStart}ms) - Pushed mutations: ${notYetPushed.map(m => m.mutation.id).join(", ")} mutations. Updated keys: ${notYetPushed.map(m => m.kvUpdates.keys()).flat().join(", ")}`)
    } catch (e) {
      console.error("Error pushing mutations", e);
      // roll back the mutations since this errored...
      // in real world we would retry
      let pushEnd = Date.now();
      logger?.error(this.#core._loggerPrefix(), `/push - failed (${pushEnd - pushStart}ms) - Rolling back ${notYetPushed.length} mutations. Updated keys: ${notYetPushed.map(m => m.kvUpdates.keys()).flat().join(", ")}. Error: ${e}`)
      this.#core.store.pendingMutations = this.#core.store.pendingMutations.filter(
        (m) => !notYetPushed.includes(m)
      );
    }
  }

  onChange(cb: (args: { state: Map<string, any>, changes: ChangeSummary, clientId: string }) => void) {
    return this.subscribeToScanEntries({ prefix: "" }, (result, changes) => {
      cb({
        state: new Map(result),
        changes,
        clientId: this.#core.getClientIdSync()
      });
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
