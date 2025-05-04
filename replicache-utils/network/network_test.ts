import { assertEquals } from "@std/assert/equals";
import { createServer } from "../../backend/replicache_server_core.ts";
import { PokeResult } from "../server-types.ts";
import { NetworkClientFactory } from "./NetworkClient.ts";
import { DatabaseSync } from "node:sqlite";

Deno.test("health check", async () => {
    const db = new DatabaseSync(":memory:");
    const server = createServer(db, (_spaceId, result) => {
        console.log("poke!!!", result)
        return Promise.resolve();
    })
    const res = await server(new Request("http://localhost/health"))
    assertEquals(res.status, 200)
})
