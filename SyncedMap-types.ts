import { ChangeSummary, JsonValue } from "./replicache-utils/replicache-types.ts";

export type OffFunction = () => void;


export type WriteableMap = Map<string, JsonValue> & {
    clientId: string;
}

export type SyncedMapArgs = {
    mutators: {
        [key: string]: (WriteableMap: Map<string, JsonValue>, arg: JsonValue) => void
    }
}

export declare class SyncedMap {
    constructor(
        args: SyncedMapArgs
    )

    onChange(
        callback: (db: Map<string, JsonValue>, changes: ChangeSummary) => void
    ): OffFunction;

    /**
     * Returns true if the state has been initialized
     */
    isReady(): boolean;

    /**
     * Watch a specific key for changes
     */
    watch(
        key: string,
        callback: (value: JsonValue | undefined) => void
    ): OffFunction;

    /**
     * Watch all keys that match a prefix
     */
    scanWatch(
        prefix: string,
        callback: (entries: [string, JsonValue][], changes: ChangeSummary) => void
    ): OffFunction;

    /**
     * Get the value of a specific key
     */
    get(key: string): JsonValue | undefined;

    /**
     * Returns true if the key exists
     */
    has(key: string): boolean;
}