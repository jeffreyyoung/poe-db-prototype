import Ably from "npm:ably@2.8.0";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "./replicache_server_core.ts";

const db = new DatabaseSync(Deno.env.get("SQLITE_DB_PATH") || "test.db");

const ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");

const server = createServer(db, async (spaceId, result) => {
  const channel = ably.channels.get(spaceId);
  await channel.publish("poke", result);
});

Deno.serve(server);