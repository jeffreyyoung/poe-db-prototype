/**
 * Repli-Cache: A Replicache-compatible client with custom internals
 */
import { createReadTransaction } from "./replicache-utils/createReadTransaction.ts";
import { createWriteTransaction } from "./replicache-utils/createWriteTransaction.ts";
import { throttle } from "./replicache-utils/throttlePromise.ts";
import { createValTownNetworkClient } from "./replicache-utils/NetworkClientValTown.ts";
import { NetworkClient, NetworkClientFactory } from "./replicache-utils/NetworkClient.ts";
import ReplicacheCore from "./replicache-utils/createReplicacheCore.ts";

export class Replicache {
  #core: ReplicacheCore;

  latestMutationId = 0;

  #enqueuePull: ReturnType<typeof throttle<unknown>>;
  #enqueuePush: ReturnType<typeof throttle<unknown>>;
  #networkClient: NetworkClient;
  options: {
    spaceID: string;
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
  constructor(options: typeof Replicache.prototype.options) {
    this.options = options;
    this.#core = new ReplicacheCore(this.options);
    this.#enqueuePull = throttle(
      this.#doPull.bind(this),
      options.pullDelay ?? 20,
      true
    );
    this.#enqueuePush = throttle(
      this.#doPush.bind(this),
      options.pushDelay ?? 20,
      true
    );
    this.#startPolling();
    const createNetworkClient = this.options.networkClientFactory ?? createValTownNetworkClient;
    this.#networkClient = createNetworkClient({
      spaceId: this.options.spaceID,
      onPoke: (poke) => {
        this.#core.processPokeResult(poke);
      },
      pullDelay: options.pullDelay ?? 20,
      pushDelay: options.pushDelay ?? 20,
    });
    if (typeof window !== "undefined") {
      this.#addToWindow();
    }
  }

  async pull() {
    await this.#enqueuePush.getCurrentPromise()?.catch(() => {})
    return await this.#enqueuePull()
  }

  push() {
    return this.#enqueuePush()
  }

  #addToWindow() {
    // @ts-ignore
    window.rep = this;
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
      tx: ReturnType<typeof createReadTransaction>
    ) => Promise<any>
  ) {
    return this.#core.query(cb);
  }

  subscribe(
    queryCb: (
      tx: ReturnType<typeof createReadTransaction>
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
    console.log("starting pull");
    const result = await this.#networkClient.pull({
      spaceId: this.options.spaceID,
      afterMutationId: this.latestMutationId
    });
    this.#core.processPullResult(result, this.#core.store.pendingMutations.filter(m => m.status === "pending").map(m => m.mutation.id));
  }



  localMutationQueue = Promise.resolve();

  async #doMutation(mutatorName: string, params: any, localMutationId: number) {
    // this is how we ensure the local mutations are executed in order
    this.localMutationQueue = this.localMutationQueue
      .catch(() => {})
      .then(async () => {
        await this.#core.mutate(mutatorName, params, localMutationId);
        setTimeout(() => {
          this.push();
        }, 100);
        return;
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
    console.log("starting push", this.#core.store.pendingMutations.length);
    const notYetPushed = this.#core.store.pendingMutations.filter(
      (m) => m.status === "waiting"
    );
    if (notYetPushed.length === 0) {
      return;
    }
    notYetPushed.forEach((m) => (m.status = "pending"));
    try {
      await this.#networkClient.push({
        mutations: notYetPushed.map((m) => m.mutation)
      });
      // now the pushed mutations are in push state
      notYetPushed.forEach((m) => (m.status = "pushed"));
      
    } catch (e) {
      console.error("Error pushing mutations", e);
      // roll back the mutations since this errored...
      // in real world we would retry
      this.#core.store.pendingMutations = this.#core.store.pendingMutations.filter(
        (m) => !notYetPushed.includes(m)
      );
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
