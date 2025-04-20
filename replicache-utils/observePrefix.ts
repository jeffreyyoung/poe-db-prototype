import ReplicacheCore from "./createReplicacheCore.ts";

type ChangeSummary = {
    added: [string, any][],
    removed: [string, any][],
    changed: [string, any][]
};
export type ObservePrefixOnChange = (entries: [string, any][], changes: ChangeSummary) => void;

export function observePrefix(rep: ReplicacheCore, prefix: string, onChange: ObservePrefixOnChange) {
    let lastEntries: [string, any][] = [];

    return rep.subscribe(async (tx) => {
        const entries = await tx.scan({ prefix }).entries().toArray();
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