import { Replicache } from './replicache.ts';

// Initialize Replicache
const rep = new Replicache({
    name: "todo-app",
    spaceID: "todo-space",
    mutators: {
        async createTodo(tx, { text }) {
            const id = crypto.randomUUID();
            await tx.put(`todo/${id}`, {
                id,
                text,
                completed: false,
                createdAt: Date.now()
            });
            return id;
        },
        async toggleTodo(tx, { id }) {
            const todo = await tx.get(`todo/${id}`);
            if (todo) {
                await tx.put(`todo/${id}`, {
                    ...todo,
                    completed: !todo.completed
                });
            }
        },
        async deleteTodo(tx, { id }) {
            await tx.del(`todo/${id}`);
        }
    },
    pullURL: "/api/pull",
    pushURL: "/api/push"
});

// DOM Elements
const todoInput = document.querySelector('.todo-input');
const todoList = document.querySelector('.todo-list');

// Define the query function
async function listTodos(tx) {
    const todos = await tx.scan({ prefix: "todo/" }).entries().toArray();
    return todos.sort((a, b) => b[1].createdAt - a[1].createdAt);
}

// Subscribe to changes using the new pattern
rep.subscribe(listTodos, (todos) => {
        renderTodos(todos);
    }
);
window.rep = rep;

// Event Listeners
todoInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && todoInput.value.trim()) {
        await rep.mutate.createTodo({ text: todoInput.value.trim() });
        todoInput.value = '';
    }
});

// Render todos
function renderTodos(todos) {
    todoList.innerHTML = '';
    todos.forEach(([_, todo]) => {
        const li = document.createElement('li');
        li.className = 'todo-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-checkbox';
        checkbox.checked = todo.completed;
        checkbox.addEventListener('change', () => {
            rep.mutate.toggleTodo({ id: todo.id });
        });

        const text = document.createElement('span');
        text.className = `todo-text ${todo.completed ? 'completed' : ''}`;
        text.textContent = todo.text;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => {
            rep.mutate.deleteTodo({ id: todo.id });
        });

        li.appendChild(checkbox);
        li.appendChild(text);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);
    });
} 