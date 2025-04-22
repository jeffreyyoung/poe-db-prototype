import { createReadTransaction } from "./createReadTransaction.ts";
import { Store } from "./Store.ts";
import type { ReadTransactionWithKeys } from "./replicache-internal-types.ts";

type QueryFunction = (tx: ReadTransactionWithKeys) => Promise<any>;
type Subscription = {
    onResultChanged: (res: any) => void;
    lastReadTransaction: ReadTransactionWithKeys;
    lastResult: any;
}

export function createSubscriptionManager(store: Store, clientID: string) {
    const subscriptions = new Map<
        QueryFunction,
        Subscription
    >();

    async function _runQuery(queryFn: QueryFunction) {
        const tx = createReadTransaction(store, clientID);
        const result = await queryFn(tx);
        return { result, tx };
    }


    async function maybeNotify(queryFn: QueryFunction, changedKeys: Set<string>,) {
        const lastRun = subscriptions.get(queryFn);
        if (!lastRun) {
            // this means the query function was never run
            return;
        }

        const { result, tx } = await _runQuery(queryFn);
        // update the last run
        subscriptions.set(queryFn, {
            onResultChanged: lastRun.onResultChanged,
            lastReadTransaction: tx,
            lastResult: result,
        });
        // first check if result is different from last result        
        if (lastRun.lastResult === result) {
            // this means the query function returned the same thing as last time
            return;
        }

        // check if we read any keys that changed
        for (const key of changedKeys) {
            if (tx._readKeys.has(key)) {
                // we did, so notify
                lastRun.onResultChanged(result);
                return;
            }
        }

        if (!areSetsEqual(lastRun.lastReadTransaction._scannedKeys, tx._scannedKeys)) {
            // the scanned keys changed across the last two runs
            lastRun.onResultChanged(result);
            return;
        }

        // if we get here, the result is the same as last time
        return;
    }
    return {
        subscribe(queryFn: QueryFunction, onChanged: (res: any) => void) {
            _runQuery(queryFn).then(({ result, tx }) => {
                subscriptions.set(queryFn, {
                    onResultChanged: onChanged,
                    lastReadTransaction: tx,
                    lastResult: result,
                });
                // always call the callback on first run
                onChanged(result);
            });
            return () => {
                subscriptions.delete(queryFn);
            }
        },
        notifySubscribers(changedKeys: Set<string>) {
            for (const cb of subscriptions.keys()) {
                maybeNotify(cb, changedKeys);
            }
        },
    }
}

function areSetsEqual<T>(setA: Set<T>, setB: Set<T>): boolean {
    // If sizes are different, sets cannot be equal
    if (setA.size !== setB.size) return false;
    
    // Check if every element in setA exists in setB
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    
    return true;
  }