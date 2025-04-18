type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export type Patch =
  | {
      op: 'set';
      key: string;
      value: JSONValue;
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
    args: Record<string, any>; // mutator arg
    operations: Operation[];
}

export type Operation = {
    op: 'set';
    key: string;
    value: JSONValue | null;
} | {
    op: 'del';
    key: string;
}