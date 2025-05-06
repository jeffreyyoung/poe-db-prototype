/**
 * Repli-Cache: A Replicache-compatible client with custom internals
 */
import { ScanArg } from "./replicache-utils/core/createReadTransaction.ts";
import { createWriteTransaction } from "./replicache-utils/core/createWriteTransaction.ts";
import { throttle, throttleAllowConcurrency } from "./replicache-utils/throttlePromise.ts";
import {
  collapseMutations,
  createValTownNetworkClient,
} from "./replicache-utils/network/NetworkClientValTown.ts";
import {
  NetworkClient,
} from "./replicache-utils/network/NetworkClient.ts";
import ReplicacheCore from "./replicache-utils/core/createReplicacheCore.ts";
import { ObservePrefixOnChange } from "./replicache-utils/observePrefix.ts";
import { ChangeSummary } from "./replicache-utils/replicache-types.ts";
import type {
  ReadTransaction,
  Replicache as ReplicacheType,
} from "./replicache-utils/replicache-types.ts";
import { hashMutators } from "./replicache-utils/hash.ts";
import { PokeResult } from "./replicache-utils/server-types.ts";
import { isTest } from "./replicache-utils/isTest.ts";

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
    networkClient?: NetworkClient;
    baseUrl?: string;
  };

  #_debugLocalMutationIdToStartTime = new Map<number, number>();
  constructor(options: typeof Replicache.prototype.options) {
    this.options = options;
    this.#core = new ReplicacheCore(this.options);
    this.#enqueuePull = throttle(
      this.#doPull.bind(this),
      typeof options.pullDelay === "number" ? options.pullDelay : 50,
    );
    this.#enqueuePush = throttleAllowConcurrency(
      this.#doPush.bind(this),
      typeof options.pushDelay === "number" ? options.pushDelay : 50,
    );
    this.#spaceId = this.options.spaceID || "";
    if (!this.#spaceId) {
      this.#spaceId = "space" + hashMutators(this.options.mutators);
    }

    this.#networkClient =
      this.options.networkClient ||
      createValTownNetworkClient({
        baseUrl:
          this.options.baseUrl ||
          "https://poe-db-prototype.fly.dev"
          // "https://poe-db-653909965599.us-central1.run.app",
      });
    this.#networkClient.subscribeToPoke(
      { spaceId: this.#spaceId },
      this._handlePokeResult.bind(this)
    );
    if (typeof window !== "undefined") {
      this.#addToWindow();
    }
    this.#core.initialPullPromise = this.pull().catch((e) => {
      console.error("initial promise failed", e)
    });
    this.#startPolling();

  }

  async hasCompletedInitialPull() {
    const b = await this.#core.initialPullPromise;
    return b;
  }



  _handlePokeResult(poke: PokeResult) {
    const { shouldPull, localMutationIds } = this.#core.processPokeResult(poke);
    if (shouldPull) {
      this.pull();
    }
    const times: number[] = [];
    localMutationIds.forEach((id) => {
      const startTime = this.#_debugLocalMutationIdToStartTime.get(id);
      if (!startTime) {
        return;
      }
      this.#_debugLocalMutationIdToStartTime.delete(id);
      const endTime = Date.now();
      const duration = endTime - startTime;
      times.push(duration);
    });

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const avgTime = times.reduce((acc, t) => acc + t, 0) / times.length;
    if (times.length > 0) {
      this.#log(
        this.#core._loggerPrefix(),
        `MUTATION ROUND TRIP TIME:minTime: ${minTime}, maxTime: ${maxTime}, avgTime: ${avgTime}, mutations count: ${times.length}`
      );
    }
  }

  async pull() {
    await this.#enqueuePush.done();
    return await this.#enqueuePull();
  }

  debug(): { lastMutationId: number } {
    return {
      lastMutationId: this.#core.latestMutationId,
    };
  }

  async push() {
    await this.#enqueuePull.done();
    return this.#enqueuePush();
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
      this.#log("Skipping Ably subscription in test environment");
      return;
    }
    while (true) {
      await sleep(20_000);
      await this.pull().catch((e) => {
        console.error("Error polling", e);
      });
    }
  }

  query(cb: (tx: ReadTransaction) => Promise<any>) {
    return this.#core.query(cb);
  }

  subscribe(
    queryCb: (tx: ReadTransaction) => Promise<any>,
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
    console.log("client", "doPull", this.#core.latestMutationId)
    const pullStart = Date.now();
    try {
      const result = await this.#networkClient.pull({
        spaceId: this.#spaceId,
        afterMutationId: this.#core.latestMutationId,
      });
      const pullEnd = Date.now();
      this.#log(
        this.#core._loggerPrefix(),
        `/pull - success (${pullEnd - pullStart}ms) - Pulled ${
          result.patches.length
        } patches.`
      );
      this.#core.processPullResult(
        result,
        this.#core.store.pendingMutations
          .filter((m) => m.status !== "waiting")
          .map((m) => m.mutation.id)
      );
    } catch (e) {
      const pullEnd = Date.now();
      this.#logError(
        this.#core._loggerPrefix(),
        `/pull - failed (${pullEnd - pullStart}ms) - Error: ${e}`
      );
    }
  }

  #log(...args: unknown[]) {
    if (isTest() && false) {
      return;
    }
    console.log(...args);
  }

  #logError(...args: unknown[]) {
    console.error(...args);
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
            const localMutationId = Math.floor(Math.random() * 9999999);
            this.#_debugLocalMutationIdToStartTime.set(
              localMutationId,
              Date.now()
            );
            await this.#core.mutate(mutatorName, args, localMutationId);
            this.push(); // push in background
          };
        },
      }
    );
  }

  async #doPush() {
    this.#log("starting push", this.#core.store.pendingMutations.length);

    const notYetPushed = this.#core.store.pendingMutations.filter(
      (m) => m.status === "waiting"
    );
    if (notYetPushed.length === 0) {
      console.log("no mutations to push");
      return;
    }
    notYetPushed.forEach((m) => (m.status = "pending"));
    let pushStart = Date.now();
    try {
      const mutations = notYetPushed.map((m) => m.mutation);
      console.log("pushing", mutations.length, "mutations");
      await this.#networkClient.push({
        mutations,
        spaceId: this.#spaceId,
        operations: collapseMutations(mutations).operations,
      });
      // now the pushed mutations are in push state
      notYetPushed.forEach((m) => (m.status = "pushed"));
      let pushEnd = Date.now();
      this.#log(
        this.#core._loggerPrefix(),
        `/push - success (${pushEnd - pushStart}ms) - Pushed mutations: ${
          notYetPushed.length
        } mutations.`
      );
    } catch (e) {
      console.error("Error pushing mutations", e);
      // roll back the mutations since this errored...
      // in real world we would retry
      let pushEnd = Date.now();
      console.error(
        this.#core._loggerPrefix(),
        `/push - failed (${pushEnd - pushStart}ms) - Rolling back ${
          notYetPushed.length
        } mutations. Error: ${e}`
      );
      this.#core.store.pendingMutations =
        this.#core.store.pendingMutations.filter(
          (m) => !notYetPushed.includes(m)
        );
    }
  }


  destroy() {
    this.#networkClient.unsubscribeFromPoke({ spaceId: this.#spaceId });
  }

  onChange(
    cb: (args: {
      state: Map<string, any>;
      changes: ChangeSummary;
      clientId: string;
    }) => void
  ) {
    return this.subscribeToScanEntries({ prefix: "" }, (result, changes) => {
      cb({
        state: new Map(result),
        changes,
        clientId: this.#core.getClientIdSync(),
      });
    });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
