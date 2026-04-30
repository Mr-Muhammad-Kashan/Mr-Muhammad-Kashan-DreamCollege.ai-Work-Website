// Global Toast Notification System
window.showToast = function(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    } else {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <div class="toast-message">${message}</div>
        <div class="toast-progress" style="animation: shrink-progress 4s linear forwards;"></div>
    `;

    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
};

document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const ALLOWED_EMAILS = [
        'mr.muhammad.kashan.tariq@gmail.com',
        'julialiang2015@gmail.com'
    ];

    const showLoginError = (message) => {
        const errorMsg = document.getElementById('error-msg');
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.style.display = 'block';
        }
        const loginCard = document.querySelector('.login-card');
        if (loginCard) {
            loginCard.classList.remove('shake');
            void loginCard.offsetWidth;
            loginCard.classList.add('shake');
        }
    };

    auth.onAuthStateChanged(async (user) => {
        if (!user && !isLoginPage) {
            window.location.href = 'login.html';
            return;
        }

        if (user && isLoginPage) {
            const email = (user.email || '').toLowerCase();
            if (!ALLOWED_EMAILS.includes(email)) {
                await auth.signOut();
                showLoginError('Error 4.4 — Incorrect credentials. Please check your email and password.');
                return;
            }
            window.location.href = 'index.html';
            return;
        }

        if (user && !isLoginPage) {
            // Whitelist enforcement: only these two users can access the system
            if (!ALLOWED_EMAILS.includes((user.email || '').toLowerCase())) {
                auth.signOut();
                window.location.href = 'login.html';
                return;
            }

            try {
                const doc = await db.collection('users').doc(user.uid).get();
                let role = doc.exists ? doc.data().role : 'viewer';
                
                const email = user.email || '';
                if (email.toLowerCase() === 'mr.muhammad.kashan.tariq@gmail.com') {
                    role = 'admin';
                } else if (email.toLowerCase() === 'julialiang2015@gmail.com') {
                    role = 'manager';
                }
                
                window.userRole = role;
                sessionStorage.setItem('role', role);

                injectSidebar();
                injectTopbar();
                applyRolePermissions();
                startClock();
                startGreetingRotation();
                
                // Stagger-in animation with consistent delays
                document.querySelectorAll('.stagger-in').forEach((el, i) => {
                    el.style.animationDelay = `${i * 80}ms`;
                });

                window.authReady = true;
                window.dispatchEvent(new Event('authReady'));

            } catch (error) {
                showToast("Error fetching user data: " + error.message, 'error');
            }
        }
    });
});

function getAvatarUrl(email) {
    if (email === 'julialiang2015@gmail.com') return 'resources/Profile Picture/Julia.jpg';
    return 'resources/Profile Picture/me.jpg';
}

function injectSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const email = auth.currentUser.email || '';
    const avatarUrl = getAvatarUrl(email);

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img src="resources/logos/logo1.png" style="width:32px; height:32px; object-fit:contain; filter:drop-shadow(0 0 8px var(--primary-glow));">
            <div class="logo-text">Kashan's<span> Portfolio</span></div>
        </div>
        <div class="user-profile-sm">
            <img src="${avatarUrl}" class="avatar-circle" style="object-fit:cover; border: 2px solid var(--primary-light);">
            <div class="user-info-sm" style="flex:1; min-width:0;">
                <h4 style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size:0.9rem; margin-bottom:2px;" title="${email}">${email.toLowerCase().includes('kashan') ? 'Muhammad Kashan' : (email.toLowerCase().includes('julia') ? 'Julia Liang' : (auth.currentUser.displayName || email.split('@')[0]))}</h4>
                <p>${window.userRole === 'admin' ? 'Admin' : (window.userRole === 'manager' ? 'Manager' : 'Viewer')}</p>
            </div>
        </div>
        <ul class="nav-links">
            <li><a href="index.html" class="nav-item" data-page="index.html">
                <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
                Dashboard
            </a></li>
            <li><a href="projects.html" class="nav-item" data-page="projects.html">
                <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                Projects
            </a></li>
            <li><a href="tasks.html" class="nav-item" data-page="tasks.html">
                <svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                Tasks
            </a></li>
            <li><a href="monthly-report.html" class="nav-item" data-page="monthly-report.html">
                <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/></svg>
                Monthly Report
            </a></li>
            <li><a href="worklog.html" class="nav-item" data-page="worklog.html">
                <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                Work Log
            </a></li>
        </ul>
        <div class="sidebar-footer">
            <button class="logout-btn" onclick="handleLogout()">
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
                Logout
            </button>
        </div>
    `;

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(link => {
        if (link.getAttribute('data-page') === currentPage) {
            link.classList.add('active');
        }
        
        // Page exit animation
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.href;
            const mainWrapper = document.querySelector('.main-wrapper');
            if (mainWrapper) mainWrapper.classList.add('page-exit');
            setTimeout(() => {
                window.location.href = target;
            }, 250);
        });
    });

    // Mobile sidebar: add backdrop and close on backdrop click
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', () => {
            sidebar.classList.remove('open');
            backdrop.classList.remove('active');
        });
    }
}

function injectTopbar() {
    const topbar = document.getElementById('topbar');
    if (!topbar) return;

    let pageTitle = "Dashboard";
    const path = window.location.pathname;
    if (path.includes('projects.html')) pageTitle = "Website Portfolio";
    if (path.includes('tasks.html')) pageTitle = "Task Tracker";
    if (path.includes('worklog.html')) pageTitle = "Work Log";

    const email = auth.currentUser.email || '';
    const avatarUrl = getAvatarUrl(email);

    topbar.innerHTML = `
        <div style="display:flex; align-items:center; gap:16px;">
            <button class="mobile-nav-toggle" onclick="toggleMobileSidebar()">☰</button>
            <div class="page-title">${pageTitle}</div>
        </div>
        <div class="topbar-center" id="greeting-container">
            <!-- Greetings injected by JS -->
        </div>
        <div class="topbar-right">
            <div class="clock" id="live-clock">00:00:00</div>
            <svg class="notification-bell" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
            </svg>
            <img src="${avatarUrl}" class="avatar-circle" style="width: 32px; height: 32px; object-fit:cover; border: 1px solid var(--border-color);">
        </div>
    `;
}

// Mobile sidebar toggle with backdrop
window.toggleMobileSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (sidebar) {
        sidebar.classList.toggle('open');
        if (backdrop) backdrop.classList.toggle('active');
    }
};

function startClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    }, 1000);
}

function startGreetingRotation() {
    const container = document.getElementById('greeting-container');
    if (!container) return;

    const greetings = [
        "Welcome back 👋",
        "Ready to be productive? ✨",
        "Great work today! 🚀",
        "Let's get things done 🎯"
    ];

    let currentIndex = 0;

    function showNextGreeting() {
        // Remove old
        Array.from(container.children).forEach(child => {
            child.classList.remove('active');
            child.classList.add('exit');
            setTimeout(() => child.remove(), 500);
        });

        // Add new
        const el = document.createElement('div');
        el.className = 'greeting-text';
        el.textContent = greetings[currentIndex];
        container.appendChild(el);
        
        // Trigger reflow
        void el.offsetWidth;
        el.classList.add('active');

        currentIndex = (currentIndex + 1) % greetings.length;
    }

    showNextGreeting();
    setInterval(showNextGreeting, 4000);
}

function applyRolePermissions() {
    if (window.userRole !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
    if (window.userRole !== 'manager') {
        document.querySelectorAll('.manager-only').forEach(el => {
            el.style.display = 'none';
        });
    }
}

window.handleLogout = function() {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch(error => {
        showToast(error.message, 'error');
    });
};
