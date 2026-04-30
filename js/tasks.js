let unsubscribeTasks = null;
let currentTasks = [];
let tempLinks = [];
let tempSubtasks = [];

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            setupTaskForm();
            setupRealtimeListener();
        } else {
            if (unsubscribeTasks) unsubscribeTasks();
        }
    });
});

function setupRealtimeListener() {
    unsubscribeTasks = db.collection('tasks')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            currentTasks = [];
            snapshot.forEach(doc => {
                currentTasks.push({ id: doc.id, ...doc.data() });
            });
            renderKanban();
        }, (error) => {
            showToast('Error fetching tasks: ' + error.message, 'error');
        });
}

function renderKanban() {
    const cols = {
        todo: { el: document.querySelector('.col-todo'), data: [] },
        inprogress: { el: document.querySelector('.col-inprogress'), data: [] },
        done: { el: document.querySelector('.col-done'), data: [] }
    };
    if(!cols.todo.el) return;

    currentTasks.forEach(t => {
        if(cols[t.status]) cols[t.status].data.push(t);
    });

    for (let key in cols) {
        const col = cols[key];
        let title = key === 'todo' ? 'To Do' : (key === 'inprogress' ? 'In Progress' : 'Done');
        
        col.el.innerHTML = `
            <div class="kanban-header">
                <span class="kanban-title">${title}</span>
                <span class="kanban-count">${col.data.length}</span>
            </div>
            <div class="task-list"></div>
        `;

        const list = col.el.querySelector('.task-list');
        
        if (col.data.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-medium); font-size:0.9rem;">No tasks</div>`;
        }

        col.data.forEach((t, i) => {
            const delay = i * 50;
            const priorityColor = t.priority === 'High' ? '#EF4444' : (t.priority === 'Medium' ? '#F59E0B' : '#10B981');
            
            const actionsHTML = `
                <div class="task-actions" onclick="event.stopPropagation()">
                    <button class="icon-btn edit" onclick="viewTask('${t.id}')" title="View/Edit">✎</button>
                    ${window.userRole === 'manager' ? `<button class="icon-btn delete" onclick="deleteTask('${t.id}')" title="Delete">✕</button>` : ''}
                </div>
            `;

            // Deadline badge
            let deadlineHTML = '';
            if (t.deadline) {
                const dl = new Date(t.deadline + 'T23:59:59');
                const now = new Date();
                const isOverdue = dl < now && t.status !== 'done';
                const dlStr = new Date(t.deadline).toLocaleDateString('en-US', {month:'short', day:'numeric'});
                deadlineHTML = `<span class="task-deadline-badge ${isOverdue ? 'overdue' : ''}">📅 ${dlStr}</span>`;
            }

            // Subtask progress
            let subtaskHTML = '';
            if (t.subtasks && t.subtasks.length > 0) {
                const done = t.subtasks.filter(s => s.completed).length;
                const total = t.subtasks.length;
                const pct = Math.round((done / total) * 100);
                subtaskHTML = `
                    <div style="font-size:0.75rem; color:var(--text-medium); margin-top:6px;">☑ ${done}/${total} subtasks</div>
                    <div class="subtask-progress"><div class="subtask-progress-bar" style="width:${pct}%"></div></div>
                `;
            }

            // Link count
            let linkHTML = '';
            if (t.links && t.links.length > 0) {
                linkHTML = `<span style="font-size:0.75rem; color:var(--primary);">🔗 ${t.links.length}</span>`;
            }

            const card = document.createElement('div');
            card.className = 'task-card';
            card.style.animation = `fadeUp 0.3s ease forwards ${delay}ms`;
            card.style.opacity = '0';
            card.style.transform = 'translateY(10px)';
            card.onclick = () => viewTask(t.id);
            card.style.borderLeft = `4px solid ${priorityColor}`;
            
            card.innerHTML = `
                <div class="task-header" style="align-items: center; margin-bottom: 0;">
                    <div class="task-title" style="display:flex; align-items:center; width: 100%;">
                        <span style="margin-right: 8px; font-size: 1.2rem; line-height: 1; color: var(--primary);">•</span>
                        <span style="flex:1; word-break:break-word;">${t.title}</span>
                    </div>
                </div>
                ${t.notes ? `<div class="task-preview" style="margin-top:6px;">${t.notes}</div>` : ''}
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px;">
                    ${deadlineHTML}
                    ${linkHTML}
                </div>
                ${subtaskHTML}
                <div class="task-footer" style="margin-top: 8px;">
                    <div class="priority-pill priority-${t.priority}">
                        <div class="priority-dot"></div>
                        ${t.priority}
                    </div>
                    ${actionsHTML}
                </div>
            `;
            list.appendChild(card);
        });
    }
}

// Mobile Tabs
function switchMobileTab(status, evt) {
    const ev = evt || window.event;
    document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
    if (ev && ev.target) {
        ev.target.classList.add('active');
    }
    document.querySelector('.col-todo').classList.remove('active');
    document.querySelector('.col-inprogress').classList.remove('active');
    document.querySelector('.col-done').classList.remove('active');
    document.querySelector('.col-' + status).classList.add('active');
}

// Modals
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ===== LINK HELPERS =====
window.addLinkField = function() {
    const container = document.getElementById('task-links-container');
    const idx = container.children.length;
    const div = document.createElement('div');
    div.className = 'task-link-item';
    div.innerHTML = `
        <span>📎</span>
        <input type="text" placeholder="Label" style="width:80px; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;">
        <input type="url" placeholder="https://..." style="flex:1; min-width:0; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;">
        <span class="remove-link" onclick="this.parentElement.remove()">✕</span>
    `;
    container.appendChild(div);
};

window.addSubtaskField = function() {
    const container = document.getElementById('task-subtasks-container');
    const div = document.createElement('div');
    div.className = 'subtask-item';
    div.innerHTML = `
        <input type="checkbox" disabled>
        <input type="text" class="subtask-text" placeholder="Sub-task description..." style="flex:1; min-width:0; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;">
        <span class="remove-subtask" onclick="this.parentElement.remove()">✕</span>
    `;
    container.appendChild(div);
};

function getLinksFromForm() {
    const items = document.querySelectorAll('#task-links-container .task-link-item');
    const links = [];
    items.forEach(item => {
        const inputs = item.querySelectorAll('input');
        const label = inputs[0].value.trim();
        const url = inputs[1].value.trim();
        if (url) links.push({ label: label || 'Link', url });
    });
    return links;
}

function getSubtasksFromForm() {
    const items = document.querySelectorAll('#task-subtasks-container .subtask-item');
    const subtasks = [];
    items.forEach(item => {
        const cb = item.querySelector('input[type="checkbox"]');
        const textInput = item.querySelector('input[type="text"], .subtask-text-display');
        let text = '';
        if (textInput && textInput.tagName === 'INPUT') text = textInput.value.trim();
        else if (textInput) text = textInput.textContent.trim();
        if (text) subtasks.push({ text, completed: cb ? cb.checked : false });
    });
    return subtasks;
}

function renderLinksInForm(links) {
    const container = document.getElementById('task-links-container');
    container.innerHTML = '';
    if (!links || links.length === 0) return;
    links.forEach(link => {
        const div = document.createElement('div');
        div.className = 'task-link-item';
        const isReadonly = window.userRole === 'admin';
        div.innerHTML = `
            <span>📎</span>
            <input type="text" value="${link.label || 'Link'}" style="width:80px; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;" ${isReadonly ? 'readonly style="pointer-events:none; opacity:0.7; width:80px; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;"' : ''}>
            <input type="url" value="${link.url}" style="flex:1; min-width:0; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;" ${isReadonly ? 'readonly style="pointer-events:none; opacity:0.7; flex:1; min-width:0; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;"' : ''}>
            ${isReadonly ? `<a href="${link.url}" target="_blank" style="color:var(--primary); font-size:0.8rem;">Open</a>` : '<span class="remove-link" onclick="this.parentElement.remove()">✕</span>'}
        `;
        container.appendChild(div);
    });
}

function renderSubtasksInForm(subtasks) {
    const container = document.getElementById('task-subtasks-container');
    container.innerHTML = '';
    if (!subtasks || subtasks.length === 0) return;
    subtasks.forEach((st, idx) => {
        const div = document.createElement('div');
        div.className = 'subtask-item';
        const isAdmin = window.userRole === 'admin';
        const isManager = window.userRole === 'manager';
        div.innerHTML = `
            <input type="checkbox" ${st.completed ? 'checked' : ''} onchange="toggleSubtaskInForm(${idx}, this.checked)">
            ${isManager ? 
                `<input type="text" class="subtask-text ${st.completed ? 'done' : ''}" value="${st.text}" style="flex:1; min-width:0; padding:4px 8px; border:1px solid var(--border-solid); border-radius:6px; font-size:0.85rem;">
                 <span class="remove-subtask" onclick="this.parentElement.remove()">✕</span>` :
                `<span class="subtask-text-display subtask-text ${st.completed ? 'done' : ''}" style="flex:1;">${st.text}</span>`
            }
        `;
        container.appendChild(div);
    });
}

window.toggleSubtaskInForm = function(idx, checked) {
    // Allow both admin and manager to toggle subtask checkboxes
    const items = document.querySelectorAll('#task-subtasks-container .subtask-item');
    if (items[idx]) {
        const textEl = items[idx].querySelector('.subtask-text, .subtask-text-display');
        if (textEl) {
            if (checked) textEl.classList.add('done');
            else textEl.classList.remove('done');
        }
    }
};

function openAddTaskModal() {
    if (window.userRole === 'admin') return;
    
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    document.getElementById('task-modal-title').textContent = 'Create New Task';
    document.getElementById('task-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('btn-delete-task').style.display = 'none';
    document.getElementById('task-status-container').style.display = 'none';
    document.getElementById('task-status').value = 'todo';
    
    // Clear deadline
    const dl = document.getElementById('task-deadline');
    if (dl) dl.value = '';
    
    // Clear links and subtasks
    document.getElementById('task-links-container').innerHTML = '';
    document.getElementById('task-subtasks-container').innerHTML = '';
    
    // Allow inputs
    document.querySelectorAll('#task-form input:not([type="hidden"]):not([type="checkbox"]), #task-form textarea, #task-form select').forEach(el => {
        el.readOnly = false;
        el.style.pointerEvents = 'all';
        el.style.opacity = '1';
    });
    document.getElementById('btn-save-task').style.display = 'block';
    
    // Show links/subtasks add buttons
    document.getElementById('links-section').style.display = 'block';
    document.getElementById('subtasks-section').style.display = 'block';
    
    document.getElementById('task-meta').textContent = '';
    openModal('task-modal');
}

function viewTask(id) {
    const t = currentTasks.find(x => x.id === id);
    if (!t) return;

    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = t.id;
    document.getElementById('task-title').value = t.title;
    document.getElementById('task-priority').value = t.priority;
    document.getElementById('task-status').value = t.status;
    document.getElementById('task-date').value = t.assignedDate;
    document.getElementById('task-notes').value = t.notes || '';
    
    // Deadline
    const dl = document.getElementById('task-deadline');
    if (dl) dl.value = t.deadline || '';
    
    // Links and subtasks
    renderLinksInForm(t.links || []);
    renderSubtasksInForm(t.subtasks || []);
    
    document.getElementById('task-modal-title').textContent = 'Task Details';
    document.getElementById('btn-delete-task').style.display = window.userRole === 'manager' ? 'block' : 'none';
    document.getElementById('btn-save-task').style.display = 'block';
    
    if (window.userRole === 'admin') {
        // Admin: Can only change status and toggle subtask checkboxes
        document.querySelectorAll('#task-form input:not([type="hidden"]):not([type="checkbox"]), #task-form textarea, #task-priority').forEach(el => {
            el.readOnly = true;
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.7';
        });
        document.getElementById('task-status-container').style.display = 'block';
        document.getElementById('task-status').disabled = false;
        document.getElementById('task-status').style.pointerEvents = 'all';
        document.getElementById('task-status').style.opacity = '1';
        
        // Hide add buttons for admin
        document.querySelectorAll('#links-section button, #subtasks-section button').forEach(b => {
            if (b.textContent.includes('+') || b.textContent.includes('Add')) b.style.display = 'none';
        });
    } else {
        // Manager: Can change everything except status
        document.querySelectorAll('#task-form input:not([type="hidden"]), #task-form textarea, #task-priority').forEach(el => {
            el.readOnly = false;
            el.style.pointerEvents = 'all';
            el.style.opacity = '1';
        });
        document.getElementById('task-status-container').style.display = 'none';
        
        // Show add buttons
        document.querySelectorAll('#links-section button, #subtasks-section button').forEach(b => b.style.display = '');
    }

    const createdStr = t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleString() : '';
    const updatedStr = t.updatedAt ? new Date(t.updatedAt.seconds * 1000).toLocaleString() : '';
    document.getElementById('task-meta').innerHTML = `Created: ${createdStr}<br>Updated: ${updatedStr}`;

    openModal('task-modal');
}

function editTask(id) {
    viewTask(id);
}

function setupTaskForm() {
    const form = document.getElementById('task-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('task-id').value;
        const data = {};
        
        if (window.userRole === 'admin') {
            // Admin only updates status and subtask states
            data.status = document.getElementById('task-status').value;
            data.subtasks = getSubtasksFromForm();
        } else {
            // Manager updates everything EXCEPT status
            data.title = document.getElementById('task-title').value;
            data.priority = document.getElementById('task-priority').value;
            data.assignedDate = document.getElementById('task-date').value;
            data.notes = document.getElementById('task-notes').value || '';
            data.deadline = document.getElementById('task-deadline').value || '';
            data.links = getLinksFromForm();
            data.subtasks = getSubtasksFromForm();
            if (!id) data.status = 'todo';
        }
        
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

        try {
            if (id) {
                await db.collection('tasks').doc(id).update(data);
                showToast('Task updated', 'success');
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                data.createdByRole = 'manager';
                await db.collection('tasks').add(data);
                showToast('Task created', 'success');
            }
            closeModal('task-modal');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

async function deleteTask(id) {
    if(confirm('Delete this task forever?')) {
        try {
            await db.collection('tasks').doc(id).delete();
            showToast('Task deleted', 'success');
        } catch(error) {
            showToast(error.message, 'error');
        }
    }
}

function deleteTaskFromModal() {
    const id = document.getElementById('task-id').value;
    if(id) {
        deleteTask(id);
        closeModal('task-modal');
    }
}
