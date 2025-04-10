# poe-db-prototype

### actions prompt

```
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@bc7c74a02d6a5e38069ba20dcf286f986ff714ee/actions.js"


setup({
   initialState: { todos: [] },
   actions: {
      addTodo(payload, state) {
          state.todos.push(payload)
      }
   },
   onChange(curState) {
       // update ui
   }
})

action("addTodo", { text: "buy an apple" })
```

### yjs
