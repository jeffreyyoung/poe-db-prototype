import { createServer } from "../../backend/replicache_server_core.ts";
import { NetworkClientFactory } from "./NetworkClient.ts";
import { DatabaseSync } from "node:sqlite";


export const createTestClient: NetworkClientFactory = (args) => {
    const db = new DatabaseSync(":memory:");
    const testServer = createServer(db, (_spaceId, result) => {
        args.onPoke(result);
        return Promise.resolve();
    })
    return {
        pull: async (pullArgs) => {
            const req = new Request(`http://localhost/pull/${args.spaceId}?afterMutationId=${pullArgs.afterMutationId}`)
            const res = await testServer(req);
            const json = await res.json();
            return json;

        },
        push: async (pushArgs) => {
            const req = new Request(`http://localhost/push/${args.spaceId}`, {
                method: 'POST',
                body: JSON.stringify(pushArgs),
            });
            const res = await testServer(req);
            const json = await res.json();
            return json
        },

    }
}