
# Replicache
~~~~
Create a todo list app using my library.
~~~
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a1c571726ff9f06fb953a6df091293e107b11e35/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithHardCodedNumbers", // some common spaceID's are occupied, so add some numbers to make it unique
   mutators: {
    addTodo: async (tx, { title, id }) => {
      await tx.set(`todo/${id}`, { id, title, completed: false })
    }
   }
})


rep.subscribe(async (tx) => {
  const todos = await tx.scan({ prefix: "todo/" }).values().toArray();
  return todos;
}, (todos) => {
  console.log(todos);
})
~~~
~~~~

# Replicache 2
~~~~
Create a todo list app using this library.
~~~
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a1c571726ff9f06fb953a6df091293e107b11e35/replicache2.js"

const rep = new Replicache({
   spaceID: "appNameWithHardCodedNumbers", // some common spaceID's are occupied, so add some numbers to make it unique
   mutators: {
    addTodo: async (tx, { title, id }) => {
      await tx.set(`todo/${id}`, { id, title, completed: false })
    }
   }
})


rep.subscribe(async (tx) => {
  const todos = await tx.scan({ prefix: "todo/" }).values().toArray();
  return todos;
}, (todos) => {
  console.log(todos);
})
~~~
~~~~

# State reducer library with state broadcasting

~~~~
Create a todo list app using this library.
~~~
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a1c571726ff9f06fb953a6df091293e107b11e35/synced-state.js"


setup({
   initialState: { todos: [] },
   actions: {
      addTodo(payload, state) {
          state.todos.push(payload)
      }
   },
   onChange(curState) {
       // update ui
   },
   channelName: "unique-hardcoded-id-for-this-application"
})

action("addTodo", { text: "buy an apple" })
~~~
~~~~


# State reducer library

~~~~
Create a todo list app using this library.
~~~
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a1c571726ff9f06fb953a6df091293e107b11e35/actions.js"


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
~~~
~~~~

# yJS library

~~~~
Create a todo list app using this library.
~~~
import { ydoc } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a85cb9673073d53ea3f12f9a429db1b7f4f3648a/yjs.js"

// ydoc is a yjs doc
// do not setup any providers or persistence.  It is already setup behind the scenes.
// mutate the doc like a regular yjs doc
// implement your own updateUI function
ydoc.observe(updateUI)
~~~
~~~~
