import { assertEquals } from "@std/assert/equals";
import { createValTownNetworkClient } from "../replicache-utils/network/NetworkClientValTown.ts";
import { Replicache } from "../replicache.ts";

const e2eOps = {
    sanitizeResources: false,
    sanitizeOps: false,
}

const baseUrl = Deno.env.get("REPLICACHE_BASE_URL") || "https://poe-db-prototype.fly.dev"
let needsToSeedData = false;
Deno.test("there exists data in the database", e2eOps, async () => {
    const spaceId = "test_49320834302894"
    console.log("baseUrl", baseUrl)
    const rep = new Replicache({
        baseUrl,
        spaceID: spaceId,
        mutators: {
            setValue: async (tx, { key, value }) => {
                await tx.set(key, value)
            }
        },
    })

    if (needsToSeedData || true) {
        // @ts-ignore
        await rep.mutate.setValue({ key: "test", value: "meow" })
        await rep.push()
    }
    try {
        // @ts-ignore
        const value = await rep.query((tx) => tx.get("test"))
        assertEquals(value, "meow")
    } catch (error: unknown) {
        // Ignore Ably connection errors
        if (error instanceof Error && error.message?.includes("Connection closed")) {
            console.log("Ignoring Ably connection error:", error.message)
            return
        }
        throw error
    }
})