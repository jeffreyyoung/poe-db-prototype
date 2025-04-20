import ReplicacheCore from "./createReplicacheCore.ts";
import { assertSpyCall, assertSpyCalls, spy } from "@std/testing/mock";
import { sleep } from "./sleep.ts";

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