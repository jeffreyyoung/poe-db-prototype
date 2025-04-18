export function throttle<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  waitMs: number
): (...args: Args) => Promise<R> {
  let timeoutId: number | null = null;
  let lastRun = 0;
  let pending: {
    args: Args;
    resolve: (value: R) => void;
    reject: (reason?: unknown) => void;
  } | null = null;
  let inProgress = false;

  return async (...args: Args) => {
    // If there's an execution in progress, store this call for later
    if (inProgress) {
      return new Promise<R>((resolve, reject) => {
        pending = { args, resolve, reject };
      });
    }

    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    // If we're within the throttle window
    if (timeSinceLastRun < waitMs) {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set up the trailing call
      return new Promise<R>((resolve, reject) => {
        pending = { args, resolve, reject };
        timeoutId = setTimeout(() => executeFunction(), waitMs - timeSinceLastRun);
      });
    }

    // If we're outside the throttle window, execute immediately
    return executeFunction();

    async function executeFunction() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // Get the arguments to use (either from pending or current call)
      const execArgs = pending?.args || args;
      const execResolve = pending?.resolve;
      const execReject = pending?.reject;
      pending = null;

      try {
        inProgress = true;
        const result = await fn(...execArgs);
        lastRun = Date.now();
        
        if (execResolve) {
          execResolve(result);
        }
        return result;
      } catch (error) {
        if (execReject) {
          execReject(error);
        }
        throw error;
      } finally {
        inProgress = false;
        
        // If there's a pending call, execute it after the throttle window
        if (pending) {
          timeoutId = setTimeout(() => executeFunction(), waitMs);
        }
      }
    }
  };
}
