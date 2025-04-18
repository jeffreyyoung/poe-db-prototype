import { createClient } from "npm:@libsql/client";

const db = createClient({
  url: "libsql://replicache-jeffreyyoung.aws-us-west-2.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NDQ5NTAyNjcsImlkIjoiYzU3ZTRkZmQtYTcyYS00NGI0LWEyMmUtZmRkNTg3ZTliODVmIiwicmlkIjoiMDU2YjNiOWEtMTdiOC00MjQ0LWJiOGItZTgwZGVlMjI3Yzk1In0.nx26DWIkY-CVcaDWBmM0jMOHiJ0GhxvyV51mVf0NM9AeE8Y1BI41oen3GToFrpCpHKkn7Kp9_xzN0kuk9uZBBQ"
});

export function closeDb() {
  db.close();
}

const SPACES_TABLE = "spaces1";
const KV_TABLE = "kv1";

export async function setupTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS ${SPACES_TABLE} (
        id TEXT PRIMARY KEY,
        lastMutationId INTEGER DEFAULT 0
    )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
        spaceId TEXT,
        key TEXT,
        value TEXT,
        mutationId INTEGER,
        PRIMARY KEY (spaceId, key)
    )`);

  // Create indexes for better query performance
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_kv_spaceid_key ON ${KV_TABLE} (spaceId, key)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_kv_spaceid_mutationid ON ${KV_TABLE} (spaceId, mutationId)`
  );
}


export async function getLastMutationId(spaceId: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT lastMutationId FROM ${SPACES_TABLE} WHERE id = ?`,
    args: [spaceId],
  });
  const row = result.rows[0];
  return row ? parseInt(row.lastMutationId as string) : 0;
}

export async function getAndWriteNextMutationId(
  spaceId: string
): Promise<number> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO ${SPACES_TABLE} (id, lastMutationId) VALUES (?, 0)`,
    args: [spaceId],
  });
  const lastMutationId = await getLastMutationId(spaceId);
  const nextMutationId = lastMutationId + 1;
  await db.execute({
    sql: `UPDATE ${SPACES_TABLE} SET lastMutationId = ? WHERE id = ?`,
    args: [nextMutationId, spaceId],
  });
  return nextMutationId;
}

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export async function writeKey(args: {
  spaceId: string;
  key: string;
  value: JSONValue;
  mutationId: number;
}) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO ${KV_TABLE} (spaceId, key, value, mutationId) VALUES (?, ?, ?, ?)`,
    args: [args.spaceId, args.key, JSON.stringify(args.value), args.mutationId],
  });
}

export async function readKey(args: {
  spaceId: string;
  key: string;
}): Promise<JSONValue | null> {
  const result = await db.execute({
    sql: `SELECT value FROM ${KV_TABLE} WHERE spaceId = ? AND key = ?`,
    args: [args.spaceId, args.key],
  });
  const row = result.rows[0];
  return row ? JSON.parse(row.value as string) : null;
}

export async function getKeysAndValuesAfterMutationId(args: {
  spaceId: string;
  afterMutationId: number;
}): Promise<{ key: string; value: JSONValue; mutationId: number }[]> {
  const result = await db.execute({
    sql: `SELECT key, value, mutationId FROM ${KV_TABLE} WHERE spaceId = ? AND mutationId > ?`,
    args: [args.spaceId, args.afterMutationId],
  });
  return result.rows.map(
    (row) => ({
      key: row.key as string,
      value: JSON.parse(row.value as string),
      mutationId: row.mutationId as number,
    })
  );
}
