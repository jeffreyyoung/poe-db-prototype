import { isTest } from "../isTest.ts";
import { NetworkClientFactory } from "./NetworkClient.ts";
import {
  Mutation,
  PushRequest,
} from "../server-types.ts";
import Ably from "https://esm.sh/ably";
let pokeCount = 0;
let pullCount = 0;
let pushCount = 0;

let ably: Ably.Realtime | null = null;
export function getAbly() {
    if (!ably) {
      ably = new Ably.Realtime(
        "frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM"
      );
      ably.connection.once("connected", () => {
        console.log("Connected to Ably!");
      });
    }
    return ably;
  }

export const createValTownNetworkClient: NetworkClientFactory = ({
  baseUrl = "https://jeffreyyoung-replicache_backend_fork1.web.val.run"
}) => {

  return {
    subscribeToPoke: ({ spaceId}, onPoke) => {
      const ably = getAbly();
      const channel = ably.channels.get(spaceId);
      channel.subscribe("poke", (message) => {
        console.log("network -- poke", pokeCount++);
        onPoke(message.data);
      });
      return () => {
        channel.unsubscribe();
      }
    },
    unsubscribeFromPoke: ({ spaceId }: { spaceId: string }) => {
      const ably = getAbly();
      const channel = ably.channels.get(spaceId);
      channel.unsubscribe();
    },
    pull: async ({ spaceId, afterMutationId }) => {
      console.log("network -- pull", pullCount++);
      const pullStart = Date.now();
      const response = await fetch(
        `${baseUrl}/pull/${spaceId}?afterMutationId=${afterMutationId}`
      );
      const pullEnd = Date.now();
      if (!response.ok) {
        throw new Error(
          `Failed to pull from ${spaceId}: ${response.statusText}`
        );
      }
      const data = await response.json();
      console.log(
        "pulled",
        data.patches.length,
        "patches in",
        pullEnd - pullStart,
        "ms",
        isTest() ? null : data
      );
      return data;
    },
    push: async (pushRequest) => {
      const spaceId = pushRequest.spaceId;
      console.log("network -- push", pushCount++);
      const pushStart = Date.now();
      const response = await fetch(`${baseUrl}/push/${spaceId}`, {
        method: "POST",
        body: JSON.stringify(pushRequest),
      });
      const pushEnd = Date.now();
      const timeInMs = pushEnd - pushStart;
      if (!response.ok) {
        console.error("Failed to push to", spaceId, pushRequest, response.statusText)
        throw new Error(`Failed to push to ${spaceId}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("pushed", pushRequest.mutations.length, "mutations in", timeInMs, "ms", ...(isTest() ? [] : ['request', pushRequest, 'response', data]));
      return data;
    },
  };
}

export function collapseMutations(mutations: Mutation[]): Mutation {
    const kvUpdates = new Map<string, Mutation["operations"][number]>();
    for (const m of mutations) {
      for (const operation of m.operations) {
        kvUpdates.set(operation.key, operation);
      }
    }
    const mutation: Mutation = {
      id: Math.floor(Math.random() * 9999999),
      name: mutations.at(0)?.name ?? "stuf",
      args: mutations.at(0)?.args ?? { hi: "bye" } as any,
      operations: Array.from(kvUpdates.values()),
    };
    return mutation;
  }