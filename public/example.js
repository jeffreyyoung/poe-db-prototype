/**
 * Example usage of Repli-Cache
 */

import RepliCache from './repli-cache.js';

// Define mutators (functions that modify data)
const mutators = {
  // Add a todo item
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
  },
  
  // Toggle a todo's completed status
  async toggleTodo(args, state) {
    const [todoId] = args;
    const todos = state.todos || [];
    
    return {
      todos: todos.map(todo => 
        todo.id === todoId 
          ? { ...todo, completed: !todo.completed } 
          : todo
      )
    };
  },
  
  // Delete a todo
  async deleteTodo(args, state) {
    const [todoId] = args;
    const todos = state.todos || [];
    
    return {
      todos: todos.filter(todo => todo.id !== todoId)
    };
  }
};

// Create a Repli-Cache instance
const rep = new RepliCache({
  name: 'todo-app',
  mutators,
  // Use the local mock server
  pullURL: 'http://localhost:3000/pull',
  pushURL: 'http://localhost:3000/push',
  // Poll every 5 seconds
  pullInterval: 5000,
  pushInterval: 5000
});

// Subscribe to data changes
rep.subscribe((data) => {
  console.log('Data updated:', data);
  updateUI(data);
});

// Example UI update function
function updateUI(data) {
  const todoList = document.getElementById('todo-list');
  if (!todoList) return;
  
  todoList.innerHTML = '';
  
  const todos = data.data?.todos || [];
  
  todos.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.innerHTML = `
      <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} 
        onchange="window.toggleTodo('${todo.id}')">
      <span class="todo-text ${todo.completed ? 'completed' : ''}">${todo.text}</span>
      <button class="todo-delete" onclick="window.deleteTodo('${todo.id}')">Delete</button>
    `;
    todoList.appendChild(li);
  });
}

// Expose functions to the window for the UI to call
window.addTodo = async (text) => {
  await rep.mutate('addTodo', [{ text }]);
};

window.toggleTodo = async (id) => {
  await rep.mutate('toggleTodo', [id]);
};

window.deleteTodo = async (id) => {
  await rep.mutate('deleteTodo', [id]);
};

// Example of adding a todo
// window.addTodo('Buy groceries');

// Close the connection when done
// rep.close(); 