type Patch =
  | {
      op: 'set';
      key: string;
      value: Map<string, any>;
      mutationId: number;
    }
  | {
      op: 'del';
      key: string;
      mutationId: number;
    }

type PullResponse = {
    lastMutationId: number;
    patches: Patch[]
}


type PushRequest = {
    mutations: Mutation[];
}
type PushResponse = {
    lastMutationId: number;
}

type Mutation = {
    id: number; // client defined mutation id
    name: string; // mutator name
    args: Map<string, any>; // mutator arg
    operations: Operation[];
}

type Operation = {
    op: 'set';
    key: string;
    value: Map<string, any> | null;
} | {
    op: 'del';
    key: string;
}