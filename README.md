# poe-db-prototype

### action_log

https://poe.com/s/6ztrjgOtuxU1TrGorFAL

```
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a85cb9673073d53ea3f12f9a429db1b7f4f3648a/actions.js"


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

https://poe.com/s/5pWL906Csmb3rYTNxYR6

```
import { ydoc } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a85cb9673073d53ea3f12f9a429db1b7f4f3648a/yjs.js"

// ydoc is a yjs doc
// do not setup any providers or persistence.  It is already setup behind the scenes.
// mutate the doc like a regular yjs doc
// implement your own updateUI function
y.observe(updateUI)
```

### how I generate the jsdelivr urls
- go to the js file https://github.com/jeffreyyoung/poe-db-prototype/blob/main/actions.js
- click copy permalink
- go to https://www.jsdelivr.com/github
- paste permalink and copy jsdelivr url

<img width="412" alt="image" src="https://github.com/user-attachments/assets/378b71a5-4be0-4dfa-960c-1b3ae95881bd" />
 
