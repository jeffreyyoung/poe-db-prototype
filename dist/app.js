import { Replicache } from './replicache.js';

// Initialize Replicache
const rep = new Replicache({
    pushDelay: 100,
    pullDelay: 100,
    baseUrl: "https://poe-db-prototype.fly.dev",
    mutators: {
        createTodo: async (tx, {id, text}) => {
            await tx.set(`todos/${id}`, {
                id,
                text,
                completed: false,
                createdAt: Date.now()
            });
        },
        toggleTodo: async (tx, {id}) => {
            const todo = await tx.get(`todos/${id}`);
            if (todo) {
                await tx.set(`todos/${id}`, {
                    ...todo,
                    completed: !todo.completed
                });
            } else {
            }
        },
        deleteTodo: async (tx, {id}) => {
            await tx.del(`todos/${id}`);
        }
    }
});

// DOM Elements
const todoInput = document.getElementById('todoInput');
const addTodoButton = document.getElementById('addTodo');
const todoList = document.getElementById('todoList');

// Subscribe to changes
rep.subscribeToScanEntries("todos/", (entries, changes) => {

    // Handle added todos
    for (let i = 0; i < changes.added.length; i++) {
        const [key, value] = changes.added[i];
        const previousKey = changes.added[i - 1]?.[0];
        addTodoToDom(key, value, previousKey);
    }

    // Handle changed todos
    for (const [key, value] of changes.changed) {
        updateTodoInDom(key, value);
    }

    // Handle removed todos
    for (const [key] of changes.removed) {
        removeTodoFromDom(key);
    }
});

// Event Listeners
addTodoButton.addEventListener('click', () => {
    const text = todoInput.value.trim();
    if (text) {
        const id = crypto.randomUUID();
        rep.mutate.createTodo({id, text});
        todoInput.value = '';
    }
});

todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const text = todoInput.value.trim();
        if (text) {
            const id = crypto.randomUUID();
            rep.mutate.createTodo({id, text});
            todoInput.value = '';
        }
    }
});

// DOM manipulation functions
function addTodoToDom(key, value, previousKey) {
    const li = document.createElement('li');
    li.className = `todo-item ${value.completed ? 'completed' : ''}`;
    li.dataset.key = key;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = value.completed;
    checkbox.addEventListener('change', () => {
        rep.mutate.toggleTodo({id: value.id});
    });
    
    const span = document.createElement('span');
    span.textContent = value.text;
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
        rep.mutate.deleteTodo({id: value.id});
    });
    
    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteButton);

    if (previousKey) {
        const previousElement = document.querySelector(`[data-key="${previousKey}"]`);
        if (previousElement) {
            previousElement.after(li);
        } else {
            todoList.appendChild(li);
        }
    } else {
        todoList.prepend(li);
    }
}

function updateTodoInDom(key, value) {
    const li = document.querySelector(`[data-key="${key}"]`);
    if (li) {
        li.className = `todo-item ${value.completed ? 'completed' : ''}`;
        const checkbox = li.querySelector('input[type="checkbox"]');
        const span = li.querySelector('span');
        if (checkbox) checkbox.checked = value.completed;
        if (span) span.textContent = value.text;
    } else {
    }
}

function removeTodoFromDom(key) {
    const li = document.querySelector(`[data-key="${key}"]`);
    if (li) {
        li.remove();
    } else {
    }
} 