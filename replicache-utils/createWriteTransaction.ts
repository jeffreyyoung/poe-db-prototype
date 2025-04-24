import { createReadTransaction, MapLike } from "./createReadTransaction.ts";
import { Operation } from "./server-types.ts";
import { JsonValue } from "./replicache-types.ts";

export function createWriteTransaction(mapLike: MapLike<string, JsonValue>, clientID: string) {
  const tx = createReadTransaction(mapLike, clientID);
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
