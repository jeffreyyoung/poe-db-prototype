type DatabaseSync = {
    exec: any,
    prepare: any,
};
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
}

type InStatement = {
    sql: string;
    args: any[];
} | string


const KEY = "replicache"; // Use a fixed valid database identifier instead of filename
const SCHEMA_VERSION = 3; // Increment schema version to create fresh tables

type PokeResult = {
  mutationIds: number[];
  /* The local ids of the mutations that were applied */
  localMutationIds: number[];
  patches: Patch[];
};

type PushRequest = {
  mutations: Mutation[];
  operations: Operation[];
};
type PushResponse = {
  lastMutationId: number;
};

type PullResponse = {
  lastMutationId: number;
  patches: Patch[];

};

type Patch = {
  mutationId: number;
  op: "set";
  key: string;
  value: Record<string, any> | null;
};

type Mutation = {
  id: number; // client defined mutation id
  name: string; // mutator name
  args: Map<string, any>; // mutator arg
};

type Operation = {
  op: "set" | "del";
  key: string;
  value?: Record<string, any>;
};

type SpaceQueryResult = {
  last_mutation_id: number;
}[];

type KeyValueQueryResult = {
  key: string;
  value: string;
  mutation_id: number;
  is_deleted: number;
}[];

// Utility function for creating error responses
function createErrorResponse(message: string, status: number = 400): Response {
  console.error(`Error: ${message}`);
  return new Response(
    JSON.stringify({
      message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

// Simple JSON stringify (with Map support and fallback for plain objects)
function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, (_, value) => {
      // If it's a Map, convert to a plain object
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      // If it's a plain object with no special handling needed, return as-is
      return value;
    });
  } catch (stringifyError) {
    console.error("Stringify error:", stringifyError, "Original object:", obj);
    return "{}";
  }
}

function batch(db: DatabaseSync, statements: InStatement[]) {
    const results = [];
    for (const statement of statements) {
        if (typeof statement === "string") {
            results.push(db.exec(statement));
        } else {
            const stmt = db.prepare(statement.sql);
            const result = stmt.all(...(statement.args));
            results.push(result);
        }
    }
    return Promise.all(results) as Promise<any[]>;
}

async function ensureTablesExist(db: DatabaseSync) {
  try {
    await batch(db, [
      `CREATE TABLE IF NOT EXISTS ${KEY}_spaces_${SCHEMA_VERSION} (
        space TEXT PRIMARY KEY,
        last_mutation_id INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS ${KEY}_keyvalue_${SCHEMA_VERSION} (
        space TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        mutation_id INTEGER NOT NULL,
        is_deleted BOOLEAN NOT NULL DEFAULT 0,
        PRIMARY KEY (space, key),
        FOREIGN KEY (space) REFERENCES ${KEY}_spaces_${SCHEMA_VERSION}(space)
      )`,
      // so we can track local mutation ids that were applied in a change
      // ideally we'd include a client id in here too
      `CREATE TABLE IF NOT EXISTS ${KEY}_mutations_${SCHEMA_VERSION} (
        space TEXT NOT NULL,
        mutation_id INTEGER NOT NULL,
        local_mutation_id INTEGER NOT NULL
      )`,
      // index
      `CREATE INDEX IF NOT EXISTS idx_space_mutation_id 
      ON ${KEY}_keyvalue_${SCHEMA_VERSION} (space, mutation_id)`,
    ]);
  } catch (e) {
    console.error("server", "Error ensuring local mutation ids table:", e);
    throw e;
  }
}


export function createServer(
    db: DatabaseSync,
    sendPoke: (spaceId: string, result: PokeResult) => Promise<any>,
) {
  let needsToCreateTables = true;
    return async (request: Request): Promise<Response> => {
  try {
    if (needsToCreateTables) {
      // Ensure tables exist before any operations
      await ensureTablesExist(db);
      needsToCreateTables = false;
    }
  } catch (error) {
    console.error("server", "Error setting up database tables", error);
    return createErrorResponse("Failed to set up database tables", 500);
  }

  const url = new URL(request.url);
  // if the path is /health, return a 200
  if (url.pathname === "/health") {
    return new Response("OK", {
      headers: { "Content-Type": "text/plain", ...corsHeaders },
    });
  }

  const [action, space] = url.pathname.split("/").filter(Boolean);

  console.log("server", `Received request: space=${space}, action=${action}, method=${request.method}`);

  // Pull endpoint
  if (action === "pull") {
    try {
      const afterMutationId = Number(url.searchParams.get("afterMutationId") || "0");
      console.log("server", `Pull request: space=${space}, afterMutationId=${afterMutationId}`);

      // Check if space exists
      const [spaceQuery, keyValueQuery] = await batch(db, [
        {
          sql: `SELECT last_mutation_id 
        FROM ${KEY}_spaces_${SCHEMA_VERSION} 
        WHERE space = ?`,
          args: [space],
        },
        {
          sql: `SELECT key, value, mutation_id, is_deleted
        FROM ${KEY}_keyvalue_${SCHEMA_VERSION}
        WHERE space = ? AND mutation_id > ?
        ORDER BY mutation_id ASC
      `,
          args: [space, afterMutationId],
        },
      ]) as [SpaceQueryResult, KeyValueQueryResult];

      // If space does not exist, return default response
      if (!spaceQuery || spaceQuery.length === 0) {
        console.log("server", `Space ${space} does not exist, returning default pull response`);
        const pullResponse: PullResponse = {
          lastMutationId: 0,
          patches: [],
        };

        return new Response(safeStringify(pullResponse), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const lastMutationId = Number(spaceQuery[0].last_mutation_id);
      console.log("server", `Pull response: lastMutationId=${lastMutationId}`);

      const patches: Patch[] = (keyValueQuery || []).map((row) => ({
        op: "set",
        key: row.key,
        value: row.is_deleted ? null : JSON.parse(row.value),
        mutationId: row.mutation_id,
      }));

      const pullResponse: PullResponse = {
        lastMutationId,
        patches,
      };
      return new Response(safeStringify(pullResponse), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (pullError) {
      console.error("server", "Error in pull endpoint:", pullError);
      return createErrorResponse("Failed to process pull request", 500);
    }
  }

  // Push endpoint
  if (action === "push") {
    try {
      let body: PushRequest;
      try {
        body = await request.json();
      } catch (parseError) {
        console.error("server", "Failed to parse request body:", parseError);
        return createErrorResponse("Invalid request body", 400);
      }

      // Validate input
      if (!body.mutations || !Array.isArray(body.mutations)) {
        console.warn("server", "Invalid mutations in push request");
        return createErrorResponse("Invalid mutations in request", 400);
      }

      console.log("server", `Push request: space=${space}, mutations=${body.mutations.length}`);

      const localMutationIds = body.mutations.map((mutation) => mutation.id);
      console.log("server", `Local mutation IDs: ${localMutationIds}`);

      const operations = body.operations;

      const [updateLastMutationIdResult, ...results] = await batch(db, [
        {
          // update mutation_id
          sql: `
INSERT OR REPLACE INTO ${KEY}_spaces_${SCHEMA_VERSION} (space, last_mutation_id)
VALUES (
    ?,
    COALESCE(
        (SELECT last_mutation_id + 1 FROM ${KEY}_spaces_${SCHEMA_VERSION} WHERE space = ?),
        1
    )
)
RETURNING last_mutation_id
          `,
          args: [space, space],
        },
        // update key values
        ...operations.map((o) => operationToInstatement(o, space)),
      ]) as [SpaceQueryResult, ...any[]];
      console.log("server", "update result!!!!", updateLastMutationIdResult);
      const newMutationId = Number(updateLastMutationIdResult?.[0]?.last_mutation_id);
      const patches = operations.map((o) => operationToPatch(o, newMutationId));

      const pokeResult: PokeResult = {
        patches,
        localMutationIds,
        mutationIds: [newMutationId],
      };
      console.log("server", "sending poke, mutationIds", pokeResult.mutationIds);
      await sendPoke(space, pokeResult)

      // Return an empty object as per PushResponse type
      return new Response(safeStringify({}), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (pushError) {
      console.error("server", "Unexpected error in push endpoint:", pushError);
      return createErrorResponse("Unexpected error processing push request", 500);
    }
  }

  // Default response for unexpected actions
  console.warn("server", `Unexpected action: ${action}`);
  return createErrorResponse(`Unsupported action: ${action}`, 400);
}
}

function localMutationIdToInstatement(
  { localMutationId, mutationId, space }: { localMutationId: number; mutationId: number; space: string },
) {
  return {
    sql: `
      INSERT OR REPLACE INTO ${KEY}_mutations_${SCHEMA_VERSION} 
      (local_mutation_id, mutation_id, space) 
      VALUES (?, ?, ?)
    `,
    args: [localMutationId, mutationId, space],
  };
}

function operationToInstatement(operation: Operation, space: string): InStatement {
  return {
    sql: `
      INSERT OR REPLACE INTO ${KEY}_keyvalue_${SCHEMA_VERSION} 
      (space, key, value, mutation_id, is_deleted) 
      VALUES (?, ?, ?,     COALESCE(
        (SELECT last_mutation_id FROM ${KEY}_spaces_${SCHEMA_VERSION} WHERE space = ?),
        0
    ), 0)
    `,
    args: [
      space,
      operation.key,
      operation.op === "del" ? JSON.stringify(null) : JSON.stringify(operation.value),
      space,
    ],
  };
}

function operationToPatch(operation: Operation, newMutationId: number): Patch {
  return {
    op: "set",
    key: operation.key,
    value: operation.op === "del" ? null : operation.value ?? null,
    mutationId: newMutationId,
  };
}
