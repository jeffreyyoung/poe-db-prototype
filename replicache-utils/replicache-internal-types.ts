import { ReadTransaction } from "./replicache-types.ts";

export type ReadTransactionWithKeys = ReadTransaction & { _readKeys: Set<string>, _scannedKeys: Set<string> }