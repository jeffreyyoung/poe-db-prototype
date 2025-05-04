import Ably from "npm:ably@2.8.0";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "./replicache_server_core.ts";

const sqliteDbPath = Deno.env.get("SQLITE_DB_PATH") || "test.db";

console.log("STARTING SERVER WITH SQLITE DB PATH", sqliteDbPath);

const db = new DatabaseSync(sqliteDbPath);

const ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");

const server = createServer(db, async (spaceId, result) => {
  const channel = ably.channels.get(spaceId);
  await channel.publish("poke", result);
});

Deno.serve(server);