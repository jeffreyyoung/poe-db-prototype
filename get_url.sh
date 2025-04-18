#!/bin/bash

# Get the most recent commit hash
COMMIT_HASH=$(git rev-parse HEAD)

cat << EOF > prompt.md
Create a todo list app using my library.
~~~
import { Replicache } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@${COMMIT_HASH}/replicache.js"

const rep = new Replicache({
   spaceID: "appNameWithHardCodedNumbers", // some common spaceID's are occupied, so add some numbers to make it unique
   mutators: {
    addTodo: async (tx, { title, id }) => {
      await tx.set(\`todo/\${id}\`, { id, title, completed: false })
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
EOF