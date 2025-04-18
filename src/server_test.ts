import { assertEquals } from "@std/assert";
import { app } from "./server.ts";
import { PullResponse, PushRequest } from "./server_types.ts";

const testSpaceId = "test"+ Math.random().toString(36).substring(2, 15);

async function testPull(spaceId: string, afterMutationId: number = 0) {
    const response = await app.request("/pull/"+spaceId+"?afterMutationId="+afterMutationId);
    const result: PullResponse = await response.json();
    assertEquals(response.ok, true, "Pull request failed");
    return result;
}

async function testPush(pushRequest: PushRequest, spaceId: string = testSpaceId) {
    const response = await app.request("/push/"+spaceId, {
        method: "POST",
        body: JSON.stringify(pushRequest),
    });
    assertEquals(response.ok, true, "Push request failed");
    const result: {lastMutationId: number} = await response.json();
    return result;
}

Deno.test("pull", async () => {
    const result = await testPull(testSpaceId);
    assertEquals(result.lastMutationId, 0);
    assertEquals(result.patches.length, 0);
});

Deno.test("push", async () => {
    const result = await testPush({mutations: []});
    assertEquals(result.lastMutationId, 1);
});



Deno.test("full flow works", async () => {
    const spaceId = "test"+ Math.random().toString(36).substring(2, 15);

    const pullResult = await testPull(spaceId);
    assertEquals(pullResult.lastMutationId, 0);
    assertEquals(pullResult.patches.length, 0);

    const pushResult = await testPush({mutations: [{
        args: { hello: "world" },
        id: 1,
        name: "test",
        operations: [{
            key: "hello",
            op: "set",
            value: "world"
        }]
    }]}, spaceId);
    assertEquals(pushResult.lastMutationId, 1);

    const pullResult2 = await testPull(spaceId);
    assertEquals(pullResult2.lastMutationId, 1);
    assertEquals(pullResult2.patches.length, 1);
    const patch = pullResult2.patches[0];
    if (patch.op !== "set") {
        throw new Error("Patch should be a set operation");
    }
    assertEquals(patch.key, "hello");
    assertEquals(patch.value, "world");


    const pullResult3 = await testPull(spaceId, 1);
    assertEquals(pullResult3.lastMutationId, 1);
    assertEquals(pullResult3.patches.length, 0);


    const pullResult4 = await testPull(spaceId, 2);
    assertEquals(pullResult4.lastMutationId, 1);
    assertEquals(pullResult4.patches.length, 0);



    const pushResult5 = await testPush({mutations: [{
        args: { hello: "world2" },
        id: 2,
        name: "test",
        operations: [{
            key: "hello",
            op: "set",
            value: "world2"
        }]
    }]}, spaceId);
    assertEquals(pushResult5.lastMutationId, 2);

    const pullResult6 = await testPull(spaceId, 1);
    assertEquals(pullResult6.lastMutationId, 2);
    assertEquals(pullResult6.patches.length, 1);
    const patch6 = pullResult6.patches[0];
    if (patch6.op !== "set") {
        throw new Error("Patch should be a set operation");
    }
    assertEquals(patch6.key, "hello");
    assertEquals(patch6.value, "world2");


    const pullResult7 = await testPull(spaceId, 2);
    assertEquals(pullResult7.lastMutationId, 2);
    assertEquals(pullResult7.patches.length, 0);
});
