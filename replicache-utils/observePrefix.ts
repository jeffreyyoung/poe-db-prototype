import { ScanArg } from "./createReadTransaction.ts";
import ReplicacheCore from "./createReplicacheCore.ts";
import { JsonValue, ChangeSummary, ScanOptions } from "./replicache-types.ts";


export type ObservePrefixOnChange = (entries: [string, JsonValue][], changes: ChangeSummary) => void;



export function observePrefix(rep: ReplicacheCore, scanArg: ScanArg, onChange: ObservePrefixOnChange) {
    let lastEntries: [string, any][] = [];

    return rep.subscribe(async (tx) => {
        const entries = await tx.scan(scanArg).entries().toArray();
        return entries;
    }, (entries: [string, any][]) => {
        const oldMap = new Map(lastEntries);
        const newMap = new Map(entries);

        const added = entries.filter(([key]) => !oldMap.has(key));
        const removed = lastEntries.filter(([key]) => !newMap.has(key));
        const changed = entries.filter(([key, value]) => oldMap.has(key) && oldMap.get(key) !== value);

        lastEntries = entries;
        onChange(entries, { added, removed, changed });
    });
}