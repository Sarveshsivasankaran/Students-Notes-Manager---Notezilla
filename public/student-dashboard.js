document.addEventListener('DOMContentLoaded', () => {
    // 1. Sidebar Toggle Logic
    const body = document.querySelector('body');
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('#toggle-sidebar');
    
    // Toggle sidebar
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('close');
        });
    }

    // Handle responsive sidebar behavior
    const handleResize = () => {
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.add('close');
        } else if (sidebar) {
            sidebar.classList.remove('close');
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // 2. User Data Population & Role Guard
    const userString = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!userString || !token) {
        window.location.href = 'login.html';
        return;
    }

    let user;
    try {
        user = JSON.parse(userString);
        if (user.role !== 'student') {
            alert('Access denied. This dashboard is for students only.');
            window.location.href = 'login.html';
            return;
        }

        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        const welcomeGreetingEl = document.getElementById('welcomeGreeting');
        
        if (userNameEl) userNameEl.textContent = user.name || 'Student';
        if (userAvatarEl && user.name) userAvatarEl.textContent = user.name.charAt(0).toUpperCase();
        if (welcomeGreetingEl && user.name) {
            welcomeGreetingEl.innerHTML = `Welcome back, <span class="highlight">${user.name.split(' ')[0]}</span>! 👋`;
        }

        // Populate Profile Details
        const profileName = document.getElementById('profile-full-name');
        const profileEmail = document.getElementById('profile-email');
        const profileId = document.getElementById('profile-id');
        const profileDept = document.getElementById('profile-dept');
        const profileSem = document.getElementById('profile-sem');
        const profileAvatarLarge = document.getElementById('profile-avatar-large');

        if (profileName) profileName.textContent = user.name || 'N/A';
        if (profileEmail) profileEmail.textContent = user.email || 'N/A';
        if (profileId) profileId.textContent = `ID: ${user.id ? user.id.substring(0, 8).toUpperCase() : 'N/A'}`;
        if (profileDept) profileDept.textContent = user.department || 'General Department';
        if (profileSem) profileSem.textContent = user.semester ? `Semester ${user.semester}` : 'N/A';
        if (profileAvatarLarge && user.name) profileAvatarLarge.textContent = user.name.charAt(0).toUpperCase();

    } catch (e) {
        console.error("Error parsing user data", e);
        window.location.href = 'login.html';
        return;
    }

    // Helper: API Fetch with Token
    async function apiFetch(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
        const defaultHeaders = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...defaultHeaders, ...options.headers }
            });
            const data = await response.json();
            if (!response.ok && response.status === 401) {
                handleLogout();
            }
            return data;
        } catch (err) {
            console.error(`API Error (${endpoint}):`, err);
            return { success: false, message: 'Network error' };
        }
    }

    // 3. Section & Dropdown Logic
    const viewSections = document.querySelectorAll('.view-section');
    const navItems = {
        'dashboard': { view: document.getElementById('dashboard-view'), nav: document.getElementById('nav-dashboard') },
        'profile': { view: document.getElementById('profile-view'), nav: document.getElementById('nav-profile') },
        'subjects': { view: document.getElementById('subjects-view'), nav: document.getElementById('nav-subjects') },
        'announcements': { view: document.getElementById('announcements-view'), nav: document.getElementById('nav-announcements') },
        'notes': { view: document.getElementById('notes-view'), nav: document.getElementById('nav-notes') },
        'progress': { view: document.getElementById('progress-view'), nav: document.getElementById('nav-progress') },
        'bookmarks': { view: document.getElementById('bookmarks-view'), nav: document.getElementById('nav-bookmarks') },
        'faculty': { view: document.getElementById('faculty-view'), nav: document.getElementById('nav-faculty') }
    };

    function switchView(viewKey) {
        Object.values(navItems).forEach(item => {
            if (item.view) item.view.style.display = 'none';
            if (item.nav) item.nav.classList.remove('active');
        });

        const target = navItems[viewKey];
        if (target) {
            if (target.view) target.view.style.display = (viewKey === 'dashboard' || viewKey === 'profile' || viewKey === 'subjects' || viewKey === 'notes' || viewKey === 'progress' || viewKey === 'bookmarks' || viewKey === 'faculty') ? 'flex' : 'block';
            // Announcements and Profile sometimes use different layouts, but let's stick to flex mostly
            if (viewKey === 'announcements') target.view.style.display = 'block';
            if (target.nav) target.nav.classList.add('active');

            // Trigger specific renders
            if (viewKey === 'subjects') renderSubjects();
            if (viewKey === 'announcements') renderAnnouncements();
            if (viewKey === 'notes') renderNotes();
            if (viewKey === 'progress') renderProgress();
            if (viewKey === 'bookmarks') renderBookmarks();
            if (viewKey === 'faculty') renderFaculty();
        }
        closeAllDropdowns();
    }

    Object.keys(navItems).forEach(key => {
        if (navItems[key].nav) {
            navItems[key].nav.addEventListener('click', () => switchView(key === 'dashboard' ? 'dashboard' : key));
        }
    });

    // Special trigger for dashboard
    if (navItems['dashboard'].nav) {
        navItems['dashboard'].nav.addEventListener('click', () => switchView('dashboard'));
    }

    const showAllNotif = document.getElementById('show-all-notif');
    if (showAllNotif) showAllNotif.addEventListener('click', () => switchView('announcements'));

    const dropdownProfileLink = document.getElementById('dropdown-profile-link');
    if (dropdownProfileLink) dropdownProfileLink.addEventListener('click', () => switchView('profile'));

    const viewStudyProgressDetails = document.getElementById('viewStudyProgressDetails');
    if (viewStudyProgressDetails) viewStudyProgressDetails.addEventListener('click', () => switchView('progress'));

    // Topbar Dropdown Toggles
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const profileMenuBtn = document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    const closeAllDropdowns = () => {
        if (notificationDropdown) notificationDropdown.classList.remove('show');
        if (profileDropdown) profileDropdown.classList.remove('show');
    };

    if (notificationBtn) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = notificationDropdown.classList.contains('show');
            closeAllDropdowns();
            if (!isOpen) notificationDropdown.classList.add('show');
        });
    }

    if (profileMenuBtn) {
        profileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = profileDropdown.classList.contains('show');
            closeAllDropdowns();
            if (!isOpen) profileDropdown.classList.add('show');
        });
    }

    document.addEventListener('click', () => closeAllDropdowns());

    // 4. Logout Functionality
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    };

    const logoutBtn = document.getElementById('logoutBtn');
    const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener('click', handleLogout);

    // 4.1 Explore Subjects Logic
    const subjectsResultsGrid = document.getElementById('subjectsResultsGrid');
    const subjectSearchInput = document.getElementById('subjectSearchInput');

    const renderSubjects = async (filterText = '') => {
        if (!subjectsResultsGrid) return;
        subjectsResultsGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 40px;"><i class="bx bx-loader-alt bx-spin" style="font-size: 32px; color: var(--primary);"></i></div>';
        
        let endpoint = `/subjects?${filterText ? `search=${filterText}` : `department=${user.department || ''}`}`;
        const res = await apiFetch(endpoint);
        
        if (!res.success || !res.data || res.data.length === 0) {
            subjectsResultsGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 40px; color: var(--text-muted);"><p>No subjects found.</p></div>';
            return;
        }

        subjectsResultsGrid.innerHTML = '';
        res.data.forEach(sub => {
            const card = document.createElement('div');
            card.className = 'subject-card';
            card.innerHTML = `
                <span class="code">${sub.code || 'N/A'}</span>
                <h3>${sub.name}</h3>
                <div class="subject-card-footer">
                    <div class="subject-info"><span>${sub.department}</span> • <span>Sem ${sub.semester}</span></div>
                    <button class="subject-btn" onclick="document.getElementById('nav-notes').click(); document.getElementById('notesSearchInput').value='${sub.name}';">View Notes</button>
                </div>
            `;
            subjectsResultsGrid.appendChild(card);
        });
    };

    if (subjectSearchInput) subjectSearchInput.addEventListener('input', (e) => renderSubjects(e.target.value));

    // 4.2 Announcements Logic
    const announcementsListFull = document.getElementById('announcements-list-full');
    const notificationContent = document.getElementById('notificationContent');

    async function renderAnnouncements() {
        const notificationsData = [
            { icon: 'bx-file', title: 'New notes uploaded', text: `New material available for ${user.department || 'your'} students.`, time: '2 hours ago', unread: true },
            { icon: 'bx-calendar-event', title: 'Assignment Due', text: 'Unit 4 Assignment submission is open.', time: '5 hours ago', unread: true },
            { icon: 'bx-badge-check', title: 'Account Verified', text: 'You have full access to Rajalakshmi repository.', time: 'Yesterday', unread: false }
        ];

        if (announcementsListFull) {
            announcementsListFull.innerHTML = notificationsData.map(n => `
                <div class="notif-item ${n.unread ? 'unread' : ''}" style="padding: 20px 24px;">
                    <div class="notif-icon"><i class='bx ${n.icon}'></i></div>
                    <div class="notif-text"><h4>${n.title}</h4><p>${n.text}</p><span>${n.time}</span></div>
                </div>
            `).join('');
        }

        if (notificationContent) {
            notificationContent.innerHTML = notificationsData.slice(0, 3).map(n => `
                <div class="notif-item ${n.unread ? 'unread' : ''}">
                    <div class="notif-icon"><i class='bx ${n.icon}'></i></div>
                    <div class="notif-text"><p>${n.title}: <strong>${n.text.substring(0, 20)}...</strong></p><span>${n.time}</span></div>
                </div>
            `).join('');
        }
    }

    // 4.3 Access Notes Logic & Bookmarks
    const notesResultsGrid = document.getElementById('notesResultsGrid');
    const notesSearchInput = document.getElementById('notesSearchInput');
    let bookmarkedNoteIds = [];

    async function renderNotes(filterText = '') {
        if (!notesResultsGrid) return;
        notesResultsGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 40px;"><i class="bx bx-loader-alt bx-spin" style="font-size: 32px; color: var(--primary);"></i></div>';
        
        const params = new URLSearchParams();
        if (filterText) params.append('search', filterText);
        if (!filterText && user.semester) params.append('semester', user.semester);
        
        const res = await apiFetch(`/notes?${params.toString()}`);
        if (!res.success || !res.data || res.data.length === 0) {
            notesResultsGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 40px; color: var(--text-muted);"><p>No study materials found.</p></div>';
            return;
        }

        notesResultsGrid.innerHTML = '';
        res.data.forEach(note => {
            const isBookmarked = bookmarkedNoteIds.includes(note.id);
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
                <div class="note-icon type-${note.type || 'pdf'}"><i class='bx ${note.type === 'ppt' ? 'bxs-slideshow' : 'bxs-file-pdf'}'></i></div>
                <div class="note-details">
                    <h4>${note.title}</h4>
                    <p>👨‍🏫 ${note.faculty || 'Professor'}</p>
                    <div class="note-meta"><span class="rating"><i class='bx bxs-star'></i> 4.5</span><span class="reviews">${(note.type || 'pdf').toUpperCase()}</span></div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn-outline bookmark-btn" title="Bookmark"><i class='bx ${isBookmarked ? 'bxs-bookmark-heart' : 'bx-bookmark-heart'}' style="color: ${isBookmarked ? '#ef4444' : ''}"></i></button>
                    <button class="icon-btn-outline download-btn" title="Download"><i class='bx bx-download'></i></button>
                </div>
            `;
            card.querySelector('.download-btn').onclick = () => {
                apiFetch(`/notes/${note.id}/download`, { method: 'POST' });
                logProgress('note', note.title, `Subject: ${note.subject || 'Material'}`);
                window.open(note.fileUrl, '_blank');
            };
            card.querySelector('.bookmark-btn').onclick = () => toggleBookmark(note.id);
            notesResultsGrid.appendChild(card);
        });
    }

    async function syncBookmarks() {
        const res = await apiFetch('/bookmarks');
        if (res.success && Array.isArray(res.data)) {
            bookmarkedNoteIds = res.data.map(b => b.noteId);
            localStorage.setItem('bookmarkedNotes', JSON.stringify(bookmarkedNoteIds));
            const countProfile = document.getElementById('bookmark-count-profile');
            if (countProfile) countProfile.textContent = bookmarkedNoteIds.length;
        }
    }

    async function toggleBookmark(noteId) {
        const exists = bookmarkedNoteIds.includes(noteId);
        const res = await apiFetch(exists ? `/bookmarks/${noteId}` : '/bookmarks', {
            method: exists ? 'DELETE' : 'POST',
            body: exists ? null : JSON.stringify({ note_id: noteId })
        });
        if (res.success) {
            if (exists) bookmarkedNoteIds = bookmarkedNoteIds.filter(id => id !== noteId);
            else bookmarkedNoteIds.push(noteId);
            localStorage.setItem('bookmarkedNotes', JSON.stringify(bookmarkedNoteIds));
            syncBookmarks();
            if (notesView && notesView.style.display !== 'none') renderNotes(notesSearchInput.value);
            if (bookmarksView && bookmarksView.style.display !== 'none') renderBookmarks();
        }
    }

    async function renderBookmarks() {
        const savedGrid = document.getElementById('savedNotesGrid');
        if (!savedGrid) return;
        savedGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 20px;"><i class="bx bx-loader-alt bx-spin"></i></div>';
        const res = await apiFetch('/bookmarks');
        if (!res.success || !res.data || res.data.length === 0) {
            savedGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 40px; color: var(--text-muted);"><p>No bookmarked notes yet.</p></div>';
            return;
        }
        savedGrid.innerHTML = '';
        res.data.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
                <div class="note-icon type-pdf"><i class='bx bxs-file-pdf'></i></div>
                <div class="note-details"><h4>${note.title}</h4><p>${note.subject || 'Note'}</p></div>
                <button class="icon-btn-outline remove-bookmark"><i class='bx bxs-trash' style="color: #ef4444;"></i></button>
            `;
            card.querySelector('.remove-bookmark').onclick = () => toggleBookmark(note.noteId);
            savedGrid.appendChild(card);
        });
    }

    if (notesSearchInput) notesSearchInput.addEventListener('input', (e) => renderNotes(e.target.value));

    // 4.4 Progress Tracker History & Tasks
    let completedWork = JSON.parse(localStorage.getItem('completedWork') || '[]');
    let savedTasks = JSON.parse(localStorage.getItem('studentTasks') || '[]');

    const logProgress = (type, title, desc = '') => {
        completedWork.unshift({ id: Date.now(), type, title, desc, timestamp: new Date().toISOString() });
        localStorage.setItem('completedWork', JSON.stringify(completedWork));
        updateStudyProgress();
        if (progressView && progressView.style.display !== 'none') renderProgress();
    };

    const renderProgress = () => {
        const historyList = document.getElementById('progress-history-list');
        if (!historyList) return;
        historyList.innerHTML = completedWork.length === 0 
            ? '<div style="text-align:center; padding: 40px;">No activity logged.</div>'
            : completedWork.map(item => `
                <div class="notif-item" style="padding: 16px 24px; border-bottom: 1px solid var(--border-light);">
                    <div class="notif-icon"><i class='bx ${item.type === 'task' ? 'bx-check-double' : 'bx-calendar-heart'}'></i></div>
                    <div class="notif-text"><h4>${item.title}</h4><p>${item.desc || (item.type === 'task' ? 'Completed task' : 'Study session finished')}</p><span>${new Date(item.timestamp).toLocaleDateString()}</span></div>
                </div>
            `).join('');
    };

    const taskList = document.getElementById('taskList');
    const addTaskInput = document.querySelector('.add-task input');
    const addTaskBtn = document.querySelector('.add-task button');

    const renderTasks = () => {
        if (!taskList) return;
        taskList.innerHTML = '';
        let left = 0;
        savedTasks.forEach((t, i) => {
            if (!t.completed) left++;
            const li = document.createElement('li');
            li.className = 'task-item';
            li.innerHTML = `
                <label class="checkbox-container">
                    <input type="checkbox" ${t.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                    <span class="task-text ${t.completed ? 'completed' : ''}">${t.text}</span>
                </label>
                <button class="delete-task-btn" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i class='bx bx-trash'></i></button>
            `;
            li.querySelector('input').onchange = (e) => {
                savedTasks[i].completed = e.target.checked;
                if (e.target.checked) logProgress('task', t.text);
                saveTasks();
            };
            li.querySelector('.delete-task-btn').onclick = () => {
                savedTasks.splice(i, 1);
                saveTasks();
            };
            taskList.appendChild(li);
        });
        const badge = document.querySelector('.count-badge');
        if (badge) badge.textContent = `${left} left`;
    };

    const saveTasks = () => {
        localStorage.setItem('studentTasks', JSON.stringify(savedTasks));
        renderTasks();
        updateStudyProgress();
    };

    if (addTaskBtn && addTaskInput) {
        const add = () => {
            const val = addTaskInput.value.trim();
            if (val) {
                savedTasks.push({ text: val, completed: false });
                saveTasks();
                addTaskInput.value = '';
            }
        };
        addTaskBtn.onclick = add;
        addTaskInput.onkeypress = (e) => { if (e.key === 'Enter') add(); };
    }

    // 5. Daily Planner
    const plannerTimeline = document.getElementById('plannerTimeline');
    const plannerForm = document.getElementById('plannerForm');
    let savedPlannerItems = JSON.parse(localStorage.getItem('studentPlanner') || '[]');

    const renderPlanner = () => {
        if (!plannerTimeline) return;
        plannerTimeline.innerHTML = '';
        savedPlannerItems.sort((a,b) => (a.time || "").localeCompare(b.time || ""));
        
        if (savedPlannerItems.length === 0) {
            plannerTimeline.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px;">No sessions planned.</div>';
            return;
        }

        savedPlannerItems.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'timeline-item';
            div.innerHTML = `
                <div class="time"><i class='bx bx-time-five'></i> ${item.time}</div>
                <div class="content" style="display:flex; justify-content:space-between; align-items:center;">
                    <div><h4>${item.title}</h4><span>${item.desc}</span></div>
                    <div style="display:flex; gap:8px;">
                        <button class="fin-btn" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class='bx bx-check-circle'></i></button>
                        <button class="del-btn" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class='bx bx-trash'></i></button>
                    </div>
                </div>
            `;
            div.querySelector('.fin-btn').onclick = () => {
                logProgress('planner', item.title, item.desc);
                savedPlannerItems.splice(index, 1);
                savePlanner();
            };
            div.querySelector('.del-btn').onclick = () => {
                savedPlannerItems.splice(index, 1);
                savePlanner();
            };
            plannerTimeline.appendChild(div);
        });
    };

    const savePlanner = () => {
        localStorage.setItem('studentPlanner', JSON.stringify(savedPlannerItems));
        renderPlanner();
        updateStudyProgress();
    };

    const addPlannerBtn = document.getElementById('addPlannerBtn');
    if (addPlannerBtn) addPlannerBtn.onclick = () => plannerForm.style.display = 'block';
    const cancelPlannerBtn = document.getElementById('cancelPlannerBtn');
    if (cancelPlannerBtn) cancelPlannerBtn.onclick = () => plannerForm.style.display = 'none';
    const savePlannerBtn = document.getElementById('savePlannerBtn');
    if (savePlannerBtn) {
        savePlannerBtn.onclick = () => {
            const t = document.getElementById('plannerTime').value;
            const h = document.getElementById('plannerTitle').value;
            const d = document.getElementById('plannerDesc').value;
            if (t && h) {
                savedPlannerItems.push({ time: t, title: h, desc: d });
                savePlanner();
                plannerForm.style.display = 'none';
            }
        };
    }

    // 6. AI Chatbot
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatMessages = document.getElementById('chatMessages');

    async function handleSendMessage() {
        const msg = chatInput.value.trim();
        if (!msg) return;
        chatMessages.insertAdjacentHTML('beforeend', `<div class="message user"><div class="msg-content">${msg}</div></div>`);
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const res = await apiFetch('/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
            const botMsg = res.success ? res.response : "I'm sorry, I couldn't connect to my brain. Try asking about REC departments!";
            chatMessages.insertAdjacentHTML('beforeend', `<div class="message bot"><div class="msg-content">${botMsg}</div></div>`);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch(e) { console.error(e); }
    }

    if (sendChatBtn) sendChatBtn.onclick = handleSendMessage;
    if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') handleSendMessage(); };

    // 7. Live Clock
    function startLiveClock() {
        const timeEl = document.getElementById('currentTimeDisplay');
        const dateEl = document.getElementById('currentDateDisplay');
        const update = () => {
            const now = new Date();
            if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (dateEl) dateEl.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
        };
        update();
        setInterval(update, 1000);
    }

    // 8. Study Progress Capsule (Detailed)
    function updateStudyProgress() {
        const circle = document.getElementById('progressCircle');
        const valueText = document.getElementById('progressValue');
        const barsContainer = document.getElementById('progressSubjectBars');
        const completedVal = document.getElementById('progressWorkCompleted');
        const inProgressVal = document.getElementById('progressInProgress');
        const todoVal = document.getElementById('progressYetToComplete');

        if (!circle || !valueText) return;

        const totalTasks = savedTasks.length;
        const compTasks = savedTasks.filter(t => t.completed).length;
        const totalItems = totalTasks + savedPlannerItems.length;
        const percentage = totalItems > 0 ? Math.round((compTasks / totalItems) * 100) : 0;

        valueText.textContent = `${percentage}%`;
        circle.style.setProperty('--percent', percentage);
        circle.style.strokeDashoffset = 251 - (251 * percentage) / 100;

        if (completedVal) completedVal.textContent = compTasks;
        if (inProgressVal) inProgressVal.textContent = savedPlannerItems.length;
        if (todoVal) todoVal.textContent = totalTasks - compTasks;

        // Milestones
        const milestones = [
            { threshold: 0, name: "Daily Hustle", target: "Reach 25% to unlock", icon: "bx-medal" },
            { threshold: 25, name: "Productivity Pro", target: "Reach 50% for next rank", icon: "bx-trophy" },
            { threshold: 50, name: "Study Master", target: "Reach 75% for ultimate title", icon: "bx-crown" },
            { threshold: 75, name: "Academic Legend", target: "Finish all goals!", icon: "bx-star" },
            { threshold: 100, name: "Task Conqueror", target: "Day Complete! 🔥", icon: "bxs-zap" }
        ];

        let current = milestones[0];
        milestones.forEach(m => { if (percentage >= m.threshold) current = m; });

        const mName = document.getElementById('milestoneName');
        const mTarget = document.getElementById('milestoneTarget');
        const mIcon = document.querySelector('.milestone-icon i');
        if (mName) mName.textContent = current.name;
        if (mTarget) mTarget.textContent = current.target;
        if (mIcon) mIcon.className = `bx ${current.icon}`;

        // Mini subject bars
        if (barsContainer) {
            barsContainer.innerHTML = '';
            const subMap = {};
            completedWork.forEach(item => {
                if (item.type === 'note' && item.desc.includes('Subject:')) {
                    const s = item.desc.split('Subject:')[1].trim();
                    subMap[s] = (subMap[s] || 0) + 1;
                }
            });
            Object.keys(subMap).slice(0, 2).forEach(s => {
                const prog = Math.min(100, subMap[s] * 20);
                barsContainer.insertAdjacentHTML('beforeend', `<div class="mini-bar-item"><span>${s}</span><div class="bar-track"><div class="bar-fill" style="width:${prog}%; background:var(--accent-1);"></div></div></div>`);
            });
        }
    }

    // 10. Browse Faculty & Modal
    const facultyResultsGrid = document.getElementById('facultyResultsGrid');
    const facultyModal = document.getElementById('facultyModal');
    const closeFacultyModal = document.getElementById('closeFacultyModal');
    const modalSubjectsView = document.getElementById('modalSubjectsView');
    const modalNotesView = document.getElementById('modalNotesView');
    const backToSubjects = document.getElementById('backToSubjects');

    async function renderFaculty() {
        if (!facultyResultsGrid) return;
        facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="bx bx-loader-alt bx-spin" style="font-size:32px;"></i></div>';
        const res = await apiFetch('/faculty');
        if (res.success && res.data) {
            facultyResultsGrid.innerHTML = '';
            res.data.forEach(fac => {
                const color = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b"][Math.floor(Math.random() * 4)];
                const card = document.createElement('div');
                card.className = 'note-card';
                card.innerHTML = `
                    <div class="note-icon" style="background:${color}22; color:${color}; font-weight:bold;">${fac.name[0]}</div>
                    <div class="note-details"><h4>${fac.name}</h4><p>${fac.department || 'Faculty Member'}</p></div>
                    <button class="icon-btn-outline view-faculty-btn"><i class='bx bx-user'></i></button>
                `;
                card.querySelector('.view-faculty-btn').onclick = () => openFacultyModal(fac);
                card.onclick = (e) => {
                    if (!e.target.closest('button')) openFacultyModal(fac);
                };
                facultyResultsGrid.appendChild(card);
            });
        }
    }

    async function openFacultyModal(faculty) {
        if (!facultyModal) return;

        // Reset views
        modalSubjectsView.style.display = 'block';
        modalNotesView.style.display = 'none';

        // Populate basic info
        document.getElementById('modalFacultyName').textContent = faculty.name;
        document.getElementById('modalFacultyDept').textContent = faculty.department || 'Rajalakshmi Engineering College';
        document.getElementById('modalFacultyAvatar').textContent = faculty.name[0];

        // Fetch notes to get subjects
        const modalSubjectsList = document.getElementById('modalSubjectsList');
        modalSubjectsList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px;"><i class="bx bx-loader-alt bx-spin" style="font-size:24px;"></i></div>';
        
        facultyModal.classList.add('show');

        try {
            const res = await apiFetch(`/faculty/${faculty.id}/notes`);
            if (res.success && res.data) {
                const notes = res.data;
                // Group by subject
                const subjectMap = {};
                notes.forEach(note => {
                    const subId = note.subject_id;
                    if (!subjectMap[subId]) {
                        subjectMap[subId] = {
                            id: subId,
                            name: note.subjects?.name || 'Unknown Subject',
                            code: note.subjects?.code || '',
                            notes: []
                        };
                    }
                    subjectMap[subId].notes.push(note);
                });

                const subjects = Object.values(subjectMap);
                if (subjects.length === 0) {
                    modalSubjectsList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No subjects found for this faculty.</div>';
                } else {
                    modalSubjectsList.innerHTML = '';
                    subjects.forEach(sub => {
                        const subCard = document.createElement('div');
                        subCard.className = 'modal-subject-card';
                        subCard.innerHTML = `
                            <h4>${sub.name}</h4>
                            <span>${sub.code} • ${sub.notes.length} Materials</span>
                        `;
                        subCard.onclick = () => showSubjectNotes(sub);
                        modalSubjectsList.appendChild(subCard);
                    });
                }
            }
        } catch (error) {
            console.error("Modal fetch error", error);
            modalSubjectsList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Failed to load subjects.</div>';
        }
    }

    function showSubjectNotes(subject) {
        modalSubjectsView.style.display = 'none';
        modalNotesView.style.display = 'block';
        document.getElementById('modalSelectedSubjectTitle').textContent = subject.name;

        const container = document.getElementById('modalUnitsContainer');
        container.innerHTML = '';

        // Group by Unit
        const unitMap = {};
        subject.notes.forEach(note => {
            const unit = note.unit || 1;
            if (!unitMap[unit]) unitMap[unit] = [];
            unitMap[unit].push(note);
        });

        const units = Object.keys(unitMap).sort();
        units.forEach(unit => {
            const section = document.createElement('div');
            section.className = 'unit-section';
            section.innerHTML = `
                <div class="unit-header">UNIT ${unit}</div>
                <div class="modal-notes-list">
                    ${unitMap[unit].map(note => `
                        <div class="modal-note-item">
                            <div class="note-item-info">
                                <i class='bx ${note.type === 'ppt' ? 'bxs-slideshow' : 'bxs-file-pdf'}'></i>
                                <h5>${note.title}</h5>
                            </div>
                            <div class="modal-note-actions">
                                <button class="icon-btn-outline download-note" data-url="${note.file_url}" data-id="${note.id}" data-title="${note.title}" data-subject="${subject.name}"><i class='bx bx-download'></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(section);
        });

        // Add download functionality to modal notes
        container.querySelectorAll('.download-note').forEach(btn => {
            btn.onclick = (e) => {
                const url = btn.getAttribute('data-url');
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-title');
                const sub = btn.getAttribute('data-subject');
                
                apiFetch(`/notes/${id}/download`, { method: 'POST' });
                logProgress('note', name, `Subject: ${sub}`);
                if (url) window.open(url, '_blank');
                else alert('File URL not available');
            };
        });
    }

    if (closeFacultyModal) {
        closeFacultyModal.onclick = () => facultyModal.classList.remove('show');
    }

    if (backToSubjects) {
        backToSubjects.onclick = () => {
            modalNotesView.style.display = 'none';
            modalSubjectsView.style.display = 'block';
        };
    }

    // Close modal on outside click
    window.onclick = (event) => {
        if (event.target === facultyModal) {
            facultyModal.classList.remove('show');
        }
    };

    // 11. Top Rated Notes
    const topRatedGrid = document.getElementById('topRatedNotesGrid');
    async function renderTopRatedNotes() {
        if (!topRatedGrid) return;
        topRatedGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="bx bx-loader-alt bx-spin"></i></div>';
        const res = await apiFetch('/notes?limit=4&sort=downloads');
        if (res.success && res.data) {
            topRatedGrid.innerHTML = '';
            res.data.forEach(note => {
                const card = document.createElement('div');
                card.className = 'note-card';
                card.innerHTML = `
                    <div class="note-icon"><i class='bx bxs-file-pdf'></i></div>
                    <div class="note-details"><h4>${note.title}</h4><p>${note.downloads || 0} downloads</p></div>
                    <button class="icon-btn-outline" title="Download"><i class='bx bx-download'></i></button>
                `;
                card.querySelector('button').onclick = () => window.open(note.fileUrl, '_blank');
                topRatedGrid.appendChild(card);
            });
        }
    }

    // Initial Support
    startLiveClock();
    renderTasks();
    renderPlanner();
    updateStudyProgress();
    syncBookmarks();
    renderTopRatedNotes();
    renderAnnouncements();
    
    // Default view or hash-based view
    const hash = window.location.hash.substring(1);
    if (hash && navItems[hash]) {
        switchView(hash);
    } else {
        switchView('dashboard');
    }
});
