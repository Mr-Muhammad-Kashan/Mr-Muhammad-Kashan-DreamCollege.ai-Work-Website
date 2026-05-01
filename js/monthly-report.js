// Monthly Report - Data Engine
// Fetches worklog data and generates comprehensive monthly statistics

// Polyfill for roundRect (older browsers)
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
        const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
        this.moveTo(x + r[0], y);
        this.lineTo(x + w - r[1], y);
        this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
        this.lineTo(x + w, y + h - r[2]);
        this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
        this.lineTo(x + r[3], y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
        this.lineTo(x, y + r[0]);
        this.quadraticCurveTo(x, y, x + r[0], y);
        this.closePath();
        return this;
    };
}

let reportYear, reportMonth;
let reportLogs = [];

const MIN_REPORT_YEAR = 2025;
const MIN_REPORT_MONTH = 9; // October (0-indexed)

function monthKey(year, month) {
    return (year * 12) + month;
}

function getMaxReportKey() {
    const now = new Date();
    return monthKey(now.getFullYear(), now.getMonth());
}

function setReportMonthFromKey(key) {
    reportYear = Math.floor(key / 12);
    reportMonth = key % 12;
}

function clampReportMonthToRange() {
    const minKey = monthKey(MIN_REPORT_YEAR, MIN_REPORT_MONTH);
    const maxKey = getMaxReportKey();
    const currentKey = monthKey(reportYear, reportMonth);
    const clamped = Math.min(Math.max(currentKey, minKey), maxKey);
    setReportMonthFromKey(clamped);
}

function updateNavButtons() {
    const prevBtn = document.getElementById('btn-prev-month');
    const nextBtn = document.getElementById('btn-next-month');
    if (!prevBtn || !nextBtn) return;

    const minKey = monthKey(MIN_REPORT_YEAR, MIN_REPORT_MONTH);
    const maxKey = getMaxReportKey();
    const currentKey = monthKey(reportYear, reportMonth);
    const prevDisabled = currentKey <= minKey;
    const nextDisabled = currentKey >= maxKey;

    prevBtn.disabled = prevDisabled;
    prevBtn.style.opacity = prevDisabled ? '0.4' : '1';
    nextBtn.disabled = nextDisabled;
    nextBtn.style.opacity = nextDisabled ? '0.4' : '1';
}

function triggerMonthAnimation() {
    const content = document.getElementById('monthly-report-content');
    if (!content) return;
    content.classList.remove('month-switch');
    void content.offsetWidth;
    content.classList.add('month-switch');
}

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    reportYear = now.getFullYear();
    reportMonth = now.getMonth(); // 0-indexed
    clampReportMonthToRange();

    const init = async () => {
        await loadReportData();
        renderReport();
    };

    if (window.authReady) { init(); }
    else { window.addEventListener('authReady', init); }
});

// ============ NAVIGATION ============
window.changeMonth = function(delta) {
    const minKey = monthKey(MIN_REPORT_YEAR, MIN_REPORT_MONTH);
    const maxKey = getMaxReportKey();
    const nextKey = monthKey(reportYear, reportMonth) + delta;
    const finalKey = Math.min(Math.max(nextKey, minKey), maxKey);
    setReportMonthFromKey(finalKey);
    loadReportData().then(() => renderReport());
};

// ============ DATA LOADING ============
async function loadReportData() {
    try {
        const snap = await db.collection('worklogs').get();
        reportLogs = [];
        snap.forEach(doc => {
            const data = doc.data();
            if (!data.date) return;
            const parts = data.date.split('-');
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]) - 1;
            if (y === reportYear && m === reportMonth) {
                reportLogs.push({ id: doc.id, ...data });
            }
        });
        // Sort by date ascending
        reportLogs.sort((a, b) => a.date.localeCompare(b.date));
    } catch(e) {
        console.error('Error loading report data:', e);
    }
}

// ============ HELPER: Parse date safely ============
function parseLocalDate(dateStr) {
    const p = dateStr.split('-');
    return new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
}

// ============ HELPER: Count weekdays in a month ============
function countWeekdays(year, month) {
    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === year && now.getMonth() === month);

    // If it's the current month, only count expected days up to today
    const endDay = isCurrentMonth ? now.getDate() : new Date(year, month + 1, 0).getDate();

    let weekdays = 0;
    for (let d = 1; d <= endDay; d++) {
        const day = new Date(year, month, d).getDay();
        if (day !== 0 && day !== 6) weekdays++;
    }

    // Let's also return total weekdays in month for the progress bar text if needed
    let totalWeekdays = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(year, month, d).getDay();
        if (day !== 0 && day !== 6) totalWeekdays++;
    }

    return { passed: weekdays, total: totalWeekdays };
}

// ============ MAIN RENDER ============
function renderReport() {
    // Month label
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('month-label').textContent = `${monthNames[reportMonth]} ${reportYear}`;
    updateNavButtons();

    // ---- CALCULATIONS ----
    const weekdaysInfo = countWeekdays(reportYear, reportMonth);
    const expectedHours = weekdaysInfo.passed * 8;
    const totalExpectedHoursInMonth = weekdaysInfo.total * 8;
    const daysInMonth = new Date(reportYear, reportMonth + 1, 0).getDate();

    let totalActual = 0;
    let weekdayActual = 0;
    let weekendActual = 0;
    let daysWorked = 0;
    let weekendDaysWorked = 0;
    const weekendLogs = [];
    const dailyMap = {}; // date string -> log data
    const isEmptyMonth = reportLogs.length === 0;

    reportLogs.forEach(log => {
        const hrs = parseFloat(log.total_hours) || 0;
        const d = parseLocalDate(log.date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;

        totalActual += hrs;
        dailyMap[log.date] = log;

        if (isWeekend) {
            weekendActual += hrs;
            if (hrs > 0) {
                weekendDaysWorked++;
                weekendLogs.push(log);
            }
        } else {
            weekdayActual += hrs;
            if (hrs > 0) daysWorked++;
        }
    });

    const overtime = totalActual - expectedHours;
    const weekdayOvertime = weekdayActual - expectedHours;
    const avgPerDay = daysWorked > 0 ? (weekdayActual / daysWorked) : 0;

    // ---- SUMMARY CARDS ----
    document.getElementById('expected-hours').textContent = expectedHours.toFixed(1);
    document.getElementById('expected-sub').textContent = `Target so far: ${weekdaysInfo.passed} weekdays × 8 hrs/day`;

    document.getElementById('actual-hours').textContent = totalActual.toFixed(1);
    document.getElementById('actual-sub').textContent = `${daysWorked} weekday${daysWorked !== 1 ? 's' : ''} worked · Avg ${avgPerDay.toFixed(1)} hrs/day`;

    const overtimeSign = overtime >= 0 ? '+' : '';
    document.getElementById('overtime-hours').textContent = `${overtimeSign}${overtime.toFixed(1)}`;
    document.getElementById('overtime-hours').style.color = overtime >= 0 ? '#10B981' : '#EF4444';
    if (overtime >= 0) {
        document.getElementById('overtime-sub').textContent = `Overworked by ${overtime.toFixed(1)} hrs this month 💪`;
    } else {
        document.getElementById('overtime-sub').textContent = `Deficit of ${Math.abs(overtime).toFixed(1)} hrs to meet target`;
    }

    document.getElementById('weekend-hours').textContent = weekendActual.toFixed(1);
    document.getElementById('weekend-sub').textContent = `${weekendDaysWorked} weekend day${weekendDaysWorked !== 1 ? 's' : ''} worked`;

    // ---- PROGRESS BAR (Dual-fill: base + overtime) ----
    const baseEl = document.getElementById('progress-fill-base');
    const overtimeEl = document.getElementById('progress-fill-overtime');
    const container = document.getElementById('progress-container');
    const pctLabel = document.getElementById('progress-pct-label');
    const legendEl = document.getElementById('progress-legend');

    baseEl.className = 'progress-fill-base';
    baseEl.style.width = '0%';
    baseEl.style.background = '';
    overtimeEl.style.width = '0%';
    overtimeEl.style.background = '';
    container.style.overflow = 'visible';
    pctLabel.style.color = 'var(--text-dark)';
    legendEl.innerHTML = '';

    if (expectedHours > 0) {
        if (isEmptyMonth && totalActual === 0) {
            baseEl.className = 'progress-fill-base empty';
            pctLabel.textContent = 'No data for this month';
            pctLabel.style.color = '#6B7280';
            legendEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="width:12px;height:12px;border-radius:3px;background:#E5E7EB;border:1px solid #D1D5DB;display:inline-block;"></span>
                    No work logs yet
                </div>
            `;
        } else {
            const rawPct = (totalActual / expectedHours) * 100;

            if (rawPct <= 100) {
                // Under or at target: only show base fill
                baseEl.style.width = rawPct + '%';
                baseEl.className = 'progress-fill-base no-overtime';

                if (rawPct < 50) {
                    baseEl.style.background = 'linear-gradient(90deg, #EF4444, #F87171)';
                } else if (rawPct < 80) {
                    baseEl.style.background = 'linear-gradient(90deg, #F59E0B, #FBBF24)';
                }

                pctLabel.textContent = `${rawPct.toFixed(0)}% completed`;
                pctLabel.style.color = rawPct >= 80 ? '#059669' : (rawPct >= 50 ? '#D97706' : '#DC2626');
                legendEl.innerHTML = `
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="width:12px;height:12px;border-radius:3px;background:#10B981;display:inline-block;"></span>
                        Completed: ${totalActual.toFixed(1)} hrs
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="width:12px;height:12px;border-radius:3px;background:#F3F4F6;border:1px solid #D1D5DB;display:inline-block;"></span>
                        Remaining: ${(expectedHours - totalActual).toFixed(1)} hrs
                    </div>
                `;
            } else {
                // Over target: base fills 100%, overtime extends
                const maxPct = rawPct;
                const basePortion = (100 / maxPct) * 100;
                const overPortion = 100 - basePortion;

                container.style.overflow = 'hidden';
                baseEl.style.width = basePortion + '%';
                baseEl.className = 'progress-fill-base full';
                overtimeEl.style.width = overPortion + '%';

                pctLabel.textContent = `${rawPct.toFixed(0)}% — Overworked by ${overtime.toFixed(1)} hrs 💪`;
                pctLabel.style.color = '#D97706';
                legendEl.innerHTML = `
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="width:12px;height:12px;border-radius:3px;background:#10B981;display:inline-block;"></span>
                        Required: ${expectedHours.toFixed(1)} hrs (100%)
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="width:12px;height:12px;border-radius:3px;background:#F59E0B;display:inline-block;"></span>
                        Extra Work: ${overtime.toFixed(1)} hrs (+${(rawPct - 100).toFixed(0)}%)
                    </div>
                `;
            }
        }
    }
    document.getElementById('progress-target').textContent = `Target so far: ${expectedHours} hrs (Total month: ${totalExpectedHoursInMonth} hrs)`;

    // ---- DAILY CHART ----
    drawDailyChart(dailyMap, daysInMonth);

    // ---- PIE CHART ----
    drawPieChart(weekdayActual, weekendActual, expectedHours);

    // ---- WEEKEND ANALYSIS ----
    renderWeekendAnalysis(weekendLogs, weekendActual, weekendDaysWorked);

    // ---- DAILY TABLE ----
    renderDailyTable(dailyMap, daysInMonth);

    triggerMonthAnimation();
}

// ============ DAILY BAR CHART ============
function drawDailyChart(dailyMap, daysInMonth) {
    const canvas = document.getElementById('daily-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(rect.width - 20, daysInMonth * 28);
    canvas.height = 280;
    const W = canvas.width, H = canvas.height;
    const padLeft = 45, padRight = 10, padTop = 20, padBottom = 40;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    ctx.clearRect(0, 0, W, H);

    // Collect data
    const values = [];
    const labels = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${reportYear}-${String(reportMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = dailyMap[ds];
        values.push(log ? (parseFloat(log.total_hours) || 0) : 0);
        labels.push(String(d));
    }

    const maxVal = Math.max(...values, 8);
    const barW = Math.max(12, (chartW / daysInMonth) - 4);
    const gap = (chartW - barW * daysInMonth) / (daysInMonth + 1);

    // Grid lines
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
        const y = padTop + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(W - padRight, y); ctx.stroke();
        const val = (maxVal * (4 - i) / 4).toFixed(0);
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '11px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(val + 'h', padLeft - 6, y + 4);
    }
    ctx.setLineDash([]);

    // 8-hour reference line
    const refY = padTop + chartH - (8 / maxVal) * chartH;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(padLeft, refY); ctx.lineTo(W - padRight, refY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 10px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('8h target', padLeft + 4, refY - 5);

    // Bars
    for (let i = 0; i < daysInMonth; i++) {
        const x = padLeft + gap + i * (barW + gap);
        const val = values[i];
        const barH = (val / maxVal) * chartH;
        const y = padTop + chartH - barH;

        const dateObj = new Date(reportYear, reportMonth, i + 1);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

        if (val > 0) {
            const grad = ctx.createLinearGradient(x, y, x, padTop + chartH);
            if (isWeekend) {
                grad.addColorStop(0, '#8B5CF6');
                grad.addColorStop(1, '#C4B5FD');
            } else if (val >= 8) {
                grad.addColorStop(0, '#10B981');
                grad.addColorStop(1, '#6EE7B7');
            } else {
                grad.addColorStop(0, '#F59E0B');
                grad.addColorStop(1, '#FDE68A');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            const r = Math.min(4, barW / 2);
            ctx.roundRect(x, y, barW, barH, [r, r, 0, 0]);
            ctx.fill();

            // Value on top
            if (val > 0.1) {
                ctx.fillStyle = '#374151';
                ctx.font = 'bold 9px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(val.toFixed(1), x + barW / 2, y - 4);
            }
        }

        // Day label
        ctx.fillStyle = isWeekend ? '#8B5CF6' : '#9CA3AF';
        ctx.font = isWeekend ? 'bold 10px Inter' : '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barW / 2, H - padBottom + 16);
    }
}

// ============ PIE CHART ============
function drawPieChart(weekdayHrs, weekendHrs, expectedHrs) {
    const canvas = document.getElementById('pie-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 280;
    canvas.height = 280;

    const cx = 140, cy = 140, radius = 110;
    ctx.clearRect(0, 0, 280, 280);

    const total = weekdayHrs + weekendHrs;
    if (total === 0) {
        ctx.fillStyle = '#E5E7EB';
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#9CA3AF';
        ctx.font = '14px Inter'; ctx.textAlign = 'center';
        ctx.fillText('No data', cx, cy + 5);
        document.getElementById('pie-legend').innerHTML = '';
        return;
    }

    const slices = [
        { label: 'Weekday Work', value: weekdayHrs, color: '#10B981' },
        { label: 'Weekend Work', value: weekendHrs, color: '#8B5CF6' }
    ].filter(s => s.value > 0);

    let startAngle = -Math.PI / 2;
    slices.forEach(slice => {
        const sliceAngle = (slice.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();

        // Label
        const midAngle = startAngle + sliceAngle / 2;
        const labelR = radius * 0.65;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;
        const pct = ((slice.value / total) * 100).toFixed(0);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(pct + '%', lx, ly + 5);

        startAngle += sliceAngle;
    });

    // Center hole (donut)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    // Center text
    ctx.fillStyle = '#1F2937';
    ctx.font = 'bold 22px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(total.toFixed(1), cx, cy - 2);
    ctx.font = '11px Inter';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('total hours', cx, cy + 16);

    // Legend
    const legendEl = document.getElementById('pie-legend');
    legendEl.innerHTML = slices.map(s =>
        `<div style="display:flex;align-items:center;gap:6px;">
            <span style="width:12px;height:12px;border-radius:3px;background:${s.color};display:inline-block;"></span>
            <span style="font-size:0.85rem;color:var(--text-medium);">${s.label}: ${s.value.toFixed(1)} hrs</span>
        </div>`
    ).join('');
}

// ============ WEEKEND ANALYSIS ============
function renderWeekendAnalysis(weekendLogs, totalWeekendHrs, weekendDaysWorked) {
    const grid = document.getElementById('weekend-grid');
    const noEl = document.getElementById('no-weekend');
    const summaryEl = document.getElementById('weekend-summary');

    if (weekendLogs.length === 0) {
        grid.style.display = 'none';
        noEl.style.display = 'block';
        summaryEl.textContent = '';
        return;
    }

    grid.style.display = '';
    noEl.style.display = 'none';

    const avgWeekend = weekendDaysWorked > 0 ? (totalWeekendHrs / weekendDaysWorked) : 0;
    summaryEl.innerHTML = `Muhammad Kashan worked on <strong>${weekendDaysWorked}</strong> weekend day${weekendDaysWorked !== 1 ? 's' : ''} this month, totaling <strong>${totalWeekendHrs.toFixed(1)} hours</strong> (avg ${avgWeekend.toFixed(1)} hrs/day). This is additional effort beyond the required Mon–Fri schedule.`;

    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    grid.innerHTML = weekendLogs.map(log => {
        const d = parseLocalDate(log.date);
        const hrs = parseFloat(log.total_hours) || 0;
        return `
            <div class="weekend-day-card">
                <div class="wk-date">${log.date}</div>
                <div class="wk-day">${dayNames[d.getDay()]}</div>
                <div class="wk-hrs">${hrs.toFixed(1)}</div>
                <div class="wk-hrs-label">hours worked</div>
            </div>
        `;
    }).join('');
}

// ============ DAILY TABLE ============
function renderDailyTable(dailyMap, daysInMonth) {
    const tbody = document.getElementById('daily-tbody');
    const emptyEl = document.getElementById('daily-empty');
    if (!tbody) return;

    tbody.innerHTML = '';
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let hasData = false;

    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${reportYear}-${String(reportMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dateObj = new Date(reportYear, reportMonth, d);
        const dayIdx = dateObj.getDay();
        const isWeekend = dayIdx === 0 || dayIdx === 6;
        const expected = isWeekend ? 0 : 8;

        // Skip future dates
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        if (dateObj > now) continue;

        const log = dailyMap[ds];
        const hrs = log ? (parseFloat(log.total_hours) || 0) : 0;
        const diff = hrs - expected;

        let startTime = '--';
        let endTime = '--';
        if (log && log.start_time) {
            try { startTime = new Date(log.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch(e) { startTime = '--'; }
        }
        if (log && log.end_time) {
            try { endTime = new Date(log.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch(e) { endTime = '--'; }
        }
        if (log && log.status === 'active') endTime = 'Active';
        if (log && log.status === 'on_break') endTime = 'On Break';

        let statusBadge = '';
        if (isWeekend && hrs > 0) {
            statusBadge = '<span class="badge-sm badge-weekend-work">Weekend Work</span>';
            hasData = true;
        } else if (isWeekend && hrs === 0) {
            statusBadge = '<span class="badge-sm badge-off">Rest Day</span>';
        } else if (hrs === 0) {
            statusBadge = '<span class="badge-sm badge-off">Off</span>';
        } else if (hrs > 8 && !isWeekend) {
            statusBadge = '<span class="badge-sm badge-overtime">Overtime</span>';
            hasData = true;
        } else if (hrs >= 8) {
            statusBadge = '<span class="badge-sm badge-complete">Complete</span>';
            hasData = true;
        } else if (hrs > 0 && hrs < 8) {
            statusBadge = '<span class="badge-sm badge-undertime">Under Time</span>';
            hasData = true;
        }

        const diffStr = diff === 0 ? '--' : (diff > 0 ? `<span style="color:#10B981;font-weight:600;">+${diff.toFixed(1)}</span>` : `<span style="color:#EF4444;font-weight:600;">${diff.toFixed(1)}</span>`);

        const tr = document.createElement('tr');
        if (isWeekend) tr.className = 'weekend-row';
        tr.innerHTML = `
            <td><strong>${ds}</strong></td>
            <td>${dayNames[dayIdx]}${isWeekend ? ' 🌙' : ''}</td>
            <td>${startTime}</td>
            <td>${endTime}</td>
            <td style="font-weight:600;">${hrs > 0 ? hrs.toFixed(2) : '--'}</td>
            <td>${expected > 0 ? expected + ' hrs' : '--'}</td>
            <td>${hrs > 0 || expected > 0 ? diffStr : '--'}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
        if (hrs > 0) hasData = true;
    }

    if (!hasData && reportLogs.length === 0) {
        tbody.parentElement.style.display = 'none';
        emptyEl.style.display = 'block';
    } else {
        tbody.parentElement.style.display = 'table';
        emptyEl.style.display = 'none';
    }
}
