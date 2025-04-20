import ReplicacheCore from "./createReplicacheCore.ts";
import { assertSpyCall, assertSpyCalls, spy } from "@std/testing/mock";
import { sleep } from "./sleep.ts";
import { ObservePrefixOnChange } from "./observePrefix.ts";

export function createSubscriptionSpy(rep: ReplicacheCore, queryFn: Parameters<typeof ReplicacheCore.prototype.query>[0]) {
    const mySpy = spy((res: any) => {
        console.log("subscription result", res)
    })
    rep.subscribe(queryFn, mySpy)
    return {
        async assertCallCount(n: number) {
            await sleep(0);
            assertSpyCalls(mySpy, n)
        },
        async assertLastCallArgs(args: any[]) {
            await sleep(0);
            const lastIndex = mySpy.calls.length - 1
            assertSpyCall(mySpy, lastIndex, {args})
        },
        _spy: mySpy
    }
}


export function createObserverPrefixSpy(rep: ReplicacheCore, prefix: string) {
    const onChangeSpy = spy();

    rep.observeEntries(prefix, onChangeSpy)
    return {
        async assertCallCount(n: number) {
            await sleep(0);
            assertSpyCalls(onChangeSpy, n)
        },
        async assertLastCallArgs(args: Parameters<ObservePrefixOnChange>) {
            await sleep(0);
            const lastIndex = onChangeSpy.calls.length - 1
            assertSpyCall(onChangeSpy, lastIndex, {args})
        },
        _spy: onChangeSpy
    }
}