import type { ReadTransaction, ScanOptions } from "./replicache-types.ts";
import type { JsonValue } from "./replicache-types.ts";
type ScanObjectArg = ScanOptions;
export type ScanArg = ScanObjectArg

export function scanArgToObject(arg: ScanArg): Exclude<ScanObjectArg, string> {
    if (typeof arg === "string") {
        return { prefix: arg }
    }
    return arg
}

type ReadTransactionWithKeys = ReadTransaction & { _readKeys: Set<string>, _scannedKeys: Set<string> }

export type MapLike<K, V> = {
    get: (key: K) => V | null;
    has: (key: K) => boolean;
    allKeys: () => Set<K>;
    set: (key: K, value: V) => void;
    delete: (key: K) => void;
    __overrides: Map<K, { type: "set" | "del", value: V | null }>;
}



export function createReadTransaction(mapLike: MapLike<string, JsonValue>, clientID: string ): ReadTransactionWithKeys {
    const _readKeys = new Set<string>();
    const _scannedKeys = new Set<string>();
    const readValue = (key: string) => {
        _readKeys.add(key);
        return mapLike.get(key);
    }

    const tx: ReadTransactionWithKeys = {
        clientID,
        isServer: false,
        _readKeys,
        _scannedKeys,
        get(key: string) {
            return Promise.resolve(readValue(key));
        },
        has(key: string) {
            _readKeys.add(key);
            return Promise.resolve(mapLike.has(key));
        },
        isEmpty() {
            const keySet = mapLike.allKeys();
            return Promise.resolve(keySet.size === 0);
        },
        scan(arg: ScanArg) {
            const { start,prefix, limit } = scanArgToObject(arg);
            const keySet = mapLike.allKeys();
            let keys = Array.from(keySet).sort();
            if (prefix) {
                keys = keys.filter((key) => key.startsWith(prefix));
            }
            
            if (start) {
                keys = handleStart(keys, start);
            }

            if (limit) {
                keys = keys.slice(0, limit);
            }
            
            const getNthKey = (index: number) => {
                _scannedKeys.add(keys[index]);
                return keys[index];
            }
            async function getEntry(key: string) {
                return [key, await readValue(key)]
            }
            
            return {
                keys: () => withToArray(keyAsyncIterable(getNthKey, keys.length)),
                values: () => withToArray(mapAsyncIterator(keyAsyncIterable(getNthKey, keys.length), readValue)),
                entries: () => withToArray(mapAsyncIterator(keyAsyncIterable(getNthKey, keys.length), getEntry)),
                [Symbol.asyncIterator]() {
                    return mapAsyncIterator(keyAsyncIterable(getNthKey, keys.length), readValue);
                }
            } as any;
        }
    }
    return tx;
}

function handleStart(keys: string[], start: Exclude<ScanOptions, string>["start"]) {
    if (!start) {
        return keys;
    }
    let startIndex = keys.indexOf(start.key);
    if (startIndex === -1) {
        return keys;
    }
    if (start.exclusive) {
        return keys.slice(startIndex + 1);
    }
    return keys.slice(startIndex);
}

function keyAsyncIterable(getNthKey: (index: number) => string, totalKeys: number) {
    return {
        [Symbol.asyncIterator]() {
            let index = 0;
            return {
                next: async () => {
                    if (index < totalKeys) {
                        const key = getNthKey(index);
                        index++;
                        return { value: key, done: false };
                    }
                    return { value: undefined, done: true };
                }
            }
        },
    }
}

function withToArray(asyncIterable: AsyncIterable<any>): AsyncIterable<any> & { toArray: () => Promise<any[]> } {
    // @ts-ignore
    asyncIterable.toArray = async () => {
        const results = [];
        for await (const result of asyncIterable) {
            results.push(result);
        }
        return results;
    }
    // @ts-ignore
    return asyncIterable;
}


async function* mapAsyncIterator(asyncIterator: AsyncIterable<any>, mapFn: (value: any) => any) {
    for await (const value of asyncIterator) {
        yield mapFn(value);
    }
}