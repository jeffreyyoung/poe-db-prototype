General rules
- Never use local storage. They are not enabled in this environment.
- Use a <script type="module"> tag to define logic

Guidelines for using replicache
- Never access global variables inside a mutator
- Use rep.subscribe or rep.subscribeToScanEntries to subscribe to changes and update the DOM
- Use the entry `key` to identify existing dom nodes.  Always update the existing DOM nodes if one exists.  If not create a new dom node.


Replicache typescript types

```
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
```


Examples

<example_todo_app_logic>
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@b4af8a9f215df026d1f6471cf99c6b4845ba7bcd/replicache.js"

const rep = new Replicache({
   pushDelay: 100,
   pullDelay: 100,
   mutators: {
      createTodo: async (tx, { text, id }) => {
         await tx.set(`todos/${id}`, { id, text, completed: false })
      },
      updateTodoText: async (tx, { id, text }) => {
         const todo = await tx.get(`todos/${id}`)
         await tx.set(`todos/${id}`, { ...todo, text })
      },
      updateTodoCompleted: async (tx, { id, completed }) => {
         const todo = await tx.get(`todos/${id}`)
         await tx.set(`todos/${id}`, { ...todo, completed })
      },
      deleteTodo: async (tx, { id }) => {
         await tx.del(`todos/${id}`)
      },
   }
})

rep.subscribe(async (tx) => {
   const entries = await tx.scan({ prefix: "todos/"}).entries().toArray();
   const count = entries.length;
   return count;
}, (count) => {
   renderTodoCount(count);
})

rep.subscribeToScanEntries("todos/", (entries, changes) => {
   for (const [index, [key, value]] of changes.added.entries()) {
      const previousKey = changes.added.get(index - 1)?.[0]
      addTodoToDom(key, value, previousKey)
   }
   for (const [key, value] of changes.changed) { // this key was in the previous state, but the value has changed
      updateTodoInDom(key, value)
   }
   for (const [key, value] of changes.removed) {
      removeTodoFromDom(key)
   }
})
</example_todo_app_logic>

<example_painting_app_logic>
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@b4af8a9f215df026d1f6471cf99c6b4845ba7bcd/replicache.js"

const rep = new Replicache({
   pushDelay: 100,
   pullDelay: 100,
   mutators: {
      addPointToStroke: async (tx, { strokeID, point, color }) => {
         const stroke = (await tx.get(`strokes/${strokeID}`)) || { points: [], color }
         await tx.set(`strokes/${strokeID}`, { ...stroke, color, points: [...stroke.points, point] })
      },
      updateCursor: async (tx, { x, y, color, name, updatedAt }) => {
         await tx.set(`cursors/${tx.clientID}`, { x, y, clientID: tx.clientID, color, name, updatedAt })
      },
      deleteCursor: async (tx, { cursorKey }) => {
         await tx.del(cursorKey)
      }
   }
})


rep.subscribeToScanEntries("cursors/", (entries, changes) => {
   for (let i = 0; i < changes.added.length; i++) {
      const [key, value] = changes.added.at(i)
      const previousKey = changes.added.at(i - 1)?.[0]
      addCursorToDom(key, value, previousKey)
   }
   for (const [key, value] of changes.changed) {
      updateCursorInDom(key, value)
   }
   for (const [key, value] of changes.removed) {
      removeCursorFromDom(key)
   }
});

rep.subscribeToScanEntries("strokes/", (entries, changes) => {
   for (let i = 0; i < changes.added.length; i++) {
      const [key, value] = changes.added.at(i)
      const previousKey = changes.added.at(i - 1)?.[0]
      addStrokeToDom(key, value, previousKey)
   }
   for (const [key, value] of changes.changed) {
      updateStrokeInDom(key, value)
   }
   for (const [key, value] of changes.removed) {
      removeStrokeFromDom(key)
   }
});


await rep.mutate.addPointToStroke({ strokeID: "1", point: { x: 10, y: 10 }, color: "red" })


async function removeInactiveCursors() {
   const keysToDelete = await rep.query(tx => {
      const entries = tx.scan({ prefix: "cursors/"}).entries().toArray();
      const keysToDelete = [];
      for (const [key, value] of entries) {
         if (Date.now() - value.updatedAt > 5000) {
            keysToDelete.push(key)
         }
      }
      return keysToDelete;
   })
   for (const cursorKey of keysToDelete) {
      await rep.mutate.deleteCursor({ cursorKey })
   }
}

setInterval(removeInactiveCursors, 30_000)

</example_painting_app_logic>