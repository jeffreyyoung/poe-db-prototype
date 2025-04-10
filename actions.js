let globals = {
  state: null,
  actions: null,
  onChange: null
}

window.Poe.setupState = ({ initialState, actions, onChange }) => {
  globals.state = intialState;
  globals.actions = actions;
  globals.onChange = onChange;
}

window.Poe.action = (actionName, payload) => {
  if (!globals.actions[actionName]) {
    throw new Error("Action not defined: "+actionName)
  }
  globals.actions[actionName](payload, globals.state)
  globals.onChange(globals.state)
}

```
Example for LLMs:

window.Poe.setupState({
   initialState: { todos: [] },
   actions: {
     addTodo: (todo, curState) => {
        curState.todos.push(todo)
     }
   },
   onChange(state => {
      // implemented by us
      updateUI(state)
   })
})

window.Poe.action("addTodo", { text: "my todo", id: Math.random() })
```
