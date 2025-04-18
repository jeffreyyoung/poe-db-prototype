import * as hono from "@hono/hono";
import { PullResponse, PushRequest, PushResponse, Patch } from "./server_types.ts";
import { getAndWriteNextMutationId, writeKey, getKeysAndValuesAfterMutationId, closeDb, getLastMutationId } from "./db.ts";

export const app = new hono.Hono();

app.get("/pull/:spaceName", async (c) => {
    const spaceName = c.req.param("spaceName");
    const afterMutationId = parseInt(c.req.query("afterMutationId") || "-1");
    const lastMutationId = await getLastMutationId(spaceName);
    
    const rows = await getKeysAndValuesAfterMutationId({spaceId: spaceName, afterMutationId});
    const patches: Patch[] = rows.map((row) => ({
        op: "set",
        key: row.key,
        value: row.value,
        mutationId: row.mutationId
    }));
    
    const result: PullResponse = {
        lastMutationId,
        patches
    }

    return c.json(result);
});

app.post("/push/:spaceName", async (c) => {
    const spaceName = c.req.param("spaceName");
    const body = await c.req.json() as PushRequest;
    const mutationId = await getAndWriteNextMutationId(spaceName);
    
    for (const mutation of body.mutations) {
        for (const operation of mutation.operations) {
            if (operation.op === 'set') {
                await writeKey({spaceId: spaceName, key: operation.key, value: operation.value, mutationId});
            } else if (operation.op === 'del') {
                await writeKey({spaceId: spaceName, key: operation.key, value: null, mutationId});
            }
        }
    }
    const result: PushResponse = {
        lastMutationId: mutationId
    }
    return c.json(result);
});

if (import.meta.main) {
  // Close the database connection when the server shuts down
  Deno.addSignalListener("SIGINT", () => {
    closeDb();
    Deno.exit();
  });
  
  Deno.serve(app.fetch);
}
