import {
  PokeResult,
  PullResponse,
  PushRequest,
  PushResponse,
} from "./server-types.ts";

export type NetworkClient = {
  pull: (args: {
    spaceId: string;
    afterMutationId: number;
  }) => Promise<PullResponse>;
  push: (args: Omit<PushRequest, "operations">) => Promise<PushResponse>;
};

export type NetworkClientFactory = (args: {
  spaceId: string;
  pullDelay?: number;
  pushDelay?: number;
  onPoke: (poke: PokeResult) => void;
}) => NetworkClient;
