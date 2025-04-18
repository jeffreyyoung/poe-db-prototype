Create a todo list app using my library.
~~~
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@bd8f934820d50e0bd0bc9541e2c96883b05e1165/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithRandomNumbers", // all users of this app will share the same spaceID.  spaceID should be unique for each app.
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
