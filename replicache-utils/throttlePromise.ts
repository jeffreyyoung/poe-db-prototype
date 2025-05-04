import { sleep } from "./sleep.ts";

export function throttle<T>(func: () => Promise<T>, ms: number): (() => Promise<T | null>) & { getCurrentPromise: () => Promise<T> | null } {
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
      currentPromise = currentPromise.finally(() => sleep(ms)).finally(() => {
        throttledCount = 0;
        return func();
      });

      return currentPromise;
    }, {
        getCurrentPromise: () => currentPromise
    });
  }