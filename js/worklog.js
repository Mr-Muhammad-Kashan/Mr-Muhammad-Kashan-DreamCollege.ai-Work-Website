let activeLogId = null;
let shiftStartTime = null;
let elapsedInterval = null;
let allLogs = [];
let onBreak = false;
let breakStartTime = null;
let totalBreakMs = 0;

document.addEventListener('DOMContentLoaded', () => {
    const initWorklog = async () => {
        startLocalClock();
        updateDateDisplay();
        
        if (window.userRole === 'admin') {
            await checkActiveShift();
        } else {
            const timeTracker = document.getElementById('time-tracker');
            if (timeTracker) timeTracker.style.display = 'none';
            const actionsHeader = document.getElementById('actions-header');
            if (actionsHeader) actionsHeader.style.display = 'none';
        }
        
        await fetchAllLogs();
        calculateStats();
        drawChart();
        loadHistoryTable();
        setupWorklogForm();
    };

    if (window.authReady) {
        initWorklog();
    } else {
        window.addEventListener('authReady', initWorklog);
    }
});

function setupWorklogForm() {
    const form = document.getElementById('worklog-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('worklog-id').value;
        const newDate = document.getElementById('worklog-date').value;
        const startStr = document.getElementById('worklog-start').value;
        const endStr = document.getElementById('worklog-end').value;
        const hours = parseFloat(document.getElementById('worklog-hours').value);
        const statusVal = document.getElementById('worklog-status') ? document.getElementById('worklog-status').value : 'complete';
        
        const newStart = new Date(`${newDate}T${startStr}`);
        const newEnd = new Date(`${newDate}T${endStr}`);
        
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const isWeekend = newStart.getDay() === 0 || newStart.getDay() === 6;
        
        // Use local ISO strings for storage
        const startISO = `${newDate}T${startStr}:00`;
        const endISO = `${newDate}T${endStr}:00`;
        
        // Find if this date already exists in allLogs (for duplicate prevention)
        const existingLog = allLogs.find(l => l.date === newDate && l.id !== id);
        const targetId = id || (existingLog ? existingLog.id : null);
        
        if (targetId) {
            try {
                await db.collection('worklogs').doc(targetId).update({
                    date: newDate,
                    start_time: startISO,
                    end_time: endISO,
                    total_hours: hours,
                    day_of_week: dayNames[newStart.getDay()],
                    is_weekend: isWeekend,
                    status: statusVal
                });
                showToast('Work log updated successfully', 'success');
                closeModal('worklog-modal');
                await fetchAllLogs();
                calculateStats();
                drawChart();
                loadHistoryTable();
            } catch(err) {
                showToast('Error updating log: ' + err.message, 'error');
            }
        } else {
            try {
                await db.collection('worklogs').add({
                    uid: auth.currentUser.uid,
                    date: newDate,
                    start_time: startISO,
                    end_time: endISO,
                    total_hours: hours,
                    day_of_week: dayNames[newStart.getDay()],
                    is_weekend: isWeekend,
                    status: statusVal
                });
                showToast('Manual work log created successfully', 'success');
                closeModal('worklog-modal');
                await fetchAllLogs();
                calculateStats();
                drawChart();
                loadHistoryTable();
            } catch(err) {
                showToast('Error creating log: ' + err.message, 'error');
            }
        }
    });
}

function startLocalClock() {
    const clock = document.getElementById('tracker-clock');
    if(!clock) return;
    setInterval(() => {
        clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }, 1000);
}

function updateDateDisplay() {
    const d = document.getElementById('tracker-date');
    if(!d) return;
    d.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function checkActiveShift() {
    try {
        const snap = await db.collection('worklogs')
            .where('uid', '==', auth.currentUser.uid)
            .get();
            
        let activeDoc = null;
        snap.forEach(doc => {
            const s = doc.data().status;
            if (s === 'active' || s === 'on_break') activeDoc = doc;
        });

        if (activeDoc) {
            activeLogId = activeDoc.id;
            shiftStartTime = new Date(activeDoc.data().start_time);
            const status = activeDoc.data().status;
            
            document.getElementById('btn-start').disabled = true;
            document.getElementById('btn-break').disabled = false;
            document.getElementById('btn-end').disabled = false;
            
            if (status === 'on_break') {
                onBreak = true;
                breakStartTime = new Date();
                updateBreakBtn();
            }
            
            totalBreakMs = (activeDoc.data().total_break_minutes || 0) * 60 * 1000;
            startElapsedTimerV2();
        }
    } catch(e) {
        console.error("Error checking active shift:", e);
    }
}

// Helper: Get local date string YYYY-MM-DD (avoids UTC timezone shift)
function getLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Helper: Get local ISO-like string for storage (preserves local time)
function getLocalISOString(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}:${mi}:${s}`;
}

async function startShift() {
    const now = new Date();
    const today = getLocalDateStr(now);
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    
    // Prevent Duplicate Dates: Upsert logic
    const existingLog = allLogs.find(l => l.date === today);
    let docId;
    
    try {
        if (existingLog) {
            docId = existingLog.id;
            await db.collection('worklogs').doc(docId).update({
                start_time: getLocalISOString(now),
                status: 'active'
            });
        } else {
            const logData = {
                uid: auth.currentUser.uid,
                date: today,
                day_of_week: dayNames[now.getDay()],
                start_time: getLocalISOString(now),
                is_weekend: isWeekend,
                status: 'active'
            };
            const docRef = await db.collection('worklogs').add(logData);
            docId = docRef.id;
        }
        
        activeLogId = docId;
        shiftStartTime = now;
        
        document.getElementById('btn-start').disabled = true;
        document.getElementById('btn-break').disabled = false;
        document.getElementById('btn-end').disabled = false;
        
        startElapsedTimerV2();
        showToast('Day started! 🚀', 'success');
    } catch(e) {
        showToast('Failed to start shift: ' + e.message, 'error');
    }
}

async function endShift() {
    if (!activeLogId || !shiftStartTime) return;
    
    const now = new Date();
    const diffMs = now - shiftStartTime;
    const totalHours = diffMs / (1000 * 60 * 60);
    
    try {
        await db.collection('worklogs').doc(activeLogId).update({
            end_time: getLocalISOString(now),
            total_hours: totalHours,
            status: 'complete'
        });
        
        const hrs = Math.floor(totalHours);
        const mins = Math.floor((totalHours - hrs) * 60);
        showToast(`Shift ended! You worked ${hrs}h ${mins}m today 🎉`, 'success');
        
        clearInterval(elapsedInterval);
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-end').disabled = true;
        document.getElementById('elapsed-time').classList.remove('active');
        
        activeLogId = null;
        shiftStartTime = null;
        
        // Refresh data
        await fetchAllLogs();
        calculateStats();
        drawChart();
        loadHistoryTable();
        
    } catch(e) {
        showToast('Failed to end shift: ' + e.message, 'error');
    }
}

function startElapsedTimer() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    const el = document.getElementById('elapsed-time');
    
    elapsedInterval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now - shiftStartTime) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        el.textContent = `Time elapsed: ${h}:${m}:${s}`;
    }, 1000);
}

// Stats & Data
async function fetchAllLogs() {
    try {
        const snap = await db.collection('worklogs').get();
            
        allLogs = [];
        snap.forEach(doc => {
            // Load ALL logs regardless of status (active, on_break, complete)
            allLogs.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by date descending using manual parsing to avoid UTC shift
        allLogs.sort((a, b) => {
            if (!a.date || !b.date) return 0;
            const pa = a.date.split('-');
            const pb = b.date.split('-');
            const da = new Date(parseInt(pa[0]), parseInt(pa[1])-1, parseInt(pa[2])).getTime();
            const db2 = new Date(parseInt(pb[0]), parseInt(pb[1])-1, parseInt(pb[2])).getTime();
            return db2 - da; // Latest date first
        });
    } catch(e) {
        console.error("Error fetching logs:", e);
    }
}

function calculateStats() {
    const now = new Date();
    
    // This week (Monday start)
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0,0,0,0);
    
    // This month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let weekHrs = 0;
    let monthHrs = 0;
    let weekendHrs = 0;
    
    const monthLogs = new Set();
    
    allLogs.forEach(log => {
        // Parse date from string manually to avoid timezone shifting
        const parts = log.date.split('-');
        if (parts.length === 3) {
            const yyyy = parseInt(parts[0], 10);
            const mm = parseInt(parts[1], 10);
            const dd = parseInt(parts[2], 10);
            const logDate = new Date(yyyy, mm - 1, dd);
            
            const hrs = parseFloat(log.total_hours) || 0;
            
            if (logDate >= startOfWeek) {
                weekHrs += hrs;
            }
            if (logDate >= startOfMonth) {
                monthHrs += hrs;
                monthLogs.add(log.date);
                if (log.is_weekend || logDate.getDay() === 0 || logDate.getDay() === 6) {
                    weekendHrs += hrs;
                }
            }
        }
    });
    
    const monthDaysWorked = monthLogs.size;
    const avgHrs = monthDaysWorked > 0 ? (monthHrs / monthDaysWorked) : 0;
    
    animateValue('stat-week-hrs', 0, weekHrs, 1000);
    animateValue('stat-month-hrs', 0, monthHrs, 1000);
    animateValue('stat-weekends', 0, weekendHrs, 1000);
    animateValue('stat-avg', 0, avgHrs, 1000);
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
        obj.innerHTML = Number.isInteger(end) ? Math.floor(current) : current.toFixed(2);
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.innerHTML = Number.isInteger(end) ? end : end.toFixed(2);
    };
    window.requestAnimationFrame(step);
}

// Chart
function drawChart() {
    const canvas = document.getElementById('hoursChart');
    const filterEl = document.getElementById('chart-filter');
    if (!canvas || !filterEl) return;
    const ctx = canvas.getContext('2d');
    
    // Get container width
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 48; // padding
    canvas.height = 300;
    
    const width = canvas.width;
    const height = canvas.height;
    
    const filter = filterEl.value;
    const now = new Date();
    
    let labels = [];
    let data = [];
    
    if (filter === 'this-week') {
        const day = now.getDay();
        const monDiff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now.getFullYear(), now.getMonth(), monDiff, 0, 0, 0, 0);
        
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        data = [0,0,0,0,0,0,0];
        
        allLogs.forEach(log => {
            if (!log.date) return;
            const p = log.date.split('-');
            const d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
            if (d >= monday) {
                const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                if(idx >= 0 && idx <= 6) data[idx] += log.total_hours || 0;
            }
        });
    } else if (filter === 'this-month' || filter === 'last-month') {
        const targetDate = filter === 'this-month' ? now : new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Group by 4 weeks (roughly 7-8 days each)
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        data = [0,0,0,0];
        
        allLogs.forEach(log => {
            if (!log.date) return;
            const p = log.date.split('-');
            const d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
            if (d.getFullYear() === year && d.getMonth() === month) {
                const dateNum = d.getDate();
                let weekIdx = Math.floor((dateNum - 1) / 7);
                if (weekIdx > 3) weekIdx = 3;
                data[weekIdx] += log.total_hours || 0;
            }
        });
    } else {
        // 'all' -> group by months this year
        const year = now.getFullYear();
        labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        data = [0,0,0,0,0,0,0,0,0,0,0,0];
        
        allLogs.forEach(log => {
            if (!log.date) return;
            const p = log.date.split('-');
            const d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
            if (d.getFullYear() === year) {
                data[d.getMonth()] += log.total_hours || 0;
            }
        });
    }
    
    const maxVal = Math.max(...data, 8); // At least 8 to show scale
    
    let animationProgress = 0;
    
    function render() {
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = '#F3F4F6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<=4; i++) {
            const y = height - 30 - (i/4) * (height - 60);
            ctx.moveTo(40, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
        
        // Y labels
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '12px Inter';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for(let i=0; i<=4; i++) {
            const y = height - 30 - (i/4) * (height - 60);
            const val = (maxVal * (i/4)).toFixed(1);
            ctx.fillText(val, 30, y);
        }
        
        // Bars
        const numBars = labels.length;
        const barWidth = Math.min(40, (width - 60) / numBars - 10);
        const spacing = (width - 60 - (barWidth * numBars)) / (numBars + 1);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        labels.forEach((label, i) => {
            const x = 40 + spacing * (i+1) + barWidth * i;
            const barH = (data[i] / maxVal) * (height - 60) * animationProgress;
            const y = height - 30 - barH;
            
            // X label
            ctx.fillStyle = '#6B7280';
            ctx.fillText(label, x + barWidth/2, height - 20);
            
            if (barH > 0) {
                // Gradient
                const grad = ctx.createLinearGradient(0, y, 0, height - 30);
                if (filter === 'this-week' && i >= 5) {
                    // Weekend pink
                    grad.addColorStop(0, '#EC4899');
                    grad.addColorStop(1, '#F9A8D4');
                } else {
                    grad.addColorStop(0, '#7C3AED');
                    grad.addColorStop(1, '#A78BFA');
                }
                
                ctx.fillStyle = grad;
                
                // Rounded top
                const r = Math.min(8, barH);
                ctx.beginPath();
                ctx.moveTo(x, height - 30);
                ctx.lineTo(x, y + r);
                ctx.arcTo(x, y, x + r, y, r);
                ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r);
                ctx.lineTo(x + barWidth, height - 30);
                ctx.closePath();
                ctx.fill();
            }
        });
        
        if (animationProgress < 1) {
            animationProgress += 0.05;
            requestAnimationFrame(render);
        }
    }
    
    render();
}

let sortCol = 'date';
let sortDesc = true;

function sortTable(col) {
    if (sortCol === col) {
        sortDesc = !sortDesc;
    } else {
        sortCol = col;
        sortDesc = (col === 'date' || col === 'total_hours'); 
    }
    loadHistoryTable();
}

// Table
function loadHistoryTable() {
    const filter = document.getElementById('log-filter').value;
    const tbody = document.getElementById('history-body');
    const emptyEl = document.getElementById('table-empty');
    
    if(!tbody) return;
    
    const now = new Date();
    let startDate = new Date(0);
    let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    if (filter === 'this-week') {
        const day = now.getDay();
        const monDiff = now.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(now.getFullYear(), now.getMonth(), monDiff, 0, 0, 0, 0);
    } else if (filter === 'this-month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (filter === 'last-month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    }
    
    // Parse date strings manually to avoid UTC timezone issues
    // "2026-04-30" must be treated as LOCAL April 30, not UTC
    let filteredLogs = allLogs.filter(log => {
        if (!log.date) return false;
        const parts = log.date.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        return d >= startDate && d <= endDate;
    });
    
    filteredLogs.sort((a, b) => {
        let valA, valB;
        if (sortCol === 'date') {
            // Parse dates manually to avoid UTC shift
            const pa = a.date.split('-');
            const pb = b.date.split('-');
            valA = new Date(parseInt(pa[0]), parseInt(pa[1])-1, parseInt(pa[2])).getTime();
            valB = new Date(parseInt(pb[0]), parseInt(pb[1])-1, parseInt(pb[2])).getTime();
        } else if (sortCol === 'total_hours') {
            valA = parseFloat(a.total_hours) || 0;
            valB = parseFloat(b.total_hours) || 0;
        } else if (sortCol === 'status') {
            const getStatus = (log) => {
                if (log.is_weekend) return 'Extra Work';
                if (log.csv_status && log.csv_status.toLowerCase().includes('off')) return 'Off Day';
                if (log.total_hours === 0) return 'Off Day';
                if (log.total_hours < 8) return 'Under Time';
                if (log.total_hours > 8) return 'Overtime';
                return 'Completed';
            };
            valA = getStatus(a);
            valB = getStatus(b);
        } else if (sortCol === 'is_weekend') {
            valA = a.is_weekend ? 1 : 0;
            valB = b.is_weekend ? 1 : 0;
        } else {
            valA = String(a[sortCol] || '').toLowerCase();
            valB = String(b[sortCol] || '').toLowerCase();
        }
        
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });
    
    tbody.innerHTML = '';
    
    if (filteredLogs.length === 0) {
        tbody.parentElement.style.display = 'none';
        emptyEl.style.display = 'block';
        return;
    }
    
    tbody.parentElement.style.display = 'table';
    emptyEl.style.display = 'none';
    
    filteredLogs.forEach(log => {
        const hrs = log.total_hours || 0;
        
        let statusText = '';
        let statusBadgeClass = '';
        let dayTypeBadge = '';
        
        if (log.is_weekend) {
            dayTypeBadge = '<span class="badge badge-purple">Weekend</span>';
            statusText = 'Extra Work';
            statusBadgeClass = 'badge-blue';
        } else {
            dayTypeBadge = '<span class="badge badge-yellow">Normal Day</span>';
            if (log.csv_status && log.csv_status.toLowerCase().includes('off')) {
                statusText = 'Off Day';
                statusBadgeClass = 'badge-gray';
            } else if (hrs === 0) {
                statusText = 'Off Day';
                statusBadgeClass = 'badge-gray';
            } else if (hrs < 8) {
                statusText = 'Under Time';
                statusBadgeClass = 'badge-red';
            } else if (hrs > 8) {
                statusText = 'Overtime';
                statusBadgeClass = 'badge-yellow';
            } else {
                statusText = 'Completed';
                statusBadgeClass = 'badge-green';
            }
        }
        
        // Add inline style for badge-gray if it's not in CSS
        if (statusBadgeClass === 'badge-gray') {
            statusBadgeClass = 'badge-gray" style="background: rgba(156, 163, 175, 0.2); color: #9CA3AF; border: 1px solid rgba(156, 163, 175, 0.3);';
        }
        
        const statusBadge = `<span class="badge ${statusBadgeClass}">${statusText}</span>`;
            
        const adminActions = window.userRole === 'admin' 
            ? `<td class="admin-only" style="text-align:right;"><button class="btn btn-outline" style="padding:4px 12px; font-size:0.8rem; border-radius:12px; background: rgba(255,255,255,0.5); box-shadow:0 2px 5px rgba(0,0,0,0.05);" onclick="editWorklog('${log.id}')" title="Edit">✎ Edit</button></td>` 
            : ``;

        // Safely display start and end times
        let startTimeDisplay = '--';
        let endTimeDisplay = '--';
        if (log.start_time) {
            try { startTimeDisplay = new Date(log.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch(e) { startTimeDisplay = log.start_time; }
        }
        if (log.end_time) {
            try { endTimeDisplay = new Date(log.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch(e) { endTimeDisplay = log.end_time; }
        }
        // Show 'Active' or 'On Break' for incomplete logs
        if (log.status === 'active') {
            endTimeDisplay = '<span class="badge badge-green">Active Now</span>';
        } else if (log.status === 'on_break') {
            endTimeDisplay = '<span class="badge badge-yellow">On Break</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${log.date}</strong></td>
            <td>${log.day_of_week || '--'}</td>
            <td>${dayTypeBadge}</td>
            <td>${startTimeDisplay}</td>
            <td>${endTimeDisplay}</td>
            <td style="font-weight:600;">${hrs.toFixed(2)} hrs</td>
            <td>${statusBadge}</td>
            ${adminActions}
        `;
        tbody.appendChild(tr);
    });
    
    // Also update the chart to reflect the current filter
    drawChart();
}

function editWorklog(id) {
    const log = allLogs.find(l => l.id === id);
    if (!log) return;
    
    document.getElementById('worklog-id').value = log.id;
    document.getElementById('worklog-date').value = log.date;
    
    const fallbackDate = log.date || getLocalDateStr(new Date());
    const parseSafeDate = (value, dateStr, timeStr) => {
        const d = value ? new Date(value) : new Date(`${dateStr}T${timeStr}`);
        return isNaN(d.getTime()) ? new Date(`${dateStr}T${timeStr}`) : d;
    };

    const start = parseSafeDate(log.start_time, fallbackDate, '09:00');
    const startHH = String(start.getHours()).padStart(2, '0');
    const startMM = String(start.getMinutes()).padStart(2, '0');
    const endFallback = `${startHH}:${startMM}`;
    const end = parseSafeDate(log.end_time, fallbackDate, endFallback);
    const endHH = String(end.getHours()).padStart(2, '0');
    const endMM = String(end.getMinutes()).padStart(2, '0');
    
    document.getElementById('worklog-start').value = `${startHH}:${startMM}`;
    document.getElementById('worklog-end').value = `${endHH}:${endMM}`;
    document.getElementById('worklog-hours').value = (log.total_hours || 0).toFixed(2);
    
    // Set status in dropdown
    const statusEl = document.getElementById('worklog-status');
    if (statusEl) statusEl.value = log.status || 'complete';
    
    document.getElementById('worklog-delete-btn').style.display = 'block';
    openModal('worklog-modal');
}

function openAddLogModal() {
    document.getElementById('worklog-id').value = '';
    const now = new Date();
    document.getElementById('worklog-date').value = getLocalDateStr(now);
    document.getElementById('worklog-start').value = '09:00';
    document.getElementById('worklog-end').value = '17:00';
    document.getElementById('worklog-hours').value = '8.00';
    
    const statusEl = document.getElementById('worklog-status');
    if (statusEl) statusEl.value = 'complete';
    
    document.getElementById('worklog-delete-btn').style.display = 'none';
    openModal('worklog-modal');
}

async function deleteWorklog() {
    const id = document.getElementById('worklog-id').value;
    if (!id) return;
    
    if (confirm('Are you sure you want to delete this log?')) {
        try {
            await db.collection('worklogs').doc(id).delete();
            showToast('Work log deleted', 'success');
            closeModal('worklog-modal');
            await fetchAllLogs();
            calculateStats();
            drawChart();
            loadHistoryTable();
        } catch(error) {
            showToast('Error deleting log: ' + error.message, 'error');
        }
    }
}

// Modal Utility Functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        // Reset form if it's the worklog modal
        if (modalId === 'worklog-modal') {
            const form = document.getElementById('worklog-form');
            if (form) form.reset();
            document.getElementById('worklog-id').value = '';
        }
    }
}

window.removeAllWorklogs = async function() {
    if (!confirm('Are you ABSOLUTELY sure you want to delete ALL your worklog data? This cannot be undone.')) {
        return;
    }
    
    showToast('Deleting all worklogs...', 'info');
    try {
        // Fetch ALL worklogs to catch legacy duplicates that might not have a UID
        const snap = await db.collection('worklogs').get();
            
        let batches = [];
        let currentBatch = db.batch();
        let count = 0;
        let totalDeleted = 0;
        
        snap.forEach(doc => {
            const data = doc.data();
            // Delete if it belongs to current user, OR if it has NO uid (corrupted legacy import)
            if (data.uid === auth.currentUser.uid || !data.uid) {
                currentBatch.delete(doc.ref);
                count++;
                totalDeleted++;
                
                if (count === 490) { // Firestore limit is 500 operations per batch
                    batches.push(currentBatch.commit());
                    currentBatch = db.batch();
                    count = 0;
                }
            }
        });
        
        if (count > 0) {
            batches.push(currentBatch.commit());
        }
        
        await Promise.all(batches);
        
        showToast(`Successfully deleted ${totalDeleted} logs!`, 'success');
        
        await fetchAllLogs();
        calculateStats();
        drawChart();
        loadHistoryTable();
    } catch(err) {
        showToast('Error deleting data: ' + err.message, 'error');
        console.error(err);
    }
};

// ====== BREAK SYSTEM FUNCTIONS ======

// startDay = same as startShift, wired to new HTML button
window.startDay = async function() {
    await startShift();
    // Show time pills
    const el = document.getElementById('elapsed-time');
    const br = document.getElementById('break-time');
    const net = document.getElementById('net-time');
    if(el) el.classList.add('active');
    if(br) br.classList.add('active');
    if(net) net.classList.add('active');
    // Reset break state
    onBreak = false;
    breakStartTime = null;
    totalBreakMs = 0;
    updateBreakBtn();
    // Refresh history table to show the new active log
    await fetchAllLogs();
    calculateStats();
    drawChart();
    loadHistoryTable();
};

// endDay = same as endShift but subtracts break time
window.endDay = async function() {
    if (!activeLogId || !shiftStartTime) return;
    
    // If currently on break, end it first
    if (onBreak && breakStartTime) {
        totalBreakMs += (new Date() - breakStartTime);
        breakStartTime = null;
        onBreak = false;
    }
    
    const now = new Date();
    const grossMs = now - shiftStartTime;
    const netMs = grossMs - totalBreakMs;
    const grossHours = grossMs / (1000 * 60 * 60);
    const netHours = Math.max(0, netMs / (1000 * 60 * 60));
    const totalBreakMinutes = Math.round(totalBreakMs / (1000 * 60));
    
    try {
        await db.collection('worklogs').doc(activeLogId).update({
            end_time: getLocalISOString(now),
            total_hours: netHours,
            gross_hours: grossHours,
            total_break_minutes: totalBreakMinutes,
            status: 'complete'
        });
        
        const hrs = Math.floor(netHours);
        const mins = Math.floor((netHours - hrs) * 60);
        showToast(`Day ended! Net work: ${hrs}h ${mins}m 🎉`, 'success');
        
        clearInterval(elapsedInterval);
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-break').disabled = true;
        document.getElementById('btn-end').disabled = true;
        
        const el = document.getElementById('elapsed-time');
        const br = document.getElementById('break-time');
        const net = document.getElementById('net-time');
        if(el) el.classList.remove('active');
        if(br) br.classList.remove('active');
        if(net) net.classList.remove('active');
        
        activeLogId = null;
        shiftStartTime = null;
        totalBreakMs = 0;
        onBreak = false;
        breakStartTime = null;
        updateBreakBtn();
        
        await fetchAllLogs();
        calculateStats();
        drawChart();
        loadHistoryTable();
    } catch(e) {
        showToast('Failed to end day: ' + e.message, 'error');
    }
};

// toggleBreak: pause/resume
window.toggleBreak = function() {
    if (!activeLogId || !shiftStartTime) return;
    
    if (!onBreak) {
        // Start break
        onBreak = true;
        breakStartTime = new Date();
        showToast('Break started ☕ Enjoy!', 'info');
        
        // Update Firebase status
        db.collection('worklogs').doc(activeLogId).update({ status: 'on_break' }).catch(()=>{});
    } else {
        // End break
        if (breakStartTime) {
            totalBreakMs += (new Date() - breakStartTime);
        }
        onBreak = false;
        breakStartTime = null;
        showToast('Break ended! Back to work 💪', 'success');
        
        // Update Firebase status
        db.collection('worklogs').doc(activeLogId).update({ status: 'active' }).catch(()=>{});
    }
    updateBreakBtn();
};

function updateBreakBtn() {
    const btn = document.getElementById('btn-break');
    if (!btn) return;
    if (onBreak) {
        btn.textContent = '▶ Resume Work';
        btn.className = 'btn btn-tracker btn-resume';
    } else {
        btn.textContent = '☕ Take Break';
        btn.className = 'btn btn-tracker btn-break';
    }
}

// Override the elapsed timer to show break and net work
function startElapsedTimerV2() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    const elEl = document.getElementById('elapsed-time');
    const brEl = document.getElementById('break-time');
    const netEl = document.getElementById('net-time');
    
    if(elEl) elEl.classList.add('active');
    if(brEl) brEl.classList.add('active');
    if(netEl) netEl.classList.add('active');
    
    elapsedInterval = setInterval(() => {
        const now = new Date();
        const elapsedMs = now - shiftStartTime;
        
        let currentBreakMs = totalBreakMs;
        if (onBreak && breakStartTime) {
            currentBreakMs += (now - breakStartTime);
        }
        const netMs = Math.max(0, elapsedMs - currentBreakMs);
        
        if(elEl) elEl.querySelector('span:last-child').textContent = 'Elapsed: ' + formatMs(elapsedMs);
        if(brEl) brEl.querySelector('span:last-child').textContent = 'Break: ' + formatMs(currentBreakMs);
        if(netEl) netEl.querySelector('span:last-child').textContent = 'Net Work: ' + formatMs(netMs);
    }, 1000);
}

function formatMs(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

