import { hashMutators } from "./replicache-utils/hash.ts";
import { ChangeSummary, JsonValue, WriteTransaction } from "./replicache-utils/replicache-types.ts";
import { Replicache } from "./replicache.ts";
import type { SyncedMap as ISyncedMap, OffFunction, SyncedMapArgs, WriteableMap } from "./SyncedMap-types.ts";


function createWriteableMap(clientId: string): [WriteableMap, Map<string, ["delete" | "set", JsonValue]>] {
    const changeMap = new Map<string, ["delete" | "set", JsonValue]>();
    // @ts-ignore
    const map: WriteableMap = new Map<string, JsonValue>();
    map.clientId = clientId;
    const originalSet = map.set;
    // watch all calls to set
    map.set = (key: string, value: JsonValue) => {
        changeMap.set(key, ["set", value]);
        originalSet.call(map, key, value);
        return map;
    }
    
    const originalDelete = map.delete;
    map.delete = (key: string) => {
        const didDelete = map.has(key);
        changeMap.set(key, ["delete", ""]);
        originalDelete.call(map, key);
        return didDelete;
    }

    map.clear = () => {
        for (const key of map.keys()) {
            map.delete(key);
        }
    }

    return [map, changeMap];
}

export class SyncedMap implements ISyncedMap {
    private _isReady = false;
    private readonly data: Map<string, JsonValue>
    private readonly replicache: Replicache;

    constructor(
        private readonly options: SyncedMapArgs
    ) {

        this.data = new Map<string, JsonValue>();

        const hash = hashMutators(options.mutators);
        
        this.replicache = new Replicache({
            spaceID: hash,
            mutators: {
                change: async (tx: WriteTransaction, args: { changes: Record<string, ["delete" | "set", JsonValue]>}) => {
                    for (const [key, [op, value]] of Object.entries(args.changes)) {
                        if (op === "delete") {
                            await tx.del(key);
                        } else {
                            await tx.set(key, value);
                        }
                    }
                }
            },
        })

        this.replicache.subscribeToScanEntries("", (entries) => {
            // @ts-ignore
            this.data = new Map(entries);
            this._isReady = true;
        })
    }

    onChange(
        callback: (db: Map<string, JsonValue>, changes: ChangeSummary) => void
    ) {

        return this.replicache.subscribeToScanEntries("", (entries, changes) => {
            // @ts-ignore
            const data = new Map(entries);
            callback(data, changes);
        })
    }

    mutate(name: string, arg: any) {
        const mutator = this.options.mutators[name];
        if (!mutator) {
            throw new Error(`Mutator ${name} not found`);
        }
        const [writeableMap, changeMap] = createWriteableMap(this.replicache.clientID);
        const result = mutator(writeableMap, arg);
        // @ts-ignore
        this.replicache.mutate.change(changeMap);
        return result;
    }


    isReady(): boolean {
        return this._isReady;
    }

    has(key: string): boolean {
        return this.data.has(key);
    }

    watch(key: string, callback: (value: JsonValue | undefined) => void): OffFunction {
        return this.replicache.subscribe((tx) => {
            const value = tx.get(key);
            return value;
        }, (value) => {
            callback(value);
        })

    }

    scanWatch(prefix: string, callback: (entries: [string, JsonValue][], changes: ChangeSummary) => void): OffFunction {
        return this.replicache.subscribeToScanEntries(prefix, (entries, changes) => {
            callback(entries, changes);
        });
    }

    get(key: string): JsonValue | undefined {
        return this.data.get(key);
    }
}