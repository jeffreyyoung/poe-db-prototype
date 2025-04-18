export type Patch =
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

export type PullResponse = {
    lastMutationId: number;
    patches: Patch[]
}


export type PushRequest = {
    mutations: Mutation[];
}
export type PushResponse = {
    lastMutationId: number;
}

export type Mutation = {
    id: number; // client defined mutation id
    name: string; // mutator name
    args: Map<string, any>; // mutator arg
    operations: Operation[];
}

export type Operation = {
    op: 'set';
    key: string;
    value: Map<string, any> | null;
} | {
    op: 'del';
    key: string;
}