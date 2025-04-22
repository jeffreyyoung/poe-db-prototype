export type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue | null };


export type ScanOptions = {
    prefix?: string,
    limit?: number
    start?: { key: string, exclusive?: boolean }
} | string;

export type AsyncIteratorWithToArray<T> = AsyncIterator<T> & { toArray: () => Promise<T[]> }

export type ScanResult<Key, Value> = {
    [Symbol.asyncIterator]: AsyncIteratorWithToArray<Value>,
    values: () => AsyncIteratorWithToArray<Value>,
    keys: () => AsyncIteratorWithToArray<Key>,
    entries: () => AsyncIteratorWithToArray<[Key, Value]>,
}

export type ReadTransaction = {
    clientID: string;
    isEmpty: () => Promise<boolean>;
    get: (key: string) => Promise<JsonValue>;
    has: (key: string) => Promise<boolean>;
    scan: (options: ScanOptions) => ScanResult<string, JsonValue>;
}

export type WriteTransaction = {
    set: (key: string, value: JsonValue) => Promise<void>;
    del: (key: string) => Promise<void>;
} & ReadTransaction;

export type ChangeSummary = {
    added: [string, JsonValue][];
    removed: [string, JsonValue][];
    changed: [string, JsonValue][];
}

export type UnsubscribeFn = () => void;

export type ReplicacheOptions<Mutators extends Record<string, (tx: WriteTransaction, args: any) => Promise<any>>> = {
    mutators: Mutators;
}

export declare class Replicache<Mutators extends Record<string, (tx: WriteTransaction, args: any) => Promise<any>>> {

    constructor(options: ReplicacheOptions<Mutators>)

    query: <T>(query: (tx: ReadTransaction) => Promise<T>) => Promise<T>;
    subscribe: <T>(query: (tx: ReadTransaction) => Promise<T>, onChange: (result: T) => void) => UnsubscribeFn;
    subscribeToScanEntries: (scanOptions: ScanOptions | string, onChange: (entries: [string, JsonValue][], changes: ChangeSummary) => void) => UnsubscribeFn;
    mutate: {
        [K in keyof Mutators]: (args: Parameters<Mutators[K]>[1]) => Promise<ReturnType<Mutators[K]>>
    }
}