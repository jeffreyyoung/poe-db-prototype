# Repli-Cache

A Replicache-compatible client with custom internals. This implementation provides an API that is compatible with the official Replicache client but allows you to handle all the internals yourself.

## Features

- API compatible with the official Replicache client
- Customizable pull/push mechanisms
- Mutator-based data modifications
- Subscription-based data change notifications
- Polling-based synchronization

## Installation

No installation required. Just include the `repli-cache.js` file in your project.

## Usage

### Basic Setup

```javascript
import RepliCache from './repli-cache.js';

// Define mutators (functions that modify data)
const mutators = {
  async addTodo(args, state) {
    const [todo] = args;
    const todos = state.todos || [];
    
    return {
      todos: [...todos, {
        id: Date.now().toString(),
        text: todo.text,
        completed: false,
        createdAt: new Date().toISOString()
      }]
    };
  }
};

// Create a Repli-Cache instance
const rep = new RepliCache({
  name: 'todo-app',
  mutators,
  pullURL: 'http://your-api.com/pull',
  pushURL: 'http://your-api.com/push',
  pullInterval: 5000,
  pushInterval: 5000
});

// Subscribe to data changes
rep.subscribe((data) => {
  console.log('Data updated:', data);
  updateUI(data);
});

// Execute a mutator
await rep.mutate('addTodo', [{ text: 'Buy groceries' }]);
```

### API Reference

#### Constructor

```javascript
const rep = new RepliCache(options);
```

Options:
- `name` (string): Name of the Replicache instance
- `mutators` (object): Object containing mutator functions
- `pullURL` (string): URL for pulling data from the server
- `pushURL` (string): URL for pushing data to the server
- `pullInterval` (number): Interval in milliseconds for pulling data (default: 1000)
- `pushInterval` (number): Interval in milliseconds for pushing data (default: 1000)
- `spaceID` (string): Optional space ID for multi-space support

#### Methods

- `mutate(mutatorName, args)`: Execute a mutator function
- `subscribe(callback)`: Subscribe to data changes
- `close()`: Close the Replicache instance
- `getState()`: Get the current state

## Example

See the `example.js` and `index.html` files for a complete example of using Repli-Cache in a todo app.

## Mock Server

A simple mock server is provided in `mock-server.js` to demonstrate the pull/push functionality without requiring a real backend.

To run the mock server:

```bash
node mock-server.js
```

The server will start on port 3000 by default.

## License

MIT

# poe-db-prototype

### state
```
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@5b41d0277662da4daf680e70190fe3d7ace162b0/synced-state.js"


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
```


### action_log (no sync)

https://poe.com/s/6ztrjgOtuxU1TrGorFAL

```
import { setup, action } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a85cb9673073d53ea3f12f9a429db1b7f4f3648a/actions.js"


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
```

### yjs

https://poe.com/s/5pWL906Csmb3rYTNxYR6

```
import { ydoc } from "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@a85cb9673073d53ea3f12f9a429db1b7f4f3648a/yjs.js"

// ydoc is a yjs doc
// do not setup any providers or persistence.  It is already setup behind the scenes.
// mutate the doc like a regular yjs doc
// implement your own updateUI function
y.observe(updateUI)
```

### how I generate the jsdelivr urls
- go to the js file https://github.com/jeffreyyoung/poe-db-prototype/blob/main/actions.js
- click copy permalink
- go to https://www.jsdelivr.com/github
- paste permalink and copy jsdelivr url

<img width="412" alt="image" src="https://github.com/user-attachments/assets/378b71a5-4be0-4dfa-960c-1b3ae95881bd" />
 
