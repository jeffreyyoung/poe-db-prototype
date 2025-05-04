import { Deferred } from "./network/Deferred.ts";
import { sleep } from "./sleep.ts";

type ThrottledPromiseFn<T> = (() => Promise<T | null>) & { getCurrentPromise: () => Promise<T> | null }

export function throttle<T>(func: () => Promise<T>, ms: number): ThrottledPromiseFn<T> {
    let currentPromise: Promise<T> | null = null;
    let throttledCount = 0;
    return Object.assign(async function () {
      if (!currentPromise) {
        currentPromise = func();
        return currentPromise;
      }
      
      if (throttledCount > 0) {
        return currentPromise;
      }

      throttledCount++;
      currentPromise = currentPromise.finally(() => sleep(ms)).then(() => {
        throttledCount = 0;
        return func();
      });

      return currentPromise;
    }, {
        getCurrentPromise: () => currentPromise
    });
  }

export function throttleAllowConcurrency<T>(func: () => Promise<T>, ms: number): ThrottledPromiseFn<T> {
  let timeoutId: number | null = null;
  const calls: Deferred<T>[] = [];
  function flush() {
    timeoutId = null;
    const promises: Deferred<T>[] = [];
    while (calls.length > 0) {
      promises.push(calls.pop()!);
    }
    func().then((result) => {
      for (const promise of promises) {
        promise.resolve(result);  
      }
    }).catch((error) => {
      console.error("throttle", "Error in throttled function", error);
      for (const promise of promises) {
        promise.reject(error);
      } 
    });
  }

  return Object.assign(function() {
    const deferred = new Deferred<T>();
    calls.push(deferred);
    if (!timeoutId) {
      timeoutId = setTimeout(flush, ms);
    }

    return deferred.promise;
  }, {
    getCurrentPromise: () => calls.at(-1)?.promise ?? null
  });
}