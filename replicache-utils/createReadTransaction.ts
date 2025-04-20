import { isEmpty } from "https://cdn.jsdelivr.net/npm/lib0@0.2.99/object/+esm";
import { Store, get, has, keys as getKeysSet } from "./Store.ts";



export function createReadTransaction(store: Store) {
    const _readKeys = new Set<string>();
    const _scannedKeys = new Set<string>();
    const readValue = (key: string) => {
        _readKeys.add(key);
        return get(store, key);
    }

    return {
        _readKeys,
        _scannedKeys,
        get(key: string) {
            return Promise.resolve(readValue(key));
        },
        has(key: string) {
            _readKeys.add(key);
            return Promise.resolve(has(store, key));
        },
        isEmpty() {
            const keySet = getKeysSet(store);
            return Promise.resolve(keySet.size === 0);
        },
        size() {
            const keySet = getKeysSet(store);
            return Promise.resolve(keySet.size);
        },
        scan({ from, to, prefix, limit }: { from?: string, to?: string, prefix?: string, limit?: number }) {
            const keySet = getKeysSet(store);
            let keys = Array.from(keySet).sort();
            console.log("all keys!", keys)
            if (prefix) {
                keys = keys.filter((key) => key.startsWith(prefix));
                console.log("filtered keys", keys, prefix)
            }
            if (from) {
                keys = keys.slice(keys.indexOf(from));
            }
            if (to) {
                keys = keys.slice(0, keys.indexOf(to));
            }
            if (limit) {
                keys = keys.slice(0, limit);
            }
            console.log("scanning keys", keys)
            const getNthKey = (index: number) => {
                _scannedKeys.add(keys[index]);
                console.log("scanned key", keys[index])
                return keys[index];
            }
            
            return {
                keys: () => addToArrayMethod(keyAsyncIterable(getNthKey, keys.length)),
                values: () => addToArrayMethod(mapAsyncIterator(keyAsyncIterable(getNthKey, keys.length), readValue)),
                [Symbol.asyncIterator]() {
                    return mapAsyncIterator(keyAsyncIterable(getNthKey, keys.length), readValue);
                }
            }
        }
    }
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

function addToArrayMethod(asyncIterable: AsyncIterable<any>): AsyncIterable<any> & { toArray: () => Promise<any[]> } {
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