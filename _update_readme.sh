#!/bin/bash

# Get the most recent commit hash
COMMIT_HASH=$(git rev-parse HEAD)

cat << EOF > README.md

# Replicache
~~~~
@gpt-4.1 @app-creator @claude-3.7-sonnet Create a collaborative drawing app. Here are the requirements:
- Use replicache as the source of truth for all synced data. (don't throttle or batch writes)
- If a user is drawing, or typing, write each change to replicache. Ex: call rep.mutate.updateTodo({ id, text }) each time the user types a character or rep.mutate.addPointToLine({ id, point }) each time the user draws a point
- Show each user's cursor as it moves around the screen.
- Use await rep.getClientId() to get a unique identifier for the current client
- When a user first loads the page, assign them a fun unique color and name.
- Avoid global variables and generally avoid storing state outside of replicache. 
- Use rep.subscribeToScanEntries to update the UI with added, removed, and changed entries
- Avoid rewriting entire html elements, instead update the contents of the element.
- DO NOT USE LOCALSTORAGE or any persistence api. You are in a sandboxed iframe. Replicache handles persistence

This is some example usage of the replicache library.
~~~
<html>
<script type="module">
// the replicache library should be imported as a esmodule
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@${COMMIT_HASH}/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithHardCodedNumbers", // some common spaceID's are occupied, so add some numbers to make it unique
   mutators: {
    createTodo: async (tx, { title, id }) => {
      await tx.set(\`todo/\${id}\`, { id, title, completed: false })
    },
    deleteTodo: async (tx, { id }) => {
      await tx.del(\`todo/\${id}\`)
    },
    updateTodoTitle: async (tx, { id, title }) => {
      const todo = await tx.get(\`todo/\${id}\`)
      if (!todo) {
         return;
      }
      await tx.set(\`todo/\${id}\`, { ...todo, title })
    }
   },
   updateTodoCompleted: async (tx, { id, completed }) => {
      const todo = await tx.get(\`todo/\${id}\`)
      if (!todo) {
         return;
      }
      await tx.set(\`todo/\${id}\`, { ...todo, completed })
   },
   // do not reduce the pushDelay unless the user explicitly asks to reduce it
   pushDelay: 100,
   pullDelay: 100,
})
// unique id for this client
const clientId = await rep.getClientId()
const randId = () => Date.now()+Math.floor(Math.random()*1000000)
rep.subscribeToScanEntries("todo/", (entries, changes) => {
  // entries is an array of [key, value] pairs
  // changes.added, changes.removed, and changes.changed are each arrays of [key, value] pairs
  changes.added.forEach(([key, value]) => {
     addToDom(key, value);
  })
  changes.changed.forEach(([key, value]) => {
     updateDom(key, value);
  })
  changes.removed.forEach(([key, value]) => {
     removeFromDom(key);
  })
})
rep.mutate.createTodo({ title: "buy an apple", id: randId() })

rep.subscribe(async (tx) => {
  // tx is a read only transaction.  .set and .del are not available.
  const todos = await tx.scan({ prefix: "todo/" }).entries().toArray();
  return todos.length;
}, (numTodos) => {
  console.log(numTodos); // numTodos is the number of todos
})

const todo = await rep.query(tx => tx.get("todo/123"))
</script>
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
</script>
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