type MutatorResult =
  | {
      result: "success";
      changedEntries: [string, any][];
    }
  | {
      result: "error";
      error: string;
    };

export async function runMutator(options: {
  mutatorName: string;
  args: any;
  serializedMutatorFnString: string;
  databaseEntries: [string, any][];
}) {
  try {
    const code = `
        const __db = new Map(${JSON.stringify(options.databaseEntries)})
        const __mutator = ${options.serializedMutatorFnString}
        const __changedKeys = new Set();
        const __tx = {
            get: async (key) => {
                return __db.get(key)
            },
            set: async (key, value) => {
                __db.set(key, value)
                __changedKeys.add(key)
            },
            delete: async (key) => {
                __db.delete(key)
                __changedKeys.add(key)
            },
        }

        const __result = __mutator.invoke(__tx, ${JSON.stringify(options.args)})
        __result.then(__result => Array.from(__changedKeys).map(__key => [__key, __db.get(__key)]))`;
    console.log(code);

    const changedEntries = await eval(code);
    console.log("changedEntries!!!", changedEntries);
    return { result: "success", changedEntries };
  } catch (error) {
    let message = "unknown error";
    if (error instanceof Error) {
      message = error.message;
      console.error("error running mutator", error);
    }
    return { result: "error", error: message };
  }
}
