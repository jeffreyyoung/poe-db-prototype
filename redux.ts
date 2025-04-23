import Ably from "https://esm.sh/ably";
type Reducer<T> = (state: T, action: any) => T;
type Listener<T> = (state: T) => void;


export function createStore<T>(reducer: Reducer<T>) {
    const hash = reducer.toString();
    const ably = new Ably.Realtime("frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM");
    const channel = ably.channels.get(hash);
    let state: T;
    const listeners = new Set<Listener<T>>();
    channel.subscribe("action", (message) => {
        state = reducer(state, message.data);
        listeners.forEach((listener) => listener(state));
    });
    return {
        getState: () => state,
        dispatch: (action: any) => {
            state = reducer(state, action);
            channel.publish("action", action);
            listeners.forEach((listener) => listener(state));
        },
        subscribe: (listener: (state: T) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    }
}