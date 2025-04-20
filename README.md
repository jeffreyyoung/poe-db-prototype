
# Replicache
~~~~
Create a collaborative drawing app.  Show each user's cursor as it moves around the screen.
~~~
<script type="module">
// the replicache library should be imported as a esmodule
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@c3eb866bb44369aead4cc8d83c5928970344acab/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithHardCodedNumbers", // some common spaceID's are occupied, so add some numbers to make it unique
   mutators: {
    addTodo: async (tx, { title, id }) => {
      await tx.set(`todo/${id}`, { id, title, completed: false })
    }
   },
   // do not reduce the pushDelay unless the user explicitly asks to reduce it
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


// special new api
// I recommend using observeEntries to render the ui
rep.observeEntries("todo/", (entries, changes) => {
   // entries is an array of [key, value] pairs
   // changes.added, changes.removed, and changes.changed are each arrays of [key, value] pairs
   changes.added.forEach(([key, value]) => {
      addToDom(key, value);
   })
   changes.changed.forEach(([key, value]) => {
      addOrUpdateDom(key, value)
   })
   changes.removed.forEach(([key, value]) => {
      removeFromDom(key)
   })
})
~~~
~~~~

# State reducer library with state broadcasting

~~~~
Create a todo list app using this library.
~~~
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@c3eb866bb44369aead4cc8d83c5928970344acab/synced-state.js"


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
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@c3eb866bb44369aead4cc8d83c5928970344acab/actions.js"


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
