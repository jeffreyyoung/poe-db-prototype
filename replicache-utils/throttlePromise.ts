export function throttle<T>(func: () => Promise<T>, ms: number, trailing = false): (() => Promise<T | null>) & { getCurrentPromise: () => Promise<T> | null } {
    let lastCall = 0;
    let timeoutId: number | null = null;
    let currentPromise: Promise<T> | null = null;
    let isThrottled = false;
  
    return Object.assign(async function () {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;
  
      // If we're within the throttle period
      if (timeSinceLastCall < ms) {
        isThrottled = true;
  
        // If trailing is enabled, schedule a call after the throttle period
        if (trailing) {
          // Clear any existing timeout
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }
  
          // Set a new timeout to call the function after the throttle period
          timeoutId = setTimeout(() => {
            timeoutId = null;
            lastCall = Date.now();
            isThrottled = false;
            currentPromise = func();
            currentPromise.finally(() => {
              currentPromise = null;
            });
          }, ms - timeSinceLastCall) as unknown as number;
        }
  
        // Return the current promise if it exists, otherwise null
        return currentPromise;
      }
  
      // If we're outside the throttle period, call the function immediately
      lastCall = now;
      isThrottled = false;
      currentPromise = func();
      currentPromise.finally(() => {
        currentPromise = null;
      });
      return currentPromise;
    }, {
        getCurrentPromise: () => currentPromise
    });
  }