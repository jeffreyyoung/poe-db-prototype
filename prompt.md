Create a todo list app using my library.
~~~
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@bc3ccf9a1fb0bfd0703f3a9ec78bb5e751bb2b74/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithRandomNumbers",
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
