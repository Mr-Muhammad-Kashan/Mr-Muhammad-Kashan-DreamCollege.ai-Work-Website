function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    result.push(current);
    return result;
}

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function(event) {
                const csvData = event.target.result;
                const lines = csvData.split('\n');
                
                if (!auth.currentUser) {
                    showToast('You must be logged in to import data.', 'error');
                    fileInput.value = '';
                    return;
                }
                
                const uid = auth.currentUser.uid;
                let count = 0;
                
                showToast('Processing CSV file...', 'info');

                // Intelligent Header Mapping
                let dateIdx = 0, dayIdx = 1, dayTypeIdx = 2;
                let startIdx = 3, endIdx = 4, totalHoursIdx = 5, statusIdx = 6;
                let startLine = 0;

                if (lines.length > 0) {
                    const firstLine = lines[0].replace(/\r$/, '').toLowerCase();
                    if (firstLine.includes('date') || firstLine.includes('day')) {
                        const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
                        startLine = 1; // skip header
                        
                        const findIdx = (keywords) => {
                            for (let i = 0; i < headers.length; i++) {
                                for (let kw of keywords) {
                                    if (headers[i] === kw || headers[i].includes(kw)) return i;
                                }
                            }
                            return -1;
                        };
                        
                        dateIdx = findIdx(['date']);
                        dayIdx = findIdx(['day', 'weekday']);
                        // Adjust if 'day type' matched 'day'
                        for (let i = 0; i < headers.length; i++) {
                            if (headers[i].includes('type')) dayTypeIdx = i;
                            if (headers[i] === 'day') dayIdx = i;
                        }
                        startIdx = findIdx(['start']);
                        endIdx = findIdx(['end']);
                        totalHoursIdx = findIdx(['total', 'hours', 'duration']);
                        statusIdx = findIdx(['status']);
                    }
                }

                // Fetch existing dates into memory to prevent 400x network queries
                const existingSnap = await db.collection('worklogs')
                    .where('uid', '==', uid)
                    .get();
                const existingDates = new Set();
                existingSnap.forEach(doc => {
                    existingDates.add(doc.data().date);
                });

                let batches = [];
                let currentBatch = db.batch();
                let batchCount = 0;

                for (let i = startLine; i < lines.length; i++) {
                    const line = lines[i].replace(/\r$/, '').trim();
                    if (!line) continue;
                    
                    const cols = parseCsvLine(line);
                    
                    const dateStr = dateIdx >= 0 && cols[dateIdx] ? cols[dateIdx].trim() : '';
                    if (!dateStr || dateStr.toLowerCase() === 'date') continue; // Mandatory

                    const dayOfWeek = dayIdx >= 0 && cols[dayIdx] ? cols[dayIdx].trim() : '';
                    const dayType = dayTypeIdx >= 0 && cols[dayTypeIdx] ? cols[dayTypeIdx].trim() : '';
                    const totalHoursStr = totalHoursIdx >= 0 && cols[totalHoursIdx] ? cols[totalHoursIdx].trim() : '';
                    const startStrRaw = startIdx >= 0 && cols[startIdx] ? cols[startIdx].trim() : '';
                    const endStrRaw = endIdx >= 0 && cols[endIdx] ? cols[endIdx].trim() : '';
                    const statusStr = statusIdx >= 0 && cols[statusIdx] ? cols[statusIdx].trim() : '';
                    
                    let hrs = 0;
                    let mins = 0;
                    if (totalHoursStr) {
                        const m1 = totalHoursStr.match(/(\d+)h/i);
                        const m2 = totalHoursStr.match(/(\d+)m/i);
                        if (m1) hrs = parseInt(m1[1]);
                        if (m2) mins = parseInt(m2[1]);
                        
                        // If it's a raw number instead of "9h 41m"
                        if (!m1 && !m2 && !isNaN(parseFloat(totalHoursStr))) {
                            hrs = parseFloat(totalHoursStr);
                        }
                    }
                    const totalHours = hrs + (mins / 60);
                    
                    const isWeekend = dayType.toLowerCase().includes('weekend');
                    
                    // Parse Start and End times
                    let startStr = "09:00";
                    let endStr = "09:00";
                    if (startStrRaw && startStrRaw.includes(':')) startStr = startStrRaw;
                    if (endStrRaw && endStrRaw.includes(':')) endStr = endStrRaw;

                    const start = new Date(`${dateStr}T${startStr}:00`);
                    const end = new Date(`${dateStr}T${endStr}:00`);
                    
                    if (!endStrRaw && startStrRaw) {
                        end.setMinutes(end.getMinutes() + Math.round(totalHours * 60));
                    }
                    
                    // Check if a log for this date already exists in memory Set
                    if (existingDates.has(dateStr)) {
                        console.log(`Skipping ${dateStr}, already exists.`);
                        continue;
                    }

                    const docRef = db.collection('worklogs').doc();
                    currentBatch.set(docRef, {
                        uid: uid,
                        date: dateStr,
                        start_time: start.toISOString(),
                        end_time: end.toISOString(),
                        total_hours: totalHours,
                        day_of_week: dayOfWeek,
                        is_weekend: isWeekend,
                        status: 'complete',
                        csv_status: statusStr // Store raw status if needed
                    });
                    
                    count++;
                    batchCount++;
                    existingDates.add(dateStr); // Add to memory so we don't duplicate within the same CSV

                    if (batchCount === 490) {
                        batches.push(currentBatch.commit());
                        currentBatch = db.batch();
                        batchCount = 0;
                    }
                }
                
                if (batchCount > 0) {
                    batches.push(currentBatch.commit());
                }
                
                try {
                    await Promise.all(batches);
                    showToast(`Successfully imported ${count} new worklogs!`, 'success');
                } catch (e) {
                    showToast('Failed to commit some CSV data: ' + e.message, 'error');
                }
                
                // Refresh UI
                if (typeof fetchAllLogs === 'function') {
                    await fetchAllLogs();
                    calculateStats();
                    drawChart();
                    loadHistoryTable();
                }
                
                // Reset file input
                fileInput.value = '';
            };
            
            reader.readAsText(file);
        });
    }
});
