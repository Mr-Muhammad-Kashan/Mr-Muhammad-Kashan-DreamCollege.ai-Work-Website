let currentProjects = [];
let currentFilter = 'All';
let activeProjectId = null;

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            setupFilters();
            setupForm();
            loadProjects();
        }
    });
});

function setupFilters() {
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            renderProjects();
        });
    });
}

async function loadProjects() {
    try {
        const snap = await db.collection('projects').orderBy('createdAt', 'desc').get();
        currentProjects = [];
        snap.forEach(doc => {
            currentProjects.push({ id: doc.id, ...doc.data() });
        });
        renderProjects();
    } catch (error) {
        showToast('Error loading projects: ' + error.message, 'error');
    }
}

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const searchInput = document.getElementById('project-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filtered = currentProjects.filter(p => {
        const matchesFilter = currentFilter === 'All' || p.status === currentFilter;
        const matchesSearch = p.name.toLowerCase().includes(searchTerm) || p.description.toLowerCase().includes(searchTerm);
        return matchesFilter && matchesSearch;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-medium); grid-column:1/-1;">No projects found for this filter.</p>';
        return;
    }

    filtered.forEach((p, i) => {
        const delay = i * 50;
        const thumb = p.thumbnailUrl || `https://placehold.co/320x180/E0E7FF/7C3AED?text=${p.name.charAt(0)}`;
        
        let statusBadge = '';
        if (p.status === 'Planning 📝') statusBadge = 'badge-yellow';
        else if (p.status === 'In Progress ⏳') statusBadge = 'badge-purple';
        else if (p.status === 'Completed ✅') statusBadge = 'badge-green';
        else if (p.status === 'Live 🚀') statusBadge = 'badge-blue';
        else statusBadge = 'badge-purple';

        const adminBtns = window.userRole === 'admin' ? `
            <div class="action-btns" onclick="event.stopPropagation()">
                <button class="icon-btn edit" onclick="editProject('${p.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
                <button class="icon-btn delete" onclick="deleteProject('${p.id}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
        ` : '';

        const dateStr = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : '';

        const card = document.createElement('div');
        card.className = 'project-card';
        
        card.innerHTML = `
            <div class="project-thumb">
                <img src="${thumb}" alt="${p.name}">
                <span class="project-status-badge ${statusBadge}">${p.status}</span>
            </div>
            <div class="project-body">
                <div class="project-name">${p.name}</div>
                <div class="project-desc">${p.description}</div>
                <div class="project-footer">
                    <span class="project-date">${dateStr}</span>
                    <button class="btn btn-outline" style="padding:6px 16px; font-size:0.85rem;" onclick="viewProject('${p.id}')">View Details</button>
                    ${adminBtns}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Modal Logic
function openAddModal() {
    document.getElementById('project-form').reset();
    document.getElementById('project-id').value = '';
    document.getElementById('add-modal-title').textContent = 'Add New Project';
    openModal('add-project-modal');
}

function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if(id === 'detail-modal') {
        document.getElementById('add-version-form').style.display = 'none';
        document.getElementById('add-img-form').style.display = 'none';
    }
}

function setupForm() {
    const form = document.getElementById('project-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('project-id').value;
        const projectData = {
            name: document.getElementById('project-name').value,
            description: document.getElementById('project-desc').value,
            status: document.getElementById('project-status').value,
            thumbnailUrl: document.getElementById('project-thumb').value,
            versions: id ? undefined : [], // preserve existing if edit
            screenshots: id ? undefined : [],
            notes: id ? undefined : '',
        };

        try {
            if (id) {
                // Remove undefined fields
                Object.keys(projectData).forEach(key => projectData[key] === undefined && delete projectData[key]);
                await db.collection('projects').doc(id).update(projectData);
                showToast('Project updated successfully', 'success');
            } else {
                projectData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                projectData.versions = [];
                projectData.screenshots = [];
                projectData.notes = '';
                await db.collection('projects').add(projectData);
                showToast('Project created successfully', 'success');
            }
            closeModal('add-project-modal');
            loadProjects();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

async function deleteProject(id) {
    if(confirm('Are you sure you want to delete this project?')) {
        try {
            await db.collection('projects').doc(id).delete();
            showToast('Project deleted', 'success');
            loadProjects();
        } catch(error) {
            showToast(error.message, 'error');
        }
    }
}

function editProject(id) {
    const p = currentProjects.find(x => x.id === id);
    if (!p) return;
    
    document.getElementById('project-id').value = p.id;
    document.getElementById('project-name').value = p.name;
    document.getElementById('project-desc').value = p.description;
    document.getElementById('project-status').value = p.status;
    document.getElementById('project-thumb').value = p.thumbnailUrl || '';
    
    document.getElementById('add-modal-title').textContent = 'Edit Project';
    openModal('add-project-modal');
}

function viewProject(id) {
    const p = currentProjects.find(x => x.id === id);
    if (!p) return;
    
    activeProjectId = p.id;
    
    document.getElementById('detail-title').textContent = p.name;
    document.getElementById('detail-desc').textContent = p.description;
    
    const thumb = p.thumbnailUrl || `https://placehold.co/1200x400/E0E7FF/7C3AED?text=${p.name.charAt(0)}`;
    document.getElementById('detail-cover').src = thumb;
    document.getElementById('detail-cover').style.display = 'block';
    
    let statusBadge = '';
    if (p.status === 'Planning 📝') statusBadge = 'badge-yellow';
    else if (p.status === 'In Progress ⏳') statusBadge = 'badge-purple';
    else if (p.status === 'Completed ✅') statusBadge = 'badge-green';
    else if (p.status === 'Live 🚀') statusBadge = 'badge-blue';
    else statusBadge = 'badge-purple';
    
    document.getElementById('detail-badge').className = `badge ${statusBadge}`;
    document.getElementById('detail-badge').textContent = p.status;
    
    // Notes
    document.getElementById('detail-notes').value = p.notes || '';
    document.getElementById('detail-notes').readOnly = (window.userRole !== 'admin');
    
    renderVersions(p.versions || []);
    renderGallery(p.screenshots || []);
    
    openModal('detail-modal');
}

// No tabs anymore

// Versions logic
function openAddVersion() {
    document.getElementById('add-version-form').style.display = 'block';
}

async function saveVersion() {
    const label = document.getElementById('v-label').value;
    const url = document.getElementById('v-url').value;
    if(!label || !url) return showToast("Label and URL required", "error");
    
    const newV = { label, url, date: new Date().toISOString() };
    
    try {
        await db.collection('projects').doc(activeProjectId).update({
            versions: firebase.firestore.FieldValue.arrayUnion(newV)
        });
        document.getElementById('add-version-form').style.display = 'none';
        document.getElementById('v-label').value = '';
        document.getElementById('v-url').value = '';
        showToast('Version added', 'success');
        
        // Update local and re-render
        const p = currentProjects.find(x => x.id === activeProjectId);
        if(!p.versions) p.versions = [];
        p.versions.push(newV);
        renderVersions(p.versions);
    } catch(e) {
        showToast(e.message, 'error');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(err => {
        showToast('Failed to copy', 'error');
    });
}

async function saveVersionRemark(versionIndex) {
    const input = document.getElementById(`remark-input-${versionIndex}`);
    const text = input.value.trim();
    if(!text) return;

    try {
        const p = currentProjects.find(x => x.id === activeProjectId);
        const updatedVersions = [...p.versions];
        if(!updatedVersions[versionIndex].remarks) {
            updatedVersions[versionIndex].remarks = [];
        }
        updatedVersions[versionIndex].remarks.push({
            author: window.userRole === 'admin' ? 'Kashan' : 'Julia',
            text: text,
            date: new Date().toISOString()
        });

        await db.collection('projects').doc(activeProjectId).update({
            versions: updatedVersions
        });
        
        input.value = '';
        showToast('Remark added', 'success');
        renderVersions(updatedVersions);
    } catch(e) {
        showToast(e.message, 'error');
    }
}

function renderVersions(versions) {
    const emptyState = document.getElementById('versions-empty-state');
    const latestContainer = document.getElementById('latest-version-container');
    const olderContainer = document.getElementById('older-versions-container');
    const latestList = document.getElementById('detail-latest-version');
    const olderList = document.getElementById('detail-older-versions');
    
    if(!emptyState) return;
    
    latestList.innerHTML = '';
    olderList.innerHTML = '';

    if (!versions || versions.length === 0) {
        emptyState.style.display = 'block';
        latestContainer.style.display = 'none';
        olderContainer.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    latestContainer.style.display = 'block';

    // Sort versions by date (newest first).
    versions.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (versions.length > 1) {
        olderContainer.style.display = 'block';
    } else {
        olderContainer.style.display = 'none';
    }

    versions.forEach((v, index) => {
        const d = v.date ? new Date(v.date).toLocaleDateString() : 'Unknown date';
        
        let remarksHtml = '';
        if (v.remarks && v.remarks.length > 0) {
            remarksHtml = '<div class="version-remarks">';
            v.remarks.forEach(r => {
                const rd = new Date(r.date).toLocaleDateString();
                remarksHtml += `<div class="remark-item"><strong>${r.author}:</strong> ${r.text} <span style="font-size:0.75rem; color:#9ca3af; margin-left:6px">${rd}</span></div>`;
            });
            remarksHtml += '</div>';
        } else {
            remarksHtml = '<div class="version-remarks" style="border:none; padding:0;"></div>';
        }

        const addRemarkHtml = window.userRole === 'manager' ? `
            <div class="add-remark-box">
                <input type="text" id="remark-input-${index}" placeholder="Add a remark...">
                <button class="btn btn-primary" style="padding:6px 12px; font-size:0.85rem;" onclick="saveVersionRemark(${index})">Post</button>
            </div>
        ` : '';

        const adminEditBtns = window.userRole === 'admin' ? `
            <button onclick="editVersion(${index})" title="Edit Version" style="color:var(--accent);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>Edit
            </button>
            <button onclick="deleteVersion(${index})" title="Delete Version" style="color:#EF4444;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>Delete
            </button>
        ` : '';


        let extraStyles = "";
        if (index === 0) {
            extraStyles = "border: 2px solid var(--primary); background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1); transform: translateY(-1px);";
        } else {
            extraStyles = "border: 1px solid #E5E7EB; background: #F9FAFB; opacity: 0.9; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); filter: grayscale(20%);";
        }

        const html = `
            <li class="version-item" style="${extraStyles}">
                <div class="version-head d-flex flex-column gap-1">
                    <div class="version-title">
                        <strong class="version-label-text" style="${index === 0 ? 'color: var(--primary); font-size: 1.05rem;' : 'color: #6B7280;'}">${v.label}</strong>
                    </div>
                    <div class="version-date" style="${index === 0 ? 'color: var(--text-dark);' : ''}">Uploaded: ${d}</div>
                </div>
                <div class="version-actions-row">
                    <div class="version-actions">
                        ${adminEditBtns}
                        <button onclick="copyToClipboard('${v.url}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>Copy
                        </button>
                        <button onclick="window.open('${v.url}', '_blank')" style="${index === 0 ? 'background: var(--primary); color: white; border: none; box-shadow: 0 4px 10px rgba(124,58,237,0.3);' : ''}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>Open
                        </button>
                    </div>
                </div>
                ${remarksHtml}
                ${addRemarkHtml}
            </li>
        `;

        if (index === 0) {
            latestList.innerHTML += html;
        } else {
            olderList.innerHTML += html;
        }
    });
}

async function deleteVersion(versionIndex) {
    if (!confirm('Are you sure you want to delete this version?')) return;
    try {
        const p = currentProjects.find(x => x.id === activeProjectId);
        if(!p || !p.versions) return;
        
        p.versions.splice(versionIndex, 1);
        await db.collection('projects').doc(activeProjectId).update({
            versions: p.versions
        });
        showToast('Version deleted', 'success');
        renderVersions(p.versions);
    } catch(e) {
        showToast(e.message, 'error');
    }
}

async function editVersion(versionIndex) {
    const p = currentProjects.find(x => x.id === activeProjectId);
    if(!p || !p.versions || !p.versions[versionIndex]) return;
    
    const v = p.versions[versionIndex];
    const newLabel = prompt('Edit version label:', v.label);
    if(newLabel === null) return;
    
    const newUrl = prompt('Edit version URL:', v.url);
    if(newUrl === null) return;
    
    if(!newLabel.trim() || !newUrl.trim()) return showToast('Label and URL cannot be empty', 'error');

    v.label = newLabel.trim();
    v.url = newUrl.trim();

    try {
        await db.collection('projects').doc(activeProjectId).update({
            versions: p.versions
        });
        showToast('Version updated', 'success');
        renderVersions(p.versions);
    } catch(e) {
        showToast(e.message, 'error');
    }
}

// Notes Logic
async function saveNotes() {
    const notes = document.getElementById('detail-notes').value;
    try {
        await db.collection('projects').doc(activeProjectId).update({ notes });
        showToast('Notes saved', 'success');
        currentProjects.find(x => x.id === activeProjectId).notes = notes;
    } catch(e) {
        showToast(e.message, 'error');
    }
}

// Screenshots logic
function openAddScreenshot() {
    document.getElementById('add-img-form').style.display = 'block';
}

async function saveScreenshot() {
    const url = document.getElementById('img-url').value;
    if(!url) return showToast("URL required", "error");
    
    try {
        await db.collection('projects').doc(activeProjectId).update({
            screenshots: firebase.firestore.FieldValue.arrayUnion(url)
        });
        document.getElementById('add-img-form').style.display = 'none';
        document.getElementById('img-url').value = '';
        showToast('Screenshot added', 'success');
        
        const p = currentProjects.find(x => x.id === activeProjectId);
        if(!p.screenshots) p.screenshots = [];
        p.screenshots.push(url);
        renderGallery(p.screenshots);
    } catch(e) {
        showToast(e.message, 'error');
    }
}

function renderGallery(imgs) {
    const grid = document.getElementById('detail-gallery');
    grid.innerHTML = '';
    if(imgs.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-medium); grid-column:1/-1;">No screenshots.</p>';
        return;
    }
    
    imgs.forEach(url => {
        grid.innerHTML += `<img src="${url}" class="gallery-img" onclick="openLightbox('${url}')">`;
    });
}

function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    openModal('lightbox-modal');
}
