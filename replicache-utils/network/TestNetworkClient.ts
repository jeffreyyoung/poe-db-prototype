import { createServer } from "../../backend/replicache_server_core.ts";
import { PokeResult } from "../server-types.ts";
import { Deferred } from "./Deferred.ts";
import { NetworkClient, NetworkClientFactory } from "./NetworkClient.ts";
import { DatabaseSync } from "node:sqlite";


export const createTestClient: NetworkClientFactory = () => {
    const db = new DatabaseSync(":memory:");
    const callbacks = new Set<(result: PokeResult) => any>();
    
    const testServer = createServer(db, (_spaceId, result) => {
        console.log("poke!!!", result)
        for (const cb of callbacks) {
            cb(result);
        }
        return Promise.resolve();
    })
    return {
        subscribeToPoke: (_args, _onPoke) => {
            callbacks.add(_onPoke);
            return () => {
                callbacks.delete(_onPoke);
            }
        },
        unsubscribeFromPoke: (_args) => {
            // no-op
        },
        pull: async (pullArgs) => {
            const req = new Request(`http://localhost/pull/${pullArgs.spaceId}?afterMutationId=${pullArgs.afterMutationId}`)
            const res = await testServer(req);
            const json = await res.json();
            console.log("pull!!!", json);
            return json;

        },
        push: async (pushArgs) => {
            const req = new Request(`http://localhost/push/${pushArgs.spaceId}`, {
                method: 'POST',
                body: JSON.stringify(pushArgs),
            });
            const res = await testServer(req);
            const json = await res.json();
            console.log("push!!!!", json);
            return json
        },
    }
}


export const createQueuedTestClient = () => {

    const baseClient = createTestClient({});
    const queuedPulls: [Parameters<NetworkClient["pull"]>[0], Deferred<ReturnType<NetworkClient["pull"]>>][]  = [];
    const queuedPushes: [Parameters<NetworkClient["push"]>[0], Deferred<ReturnType<NetworkClient["push"]>>][]  = [];


    const queuedPokes: Map<(poke: PokeResult) => void, PokeResult[]> = new Map();
    
    
    
    const queuedClient: NetworkClient = {
        pull: async (pullArgs) => {
            const deferred = new Deferred<ReturnType<NetworkClient["pull"]>>();
            queuedPulls.push([pullArgs, deferred]);
            return deferred.promise;
        },
        push: async (pushArgs) => {
            const deferred = new Deferred<ReturnType<NetworkClient["push"]>>();
            queuedPushes.push([pushArgs, deferred]);
            return deferred.promise;
        },
        subscribeToPoke: (ops, cb) => {
            queuedPokes.set(cb, []);
            const off = baseClient.subscribeToPoke(ops, (poke) => {
                queuedPokes.get(cb)?.push(poke);
            });
            return () => {
                off();
                queuedPokes.delete(cb);
            }
        },
        unsubscribeFromPoke: (ops) => {
            return {
                
            }
        },
    };
    const controller = {
        queuedPulls,
        get queuedPokes() {
            return Array.from(queuedPokes.values()).flat();
        },
        queuedPushes,
        flushPulls: async () => {
            while (queuedPulls.length > 0) {
                const [pullArgs, deferred] = queuedPulls.shift()!;
                const result = await baseClient.pull(pullArgs);
                deferred.resolve(Promise.resolve(result));
            }
        },
        flushPokes: () => {
            for (const [cb, pokes] of queuedPokes.entries()) {
                while (pokes.length > 0) {
                    cb(pokes.shift()!);
                }
            }
        },
        flushPushes: async () => {
            while (queuedPushes.length > 0) {
                const [pushArgs, deferred] = queuedPushes.shift()!;
                const result = await baseClient.push(pushArgs);
                deferred.resolve(Promise.resolve(result));
            }
        },
    }

    return [queuedClient, controller] as const;
}