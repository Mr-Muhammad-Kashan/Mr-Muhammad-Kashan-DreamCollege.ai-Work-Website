document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth to resolve
    auth.onAuthStateChanged((user) => {
        if (user) {
            initDashboard();
        }
    });
});

function initDashboard() {
    if (window.startHeroCanvas) window.startHeroCanvas();
    
    // Update Date
    const dateEl = document.getElementById('hero-date');
    if (dateEl) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
    
    // Update Greeting based on hour
    const greetingEl = document.getElementById('dynamic-greeting');
    if (greetingEl) {
        const hour = new Date().getHours();
        let greeting = 'Good Evening';
        if (hour < 12) greeting = 'Good Morning';
        else if (hour < 18) greeting = 'Good Afternoon';
        
        const email = auth.currentUser.email || '';
        let fullName = auth.currentUser.displayName || email.split('@')[0];
        if (email.toLowerCase() === 'mr.muhammad.kashan.tariq@gmail.com') {
            fullName = 'Muhammad Kashan Tariq';
        } else if (email.toLowerCase() === 'julialiang2015@gmail.com') {
            fullName = 'Julia Liang';
        }
        greetingEl.textContent = `${greeting}, ${fullName}! 👋`;
        
        // Dynamic hero info based on user
        const heroAvatar = document.getElementById('hero-avatar-img');
        const heroName = document.getElementById('hero-name-display');
        const heroRole = document.getElementById('hero-role-display');
        
        if (email === 'julialiang2015@gmail.com' || window.userRole === 'manager') {
            if(heroAvatar) heroAvatar.src = 'resources/Profile Picture/Julia.jpg';
            if(heroName) heroName.textContent = 'Julia Liang';
            if(heroRole) heroRole.textContent = 'Manager';
            
            // Custom manager greeting
            greetingEl.textContent = `${greeting}, Julia! 👋`;
            const tagline = document.querySelector('.hero-tagline');
            if (tagline) {
                tagline.innerHTML = `<span id="manager-status-text">Loading Kashan's status...</span>`;
            }
            
            // Distinct manager hero background
            const heroSec = document.querySelector('.hero-section');
            if (heroSec) {
                heroSec.style.boxShadow = '0 20px 40px rgba(30, 27, 75, 0.4)';
            }
            
            // Show manager shortcuts
            const shortcuts = document.getElementById('manager-shortcuts');
            if (shortcuts) shortcuts.style.display = 'flex';
        } else {
            if(heroAvatar) heroAvatar.src = 'resources/Profile Picture/me.jpg';
            if(heroName) heroName.textContent = 'Muhammad Kashan';
            if(heroRole) heroRole.textContent = 'Software Engineer';
        }
    }

    loadStats();
    loadRecentWorklogs();
    loadActiveTasks();
    loadRecentProjects();
}

async function loadStats() {
    try {
        // Projects count
        const projectsSnap = await db.collection('projects').get();
        animateValue('stat-projects', 0, projectsSnap.size, 1500);

        // Pending Tasks
        const tasksSnap = await db.collection('tasks').where('status', 'in', ['todo', 'inprogress']).get();
        animateValue('stat-tasks', 0, tasksSnap.size, 1500);

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        // This Month Start
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Fetch all worklogs (assuming Kashan is the only one tracking time)
        const logsSnap = await db.collection('worklogs').get();

        let totalHoursThisMonth = 0;
        let todayHours = 0;

        logsSnap.forEach(doc => {
            const data = doc.data();
            if (data.status === 'complete') {
                const parts = (data.date || '').split('-');
                if (parts.length === 3) {
                    const yyyy = parseInt(parts[0], 10);
                    const mm = parseInt(parts[1], 10);
                    const dd = parseInt(parts[2], 10);
                    const logDate = new Date(yyyy, mm - 1, dd);
                    
                    const hrs = parseFloat(data.total_hours) || 0;
                    
                    if (logDate >= startOfMonth) {
                        totalHoursThisMonth += hrs;
                    }
                }
                
                if (data.date === todayStr) {
                    todayHours += (parseFloat(data.total_hours) || 0);
                }
            }
        });

        const labelEl = document.getElementById('stat-hours-label');
        if (labelEl) {
            labelEl.textContent = 'Hours This Month';
        }

        let displayHours = totalHoursThisMonth;

        animateValue('stat-hours', 0, displayHours, 1500);
        animateValue('stat-today', 0, todayHours, 1500);

        // Update Manager's custom status text
        if (window.userRole === 'manager') {
            const statusText = document.getElementById('manager-status-text');
            if (statusText) {
                const hours = parseFloat(todayHours) || 0;
                let color = '#EF4444'; // red: under time
                if (hours >= 8 && hours < 9) {
                    color = '#10B981'; // green: 8.0 to 8.9
                } else if (hours >= 9) {
                    color = '#F59E0B'; // yellow: 9.0+
                }
                statusText.innerHTML = `Muhammad Kashan has worked <strong style="color:${color}; font-size:1.4rem;">${hours.toFixed(1)}</strong> hours today.`;
            }
        }

    } catch (error) {
        console.error("Error loading stats:", error);
        showToast("Error loading statistics", 'error');
    }
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let startTimestamp = null;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = start + (end - start) * easeOutCubic(progress);
        
        // Format to 2 decimals if it's a float
        obj.innerHTML = Number.isInteger(end) ? Math.floor(current) : current.toFixed(2);
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = Number.isInteger(end) ? end : end.toFixed(2);
        }
    };
    window.requestAnimationFrame(step);
}

async function loadRecentWorklogs() {
    const container = document.getElementById('recent-worklog');
    if (!container) return;

    try {
        const snap = await db.collection('worklogs').get();

        let logs = [];
        snap.forEach(doc => {
            if (doc.data().status === 'complete') {
                logs.push(doc.data());
            }
        });
        
        logs.sort((a, b) => new Date(b.date) - new Date(a.date));
        logs = logs.slice(0, 5);

        if (logs.length === 0) {
            container.innerHTML = '<p style="color: var(--text-medium);">No recent work logs found.</p>';
            return;
        }

        let html = '';
        logs.forEach(data => {
            const hours = data.total_hours ? data.total_hours.toFixed(1) : '0';
            const badge = data.is_weekend ? '<span class="badge badge-pink" style="margin-left: 8px;">Weekend</span>' : '';
            
            html += `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <strong style="color:var(--primary-dark)">${data.date} (${data.day_of_week})</strong>
                            <span style="font-weight:bold; color:var(--text-dark)">${hours} hrs</span>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-medium)">
                            ${new Date(data.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                            ${new Date(data.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            ${badge}
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("Error loading worklogs:", error);
        container.innerHTML = '<p style="color: #EF4444;">Failed to load work logs.</p>';
    }
}

async function loadKashanStatus() {
    const statusEl = document.getElementById('manager-status-text');
    if (!statusEl) return;
    
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
        
        const snap = await db.collection('worklogs')
            .where('date', '==', todayStr)
            .get();
            
        let totalHrs = 0;
        let isActive = false;
        let isOnBreak = false;
        
        snap.forEach(doc => {
            const data = doc.data();
            totalHrs += (data.total_hours || 0);
            if (data.status === 'active') isActive = true;
            if (data.status === 'on_break') isOnBreak = true;
        });
        
        let msg = '';
        if (isOnBreak) {
            msg = `🟡 Muhammad Kashan is currently on a break.`;
        } else if (isActive) {
            msg = `🟢 Muhammad Kashan is currently active right now.`;
        } else if (totalHrs > 0) {
            msg = `✅ Muhammad Kashan has worked ${totalHrs} hours today.`;
        } else if (isWeekend) {
            msg = `🌴 It's the weekend. Muhammad Kashan is currently resting.`;
        } else {
            msg = `⏳ Muhammad Kashan hasn't worked any hours today yet.`;
        }
        
        statusEl.innerHTML = `<span style="font-weight:600; color:white; font-size: 1.15rem;">${msg}</span>`;
    } catch(e) {
        console.error("Error loading status:", e);
        statusEl.innerHTML = "Status unavailable.";
    }
}

async function loadActiveTasks() {
    const container = document.getElementById('recent-tasks');
    if (!container) return;

    try {
        const snap = await db.collection('tasks')
            .where('status', 'in', ['todo', 'inprogress'])
            .limit(5)
            .get();

        if (snap.empty) {
            container.innerHTML = '<p style="color: var(--text-medium);">No active tasks.</p>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            let priorityColor = '#10B981'; // Low
            if (data.priority === 'High') priorityColor = '#EF4444';
            if (data.priority === 'Medium') priorityColor = '#F59E0B';

            html += `
                <div class="task-card-compact">
                    <div>
                        <div style="font-weight:600; color:var(--text-dark); margin-bottom:4px;">${data.title}</div>
                        <div style="font-size:0.8rem; color:var(--text-medium);">Assigned: ${data.assignedDate}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:600; color:${priorityColor}">
                        <div style="width:8px; height:8px; border-radius:50%; background:${priorityColor}"></div>
                        ${data.priority}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("Error loading tasks:", error);
        container.innerHTML = '<p style="color: #EF4444;">Failed to load tasks.</p>';
    }
}

async function loadRecentProjects() {
    const container = document.getElementById('recent-projects');
    if (!container) return;

    try {
        const snap = await db.collection('projects')
            .orderBy('createdAt', 'desc')
            .limit(3)
            .get();

        if (snap.empty) {
            container.innerHTML = '<p style="color: var(--text-medium); grid-column: 1/-1;">No projects found.</p>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            const thumb = data.thumbnailUrl || 'https://placehold.co/300x180/E0E7FF/7C3AED?text=' + data.name.charAt(0);
            
            let statusBadge = '';
            if (data.status === 'Planning 📝') statusBadge = '<span class="badge badge-yellow" style="position:absolute; top:12px; right:12px;">Planning 📝</span>';
            else if (data.status === 'In Progress ⏳') statusBadge = '<span class="badge badge-purple" style="position:absolute; top:12px; right:12px;">In Progress ⏳</span>';
            else if (data.status === 'Completed ✅') statusBadge = '<span class="badge badge-green" style="position:absolute; top:12px; right:12px;">Completed ✅</span>';
            else if (data.status === 'Live 🚀') statusBadge = '<span class="badge badge-blue" style="position:absolute; top:12px; right:12px;">Live 🚀</span>';
            else statusBadge = `<span class="badge badge-purple" style="position:absolute; top:12px; right:12px;">${data.status}</span>`;

            html += `
                <div class="card project-card-mini" style="padding:16px;">
                    <img src="${thumb}" alt="${data.name}">
                    ${statusBadge}
                    <h3 style="font-size:1.1rem; margin-bottom:4px; color:var(--text-dark)">${data.name}</h3>
                    <p style="font-size:0.85rem; color:var(--text-medium); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${data.description}</p>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (error) {
        console.error("Error loading projects:", error);
        container.innerHTML = '<p style="color: #EF4444; grid-column: 1/-1;">Failed to load projects.</p>';
    }
}
