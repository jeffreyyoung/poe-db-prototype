import type { Mutation, PullResponse, PushResponse } from "./server_types.ts";
const baseURL = 'https://jeffreyyoung-replicachebackendv2.web.val.run';

import Ably from 'https://esm.sh/ably';

const ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");

ably.connection.once("connected", () => {
  console.log("Connected to Ably!");
});

/**
 * Pulls the latest mutations from the server
 * @param spaceName The name of the space to pull from
 * @param afterMutationId The mutation id to start pulling from
 * @returns The latest mutations from the server
 */
export async function pullFromServer(spaceName: string, afterMutationId: number): Promise<PullResponse> {
    console.log("pulling from server", spaceName, afterMutationId);
    const response = await fetch(`${baseURL}/pull/${spaceName}?afterMutationId=${afterMutationId}`);
    if (!response.ok) {
        throw new Error(`Failed to pull from ${spaceName}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log("pulled", data);
    return data;
}

/**
 * Combines multiple mutations into a single mutation
 * @param mutations The mutations to combine
 * @returns A single mutation that contains all the operations from the input mutations
 */
function combineMutations(mutations: Mutation[]): Mutation {
  const kvUpdates = new Map<string, Mutation["operations"][number]>();
  for (const mutation of mutations) {
    for (const operation of mutation.operations) {
      kvUpdates.set(operation.key, operation);
    }
  }
  const mutation: Mutation = {
    id: Math.floor(Math.random()*9999999),
    name: "stuf",
    args: { "hi": "bye"} as any,
    operations: Array.from(kvUpdates.values())
  }
  return mutation;
}

/**
 * Pushes a mutation to the server
 * @param spaceName The name of the space to push to
 * @param mutations The mutations to push
 * @returns The response from the server
 */
export async function pushToServer(spaceName: string, mutations: Mutation[]): Promise<PushResponse> {

    const response = await fetch(`${baseURL}/push/${spaceName}`, {
        method: 'POST',
        body: JSON.stringify({ mutations: [combineMutations(mutations)] }),
    });
    if (!response.ok) {
        throw new Error(`Failed to push to ${spaceName}: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
}