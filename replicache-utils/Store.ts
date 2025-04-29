
import type { Mutation, Patch } from "./server-types.ts";
import type { MapLike } from "./createReadTransaction.ts";
import type { JsonValue } from "./replicache-types.ts";

export function createStoreSnapshot(store: Store): MapLike<string, JsonValue> {
    const overrides: Map<string, { type: "set" | "del", value: JsonValue | null }> = new Map();
    return {
        get: (key: string) => {
            const override = overrides.get(key);
            if (override) {
                return override.value;
            }
            return get(store, key);
        },
        has: (key: string) => {
            const override = overrides.get(key);
            if (override) {
                return override.type === "set";
            }
            return has(store, key);
        },
        allKeys: () => keys(store),
        set: (key: string, value: JsonValue) => {
            overrides.set(key, { type: "set", value });
        },
        delete: (key: string) => {
            overrides.set(key, { type: "del", value: null });
        },
        __overrides: overrides,
    }
}

type PendingMutation = {
    mutation: Mutation;
    status: "waiting" | "pending" | "pushed";
    kvUpdates: Map<string, any>;
}

export type Store = {
    kv: Map<string, {value: any, mutation_id: number}>;
    pendingMutations: PendingMutation[];
}

export function createStore(): Store {
    return {
        kv: new Map(),
        pendingMutations: [],
    }
}

export function get(store: Store, key: string) {
    for (let i = 0; i < store.pendingMutations.length; i++) {
        const mutation = store.pendingMutations.at(store.pendingMutations.length - 1 - i);
        if (mutation && mutation.kvUpdates.has(key)) {
            return mutation.kvUpdates.get(key);
        }
    }
    return store.kv.get(key)?.value;
}


export function has(store: Store, key: string) {
    const value = get(store, key);
    return value !== undefined && value !== null;
}

export function keys(store: Store) {
    const keySet = new Set<string>();
    for (const key of store.kv.keys()) {
        keySet.add(key);
    }
    for (const mutation of store.pendingMutations) {
        mutation.kvUpdates.forEach((_, key) => keySet.add(key));
    }
    for (const key of keySet) {
        if (!has(store, key)) {
            keySet.delete(key);
        }
    }

    return keySet;
}

export function processPatches(store: Store, patch: Patch): Set<string> {
    const changedKeys = new Set<string>();
    if (patch.op === "set") {
        store.kv.set(patch.key, {
            value: patch.value,
            mutation_id: patch.mutationId,
        });
        changedKeys.add(patch.key);
    } else if (patch.op === "del") {
        store.kv.delete(patch.key);
        changedKeys.add(patch.key);
    }
    return changedKeys;
}


