import { createReadTransaction } from "./createReadTransaction.ts";
import { Store } from "./Store.ts";
import { Operation } from "./server-types.ts";

export function createWriteTransaction(store: Store) {
  const tx = createReadTransaction(store);
  const writeOperations: Operation[] = [];

  return {
    ...tx,
    set(key: string, value: any) {
      writeOperations.push({ op: "set", key, value });
      return Promise.resolve();
    },
    put(key: string, value: any) {
      writeOperations.push({ op: "set", key, value });
      return Promise.resolve();
    },
    delete(key: string) {
      writeOperations.push({ op: "set", key, value: null });
      return Promise.resolve();
    },
    del(key: string) {
      writeOperations.push({ op: "set", key, value: null });
      return Promise.resolve();
    },
    _writeOperations: writeOperations,
  };
}
