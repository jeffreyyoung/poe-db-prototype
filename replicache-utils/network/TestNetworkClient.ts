import { createServer } from "../../backend/replicache_server_core.ts";
import { PokeResult } from "../server-types.ts";
import { NetworkClientFactory } from "./NetworkClient.ts";
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