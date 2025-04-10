let globals = {
  state: null,
  actions: null,
  onChange: null
}

export const setupState = ({ initialState, actions, onChange }) => {
  globals.state = intialState;
  globals.actions = actions;
  globals.onChange = onChange;
}

export const action = (actionName, payload) => {
  if (!globals.actions[actionName]) {
    throw new Error("Action not defined: "+actionName)
  }
  globals.actions[actionName](payload, globals.state)
  globals.onChange(globals.state)
}


