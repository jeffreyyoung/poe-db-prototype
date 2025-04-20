#!/bin/bash

# Get the most recent commit hash
COMMIT_HASH=$(git rev-parse HEAD)

cat << EOF > README.md

# Replicache
~~~~
Create a collaborative drawing app.  Show each user's cursor as it moves around the screen.
~~~
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@${COMMIT_HASH}/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithHardCodedNumbers", // some common spaceID's are occupied, so add some numbers to make it unique
   mutators: {
    addTodo: async (tx, { title, id }) => {
      await tx.set(\`todo/\${id}\`, { id, title, completed: false })
    }
   },
   pushDelay: 100,
   pullDelay: 100,
})

const randId = () => Date.now()+Math.floor(Math.random()*1000000)
rep.mutate.addTodo({ title: "buy an apple", id: randId() })

rep.subscribe(async (tx) => {
  // tx is a read only transaction.  .set and .del are not available.
  const todos = await tx.scan({ prefix: "todo/" }).entries().toArray();
  return todos;
}, (todos) => {
  console.log(todos); // todos is an array of [key, value] pairs
})

const todo = await rep.query(tx => tx.get("todo/123"))
~~~
~~~~

# State reducer library with state broadcasting

~~~~
Create a todo list app using this library.
~~~
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@${COMMIT_HASH}/synced-state.js"


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
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@${COMMIT_HASH}/actions.js"


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
EOF