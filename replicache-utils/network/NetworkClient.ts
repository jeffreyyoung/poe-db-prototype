import {
  PokeResult,
  PullResponse,
  PushRequest,
  PushResponse,
} from "../server-types.ts";

type OffFn = () => void;

export type NetworkClient = {
  pull: (args: {
    spaceId: string;
    afterMutationId: number;
  }) => Promise<PullResponse>;
  push: (args: PushRequest & { spaceId: string }) => Promise<PushResponse>;
  subscribeToPoke: (args: { spaceId: string }, callback: (res: PokeResult) => void) => OffFn
  unsubscribeFromPoke: (args: { spaceId: string }) => void
};

export type NetworkClientFactory = (args: {
  baseUrl?: string;
}) => NetworkClient;
