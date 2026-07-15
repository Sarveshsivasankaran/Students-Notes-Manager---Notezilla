// Initialize Socket.io
const socket = io();

document.addEventListener('DOMContentLoaded', () => {
    let bookmarkedNoteIds = [];
    let bookmarkedNoteUrls = [];
    let bookmarkedNotesList = [];
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

    // Connect to socket room
    socket.emit('join', user.id);
    socket.on('live_activity', (data) => {
        const liveUsersEl = document.getElementById('live-users-count');
        if (liveUsersEl) liveUsersEl.textContent = data.activeUsers;
    });
    socket.on('progress_synced', (data) => {
        // Update local stats UI
        applyProductivityStats(data);
        updateStudyProgress();
    });

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
        'progress': { view: document.getElementById('progress-view'), nav: document.getElementById('nav-progress') },
        'bookmarks': { view: document.getElementById('bookmarks-view'), nav: document.getElementById('nav-bookmarks') },
        'faculty': { view: document.getElementById('faculty-view'), nav: document.getElementById('nav-faculty') },
        'dsa': { view: document.getElementById('dsa-view'), nav: document.getElementById('nav-dsa') }
    };

    function switchView(viewKey) {
        Object.values(navItems).forEach(item => {
            if (item.view) item.view.style.display = 'none';
            if (item.nav) item.nav.classList.remove('active');
        });

        const target = navItems[viewKey];
        if (target) {
            if (target.view) target.view.style.display = (viewKey === 'dashboard' || viewKey === 'profile' || viewKey === 'subjects' || viewKey === 'announcements' || viewKey === 'progress' || viewKey === 'bookmarks' || viewKey === 'faculty' || viewKey === 'dsa') ? 'flex' : 'block';
            if (target.nav) target.nav.classList.add('active');

            // Trigger specific renders
            if (viewKey === 'subjects') renderSubjects();
            if (viewKey === 'announcements') renderAnnouncements();

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

    // Helper: Add copy button to a bot message element
    function addCopyButton(botMsgEl) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'chat-copy-btn';
        copyBtn.title = 'Copy to clipboard';
        copyBtn.innerHTML = "<i class='bx bx-copy'></i>";
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const textContent = botMsgEl.innerText || botMsgEl.textContent || '';
            try {
                await navigator.clipboard.writeText(textContent);
                copyBtn.innerHTML = "<i class='bx bx-check'></i>";
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = "<i class='bx bx-copy'></i>";
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (err) {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = textContent;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                copyBtn.innerHTML = "<i class='bx bx-check'></i>";
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = "<i class='bx bx-copy'></i>";
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
        });
        botMsgEl.appendChild(copyBtn);
    }

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
            card.onclick = () => {
                document.getElementById('nav-notes').click();
                document.getElementById('notesSearchInput').value = sub.name;
            };
            card.innerHTML = `
                <div class="subject-card-top">
                    <div class="subject-tag-new">${sub.department || 'Programming'}</div>
                    <div class="subject-graphic">
                        <svg viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <!-- Monitor Outline -->
                            <rect x="30" y="20" width="140" height="90" rx="8" fill="#F0F7FF" stroke="#1E3A8A" stroke-width="6"/>
                            <!-- Monitor Base -->
                            <path d="M90 110 H110 L115 130 H85 L90 110Z" fill="#1E3A8A"/>
                            <rect x="75" y="130" width="50" height="6" rx="3" fill="#1E3A8A"/>
                            <!-- Screen Bottom Bezel -->
                            <rect x="27" y="90" width="146" height="20" fill="#1E3A8A"/>
                            <!-- Code lines -->
                            <rect x="45" y="35" width="30" height="6" rx="3" fill="#F97316"/>
                            <rect x="80" y="35" width="20" height="6" rx="3" fill="#0EA5E9"/>
                            <rect x="105" y="35" width="40" height="6" rx="3" fill="#1E3A8A"/>
                            
                            <rect x="45" y="50" width="20" height="6" rx="3" fill="#1E3A8A"/>
                            <rect x="70" y="50" width="45" height="6" rx="3" fill="#0EA5E9"/>
                            
                            <rect x="45" y="65" width="45" height="6" rx="3" fill="#F97316"/>
                            <rect x="95" y="65" width="25" height="6" rx="3" fill="#1E3A8A"/>
                            <rect x="125" y="65" width="20" height="6" rx="3" fill="#0EA5E9"/>
                            
                            <rect x="45" y="80" width="35" height="6" rx="3" fill="#0EA5E9"/>
                            <rect x="85" y="80" width="40" height="6" rx="3" fill="#1E3A8A"/>
                        </svg>
                    </div>
                </div>
                <div class="subject-card-bottom">
                    <h2 class="subject-code-new">${sub.code || 'N/A'}</h2>
                    <p class="subject-name-new">${sub.name}</p>
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



    async function syncBookmarks() {
        const res = await apiFetch('/bookmarks');
        if (res.success && Array.isArray(res.data)) {
            bookmarkedNoteIds = res.data.map(b => b.noteId);
            bookmarkedNotesList = res.data;
            bookmarkedNoteUrls = res.data.map(b => b.fileUrl || b.file_url).filter(Boolean);
            const countProfile = document.getElementById('bookmark-count-profile');
            if (countProfile) countProfile.textContent = bookmarkedNoteIds.length;
        }
    }

    async function toggleBookmark(noteId) {
        const exists = bookmarkedNoteIds.some(id => String(id) === String(noteId));
        const res = await apiFetch(exists ? `/bookmarks/${noteId}` : '/bookmarks', {
            method: exists ? 'DELETE' : 'POST',
            body: exists ? null : JSON.stringify({ note_id: noteId })
        });
        if (res.success) {
            if (exists) bookmarkedNoteIds = bookmarkedNoteIds.filter(id => String(id) !== String(noteId));
            else bookmarkedNoteIds.push(noteId);
            await syncBookmarks();
            if (bookmarksView && bookmarksView.style.display !== 'none') renderBookmarks();
            renderTopRatedNotes();
            return res;
        }
        return res;
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
            card.style.cursor = 'pointer';
            card.innerHTML = `
                <div class="note-icon type-pdf"><i class='bx bxs-file-pdf'></i></div>
                <div class="note-details"><h4>${note.title}</h4><p>${note.subject || 'Note'}</p></div>
                <button class="icon-btn-outline remove-bookmark"><i class='bx bxs-trash' style="color: #ef4444;"></i></button>
            `;
            card.querySelector('.remove-bookmark').onclick = (e) => {
                e.stopPropagation();
                toggleBookmark(note.noteId);
            };
            card.onclick = (e) => {
                if (e.target.closest('button')) return;
                localStorage.setItem('selectedNoteId', note.noteId);
                window.location.href = 'note-detail.html';
            };
            savedGrid.appendChild(card);
        });
    }



    // 4.4 Progress Tracker History & Tasks
    let completedWork = [];
    let savedTasks = [];
    let productivityStats = {
        total_tasks_done: 0,
        planner_sessions: 0,
        productivity_score: 0,
        total_tasks: 0,
        total_planner_sessions: 0,
        note_views: 0,
        active_days: 0
    };

    const applyProductivityStats = (stats = {}) => {
        productivityStats = { ...productivityStats, ...stats };
        const mappings = {
            totalTasksCount: productivityStats.total_tasks_done,
            totalSessionsCount: productivityStats.planner_sessions,
            notesStudiedCount: productivityStats.note_views,
            activeStudyDays: productivityStats.active_days,
            productivityScore: `${Math.round(Number(productivityStats.productivity_score) || 0)}%`,
            tasksCompletionMeta: `of ${productivityStats.total_tasks || 0} tasks`,
            sessionsCompletionMeta: `of ${productivityStats.total_planner_sessions || 0} sessions`
        };
        Object.entries(mappings).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    };

    const logProgress = async (type, title, desc = '') => {
        const res = await apiFetch('/user/activity', {
            method: 'POST',
            body: JSON.stringify({ action_type: type, title, description: desc })
        });
        if (res.success) {
            completedWork.unshift(res.data);
            updateStudyProgress();
            await renderProgress();
        }
    };

    const renderProgress = async () => {
        const historyList = document.getElementById('progress-history-list');
        if (!historyList) return;
        
        const [activityResponse, statsResponse] = await Promise.all([
            apiFetch('/user/activity'),
            apiFetch('/user/progress')
        ]);
        if (activityResponse.success) completedWork = activityResponse.data || [];
        if (statsResponse.success) applyProductivityStats(statsResponse.data);
        updateStudyProgress();

        historyList.innerHTML = completedWork.length === 0 
            ? '<div style="text-align:center; padding: 40px; color:var(--text-muted);">No study activity in the last 30 days.</div>'
            : completedWork.map(item => `
                <div class="notif-item" style="padding: 16px 24px; border-bottom: 1px solid var(--border-light);">
                    <div class="notif-icon"><i class='bx ${item.action_type === 'task' ? 'bx-check-double' : item.action_type === 'planner' ? 'bx-calendar-heart' : 'bx-book-reader'}'></i></div>
                    <div class="notif-text"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || (item.action_type === 'task' ? 'Completed task' : item.action_type === 'planner' ? 'Study session finished' : 'Studied a note'))}</p><span>${new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                </div>
            `).join('');
    };

    const taskList = document.getElementById('taskList');
    const addTaskInput = document.querySelector('.add-task input');
    const addTaskBtn = document.getElementById('addTaskBtn') || document.querySelector('.add-task button');

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
                <button class="delete-task-btn" type="button" title="Delete task"><i class='bx bx-trash'></i></button>
            `;
            li.querySelector('input').onchange = async (e) => {
                const completed = e.target.checked;
                const res = await apiFetch(`/user/tasks/${t.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ is_completed: completed })
                });
                if (res.success) {
                    savedTasks[i].completed = completed;
                    if (completed) logProgress('task', t.text);
                    saveTasks();
                }
            };
            li.querySelector('.delete-task-btn').onclick = async (event) => {
                event.stopPropagation();
                const res = await apiFetch(`/user/tasks/${t.id}`, { method: 'DELETE' });
                if (res.success) {
                    savedTasks.splice(i, 1);
                    saveTasks();
                }
            };
            taskList.appendChild(li);
        });
        const badge = document.querySelector('.count-badge');
        if (badge) badge.textContent = `${left} left`;
    };

    const saveTasks = async () => {
        renderTasks();
        await syncProgress();
    };

    const syncProgress = async () => {
        const compTasks = savedTasks.filter(t => t.completed).length;
        const plannerCompleted = savedPlannerItems.filter(item => item.completed).length;
        
        await apiFetch('/user/progress/sync', {
            method: 'POST',
            body: JSON.stringify({
                total_tasks_done: compTasks,
                planner_sessions: plannerCompleted
            })
        });
    };

    const fetchTasks = async () => {
        const res = await apiFetch('/user/tasks');
        if (res.success) {
            savedTasks = res.data.map(t => ({ id: t.id, text: t.text, completed: t.is_completed }));
            renderTasks();
            updateStudyProgress();
        }
    };
    fetchTasks();

    if (addTaskBtn && addTaskInput) {
        const add = async () => {
            const val = addTaskInput.value.trim();
            if (val) {
                const res = await apiFetch('/user/tasks', {
                    method: 'POST',
                    body: JSON.stringify({ text: val })
                });
                if (res.success) {
                    savedTasks.unshift({ id: res.data.id, text: val, completed: false });
                    renderTasks();
                    addTaskInput.value = '';
                }
            }
        };
        addTaskBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            add();
        });
        addTaskInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                add();
            }
        });
    }

    // 5. Daily Planner
    const plannerTimeline = document.getElementById('plannerTimeline');
    const plannerForm = document.getElementById('plannerForm');
    let savedPlannerItems = [];

    const renderPlanner = () => {
        if (!plannerTimeline) return;
        plannerTimeline.innerHTML = '';
        savedPlannerItems.sort((a,b) => (a.time || "").localeCompare(b.time || ""));
        
        if (savedPlannerItems.length === 0) {
            plannerTimeline.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px;">No sessions planned.</div>';
            return;
        }

        savedPlannerItems.forEach((item, index) => {
            const isCompleted = item.completed === true;
            const div = document.createElement('div');
            div.className = `timeline-item ${isCompleted ? 'completed' : ''}`;
            div.style.opacity = isCompleted ? '0.6' : '1';
            // Removed pointerEvents none to ensure buttons remain clickable if needed
            
            div.innerHTML = `
                <div class="time"><i class='bx bx-time-five'></i> ${item.time}</div>
                <div class="content planner-content">
                    <div style="${isCompleted ? 'text-decoration: line-through;' : ''}">
                        <h4>${item.title}</h4>
                        <span>${item.desc}</span>
                    </div>
                    <div class="planner-actions">
                        <button class="fin-btn" type="button" title="Mark complete" ${isCompleted ? 'disabled' : ''} style="color:${isCompleted ? 'var(--accent-1)' : ''}">
                            <i class='bx ${isCompleted ? 'bxs-check-circle' : 'bx-check-circle'}'></i>
                        </button>
                        <button class="del-btn" type="button" title="Delete session">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </div>
            `;
            
            if (!isCompleted) {
                div.querySelector('.fin-btn').onclick = async (event) => {
                    event.stopPropagation();
                    const res = await apiFetch(`/user/planner/${item.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ is_completed: true })
                    });
                    if (res.success) {
                        logProgress('planner', item.title, item.desc);
                        savedPlannerItems[index].completed = true;
                        savePlanner();
                    }
                };
            }
            
            div.querySelector('.del-btn').onclick = async (event) => {
                event.stopPropagation();
                const res = await apiFetch(`/user/planner/${item.id}`, { method: 'DELETE' });
                if (res.success) {
                    savedPlannerItems.splice(index, 1);
                    savePlanner();
                }
            };
            plannerTimeline.appendChild(div);
        });
    };

    const savePlanner = async () => {
        renderPlanner();
        syncProgress();
    };

    const fetchPlanner = async () => {
        const res = await apiFetch('/user/planner');
        if (res.success) {
            savedPlannerItems = res.data.map(p => ({ 
                id: p.id, 
                time: p.task_time, 
                title: p.title, 
                desc: p.description, 
                completed: p.is_completed 
            }));
            renderPlanner();
            updateStudyProgress();
        }
    };
    fetchPlanner();

    const addPlannerBtn = document.getElementById('addPlannerBtn');
    if (addPlannerBtn) addPlannerBtn.onclick = () => plannerForm.style.display = 'block';
    const cancelPlannerBtn = document.getElementById('cancelPlannerBtn');
    if (cancelPlannerBtn) cancelPlannerBtn.onclick = () => plannerForm.style.display = 'none';
    const savePlannerBtn = document.getElementById('savePlannerBtn');
    if (savePlannerBtn) {
        savePlannerBtn.onclick = async () => {
            const t = document.getElementById('plannerTime').value;
            const h = document.getElementById('plannerTitle').value;
            const d = document.getElementById('plannerDesc').value;
            if (t && h) {
                const res = await apiFetch('/user/planner', {
                    method: 'POST',
                    body: JSON.stringify({ title: h, description: d, task_time: t })
                });
                if (res.success) {
                    savedPlannerItems.push({ id: res.data.id, time: t, title: h, desc: d, completed: false });
                    savePlanner();
                    plannerForm.style.display = 'none';
                }
            }
        };
    }

    // 6. AI Chatbot (Matches index.html Logic & IDs)
    const chatToggle = document.getElementById('chatToggle');
    const chatbotWindow = document.getElementById('chatbotWindow');
    const chatClose = document.getElementById('chatClose');
    const chatBody = document.getElementById('chatBody');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');

    // Toggle Chat Window
    if (chatToggle && chatbotWindow) {
        chatToggle.onclick = () => {
            chatbotWindow.classList.toggle('active');
            if (chatbotWindow.classList.contains('active')) {
                chatInput.focus();
            }
        };
    }

    if (chatClose && chatbotWindow) {
        chatClose.onclick = () => chatbotWindow.classList.remove('active');
    }

    // Quick Prompts Logic (Event Delegation)
    if (chatBody) {
        chatBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.parentElement.classList.contains('quick-prompts')) {
                chatInput.value = btn.textContent;
                handleSendMessage();
                // Hide quick prompts once clicked
                btn.parentElement.style.display = 'none';
            }
        });
    }

    async function handleSendMessage() {
        const msg = chatInput.value.trim();
        if (!msg) return;

        // Add user message
        const userMsgEl = document.createElement('div');
        userMsgEl.className = 'chat-msg user';
        userMsgEl.textContent = msg;
        chatBody.appendChild(userMsgEl);
        
        chatInput.value = '';
        chatBody.scrollTop = chatBody.scrollHeight;

        // Show typing indicator
        const typingEl = document.createElement('div');
        typingEl.className = 'chat-msg bot typing';
        typingEl.id = 'typing-indicator';
        typingEl.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
        chatBody.appendChild(typingEl);
        chatBody.scrollTop = chatBody.scrollHeight;

        try {
            const res = await apiFetch('/chat', { 
                method: 'POST', 
                body: JSON.stringify({ message: msg }) 
            });
            
            // Remove typing indicator
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) typingIndicator.remove();

            const botMsg = res.success ? res.response : "I'm sorry, I couldn't connect to my brain. Try asking about REC departments!";
            const botMsgEl = document.createElement('div');
            botMsgEl.className = 'chat-msg bot';
            // Use marked for rich formatting
            botMsgEl.innerHTML = marked.parse(botMsg);
            chatBody.appendChild(botMsgEl);

            // Render math if KaTeX is loaded
            if (window.renderMathInElement) {
                renderMathInElement(botMsgEl, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError : false
                });
            }
            // Add copy button to bot response
            addCopyButton(botMsgEl);
            chatBody.scrollTop = chatBody.scrollHeight;
        } catch(e) { 
            console.error(e);
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) typingIndicator.remove();
        }
    }

    if (chatSend) chatSend.onclick = handleSendMessage;
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
        
        // Count from planner list (both upcoming and completed)
        const plannerTotal = savedPlannerItems.length;
        const plannerCompleted = savedPlannerItems.filter(item => item.completed).length;
        
        const totalItems = totalTasks + plannerTotal;
        const totalCompleted = compTasks + plannerCompleted;
        
        const percentage = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

        valueText.textContent = `${percentage}%`;
        circle.style.setProperty('--percent', percentage);
        circle.style.strokeDashoffset = 251 - (251 * percentage) / 100;

        if (completedVal) completedVal.textContent = totalCompleted;
        if (inProgressVal) inProgressVal.textContent = plannerTotal - plannerCompleted;
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
                if (item.action_type === 'note' && (item.description || '').includes('Subject:')) {
                    const s = item.description.split('Subject:')[1].trim();
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
    const facultyRepoGrid = document.getElementById('facultyRepoGrid');
    const facultyRepoBreadcrumbs = document.getElementById('facultyRepoBreadcrumbs');
    const facultyFilePreviewPanel = document.getElementById('facultyFilePreviewPanel');
    const facultyFilePreviewFrame = document.getElementById('facultyFilePreviewFrame');
    const facultyPreviewTitle = document.getElementById('facultyPreviewTitle');
    const closeFacultyPreview = document.getElementById('closeFacultyPreview');
    const modalFilePreviewPanel = document.getElementById('modalFilePreviewPanel');
    const modalFilePreviewFrame = document.getElementById('modalFilePreviewFrame');
    const modalPreviewTitle = document.getElementById('modalPreviewTitle');
    const closeModalPreview = document.getElementById('closeModalPreview');
    const facultySearchInput = document.getElementById('facultySearchInput');
    const facultyDeptFilters = document.getElementById('facultyDeptFilters');

    let driveFacultyRoot = null;
    let driveFacultyFolders = [];
    let activeFacultyDriveFilter = 'all';
    let activeFacultyModalStack = [];

    const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));

    const getNoteFileUrl = (note) => note.file_url || note.fileUrl || note.url || '';
    const getNoteFileName = (note) => note.file_name || note.fileName || note.title || note.name || 'Untitled material';

    function getDrivePreviewUrl(url) {
        if (!url) return '';
        const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;

        const idMatch = url.match(/[?&]id=([^&]+)/);
        if (url.includes('drive.google.com') && idMatch) {
            return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
        }

        return url;
    }

    function openFilePreview(note, context = 'faculty') {
        const url = getNoteFileUrl(note);
        if (!url) {
            alert('File URL not available');
            return;
        }

        const isDbNote = note.hasOwnProperty('downloads') || note.hasOwnProperty('subject_id') || note.hasOwnProperty('is_verified');
        const source = isDbNote ? 'db' : 'drive';

        // Open the AI Analysis Modal instead of inline preview for all faculty files
        if (window.openNoteAnalysis) {
            window.openNoteAnalysis(
                note.id,
                getNoteFileName(note),
                getDrivePreviewUrl(url),
                source,
                getNoteFileName(note),
                {
                    fileUrl: url,
                    facultyName: note.faculty_name || activeFacultyModalStack[0]?.name || '',
                    subjectName: note.subject_name || activeFacultyModalStack[1]?.name || ''
                }
            );
        }
    }

    // Current-semester timetable
    const timetableInput = document.getElementById('timetableInput');
    const timetableImage = document.getElementById('timetableImage');
    const timetableEmpty = document.getElementById('timetableEmpty');
    const timetablePreview = document.getElementById('timetablePreview');
    const timetableZoomHint = document.getElementById('timetableZoomHint');
    const timetableStatus = document.getElementById('timetableStatus');
    const timetableUploadLabel = document.getElementById('timetableUploadLabel');
    const timetableLightbox = document.getElementById('timetableLightbox');
    const timetableLightboxImage = document.getElementById('timetableLightboxImage');
    const timetableLightboxCanvas = document.getElementById('timetableLightboxCanvas');
    const timetableZoomLevel = document.getElementById('timetableZoomLevel');
    const timetableZoomIn = document.getElementById('timetableZoomIn');
    const timetableZoomOut = document.getElementById('timetableZoomOut');
    const timetableZoomReset = document.getElementById('timetableZoomReset');
    const timetableLightboxClose = document.getElementById('timetableLightboxClose');
    let timetableScale = 1;

    const applyTimetableZoom = (nextScale) => {
        timetableScale = Math.min(4, Math.max(1, Math.round(nextScale * 4) / 4));
        if (!timetableLightboxImage) return;
        if (timetableScale === 1) {
            timetableLightboxImage.style.width = 'auto';
            timetableLightboxImage.style.maxWidth = '100%';
            timetableLightboxImage.style.maxHeight = '100%';
        } else {
            timetableLightboxImage.style.width = `${timetableScale * 100}%`;
            timetableLightboxImage.style.maxWidth = 'none';
            timetableLightboxImage.style.maxHeight = 'none';
        }
        if (timetableZoomLevel) timetableZoomLevel.textContent = `${Math.round(timetableScale * 100)}%`;
    };

    const openTimetableLightbox = () => {
        if (!timetableImage?.src || timetableImage.hidden || !timetableLightbox) return;
        timetableLightboxImage.src = timetableImage.src;
        timetableLightbox.classList.add('show');
        timetableLightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        applyTimetableZoom(1);
        timetableLightboxClose?.focus();
    };

    const closeTimetableLightbox = () => {
        if (!timetableLightbox) return;
        timetableLightbox.classList.remove('show');
        timetableLightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        applyTimetableZoom(1);
        timetablePreview?.focus();
    };

    const showTimetable = (data) => {
        const hasImage = Boolean(data?.imageUrl);
        if (timetableImage) {
            timetableImage.hidden = !hasImage;
            timetableImage.src = hasImage ? data.imageUrl : '';
        }
        if (timetableEmpty) timetableEmpty.style.display = hasImage ? 'none' : 'flex';
        if (timetableZoomHint) timetableZoomHint.hidden = !hasImage;
        if (timetablePreview) timetablePreview.classList.toggle('has-image', hasImage);
        if (timetableUploadLabel) timetableUploadLabel.textContent = hasImage ? 'Replace timetable' : 'Upload timetable';
        if (timetableStatus) {
            timetableStatus.textContent = hasImage && data.updatedAt
                ? `Updated ${new Date(data.updatedAt).toLocaleDateString([], { dateStyle: 'medium' })}`
                : 'PNG, JPG or WebP · up to 5 MB';
        }
    };

    if (timetablePreview) {
        timetablePreview.addEventListener('click', openTimetableLightbox);
        timetablePreview.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openTimetableLightbox();
            }
        });
    }
    if (timetableZoomIn) timetableZoomIn.onclick = () => applyTimetableZoom(timetableScale + 0.25);
    if (timetableZoomOut) timetableZoomOut.onclick = () => applyTimetableZoom(timetableScale - 0.25);
    if (timetableZoomReset) timetableZoomReset.onclick = () => applyTimetableZoom(1);
    if (timetableLightboxClose) timetableLightboxClose.onclick = closeTimetableLightbox;
    if (timetableLightbox) {
        timetableLightbox.addEventListener('wheel', event => {
            event.preventDefault();
            applyTimetableZoom(timetableScale + (event.deltaY < 0 ? 0.25 : -0.25));
        }, { passive: false });
        timetableLightbox.addEventListener('click', event => {
            if (event.target === timetableLightbox) closeTimetableLightbox();
        });
    }
    if (timetableLightboxImage) {
        timetableLightboxImage.addEventListener('dblclick', event => {
            event.stopPropagation();
            applyTimetableZoom(timetableScale === 1 ? 2 : 1);
        });
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && timetableLightbox?.classList.contains('show')) closeTimetableLightbox();
    });

    const loadTimetable = async () => {
        const response = await apiFetch('/user/timetable');
        if (response.success) showTimetable(response.data);
        else if (timetableStatus) timetableStatus.textContent = response.message || 'Unable to load timetable';
    };

    if (timetableInput) {
        timetableInput.addEventListener('change', async () => {
            const file = timetableInput.files?.[0];
            if (!file) return;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                timetableStatus.textContent = 'Choose a PNG, JPG or WebP image up to 5 MB.';
                timetableInput.value = '';
                return;
            }

            timetableInput.disabled = true;
            timetableUploadLabel.textContent = 'Uploading…';
            timetableStatus.textContent = 'Saving your timetable securely…';
            const formData = new FormData();
            formData.append('timetable', file);
            try {
                const response = await fetch('/api/user/timetable', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || 'Upload failed');
                showTimetable(result.data);
            } catch (error) {
                timetableStatus.textContent = error.message || 'Unable to upload timetable';
                timetableUploadLabel.textContent = timetableImage?.src ? 'Replace timetable' : 'Upload timetable';
            } finally {
                timetableInput.disabled = false;
                timetableInput.value = '';
            }
        });
    }

    function renderRepoBreadcrumbs(items) {
        if (!facultyRepoBreadcrumbs) return;
        facultyRepoBreadcrumbs.innerHTML = items.map((item, index) => `
            <button class="repo-crumb ${index === items.length - 1 ? 'active' : ''}" data-index="${index}">
                ${escapeHtml(item.label)}
            </button>
        `).join('');
        facultyRepoBreadcrumbs.querySelectorAll('.repo-crumb').forEach((button, index) => {
            button.onclick = items[index].onClick;
        });
    }

    function renderFolderCard({ tag, icon, code, name, meta, onClick }) {
        const card = document.createElement('div');
        card.className = 'subject-card';
        card.innerHTML = `
            <div class="subject-card-top">
                <div class="subject-tag-new">${escapeHtml(tag)}</div>
                <div class="subject-graphic">
                    <i class='bx ${icon}' style="font-size: 64px; color: var(--primary-light);"></i>
                </div>
            </div>
            <div class="subject-card-bottom">
                <h2 class="subject-code-new">${escapeHtml(code)}</h2>
                <p class="subject-name-new">${escapeHtml(name)}</p>
                <span class="repo-folder-meta"><i class='bx bx-folder'></i>${escapeHtml(meta)}</span>
            </div>
        `;
        card.onclick = onClick;
        return card;
    }

    async function loadFacultyNotes(facultyId) {
        const res = await apiFetch(`/faculty/${facultyId}/notes`);
        return res.success && Array.isArray(res.data) ? res.data : [];
    }

    function closeFacultyPreviewPanel() {
        if (facultyFilePreviewPanel) facultyFilePreviewPanel.style.display = 'none';
        if (facultyFilePreviewFrame) facultyFilePreviewFrame.src = '';
    }

    async function renderFacultyRepository(facultyList = []) {
        if (!facultyRepoGrid) return;
        closeFacultyPreviewPanel();
        renderRepoBreadcrumbs([{ label: 'Faculty Folders', onClick: () => renderFacultyRepository(facultyList) }]);
        facultyRepoGrid.innerHTML = '';

        if (facultyList.length === 0) {
            facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No faculty folders found.</div>';
            return;
        }

        facultyList.forEach(fac => {
            facultyRepoGrid.appendChild(renderFolderCard({
                tag: fac.department || 'Faculty',
                icon: 'bx-folder',
                code: fac.name ? fac.name.charAt(0).toUpperCase() : 'F',
                name: fac.name || 'Faculty Folder',
                meta: 'Open mapped subjects',
                onClick: () => renderFacultySubjectsFolder(fac, facultyList)
            }));
        });
    }

    async function renderFacultySubjectsFolder(faculty, facultyList) {
        if (!facultyRepoGrid) return;
        closeFacultyPreviewPanel();
        renderRepoBreadcrumbs([
            { label: 'Faculty Folders', onClick: () => renderFacultyRepository(facultyList) },
            { label: faculty.name || 'Faculty', onClick: () => renderFacultySubjectsFolder(faculty, facultyList) }
        ]);
        facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px;"><i class="bx bx-loader-alt bx-spin" style="font-size:28px;"></i></div>';

        const notes = await loadFacultyNotes(faculty.id);
        const subjectMap = {};
        notes.forEach(note => {
            const subId = note.subject_id || note.subjectId || note.subject || 'unknown-subject';
            if (!subjectMap[subId]) {
                subjectMap[subId] = {
                    id: subId,
                    name: note.subjects?.name || note.subject || 'Unknown Subject',
                    code: note.subjects?.code || note.subjectCode || '',
                    notes: []
                };
            }
            subjectMap[subId].notes.push(note);
        });

        const subjects = Object.values(subjectMap);
        facultyRepoGrid.innerHTML = '';
        if (subjects.length === 0) {
            facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No mapped subject folders found.</div>';
            return;
        }

        subjects.forEach(subject => {
            facultyRepoGrid.appendChild(renderFolderCard({
                tag: faculty.name || 'Faculty',
                icon: 'bx-book-open',
                code: subject.code || 'SUB',
                name: subject.name,
                meta: `${subject.notes.length} material${subject.notes.length === 1 ? '' : 's'}`,
                onClick: () => renderSubjectUnitFolders(faculty, facultyList, subject, subjects)
            }));
        });
    }

    function renderSubjectUnitFolders(faculty, facultyList, subject, subjects) {
        if (!facultyRepoGrid) return;
        closeFacultyPreviewPanel();
        renderRepoBreadcrumbs([
            { label: 'Faculty Folders', onClick: () => renderFacultyRepository(facultyList) },
            { label: faculty.name || 'Faculty', onClick: () => renderFacultySubjectsFolder(faculty, facultyList) },
            { label: subject.name, onClick: () => renderSubjectUnitFolders(faculty, facultyList, subject, subjects) }
        ]);

        const unitMap = {};
        subject.notes.forEach(note => {
            const unit = note.unit || 'General';
            if (!unitMap[unit]) unitMap[unit] = [];
            unitMap[unit].push(note);
        });

        facultyRepoGrid.innerHTML = '';
        Object.keys(unitMap).sort().forEach(unit => {
            facultyRepoGrid.appendChild(renderFolderCard({
                tag: subject.code || 'Subject',
                icon: 'bx-folder-open',
                code: unit === 'General' ? 'GEN' : `U${unit}`,
                name: unit === 'General' ? 'General Materials' : `Unit ${unit}`,
                meta: `${unitMap[unit].length} file${unitMap[unit].length === 1 ? '' : 's'}`,
                onClick: () => renderUnitFiles(faculty, facultyList, subject, subjects, unit, unitMap[unit])
            }));
        });
    }

    function renderUnitFiles(faculty, facultyList, subject, subjects, unit, notes) {
        if (!facultyRepoGrid) return;
        renderRepoBreadcrumbs([
            { label: 'Faculty Folders', onClick: () => renderFacultyRepository(facultyList) },
            { label: faculty.name || 'Faculty', onClick: () => renderFacultySubjectsFolder(faculty, facultyList) },
            { label: subject.name, onClick: () => renderSubjectUnitFolders(faculty, facultyList, subject, subjects) },
            { label: unit === 'General' ? 'General' : `Unit ${unit}`, onClick: () => renderUnitFiles(faculty, facultyList, subject, subjects, unit, notes) }
        ]);

        facultyRepoGrid.innerHTML = '';
        notes.forEach(note => {
            const file = document.createElement('div');
            file.className = 'repo-file-card';
            file.innerHTML = `
                <div class="repo-file-icon"><i class='bx ${note.type === 'ppt' ? 'bxs-slideshow' : 'bxs-file'}'></i></div>
                <div class="repo-file-info">
                    <h4>${escapeHtml(note.title || getNoteFileName(note))}</h4>
                    <p>${escapeHtml(getNoteFileName(note))}</p>
                </div>
            `;
            file.onclick = () => {
                apiFetch(`/notes/${note.id}/download`, { method: 'POST' });
                logProgress('note', note.title || getNoteFileName(note), `Subject: ${subject.name}`);
                openFilePreview(note, 'faculty');
            };
            facultyRepoGrid.appendChild(file);
        });
    }

    async function renderFaculty() {
        if (!facultyResultsGrid) return;
        facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="bx bx-loader-alt bx-spin" style="font-size:32px;"></i></div>';
        const res = await apiFetch('/faculty');
        if (res.success && res.data) {
            facultyResultsGrid.innerHTML = '';
            renderFacultyRepository(res.data);
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
                    const subId = note.subject_id || note.subjectId || note.subject || 'unknown-subject';
                    if (!subjectMap[subId]) {
                        subjectMap[subId] = {
                            id: subId,
                            name: note.subjects?.name || note.subject || 'Unknown Subject',
                            code: note.subjects?.code || note.subjectCode || '',
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
                        <div class="modal-note-item" data-id="${note.id}">
                            <div class="note-item-info">
                                <i class='bx ${note.type === 'ppt' ? 'bxs-slideshow' : 'bxs-file-pdf'}'></i>
                                <h5>${note.title}</h5>
                            </div>
                            <div class="modal-note-actions">
                                <button class="icon-btn-outline preview-note" data-id="${note.id}" title="Preview Note"><i class='bx bx-show'></i></button>
                                <button class="icon-btn-outline download-note" data-url="${getNoteFileUrl(note)}" data-id="${note.id}" data-title="${escapeHtml(note.title)}" data-subject="${escapeHtml(subject.name)}" title="Download Note"><i class='bx bx-download'></i></button>
                                <button class="icon-btn-outline view-note-details" data-id="${note.id}" title="View Details & Ratings"><i class='bx bx-info-circle'></i></button>
                                <button class="icon-btn-outline toggle-bookmark-btn" data-id="${note.id}" title="Bookmark note"><i class='bx ${bookmarkedNoteIds.includes(note.id) ? 'bxs-bookmark-star' : 'bx-bookmark'}'></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(section);
        });

        // Add preview, download, details and bookmark functionality to modal notes
        container.querySelectorAll('.modal-note-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.closest('button')) return;
                const noteId = item.getAttribute('data-id');
                const note = subject.notes.find(entry => String(entry.id) === String(noteId));
                if (!note) return;
                apiFetch(`/notes/${note.id}/download`, { method: 'POST' });
                logProgress('note', note.title || getNoteFileName(note), `Subject: ${subject.name}`);
                openFilePreview(note, 'modal');
            };
        });

        container.querySelectorAll('.preview-note').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const noteId = btn.getAttribute('data-id');
                const note = subject.notes.find(item => String(item.id) === String(noteId));
                if (!note) return;
                apiFetch(`/notes/${note.id}/download`, { method: 'POST' });
                logProgress('note', note.title || getNoteFileName(note), `Subject: ${subject.name}`);
                openFilePreview(note, 'modal');
            };
        });

        container.querySelectorAll('.download-note').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
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

        container.querySelectorAll('.view-note-details').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                localStorage.setItem('selectedNoteId', id);
                window.location.href = 'note-detail.html';
            };
        });

        container.querySelectorAll('.toggle-bookmark-btn').forEach(btn => {
            const id = btn.getAttribute('data-id');
            const icon = btn.querySelector('i');
            
            // Set initial style
            if (bookmarkedNoteIds.includes(id)) {
                icon.className = 'bx bxs-bookmark-star';
                icon.style.color = '#fbbf24';
            }
            
            btn.onclick = async (e) => {
                e.stopPropagation();
                await toggleBookmark(id);
                if (bookmarkedNoteIds.includes(id)) {
                    icon.className = 'bx bxs-bookmark-star';
                    icon.style.color = '#fbbf24';
                } else {
                    icon.className = 'bx bx-bookmark';
                    icon.style.color = '';
                }
            };
        });
    }

    function pluralize(count, singular, plural = `${singular}s`) {
        return `${count} ${count === 1 ? singular : plural}`;
    }

    function getFolderCode(name = 'Folder') {
        const parts = String(name)
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (parts.length === 0) return 'DIR';
        if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
        return parts.slice(0, 3).map((part) => part[0].toUpperCase()).join('');
    }

    function sortByName(items = []) {
        return [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {
            numeric: true,
            sensitivity: 'base'
        }));
    }

    function getFolderMeta(folder) {
        if (folder.error) return folder.error;

        const parts = [];
        if (folder.directFolderCount) parts.push(pluralize(folder.directFolderCount, 'subfolder'));
        if (folder.directFileCount) parts.push(pluralize(folder.directFileCount, 'file'));
        if (parts.length > 0) return parts.join(' | ');
        if (folder.fileCount) return pluralize(folder.fileCount, 'file');
        return 'Empty folder';
    }

    function getFacultyCardSubtitle(folder) {
        const parts = [];
        if (folder.directFolderCount) parts.push(pluralize(folder.directFolderCount, 'subject folder'));
        if (folder.fileCount) parts.push(pluralize(folder.fileCount, 'file'));
        return parts.join(' | ') || 'Shared Google Drive folder';
    }

    function getFileIcon(item) {
        const fileName = getNoteFileName(item).toLowerCase();
        if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) return 'bxs-slideshow';
        if (fileName.endsWith('.pdf')) return 'bxs-file-pdf';
        return 'bxs-file';
    }

    function renderDriveFileCard(item, context = 'faculty', folderName = '') {
        const file = document.createElement('div');
        file.className = 'repo-file-card';
        file.innerHTML = `
            <div class="repo-file-icon"><i class='bx ${getFileIcon(item)}'></i></div>
            <div class="repo-file-info">
                <h4>${escapeHtml(getNoteFileName(item))}</h4>
                <p>${escapeHtml(folderName || 'Google Drive file')}</p>
            </div>
        `;
        file.onclick = () => {
            logProgress('note', getNoteFileName(item), folderName ? `Folder: ${folderName}` : 'Google Drive');
            openFilePreview(item, context);
        };
        return file;
    }

    function collectFacultySearchText(folder, values = []) {
        values.push(folder.name || '');
        (folder.children || []).forEach((child) => {
            values.push(child.name || '');
            if (child.type === 'folder') collectFacultySearchText(child, values);
        });
        return values.join(' ').toLowerCase();
    }

    function matchesFacultyFilters(folder, query = '', filter = 'all') {
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery && !collectFacultySearchText(folder).includes(normalizedQuery)) {
            return false;
        }

        if (filter === 'with-folders' && !folder.folderCount) return false;
        if (filter === 'with-files' && !folder.fileCount) return false;
        return true;
    }

    function closeFacultyPreviewPanel() {
        if (facultyFilePreviewPanel) facultyFilePreviewPanel.style.display = 'none';
        if (facultyFilePreviewFrame) facultyFilePreviewFrame.src = '';
    }

    function setupFacultyFilters() {
        if (!facultyDeptFilters) return;

        facultyDeptFilters.innerHTML = `
            <span class="subject-tag ${activeFacultyDriveFilter === 'all' ? 'active' : ''}" data-drive-filter="all">All</span>
            <span class="subject-tag ${activeFacultyDriveFilter === 'with-folders' ? 'active' : ''}" data-drive-filter="with-folders">Has Subfolders</span>
            <span class="subject-tag ${activeFacultyDriveFilter === 'with-files' ? 'active' : ''}" data-drive-filter="with-files">Has Files</span>
        `;

        facultyDeptFilters.querySelectorAll('[data-drive-filter]').forEach((tag) => {
            tag.onclick = () => {
                activeFacultyDriveFilter = tag.getAttribute('data-drive-filter') || 'all';
                setupFacultyFilters();
                renderFacultyCards();
            };
        });
    }

    async function loadDriveFacultyRepository(forceRefresh = false) {
        const endpoint = forceRefresh ? '/drive/faculty-repository?refresh=1' : '/drive/faculty-repository';
        const res = await apiFetch(endpoint);

        if (!res.success || !res.data || !res.data.root) {
            driveFacultyRoot = null;
            driveFacultyFolders = [];
            return false;
        }

        driveFacultyRoot = res.data.root;
        driveFacultyFolders = Array.isArray(res.data.faculties)
            ? res.data.faculties
            : (driveFacultyRoot.children || []).filter((child) => child.type === 'folder');
        return true;
    }

    function renderDriveFolderContents(folder, path = [driveFacultyRoot]) {
        if (!facultyRepoGrid || !folder) return;

        closeFacultyPreviewPanel();
        renderRepoBreadcrumbs(path.map((node, index) => ({
            label: index === 0 ? 'Faculty Folders' : (node.name || 'Folder'),
            onClick: () => renderDriveFolderContents(node, path.slice(0, index + 1))
        })));

        facultyRepoGrid.innerHTML = '';
        const children = Array.isArray(folder.children) ? folder.children : [];
        const folders = sortByName(children.filter((child) => child.type === 'folder'));
        const files = sortByName(children.filter((child) => child.type === 'file'));

        if (folders.length === 0 && files.length === 0) {
            facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No items found in this Drive folder.</div>';
            return;
        }

        folders.forEach((child) => {
            facultyRepoGrid.appendChild(renderFolderCard({
                tag: path.length === 1 ? 'Faculty' : (folder.name || 'Folder'),
                icon: path.length === 1 ? 'bx-folder' : 'bx-folder-open',
                code: getFolderCode(child.name),
                name: child.name || 'Folder',
                meta: getFolderMeta(child),
                onClick: () => renderDriveFolderContents(child, [...path, child])
            }));
        });

        files.forEach((child) => {
            facultyRepoGrid.appendChild(renderDriveFileCard(child, 'faculty', folder.name || 'Google Drive'));
        });
    }

    function renderFacultyCards() {
        if (!facultyResultsGrid) return;

        const query = facultySearchInput ? facultySearchInput.value : '';
        const filteredFaculty = driveFacultyFolders.filter((folder) => matchesFacultyFilters(folder, query, activeFacultyDriveFilter));
        facultyResultsGrid.innerHTML = '';

        if (filteredFaculty.length === 0) {
            facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No faculty folders matched the current filters.</div>';
            return;
        }

        filteredFaculty.forEach((fac) => {
            const color = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b'][Math.floor(Math.random() * 4)];
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
                <div class="note-icon" style="background:${color}22; color:${color}; font-weight:bold;">${escapeHtml((fac.name || 'F').charAt(0).toUpperCase())}</div>
                <div class="note-details">
                    <h4>${escapeHtml(fac.name || 'Faculty Folder')}</h4>
                    <p>${escapeHtml(getFacultyCardSubtitle(fac))}</p>
                </div>
                <button class="icon-btn-outline view-faculty-btn"><i class='bx bx-user'></i></button>
            `;
            card.querySelector('.view-faculty-btn').onclick = () => openFacultyModal(fac);
            card.onclick = (event) => {
                if (!event.target.closest('button')) openFacultyModal(fac);
            };
            facultyResultsGrid.appendChild(card);
        });
    }

    async function renderFaculty() {
        if (!facultyResultsGrid || !facultyRepoGrid) return;

        facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="bx bx-loader-alt bx-spin" style="font-size:32px;"></i></div>';
        facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px;"><i class="bx bx-loader-alt bx-spin" style="font-size:28px;"></i></div>';

        const loaded = await loadDriveFacultyRepository();
        if (!loaded || !driveFacultyRoot) {
            facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Failed to load the shared faculty Drive repository.</div>';
            facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Unable to load Google Drive folders right now.</div>';
            return;
        }

        setupFacultyFilters();
        renderDriveFolderContents(driveFacultyRoot, [driveFacultyRoot]);
        renderFacultyCards();
    }

    function renderFacultyModalRoot(faculty) {
        const modalSubjectsList = document.getElementById('modalSubjectsList');
        if (!modalSubjectsList) return;

        if (modalFilePreviewPanel) modalFilePreviewPanel.style.display = 'none';
        if (modalFilePreviewFrame) modalFilePreviewFrame.src = '';

        modalSubjectsView.style.display = 'block';
        modalNotesView.style.display = 'none';
        modalSubjectsList.innerHTML = '';

        const children = Array.isArray(faculty.children) ? faculty.children : [];
        const folders = sortByName(children.filter((child) => child.type === 'folder'));
        const files = sortByName(children.filter((child) => child.type === 'file'));

        if (folders.length === 0 && files.length === 0) {
            modalSubjectsList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No subject folders or files found for this faculty.</div>';
            return;
        }

        folders.forEach((folder) => {
            const card = document.createElement('div');
            card.className = 'modal-subject-card';
            card.innerHTML = `
                <h4>${escapeHtml(folder.name || 'Folder')}</h4>
                <span>${escapeHtml(getFolderMeta(folder))}</span>
            `;
            card.onclick = () => {
                activeFacultyModalStack = [faculty, folder];
                renderFacultyModalFolder(folder);
            };
            modalSubjectsList.appendChild(card);
        });

        files.forEach((file) => {
            const card = document.createElement('div');
            card.className = 'modal-subject-card';
            card.innerHTML = `
                <h4>${escapeHtml(getNoteFileName(file))}</h4>
                <span>Direct file</span>
            `;
            card.onclick = () => openFilePreview(file, 'modal');
            modalSubjectsList.appendChild(card);
        });
    }

    function renderFacultyModalFolder(folder) {
        const container = document.getElementById('modalUnitsContainer');
        if (!container) return;

        if (modalFilePreviewPanel) modalFilePreviewPanel.style.display = 'none';
        if (modalFilePreviewFrame) modalFilePreviewFrame.src = '';

        modalSubjectsView.style.display = 'none';
        modalNotesView.style.display = 'block';
        document.getElementById('modalSelectedSubjectTitle').textContent = folder.name || 'Folder';

        container.innerHTML = '';
        const children = Array.isArray(folder.children) ? folder.children : [];
        const folders = sortByName(children.filter((child) => child.type === 'folder'));
        const files = sortByName(children.filter((child) => child.type === 'file'));

        if (folders.length === 0 && files.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">This folder is empty.</div>';
            return;
        }

        if (folders.length > 0) {
            const folderSection = document.createElement('div');
            folderSection.className = 'unit-section';
            folderSection.innerHTML = '<div class="unit-header">SUBFOLDERS</div><div class="modal-notes-list"></div>';
            const folderList = folderSection.querySelector('.modal-notes-list');

            folders.forEach((childFolder) => {
                const item = document.createElement('div');
                item.className = 'modal-note-item';
                item.innerHTML = `
                    <div class="note-item-info">
                        <i class='bx bx-folder-open'></i>
                        <h5>${escapeHtml(childFolder.name || 'Folder')}</h5>
                    </div>
                    <div class="modal-note-actions">
                        <button class="icon-btn-outline open-folder-btn" type="button" title="Open folder"><i class='bx bx-right-arrow-alt'></i></button>
                    </div>
                `;

                const openChildFolder = () => {
                    activeFacultyModalStack.push(childFolder);
                    renderFacultyModalFolder(childFolder);
                };

                item.onclick = (event) => {
                    if (event.target.closest('button')) return;
                    openChildFolder();
                };
                item.querySelector('.open-folder-btn').onclick = (event) => {
                    event.stopPropagation();
                    openChildFolder();
                };
                folderList.appendChild(item);
            });

            container.appendChild(folderSection);
        }

        if (files.length > 0) {
            const fileSection = document.createElement('div');
            fileSection.className = 'unit-section';
            fileSection.innerHTML = '<div class="unit-header">FILES</div><div class="modal-notes-list"></div>';
            const fileList = fileSection.querySelector('.modal-notes-list');

            files.forEach((file) => {
                const item = document.createElement('div');
                item.className = 'modal-note-item';
                item.innerHTML = `
                    <div class="note-item-info">
                        <i class='bx ${getFileIcon(file)}'></i>
                        <h5>${escapeHtml(getNoteFileName(file))}</h5>
                    </div>
                    <div class="modal-note-actions">
                        <button class="icon-btn-outline preview-note" title="Preview"><i class='bx bx-show'></i></button>
                        <button class="icon-btn-outline download-note" title="Open"><i class='bx bx-link-external'></i></button>
                        <button class="icon-btn-outline toggle-drive-bookmark-btn" title="Bookmark"><i class='bx bx-bookmark'></i></button>
                    </div>
                `;
                item.onclick = (event) => {
                    if (event.target.closest('button')) return;
                    openFilePreview(file, 'modal');
                };
                item.querySelector('.preview-note').onclick = (event) => {
                    event.stopPropagation();
                    openFilePreview(file, 'modal');
                };
                item.querySelector('.download-note').onclick = (event) => {
                    event.stopPropagation();
                    const fileUrl = getNoteFileUrl(file);
                    if (fileUrl) window.open(fileUrl, '_blank');
                };

                const bookmarkBtn = item.querySelector('.toggle-drive-bookmark-btn');
                const bookmarkIcon = bookmarkBtn.querySelector('i');
                const fileUrl = getNoteFileUrl(file);
                
                let isBookmarked = bookmarkedNoteUrls.includes(fileUrl);
                if (isBookmarked) {
                    bookmarkIcon.className = 'bx bxs-bookmark-star';
                    bookmarkIcon.style.color = '#fbbf24';
                }

                bookmarkBtn.onclick = async (event) => {
                    event.stopPropagation();
                    const facultyName = activeFacultyModalStack[0]?.name || '';
                    const subjectName = activeFacultyModalStack[1]?.name || '';
                    const fileName = getNoteFileName(file);
                    
                    if (isBookmarked) {
                        const bookmarkItem = bookmarkedNotesList.find(b => b.fileUrl === fileUrl);
                        if (bookmarkItem) {
                            const res = await apiFetch(`/bookmarks/${bookmarkItem.noteId}`, {
                                method: 'DELETE'
                            });
                            if (res.success) {
                                bookmarkIcon.className = 'bx bx-bookmark';
                                bookmarkIcon.style.color = '';
                                isBookmarked = false;
                                await syncBookmarks();
                            }
                        }
                    } else {
                        const res = await apiFetch('/bookmarks', {
                            method: 'POST',
                            body: JSON.stringify({
                                file_name: fileName,
                                file_url: fileUrl,
                                faculty_name: facultyName,
                                subject_name: subjectName
                            })
                        });
                        if (res.success) {
                            bookmarkIcon.className = 'bx bxs-bookmark-star';
                            bookmarkIcon.style.color = '#fbbf24';
                            isBookmarked = true;
                            await syncBookmarks();
                        }
                    }
                };

                fileList.appendChild(item);
            });

            container.appendChild(fileSection);
        }
    }

    function openFacultyModal(faculty) {
        if (!facultyModal) return;

        activeFacultyModalStack = [faculty];
        document.getElementById('modalFacultyName').textContent = faculty.name || 'Faculty Folder';
        document.getElementById('modalFacultyDept').textContent = getFacultyCardSubtitle(faculty);
        document.getElementById('modalFacultyAvatar').textContent = (faculty.name || 'F').charAt(0).toUpperCase();
        facultyModal.classList.add('show');
        renderFacultyModalRoot(faculty);
    }

    if (closeFacultyModal) {
        closeFacultyModal.onclick = () => {
            facultyModal.classList.remove('show');
            activeFacultyModalStack = [];
            if (modalFilePreviewPanel) modalFilePreviewPanel.style.display = 'none';
            if (modalFilePreviewFrame) modalFilePreviewFrame.src = '';
        };
    }

    if (closeFacultyPreview) {
        closeFacultyPreview.onclick = closeFacultyPreviewPanel;
    }

    if (closeModalPreview) {
        closeModalPreview.onclick = () => {
            modalFilePreviewPanel.style.display = 'none';
            modalFilePreviewFrame.src = '';
        };
    }

    if (backToSubjects) {
        backToSubjects.onclick = () => {
            if (activeFacultyModalStack.length <= 1) {
                modalNotesView.style.display = 'none';
                modalSubjectsView.style.display = 'block';
            } else if (activeFacultyModalStack.length === 2) {
                const facultyRoot = activeFacultyModalStack[0];
                activeFacultyModalStack = [facultyRoot];
                renderFacultyModalRoot(facultyRoot);
            } else {
                activeFacultyModalStack.pop();
                renderFacultyModalFolder(activeFacultyModalStack[activeFacultyModalStack.length - 1]);
            }

            if (modalFilePreviewPanel) modalFilePreviewPanel.style.display = 'none';
            if (modalFilePreviewFrame) modalFilePreviewFrame.src = '';
        };
    }

    if (facultySearchInput) {
        facultySearchInput.addEventListener('input', () => {
            renderFacultyCards();
        });
    }

    // Close modal on outside click
    window.onclick = (event) => {
        if (event.target === facultyModal) {
            facultyModal.classList.remove('show');
            activeFacultyModalStack = [];
            if (modalFilePreviewPanel) modalFilePreviewPanel.style.display = 'none';
            if (modalFilePreviewFrame) modalFilePreviewFrame.src = '';
        }
    };

    // ==================== MOST BOOKMARKED NOTES LOGIC ====================
    async function renderTopRatedNotes() {
        const grid = document.getElementById('topRatedNotesGrid');
        if (!grid) return;
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="bx bx-loader-alt bx-spin"></i></div>';
        
        const res = await apiFetch('/bookmarks/top');
        if (res.success && Array.isArray(res.data) && res.data.length) {
            grid.innerHTML = res.data.map(note => `
                <div class="note-card glass-panel most-bookmarked-card" data-note-id="${escapeHtml(note.id)}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 16px; padding: 15px; transition: 0.3s; cursor: pointer;">
                    <div class="note-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <i class='bx bxs-file-pdf' style="font-size: 24px; color: var(--accent);"></i>
                        <div class="star-rating" style="display: flex; align-items: center; gap: 4px; color: #fbbf24; font-weight: 600;">
                            <i class='bx bxs-bookmark-star'></i>
                            <span>${note.bookmark_count}</span>
                        </div>
                    </div>
                    <div class="note-card-body" style="margin-bottom: 15px;">
                        <h4 style="margin: 0; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(note.title)}</h4>
                        <p style="margin: 4px 0 0; font-size: 12px; color: var(--text-muted);">${escapeHtml(note.subject_name || 'Notezilla')}</p>
                    </div>
                    <div class="note-card-footer" style="display:flex; gap:8px;">
                        <button class="btn-glass open-bookmarked-note" style="flex:1; padding: 8px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class='bx bx-show'></i> Open note
                        </button>
                        <button class="icon-btn-outline bookmark-top-note" title="${bookmarkedNoteIds.some(id => String(id) === String(note.id)) ? 'Remove bookmark' : 'Bookmark note'}">
                            <i class='bx ${bookmarkedNoteIds.some(id => String(id) === String(note.id)) ? 'bxs-bookmark-star' : 'bx-bookmark'}'></i>
                        </button>
                    </div>
                </div>
            `).join('');

            grid.querySelectorAll('.most-bookmarked-card').forEach((card, index) => {
                const note = res.data[index];
                const openNote = () => window.openNoteAnalysis(note.id, note.title, getDrivePreviewUrl(note.file_url), 'db', note.file_name || note.title);
                card.onclick = (event) => {
                    if (event.target.closest('button')) return;
                    openNote();
                };
                card.querySelector('.open-bookmarked-note').onclick = (event) => {
                    event.stopPropagation();
                    openNote();
                };
                card.querySelector('.bookmark-top-note').onclick = async (event) => {
                    event.stopPropagation();
                    await toggleBookmark(note.id);
                };
            });
        } else {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted);">No bookmarked notes yet.</div>';
        }
    }

    // ==================== DSA MODULE LOGIC ====================
    const dsaSetupPrompt = document.getElementById('dsa-setup-prompt');
    const dsaContentArea = document.getElementById('dsa-content-area');
    const dsaLoadingOverlay = document.getElementById('dsa-loading-overlay');
    const dsaOnboardingForm = document.getElementById('dsa-onboarding-form');
    const dsaLanguageSelect = document.getElementById('dsaLanguageSelect');
    
    let currentDsaDay = 1;
    let currentDsaLanguage = 'python';
    let currentDsaLearningGoal = '';
    
    async function fetchDSA() {
        if (dsaLoadingOverlay) dsaLoadingOverlay.style.display = 'none';
        
        const res = await apiFetch('/dsa/daily');
        if (res.success) {
            if (dsaSetupPrompt) dsaSetupPrompt.style.display = 'none';
            if (dsaLoadingOverlay) dsaLoadingOverlay.style.display = 'none';
            if (dsaContentArea) dsaContentArea.style.display = 'flex';
            
            currentDsaDay = res.data.day;
            currentDsaLanguage = res.data.programming_language || 'python';
            currentDsaLearningGoal = res.data.learning_goal || currentDsaLearningGoal;
            
            renderDSA(res.data);
        } else if (res.needsLanguage) {
            if (dsaSetupPrompt) dsaSetupPrompt.style.display = 'block';
            if (dsaLoadingOverlay) dsaLoadingOverlay.style.display = 'none';
            if (dsaContentArea) dsaContentArea.style.display = 'none';
        }
    }

    function renderDSA(data) {
        if (!data) return;
        
        const mapping = {
            'dsa-concept-title': `Concept: ${data.concept}`,
            'dsa-day-badge': `Day ${data.day}`,
            'dsa-concept-explanation': data.explanation,
            'dsa-syntax-code': data.syntax,
            'dsa-example-code': data.example_code,
            'dsa-practice-problem': data.practice_problem
        };
        Object.entries(mapping).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });
        
        // Render logic list
        const logicList = document.getElementById('dsa-logic-list');
        if (logicList) {
            logicList.innerHTML = data.logic_breakdown 
                ? data.logic_breakdown.map(item => `<li>${item}</li>`).join('') 
                : '';
        }
        
        // Video tutorial url
        const youtubeLink = document.getElementById('dsa-youtube-link');
        if (youtubeLink) youtubeLink.href = data.youtube_url;
        
        // Programming language pill
        const langPill = document.getElementById('dsa-language-pill');
        if (langPill) {
            const meta = data.language_meta || {};
            langPill.textContent = meta.label || data.programming_language.toUpperCase();
        }
        if (dsaLanguageSelect) dsaLanguageSelect.value = data.programming_language || '';
        
        // Editor configuration
        const editorFile = document.getElementById('dsa-editor-file');
        const codeEditor = document.getElementById('dsa-code-editor');
        if (codeEditor) {
            if (editorFile) {
                const ext = data.programming_language === 'python' ? 'py' : (data.programming_language === 'cpp' ? 'cpp' : (data.programming_language === 'java' ? 'java' : 'c'));
                editorFile.textContent = `solution.${ext}`;
            }
            // Load saved draft, fallback to example code
            const draft = data.progress?.todayStatus?.codeDraft;
            codeEditor.value = draft || data.example_code || '';
        }
        
        // Render stats and metrics
        const progress = data.progress || {};
        
        const streakEl = document.getElementById('dsa-streak');
        if (streakEl) streakEl.textContent = `${progress.streak || 0} days`;

        const completedEl = document.getElementById('dsa-completed-count');
        if (completedEl) completedEl.textContent = `${progress.completedCount || 0} / 14`;

        const minutesEl = document.getElementById('dsa-total-minutes');
        if (minutesEl) minutesEl.textContent = `${progress.totalMinutes || 0} min`;

        const percentEl = document.getElementById('dsa-progress-percent');
        if (percentEl) percentEl.textContent = `${progress.completionPercent || 0}%`;

        const fillEl = document.getElementById('dsa-progress-fill');
        if (fillEl) fillEl.style.width = `${progress.completionPercent || 0}%`;

        // Render external practice links
        const linksWrap = document.getElementById('dsa-external-links');
        if (linksWrap && data.external_links) {
            linksWrap.innerHTML = data.external_links.map(link => `
                <a href="${link.url}" target="_blank" class="dsa-link-card">
                    <span class="platform-badge">${link.platform}</span>
                    <span class="link-title">${link.title}</span>
                </a>
            `).join('');
        }
        
        // Reset output console
        const runOutput = document.getElementById('dsa-run-output');
        if (runOutput) {
            runOutput.textContent = 'Draft autosaves locally while you work. Run Check to test your solution.';
            runOutput.style.color = '#a78bfa';
        }
    }

    // Onboarding Form Submit handler
    if (dsaOnboardingForm) {
        dsaOnboardingForm.onsubmit = async (e) => {
            e.preventDefault();
            const lang = document.getElementById('onboarding-lang').value;
            const goal = document.getElementById('onboarding-goal').value;
            
            if (!lang || !goal) return;
            
            if (dsaSetupPrompt) dsaSetupPrompt.style.display = 'none';
            if (dsaLoadingOverlay) dsaLoadingOverlay.style.display = 'block';
            
            const res = await apiFetch('/dsa/preference', {
                method: 'POST',
                body: JSON.stringify({ language: lang, learningGoal: goal })
            });
            
            if (res.success) {
                await fetchDSA();
            } else {
                alert('Preference configuration failed: ' + (res.message || 'Unknown error'));
                if (dsaSetupPrompt) dsaSetupPrompt.style.display = 'block';
                if (dsaLoadingOverlay) dsaLoadingOverlay.style.display = 'none';
            }
        };
    }

    if (dsaLanguageSelect) {
        dsaLanguageSelect.onchange = async () => {
            const language = dsaLanguageSelect.value;
            if (!language || language === currentDsaLanguage || !currentDsaLearningGoal) return;

            dsaLanguageSelect.disabled = true;
            const res = await apiFetch('/dsa/preference', {
                method: 'POST',
                body: JSON.stringify({ language, learningGoal: currentDsaLearningGoal })
            });
            dsaLanguageSelect.disabled = false;

            if (res.success) {
                currentDsaLanguage = language;
                await fetchDSA();
            } else {
                dsaLanguageSelect.value = currentDsaLanguage;
                alert('Unable to change language: ' + (res.message || 'Unknown error'));
            }
        };
    }

    // Compiler / Draft Actions
    const saveProgressBtn = document.getElementById('dsa-save-progress');
    if (saveProgressBtn) {
        saveProgressBtn.onclick = async () => {
            const codeEditor = document.getElementById('dsa-code-editor');
            if (!codeEditor) return;
            
            saveProgressBtn.disabled = true;
            saveProgressBtn.textContent = 'Saving...';
            
            const res = await apiFetch('/dsa/progress', {
                method: 'POST',
                body: JSON.stringify({
                    day: currentDsaDay,
                    codeDraft: codeEditor.value,
                    status: {},
                    minutes: 5 // log 5 minutes of study time
                })
            });
            
            saveProgressBtn.disabled = false;
            saveProgressBtn.textContent = 'Save Draft';
            
            const runOutput = document.getElementById('dsa-run-output');
            if (runOutput) {
                if (res.success) {
                    runOutput.textContent = 'Draft saved successfully to dashboard cloud storage!';
                    runOutput.style.color = '#10b981';
                } else {
                    runOutput.textContent = 'Failed to save draft: ' + (res.message || 'Unknown error');
                    runOutput.style.color = '#ef4444';
                }
            }
        };
    }

    const markCompleteBtn = document.getElementById('dsa-mark-complete');
    if (markCompleteBtn) {
        markCompleteBtn.onclick = async () => {
            const codeEditor = document.getElementById('dsa-code-editor');
            const code = codeEditor ? codeEditor.value : '';
            
            markCompleteBtn.disabled = true;
            markCompleteBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Completing...";
            
            const res = await apiFetch('/dsa/progress', {
                method: 'POST',
                body: JSON.stringify({
                    day: currentDsaDay,
                    codeDraft: code,
                    status: { completed: true },
                    minutes: 15, // log 15 minutes of completion time
                    advance: true
                })
            });
            
            markCompleteBtn.disabled = false;
            markCompleteBtn.innerHTML = "<i class='bx bx-check-circle'></i> Mark Complete";
            
            if (res.success) {
                // Fetch next day content
                await fetchDSA();
            } else {
                alert('Failed to mark complete: ' + (res.message || 'Unknown error'));
            }
        };
    }

    const runCodeBtn = document.getElementById('dsa-run-code');
    if (runCodeBtn) {
        runCodeBtn.onclick = async () => {
            const codeEditor = document.getElementById('dsa-code-editor');
            const runOutput = document.getElementById('dsa-run-output');
            if (!codeEditor || !runOutput) return;
            
            runCodeBtn.disabled = true;
            runCodeBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Running...";
            
            runOutput.textContent = 'Compiling and running your code in the isolated sandbox...\n';
            runOutput.style.color = '#f59e0b';
            
            try {
                const res = await apiFetch('/dsa/run', {
                    method: 'POST',
                    body: JSON.stringify({
                        code: codeEditor.value,
                        language: currentDsaLanguage,
                        day: currentDsaDay
                    })
                });
                
                runCodeBtn.disabled = false;
                runCodeBtn.innerHTML = 'Run Check';
                
                if (res.success && Array.isArray(res.results) && res.results.length > 0) {
                    runOutput.innerHTML = '';
                    let allPassed = true;
                    
                    res.results.forEach((tc, idx) => {
                        const tcRow = document.createElement('div');
                        tcRow.className = 'dsa-tc-row';
                        
                        const statusClass = tc.passed ? 'passed' : 'failed';
                        const statusLabel = String(tc.status || (tc.passed ? 'passed' : 'failed')).replace(/_/g, ' ').toUpperCase();
                        
                        let detailHtml = `
                            <div style="margin-bottom: 5px;">
                                <span class="dsa-tc-badge ${statusClass}">${statusLabel}</span>
                                <strong>Test Case #${idx + 1}</strong>
                            </div>
                        `;
                        
                        if (tc.stdout || !tc.passed) {
                            detailHtml += `<div class="dsa-tc-detail"><strong>Output</strong><pre>${escapeHtml(String(tc.stdout || '').trim() || '(no output)')}</pre></div>`;
                        }
                        if (!tc.passed && typeof tc.expectedOutput === 'string') {
                            detailHtml += `<div class="dsa-tc-detail expected"><strong>Expected</strong><pre>${escapeHtml(tc.expectedOutput.trim() || '(no output)')}</pre></div>`;
                        }
                        if (tc.stderr) {
                            detailHtml += `<div class="dsa-tc-detail error"><strong>Compiler error</strong><pre>${escapeHtml(tc.stderr)}</pre></div>`;
                        }
                        
                        tcRow.innerHTML = detailHtml;
                        runOutput.appendChild(tcRow);
                        
                        if (!tc.passed) allPassed = false;
                    });
                    
                    const summary = document.createElement('div');
                    summary.style.marginTop = '15px';
                    summary.style.fontWeight = 'bold';
                    
                    if (allPassed) {
                        summary.textContent = '🎉 All test cases passed! Outstanding work!';
                        summary.style.color = '#10b981';
                    } else {
                        summary.textContent = '❌ Some test cases failed or code generated compiler errors. Check outputs above.';
                        summary.style.color = '#ef4444';
                    }
                    runOutput.appendChild(summary);
                    
                } else {
                    runOutput.textContent = 'Compiler Execution Error: ' + (res.message || 'Unknown compilation error.');
                    runOutput.style.color = '#ef4444';
                }
            } catch (err) {
                runCodeBtn.disabled = false;
                runCodeBtn.innerHTML = 'Run Check';
                runOutput.textContent = 'Network or connection error during code run check.';
                runOutput.style.color = '#ef4444';
            }
        };
    }

    // ==================== NOTE ANALYSIS LOGIC ====================
    let currentNoteId = null;
    let currentNoteSource = 'db'; // 'db' or 'drive'
    let currentNoteFileName = '';
    let currentNoteTitle = '';
    let currentNoteUrl = '';
    let currentNoteFacultyName = '';
    let currentNoteSubjectName = '';
    let selectedNoteText = '';
    const noteAnalysisModal = document.getElementById('noteAnalysisModal');
    const analysisNoteTitle = document.getElementById('analysisNoteTitle');
    const analysisFrame = document.getElementById('analysisFrame');
    const pdfDocumentViewer = document.getElementById('pdfDocumentViewer');
    const textSelectionActions = document.getElementById('textSelectionActions');
    const analysisBookmarkBtn = document.getElementById('analysisBookmarkBtn');
    const startAnalysisBtn = document.getElementById('startAnalysisBtn');
    const closeAnalysisModal = document.getElementById('closeAnalysisModal');

    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    window.openNoteDetails = (id) => {
        localStorage.setItem('selectedNoteId', id);
        window.location.href = 'note-detail.html';
    };

    const isCurrentNoteBookmarked = () => {
        if (currentNoteSource === 'db') {
            return bookmarkedNoteIds.some(id => String(id) === String(currentNoteId));
        }
        return bookmarkedNoteUrls.includes(currentNoteUrl);
    };

    const updateAnalysisBookmarkButton = () => {
        if (!analysisBookmarkBtn) return;
        const isBookmarked = isCurrentNoteBookmarked();
        analysisBookmarkBtn.classList.toggle('bookmarked', isBookmarked);
        analysisBookmarkBtn.setAttribute('aria-pressed', String(isBookmarked));
        analysisBookmarkBtn.querySelector('i').className = `bx ${isBookmarked ? 'bxs-bookmark-star' : 'bx-bookmark'}`;
        analysisBookmarkBtn.querySelector('.note-save-copy strong').textContent = isBookmarked ? 'Saved' : 'Save note';
        analysisBookmarkBtn.querySelector('.note-save-copy small').textContent = isBookmarked ? 'In your bookmarks' : 'Add to bookmarks';
    };

    const renderPdfTextLayer = async (page, viewport, pageElement) => {
        const textContent = await page.getTextContent();
        const layer = document.createElement('div');
        layer.className = 'pdf-text-layer';
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
        pageElement.appendChild(layer);

        textContent.items.forEach((item) => {
            const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
            const angle = Math.atan2(tx[1], tx[0]);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            const span = document.createElement('span');
            span.textContent = item.str;
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - fontHeight}px`;
            span.style.fontSize = `${fontHeight}px`;
            span.style.fontFamily = textContent.styles[item.fontName]?.fontFamily || 'sans-serif';
            layer.appendChild(span);
            const expectedWidth = item.width * viewport.scale;
            const measuredWidth = span.getBoundingClientRect().width;
            const scaleX = measuredWidth > 0 && expectedWidth > 0 ? expectedWidth / measuredWidth : 1;
            span.style.transform = `rotate(${angle}rad) scaleX(${scaleX})`;
        });
    };

    const renderSelectableDocumentText = (text) => {
        const documentText = document.createElement('article');
        documentText.className = 'selectable-document-text';

        const header = document.createElement('header');
        header.className = 'selectable-document-header';
        const badge = document.createElement('span');
        badge.className = 'selectable-document-badge';
        badge.innerHTML = "<i class='bx bx-text'></i> Selectable document";
        const title = document.createElement('h2');
        title.textContent = currentNoteTitle || currentNoteFileName || 'Document';
        const hint = document.createElement('p');
        hint.textContent = 'Highlight any passage to create flashcards or request an explanation.';
        header.append(badge, title, hint);

        const body = document.createElement('div');
        body.className = 'selectable-document-body';
        const formatter = window.NotezillaDocumentFormatter;
        const blocks = formatter?.parse ? formatter.parse(text) : [{ type: 'paragraph', text }];

        blocks.forEach(block => {
            if (block.type === 'heading') {
                const heading = document.createElement(block.level === 2 ? 'h2' : 'h3');
                heading.textContent = block.text;
                body.appendChild(heading);
                return;
            }
            if (block.type === 'list') {
                const list = document.createElement('ul');
                block.items.forEach(item => {
                    const listItem = document.createElement('li');
                    listItem.textContent = item;
                    list.appendChild(listItem);
                });
                body.appendChild(list);
                return;
            }
            if (block.type === 'table') {
                const table = document.createElement('div');
                table.className = 'selectable-document-table';
                block.rows.forEach((row, rowIndex) => {
                    const tableRow = document.createElement('div');
                    tableRow.className = `selectable-document-table-row${rowIndex === 0 ? ' is-header' : ''}`;
                    row.forEach(value => {
                        const cell = document.createElement('span');
                        cell.textContent = value;
                        tableRow.appendChild(cell);
                    });
                    table.appendChild(tableRow);
                });
                body.appendChild(table);
                return;
            }
            if (block.type === 'pageBreak') {
                const divider = document.createElement('div');
                divider.className = 'selectable-document-page-break';
                divider.setAttribute('aria-hidden', 'true');
                body.appendChild(divider);
                return;
            }

            const paragraph = document.createElement('p');
            paragraph.textContent = block.text;
            body.appendChild(paragraph);
        });

        documentText.append(header, body);
        return documentText;
    };

    const loadExtractedDocumentText = async () => {
        if (!pdfDocumentViewer) return false;
        pdfDocumentViewer.innerHTML = '<div style="color:white;text-align:center;padding:40px"><i class="bx bx-loader-alt bx-spin"></i> Preparing selectable document text...</div>';
        pdfDocumentViewer.classList.add('active');
        analysisFrame.style.display = 'none';

        const response = currentNoteSource === 'drive'
            ? await apiFetch('/drive/text', {
                method: 'POST',
                body: JSON.stringify({ fileId: currentNoteId, fileName: currentNoteFileName })
            })
            : await apiFetch(`/notes/${encodeURIComponent(currentNoteId)}/text`);

        if (!response.success || !response.text) throw new Error(response.message || 'No selectable text was found');

        const documentText = renderSelectableDocumentText(response.text);
        pdfDocumentViewer.innerHTML = '';
        pdfDocumentViewer.appendChild(documentText);
        return true;
    };

    const loadSelectablePdf = async () => {
        if (!window.pdfjsLib || !pdfDocumentViewer) return false;
        pdfDocumentViewer.innerHTML = '<div style="color:white;text-align:center;padding:40px"><i class="bx bx-loader-alt bx-spin"></i> Loading selectable PDF...</div>';
        pdfDocumentViewer.classList.add('active');
        analysisFrame.style.display = 'none';

        try {
            const endpoint = currentNoteSource === 'drive' ? '/api/drive/content' : `/api/notes/${encodeURIComponent(currentNoteId)}/content`;
            const response = await fetch(endpoint, {
                method: currentNoteSource === 'drive' ? 'POST' : 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...(currentNoteSource === 'drive' ? { 'Content-Type': 'application/json' } : {})
                },
                body: currentNoteSource === 'drive' ? JSON.stringify({ fileId: currentNoteId }) : undefined
            });
            if (!response.ok) throw new Error('Unable to fetch PDF');
            const pdf = await window.pdfjsLib.getDocument({ data: await response.arrayBuffer() }).promise;
            pdfDocumentViewer.innerHTML = '';

            const availableWidth = Math.max(560, pdfDocumentViewer.clientWidth - 48);
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                const page = await pdf.getPage(pageNumber);
                const baseViewport = page.getViewport({ scale: 1 });
                const scale = Math.min(1.45, availableWidth / baseViewport.width);
                const viewport = page.getViewport({ scale });
                const pageElement = document.createElement('div');
                pageElement.className = 'pdf-page';
                pageElement.style.width = `${viewport.width}px`;
                pageElement.style.height = `${viewport.height}px`;
                const canvas = document.createElement('canvas');
                const outputScale = window.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * outputScale);
                canvas.height = Math.floor(viewport.height * outputScale);
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;
                pageElement.appendChild(canvas);
                pdfDocumentViewer.appendChild(pageElement);
                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport,
                    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
                }).promise;
                await renderPdfTextLayer(page, viewport, pageElement);
            }
            return true;
        } catch (error) {
            console.error('Selectable PDF viewer error:', error);
            pdfDocumentViewer.classList.remove('active');
            pdfDocumentViewer.innerHTML = '';
            analysisFrame.style.display = 'block';
            return false;
        }
    };

    const loadSelectableDocument = async (isPdf) => {
        if (isPdf && await loadSelectablePdf()) return true;

        try {
            return await loadExtractedDocumentText();
        } catch (error) {
            console.error('Selectable document viewer error:', error);
            pdfDocumentViewer.classList.remove('active');
            pdfDocumentViewer.innerHTML = '';
            analysisFrame.style.display = 'block';
            return false;
        }
    };

    window.openNoteAnalysis = (noteId, title, url, source = 'db', fileName = '', metadata = {}) => {
        currentNoteId = noteId;
        currentNoteSource = source;
        currentNoteFileName = fileName || title;
        currentNoteTitle = title;
        currentNoteUrl = metadata.fileUrl || url;
        currentNoteFacultyName = metadata.facultyName || '';
        currentNoteSubjectName = metadata.subjectName || '';
        selectedNoteText = '';
        if (analysisNoteTitle) analysisNoteTitle.textContent = title;
        if (analysisFrame) {
            analysisFrame.src = url;
            analysisFrame.style.display = 'block';
        }
        if (pdfDocumentViewer) {
            pdfDocumentViewer.classList.remove('active');
            pdfDocumentViewer.innerHTML = '';
        }
        if (noteAnalysisModal) noteAnalysisModal.classList.add('show');
        if (textSelectionActions) textSelectionActions.classList.remove('show');
        updateAnalysisBookmarkButton();

        const looksLikePdf = /\.pdf(?:$|[?#])/i.test(currentNoteFileName) || /\.pdf(?:$|[?#])/i.test(url);
        const supportsSelectableText = /\.(?:pdf|docx?|pptx?|txt|md|csv)(?:$|[?#])/i.test(currentNoteFileName)
            || /\.(?:pdf|docx?|pptx?|txt|md|csv)(?:$|[?#])/i.test(url);
        if (supportsSelectableText) loadSelectableDocument(looksLikePdf);
        
        const resultContent = document.getElementById('analysisResultContent');
        const placeholder = document.querySelector('.placeholder-text');
        if (resultContent) resultContent.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';

        const chatMessages = document.getElementById('analysisChatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = '<div class="chat-msg bot">Hi! I\'m Aadhi. I can help you understand this document. What would you like to know?</div>';
        }

        const flashcardsResult = document.getElementById('flashcardsResult');
        const flashcardsEmpty = document.getElementById('flashcardsEmpty');
        if (flashcardsResult) flashcardsResult.innerHTML = '';
        if (flashcardsEmpty) flashcardsEmpty.style.display = 'block';
    };

    if (analysisBookmarkBtn) {
        analysisBookmarkBtn.onclick = async () => {
            analysisBookmarkBtn.disabled = true;
            analysisBookmarkBtn.classList.add('saving');
            let result;
            if (currentNoteSource === 'db') {
                result = await toggleBookmark(currentNoteId);
            } else {
                const saved = bookmarkedNotesList.find(item => item.fileUrl === currentNoteUrl);
                result = saved
                    ? await apiFetch(`/bookmarks/${saved.noteId}`, { method: 'DELETE' })
                    : await apiFetch('/bookmarks', {
                        method: 'POST',
                        body: JSON.stringify({
                            file_name: currentNoteFileName || currentNoteTitle,
                            file_url: currentNoteUrl,
                            faculty_name: currentNoteFacultyName,
                            subject_name: currentNoteSubjectName
                        })
                    });
                if (result.success) {
                    await syncBookmarks();
                    renderTopRatedNotes();
                }
            }
            if (!result?.success) alert(result?.message || 'Unable to update this bookmark. Please try again.');
            analysisBookmarkBtn.disabled = false;
            analysisBookmarkBtn.classList.remove('saving');
            updateAnalysisBookmarkButton();
        };
    }

    if (closeAnalysisModal) {
        closeAnalysisModal.onclick = () => {
            noteAnalysisModal.classList.remove('show');
            analysisFrame.src = '';
            if (pdfDocumentViewer) pdfDocumentViewer.innerHTML = '';
            if (textSelectionActions) textSelectionActions.classList.remove('show');
        };
    }

    if (startAnalysisBtn) {
        startAnalysisBtn.onclick = async () => {
            const loading = document.getElementById('analysisLoading');
            if (loading) loading.style.display = 'flex';
            startAnalysisBtn.disabled = true;
            startAnalysisBtn.classList.add('saving');
            startAnalysisBtn.querySelector('.note-save-copy strong').textContent = 'Analyzing…';
            startAnalysisBtn.querySelector('.note-save-copy small').textContent = 'Reading this note';
            
            let res;
            if (currentNoteSource === 'drive') {
                res = await apiFetch(`/drive/analyze`, { 
                    method: 'POST',
                    body: JSON.stringify({ fileId: currentNoteId, fileName: currentNoteFileName })
                });
            } else {
                res = await apiFetch(`/notes/${currentNoteId}/analyze`, { method: 'POST' });
            }
            if (loading) loading.style.display = 'none';
            startAnalysisBtn.disabled = false;
            startAnalysisBtn.classList.remove('saving');
            startAnalysisBtn.querySelector('.note-save-copy strong').textContent = 'AI analysis';
            startAnalysisBtn.querySelector('.note-save-copy small').textContent = 'Summarize this note';
            
            if (res.success) {
                document.querySelector('.placeholder-text').style.display = 'none';
                document.getElementById('analysisResultContent').style.display = 'block';
                const summaryEl = document.getElementById('aiSummaryText');
                if (summaryEl) {
                    summaryEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(res.data.summary || '') : (res.data.summary || '');
                    if (window.renderMathInElement) {
                        renderMathInElement(summaryEl, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true},
                                {left: '$', right: '$', display: false},
                                {left: '\\(', right: '\\)', display: false},
                                {left: '\\[', right: '\\]', display: true}
                            ],
                            throwOnError : false
                        });
                    }
                }
                const contextEl = document.getElementById('aiContextText');
                if (contextEl) contextEl.textContent = res.data.contextExplanation;
                const conceptsEl = document.getElementById('aiKeyConcepts');
                if (conceptsEl) {
                    if (res.data.keyConcepts && res.data.keyConcepts.length > 0) {
                        conceptsEl.innerHTML = `<ul style="list-style-type: disc; padding-left: 20px; color: var(--text-main); font-size: 13.5px; line-height: 1.7;">` + 
                            res.data.keyConcepts.map(c => `<li style="margin-bottom: 8px;"><strong>${c}</strong></li>`).join('') + 
                            `</ul>`;
                    } else {
                        conceptsEl.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">No key concepts identified.</span>';
                    }
                }
            } else {
                alert('Analysis failed: ' + (res.message || 'Unknown error'));
                const placeholder = document.querySelector('.placeholder-text');
                if (placeholder) {
                    placeholder.style.display = 'block';
                    placeholder.innerHTML = `<i class='bx bx-error-circle' style="font-size: 48px; color: #ef4444; opacity: 0.8;"></i><p style="color: #ef4444; margin-top: 10px;">${res.message || 'Analysis failed. Please try again later.'}</p>`;
                }
            }
        };
    }

    // AI Sidebar Tabs, PDF Selection & Study Tools
    const activateAnalysisTab = (target) => {
        document.querySelectorAll('.ai-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === target));
        document.getElementById('analysisSummary').style.display = target === 'summary' ? 'block' : 'none';
        document.getElementById('analysisChat').style.display = target === 'chat' ? 'flex' : 'none';
        document.getElementById('analysisFlashcards').style.display = target === 'flashcards' ? 'flex' : 'none';
        if (target === 'chat') {
            const list = document.getElementById('analysisChatMessages');
            if (list) list.scrollTop = list.scrollHeight;
        }
    };

    document.querySelectorAll('.ai-tab').forEach(tab => {
        tab.onclick = () => activateAnalysisTab(tab.dataset.tab);
    });

    let selectionTimer = null;
    const updatePdfSelectionActions = () => {
        const selection = window.getSelection();
        const text = selection?.toString().replace(/\s+/g, ' ').trim() || '';
        const anchorElement = selection?.anchorNode?.nodeType === Node.TEXT_NODE
            ? selection.anchorNode.parentElement
            : selection?.anchorNode;
        const focusElement = selection?.focusNode?.nodeType === Node.TEXT_NODE
            ? selection.focusNode.parentElement
            : selection?.focusNode;
        if (text.length < 3 || !anchorElement || !focusElement
            || !pdfDocumentViewer?.contains(anchorElement)
            || !pdfDocumentViewer.contains(focusElement)
            || selection.rangeCount === 0) {
            textSelectionActions?.classList.remove('show');
            return;
        }

        selectedNoteText = text.slice(0, 12000);
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        textSelectionActions.style.left = `${Math.max(12, Math.min(window.innerWidth - 310, rect.left))}px`;
        textSelectionActions.style.top = `${Math.max(12, rect.top - 54)}px`;
        textSelectionActions.classList.add('show');
    };

    if (pdfDocumentViewer) {
        pdfDocumentViewer.addEventListener('mouseup', () => setTimeout(updatePdfSelectionActions, 0));
        pdfDocumentViewer.addEventListener('keyup', updatePdfSelectionActions);
        document.addEventListener('selectionchange', () => {
            clearTimeout(selectionTimer);
            selectionTimer = setTimeout(updatePdfSelectionActions, 140);
        });
    }

    const requestSelectedTextStudyHelp = async (action) => {
        if (!selectedNoteText) return;
        const selectionText = selectedNoteText;
        activateAnalysisTab('flashcards');
        textSelectionActions.classList.remove('show');

        const emptyState = document.getElementById('flashcardsEmpty');
        const result = document.getElementById('flashcardsResult');
        emptyState.style.display = 'none';
        const label = action === 'flashcards' ? 'Flashcards' : 'Explanation';
        const icon = action === 'flashcards' ? 'bx-layer' : 'bx-bulb';
        const selectionPreview = `${escapeHtml(selectionText.slice(0, 450))}${selectionText.length > 450 ? '&hellip;' : ''}`;
        result.innerHTML = `
            <div class="result-heading"><i class='bx ${icon}'></i><h4>${label}</h4></div>
            <div class="selection-context">${selectionPreview}</div>
            <div style="text-align:center; padding:26px; color:var(--text-muted);"><i class="bx bx-loader-alt bx-spin"></i> Aadhi is preparing ${label.toLowerCase()}...</div>
        `;

        const response = await apiFetch('/study-tools/selection', {
            method: 'POST',
            body: JSON.stringify({ action, selectedText: selectionText })
        });

        const content = response.success
            ? (typeof marked !== 'undefined' ? marked.parse(response.response || '') : escapeHtml(response.response || ''))
            : `<div style="color:#ef4444"><i class='bx bx-error-circle'></i> ${escapeHtml(response.message || 'Unable to generate this study aid right now.')}</div>`;
        result.innerHTML = `
            <div class="result-heading"><i class='bx ${icon}'></i><h4>${label}</h4></div>
            <div class="selection-context">${selectionPreview}</div>
            <div class="ai-md-body">${content}</div>
        `;
        if (window.renderMathInElement) renderMathInElement(result, { throwOnError: false });
    };

    if (textSelectionActions) {
        textSelectionActions.querySelectorAll('[data-selection-action]').forEach(button => {
            button.addEventListener('pointerdown', event => event.preventDefault());
            button.onclick = () => requestSelectedTextStudyHelp(button.dataset.selectionAction);
        });
    }

    const sendAadhiChatMessage = async (msg) => {
        const list = document.getElementById('analysisChatMessages');
        if (!list || !msg.trim()) return;
        
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-msg user';
        userDiv.textContent = msg === "Draft subjective study/exam questions using the Bloom's Taxonomy method based on this document. Generate detailed 11-16 marks questions, including explanations, advantages, disadvantages, and critical architectural/technical terms for each concept."
            ? "Generate Questions with College pattern"
            : msg;
        list.appendChild(userDiv);
        
        const botDiv = document.createElement('div');
        botDiv.className = 'chat-msg bot';
        botDiv.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
        list.appendChild(botDiv);
        list.scrollTop = list.scrollHeight;
        
        let res;
        if (currentNoteSource === 'drive') {
            res = await apiFetch(`/drive/chat`, { 
                method: 'POST', 
                body: JSON.stringify({ fileId: currentNoteId, message: msg }) 
            });
        } else {
            res = await apiFetch(`/notes/${currentNoteId}/chat`, { method: 'POST', body: JSON.stringify({ message: msg }) });
        }
        if (res.success) {
            botDiv.classList.add('ai-md-body'); // Apply rich markdown styles
            botDiv.innerHTML = marked.parse(res.response);
            
            // Render math if KaTeX is loaded
            if (window.renderMathInElement) {
                renderMathInElement(botDiv, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError : false
                });
            }
            
            // Add copy button to bot response
            addCopyButton(botDiv);
            
            // Final scroll after content and math are rendered
            setTimeout(() => {
                list.scrollTop = list.scrollHeight;
            }, 50);
        } else {
            botDiv.innerHTML = `<div style="color: #ef4444; display: flex; align-items: center; gap: 8px;">
                <i class='bx bx-error-circle'></i>
                <span>${res.message || "Aadhi is unavailable right now."}</span>
            </div>`;
        }
        list.scrollTop = list.scrollHeight;
    };

    const sendNoteChat = async () => {
        const input = document.getElementById('analysisChatInput');
        if (!input || !input.value.trim()) return;
        const msg = input.value.trim();
        input.value = '';
        await sendAadhiChatMessage(msg);
    };

    const shortcutBtn = document.getElementById('shortcutCollegePattern');
    if (shortcutBtn) {
        shortcutBtn.onclick = async () => {
            const specializedPrompt = "Draft subjective study/exam questions using the Bloom's Taxonomy method based on this document. Generate detailed 11-16 marks questions, including explanations, advantages, disadvantages, and critical architectural/technical terms for each concept.";
            await sendAadhiChatMessage(specializedPrompt);
        };
    }

    const chatBtn = document.getElementById('analysisChatSend');
    if (chatBtn) chatBtn.onclick = sendNoteChat;
    const chatInp = document.getElementById('analysisChatInput');
    if (chatInp) chatInp.onkeypress = (e) => { if (e.key === 'Enter') sendNoteChat(); };

    // Initial Support
    startLiveClock();
    renderTasks();
    renderPlanner();
    updateStudyProgress();
    renderProgress();
    loadTimetable();
    syncBookmarks().then(renderTopRatedNotes);
    renderAnnouncements();
    
    // Default view
    const hash = window.location.hash.substring(1);
    if (hash && navItems[hash]) {
        switchView(hash);
        if (hash === 'dsa') fetchDSA();
    } else {
        switchView('dashboard');
    }

    if (navItems['dsa'].nav) {
        navItems['dsa'].nav.addEventListener('click', fetchDSA);
    }
});
