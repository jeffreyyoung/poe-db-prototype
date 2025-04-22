#!/bin/bash

# Get the most recent commit hash
COMMIT_HASH=$(git rev-parse HEAD)

cat << EOF > README.md

# Replicache
~~~~
@gpt-4.1 @app-creator @claude-3.7-sonnet Create a collaborative drawing app. Here are the requirements:
- Use replicache as the source of truth for all synced data. (don't throttle or batch writes)
- Do not reference any global variables in a mutator.  Use rep.subscribeToScanEntries or rep.subscribe to react to changes.
- If there is required initial state, have a mutator like \`async maybeSetupState(tx, args) {   if (!await tx.has("someField")) { tx.set("someField", { started: true })}}`
- Define a presence mutator that might look like this: \`async setPresence(tx, args) { await tx.set("presence/\${args.clientId}", { updatedAt: Date.now(), clientId: args.clientId, cursorPosition: { x: 100, y: 100 }}) }`
- Use await rep.query(tx => tx.clientID) to get a unique identifier for the current client
- When a client first loads the page, assign them a fun unique color and name.
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
      // most apps should indicate the presence of users
      setPresence: async (tx, args) => {
         await tx.set('presence/'+args.clientId, { updatedAt: Date.now(), clientId: args.clientId, cursorPosition: args.cursorPosition})
      },
      // if some apps require common state before beginning, have a `maybeSetup` mutator
      // that is called on page load.  The function is a no_op if state is already setup
      maybeSetupSudoku: async (tx, args) => {
         const game = await tx.get("game");
         if (!game) {
            await tx.set("game", { started: true, boardSize: 81 })
         }
         const boardSize = await tx.get("game")?.boardSize ?? 81;
         const cells = await tx.scan({ prefix: "cells/" }).entries().toArray();
         if (cells.length === boardSize) {
            return;
         }

         const board = generateSudoku(boardSize);
         for (const cell of board) {
            await tx.set("cells/"+cell.key, cell.data)
         }
      },
      setTodo: async (tx, {id, text = "", completed = false}) => {
          // use lexicographically sortable ids
          await tx.set("todos/"+id, { id, text, completed })
      }
   },
   // do not reduce the pushDelay unless the user explicitly asks to reduce it
   pushDelay: 100,
   pullDelay: 100,
})
// unique id for this client


rep.subscribeToScanEntries("presence/", (entries, changes) => {
   const toRemove = [
     ...changes.removed,
     ...entries.filter(entry => !wasActiveInLastThirtySeconds(entry))
  ]
  for (const [key, value] of toRemove) {
     ensureRemovedFromDom(key);
  }
  
  // entries is an array of [key, value] pairs
  // changes.added, changes.removed, and changes.changed are each arrays of [key, value] pairs
  changes.added.filter(wasActiveInLastThirtySeconds).forEach(([key, value]) => {
     addToDom(key, value);
  })
  changes.changed.filter(wasActiveInLastThirtySeconds).forEach(([key, value]) => {
     updateDom(key, value);
  })
})
const clientId = await rep.query(tx => tx.clientID)
rep.mutate.setPresence({ clientId, updatedAt: Date.now(), cursorPosition: { x: 100, y: 100 }})
rep.mutate.addTodo({ id: 123, title: "buy an apple" })
rep.subscribe(async (tx) => {
  // tx is a read only transaction.  .set and .del are not available.
  const todos = await tx.scan({ prefix: "todo/" }).entries().toArray();
  return todos.length;
}, (numTodos) => {
  // update ui
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