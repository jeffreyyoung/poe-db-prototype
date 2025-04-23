// redux.ts
import Ably from "https://esm.sh/ably";
function createStore(reducer) {
  const hash = reducer.toString();
  const ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");
  const channel = ably.channels.get(hash);
  let state;
  const listeners = /* @__PURE__ */ new Set();
  channel.subscribe("action", (message) => {
    state = reducer(state, message.data);
    listeners.forEach((listener) => listener(state));
  });
  return {
    getState: () => state,
    dispatch: (action) => {
      state = reducer(state, action);
      channel.publish("action", action);
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
export {
  createStore
};
