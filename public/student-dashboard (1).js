document.addEventListener('DOMContentLoaded', () => {
    // 1. Sidebar Toggle Logic
    const body = document.querySelector('body');
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('#toggle-sidebar');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('close');
        });
    }

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

        // ✅ FIX #1: Declare bookmarkedNoteIds right after user is parsed
        let bookmarkedNoteIds = JSON.parse(localStorage.getItem('bookmarkedNotes') || '[]');

        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        const welcomeGreetingEl = document.getElementById('welcomeGreeting');
        
        if (userNameEl) userNameEl.textContent = user.name || 'Student';
        if (userAvatarEl && user.name) userAvatarEl.textContent = user.name.charAt(0).toUpperCase();
        if (welcomeGreetingEl && user.name) {
            welcomeGreetingEl.innerHTML = `Welcome back, <span class="highlight">${user.name.split(' ')[0]}</span>! 👋`;
        }

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
                if (!response.ok && response.status === 401) handleLogout();
                return data;
            } catch (err) {
                console.error(`API Error (${endpoint}):`, err);
                return { success: false, message: 'Network error' };
            }
        }

        // Toast notification helper
        function showToast(message, type = 'info') {
            const existing = document.querySelector('.notezilla-toast');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.className = 'notezilla-toast';
            const colorMap = { info: '#6366f1', success: '#10b981', error: '#ef4444' };
            toast.style.cssText = `
                position: fixed; bottom: 100px; right: 30px; z-index: 9999;
                background: rgba(15,23,42,0.95); backdrop-filter: blur(16px);
                border: 1px solid ${colorMap[type] || colorMap.info}44;
                border-left: 3px solid ${colorMap[type] || colorMap.info};
                color: #f8fafc; padding: 14px 20px; border-radius: 12px;
                font-size: 14px; font-weight: 500;
                box-shadow: 0 8px 30px rgba(0,0,0,0.4);
                transform: translateX(120%); transition: transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
                max-width: 300px; line-height: 1.4;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
            setTimeout(() => {
                toast.style.transform = 'translateX(120%)';
                setTimeout(() => toast.remove(), 400);
            }, 3500);
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
            'faculty': { view: document.getElementById('faculty-view'), nav: document.getElementById('nav-faculty') }
        };

        function switchView(viewKey) {
            Object.values(navItems).forEach(item => {
                if (item.view) item.view.style.display = 'none';
                if (item.nav) item.nav.classList.remove('active');
            });

            const target = navItems[viewKey];
            if (target) {
                if (target.view) {
                    target.view.style.display = (viewKey === 'announcements') ? 'block' : 'flex';
                }
                if (target.nav) target.nav.classList.add('active');

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
                navItems[key].nav.addEventListener('click', () => switchView(key));
            }
        });

        const showAllNotif = document.getElementById('show-all-notif');
        if (showAllNotif) showAllNotif.addEventListener('click', () => switchView('announcements'));

        const dropdownProfileLink = document.getElementById('dropdown-profile-link');
        if (dropdownProfileLink) dropdownProfileLink.addEventListener('click', () => switchView('profile'));

        // ✅ FIX #4 + #10: Wire Account Settings and Help Center dropdown items
        const dropdownList = document.querySelectorAll('.dropdown-list li');
        dropdownList.forEach(li => {
            const text = li.textContent.trim();
            if (text.includes('Account Settings')) {
                li.addEventListener('click', () => {
                    switchView('profile');
                    // Scroll to settings section after a tiny delay
                    setTimeout(() => {
                        const settingsSection = document.querySelector('.settings-grid');
                        if (settingsSection) settingsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 200);
                });
            }
            if (text.includes('Help Center')) {
                li.addEventListener('click', () => {
                    closeAllDropdowns();
                    showToast('Help Center coming soon! 🚀', 'info');
                });
            }
        });

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

        // ✅ FIX #10: Prevent dropdown from closing when clicking inside it
        if (notificationDropdown) notificationDropdown.addEventListener('click', e => e.stopPropagation());
        if (profileDropdown) profileDropdown.addEventListener('click', e => e.stopPropagation());

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

        // ──────────────────────────────────────────────────────────────
        // DEPT HELPERS
        // ──────────────────────────────────────────────────────────────
        const DEPT_CONFIG = {
            'CSE': { color: '#6366f1', icon: '💻' },
            'IT':  { color: '#6366f1', icon: '💻' },
            'ECE': { color: '#f59e0b', icon: '⚡' },
            'EEE': { color: '#f59e0b', icon: '⚡' },
            'MECH': { color: '#10b981', icon: '📐' },
            'CIVIL': { color: '#3b82f6', icon: '🏗️' },
            'AI':  { color: '#8b5cf6', icon: '🤖' },
            'DS':  { color: '#8b5cf6', icon: '🤖' },
            'BIOTECH': { color: '#ec4899', icon: '🧬' },
        };

        function getDeptConfig(dept = '') {
            const upper = dept.toUpperCase();
            for (const [key, cfg] of Object.entries(DEPT_CONFIG)) {
                if (upper.includes(key)) return cfg;
            }
            return { color: '#6366f1', icon: '📚' };
        }

        // ──────────────────────────────────────────────────────────────
        // ✅ FEATURE #6: Explore Subjects — dark glassmorphism + real data + modal
        // ──────────────────────────────────────────────────────────────
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
                const cfg = getDeptConfig(sub.department || '');
                const noteCount = sub.note_count || sub.notes_count || '–';
                const card = document.createElement('div');
                card.className = 'subject-card subject-card-dark';
                card.innerHTML = `
                    <div class="subject-card-top-dark" style="--dept-color: ${cfg.color};">
                        <div class="subject-tag-new-dark">${sub.department || 'General'}</div>
                        <div class="subject-icon-large">${cfg.icon}</div>
                    </div>
                    <div class="subject-card-bottom-dark" style="--dept-color: ${cfg.color};">
                        <h2 class="subject-code-new">${sub.code || 'N/A'}</h2>
                        <p class="subject-name-new">${sub.name}</p>
                        <span class="subject-note-count"><i class='bx bx-file'></i> ${noteCount} Materials</span>
                    </div>
                `;
                // ✅ FIX #2: onclick opens faculty modal filtered by subject, not nav-notes click
                card.addEventListener('click', () => openSubjectModal(sub));
                subjectsResultsGrid.appendChild(card);
            });
        };

        if (subjectSearchInput) subjectSearchInput.addEventListener('input', (e) => renderSubjects(e.target.value));

        async function openSubjectModal(sub) {
            // Re-use the faculty modal to show notes for a subject
            if (!facultyModal) return;
            modalSubjectsView.style.display = 'none';
            modalNotesView.style.display = 'block';

            document.getElementById('modalFacultyName').textContent = sub.name;
            document.getElementById('modalFacultyDept').textContent = sub.code || sub.department || 'Subject';
            document.getElementById('modalFacultyAvatar').textContent = getDeptConfig(sub.department || '').icon;
            document.getElementById('modalSelectedSubjectTitle').textContent = sub.name;

            facultyModal.classList.add('show');

            const container = document.getElementById('modalUnitsContainer');
            container.innerHTML = '<div style="text-align:center; padding:30px;"><i class="bx bx-loader-alt bx-spin" style="font-size:28px; color:var(--primary);"></i></div>';

            try {
                const res = await apiFetch(`/notes?subject_id=${sub.id}`);
                container.innerHTML = '';
                if (!res.success || !res.data || res.data.length === 0) {
                    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">No notes found for this subject.</div>';
                    return;
                }

                const unitMap = {};
                res.data.forEach(note => {
                    const unit = note.unit || 1;
                    if (!unitMap[unit]) unitMap[unit] = [];
                    unitMap[unit].push(note);
                });

                Object.keys(unitMap).sort().forEach(unit => {
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
                                        <button class="icon-btn-outline bookmark-note-btn ${bookmarkedNoteIds.includes(note.id) ? 'bookmarked' : ''}" data-id="${note.id}" title="Bookmark">
                                            <i class='bx ${bookmarkedNoteIds.includes(note.id) ? 'bxs-bookmark' : 'bx-bookmark'}'></i>
                                        </button>
                                        <button class="icon-btn-outline download-note" data-url="${note.file_url}" data-id="${note.id}" data-title="${note.title}" data-subject="${sub.name}">
                                            <i class='bx bx-download'></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    container.appendChild(section);
                });

                wireModalButtons(container, sub.name);
            } catch(e) {
                container.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">Failed to load notes.</div>';
            }
        }

        // ──────────────────────────────────────────────────────────────
        // Announcements
        // ──────────────────────────────────────────────────────────────
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

        // ──────────────────────────────────────────────────────────────
        // ✅ FIX #1 + FEATURE #5 + #8: Bookmarks — full end-to-end
        // ──────────────────────────────────────────────────────────────
        async function syncBookmarks() {
            const res = await apiFetch('/bookmarks');
            if (res.success && Array.isArray(res.data)) {
                bookmarkedNoteIds = res.data.map(b => b.noteId || b.note_id);
                localStorage.setItem('bookmarkedNotes', JSON.stringify(bookmarkedNoteIds));
                const countProfile = document.getElementById('bookmark-count-profile');
                if (countProfile) countProfile.textContent = bookmarkedNoteIds.length;
                // Update all visible bookmark buttons
                document.querySelectorAll('.bookmark-note-btn').forEach(btn => {
                    const id = btn.getAttribute('data-id');
                    const isBookmarked = bookmarkedNoteIds.includes(id);
                    btn.classList.toggle('bookmarked', isBookmarked);
                    btn.querySelector('i').className = `bx ${isBookmarked ? 'bxs-bookmark' : 'bx-bookmark'}`;
                });
            }
        }

        async function toggleBookmark(noteId, noteTitle = '') {
            const exists = bookmarkedNoteIds.includes(noteId);
            const res = await apiFetch(exists ? `/bookmarks/${noteId}` : '/bookmarks', {
                method: exists ? 'DELETE' : 'POST',
                body: exists ? null : JSON.stringify({ note_id: noteId })
            });
            if (res.success) {
                if (exists) {
                    bookmarkedNoteIds = bookmarkedNoteIds.filter(id => id !== noteId);
                    showToast('Bookmark removed', 'info');
                } else {
                    bookmarkedNoteIds.push(noteId);
                    showToast('Note bookmarked! ⭐', 'success');
                    // ✅ FEATURE #8: Log bookmark to progress
                    logProgress('bookmark', noteTitle || 'Note bookmarked', 'Bookmarked a note');
                }
                localStorage.setItem('bookmarkedNotes', JSON.stringify(bookmarkedNoteIds));
                syncBookmarks();
                const bookmarksView = navItems['bookmarks']?.view;
                if (bookmarksView && bookmarksView.style.display !== 'none') renderBookmarks();
            }
        }

        async function renderBookmarks() {
            const savedGrid = document.getElementById('savedNotesGrid');
            if (!savedGrid) return;
            savedGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 20px;"><i class="bx bx-loader-alt bx-spin"></i></div>';
            const res = await apiFetch('/bookmarks');
            if (!res.success || !res.data || res.data.length === 0) {
                savedGrid.innerHTML = '<div class="col-span-3" style="text-align:center; padding: 40px; color: var(--text-muted);"><i class="bx bx-bookmark" style="font-size:40px; margin-bottom:12px; display:block;"></i><p>No bookmarked notes yet.</p></div>';
                return;
            }
            savedGrid.innerHTML = '';
            res.data.forEach(note => {
                const card = document.createElement('div');
                card.className = 'note-card';
                card.innerHTML = `
                    <div class="note-icon type-pdf"><i class='bx bxs-file-pdf'></i></div>
                    <div class="note-details"><h4>${note.title || note.note_title || 'Note'}</h4><p>${note.subject || note.subject_name || 'Note'}</p></div>
                    <button class="icon-btn-outline remove-bookmark" title="Remove bookmark"><i class='bx bxs-bookmark' style="color: var(--primary-light);"></i></button>
                `;
                const noteId = note.noteId || note.note_id || note.id;
                card.querySelector('.remove-bookmark').onclick = () => toggleBookmark(noteId);
                savedGrid.appendChild(card);
            });
        }

        // ──────────────────────────────────────────────────────────────
        // ✅ FEATURE #8: Progress Tracker with download/bookmark logging
        // ──────────────────────────────────────────────────────────────
        let completedWork = JSON.parse(localStorage.getItem('completedWork') || '[]');
        let savedTasks = JSON.parse(localStorage.getItem('studentTasks') || '[]');

        const logProgress = (type, title, desc = '') => {
            completedWork.unshift({ id: Date.now(), type, title, desc, timestamp: new Date().toISOString() });
            localStorage.setItem('completedWork', JSON.stringify(completedWork));
            updateStudyProgress();
            const progressView = navItems['progress']?.view;
            if (progressView && progressView.style.display !== 'none') renderProgress();
        };

        const PROGRESS_ICONS = {
            'task': 'bx-check-double',
            'planner': 'bx-calendar-heart',
            'note': 'bx-download',
            'bookmark': 'bx-bookmark',
            'download': 'bx-download',
        };

        const renderProgress = () => {
            const historyList = document.getElementById('progress-history-list');
            if (!historyList) return;

            // ✅ FEATURE #8: Stat boxes with accurate data
            const totalTasks = savedTasks.length;
            const completedTasks = savedTasks.filter(t => t.completed).length;
            const plannerSessions = completedWork.filter(w => w.type === 'planner').length;
            const productivityScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            const statTasksDone = document.getElementById('stat-tasks-done');
            const statPlannerSessions = document.getElementById('stat-planner-sessions');
            const statProductivity = document.getElementById('stat-productivity');

            if (statTasksDone) statTasksDone.textContent = completedTasks;
            if (statPlannerSessions) statPlannerSessions.textContent = plannerSessions;
            if (statProductivity) {
                statProductivity.textContent = `${productivityScore}%`;
                const color = productivityScore > 70 ? '#10b981' : productivityScore > 40 ? '#f59e0b' : '#ef4444';
                statProductivity.style.color = color;
            }

            historyList.innerHTML = completedWork.length === 0 
                ? '<div style="text-align:center; padding: 40px; color: var(--text-muted);"><i class="bx bx-history" style="font-size:40px; display:block; margin-bottom:12px;"></i>No activity logged yet.</div>'
                : completedWork.map(item => `
                    <div class="notif-item" style="padding: 16px 24px; border-bottom: 1px solid var(--border-light);">
                        <div class="notif-icon"><i class='bx ${PROGRESS_ICONS[item.type] || 'bx-check'}'></i></div>
                        <div class="notif-text">
                            <h4>${item.title}</h4>
                            <p>${item.desc || ''}</p>
                            <span>${new Date(item.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                `).join('');
        };

        // ✅ FIX #3: Todo List — badge updates live after every saveTasks()
        const taskList = document.getElementById('taskList');
        const addTaskInput = document.querySelector('.add-task input');
        const addTaskBtn = document.querySelector('.add-task button');

        const updateTaskBadge = () => {
            const left = savedTasks.filter(t => !t.completed).length;
            const badge = document.querySelector('.count-badge');
            if (badge) badge.textContent = `${left} left`;
        };

        const renderTasks = () => {
            if (!taskList) return;
            taskList.innerHTML = '';
            savedTasks.forEach((t, i) => {
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
                    if (e.target.checked) logProgress('task', t.text, 'Completed task');
                    saveTasks();
                };
                li.querySelector('.delete-task-btn').onclick = () => {
                    savedTasks.splice(i, 1);
                    saveTasks();
                };
                taskList.appendChild(li);
            });
            updateTaskBadge(); // ✅ FIX #3: live update
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
            savedPlannerItems.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            
            if (savedPlannerItems.length === 0) {
                plannerTimeline.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px;">No sessions planned.</div>';
                return;
            }

            savedPlannerItems.forEach((item, index) => {
                const isCompleted = item.completed === true;
                const div = document.createElement('div');
                div.className = `timeline-item ${isCompleted ? 'completed' : ''}`;
                div.style.opacity = isCompleted ? '0.6' : '1';
                
                div.innerHTML = `
                    <div class="time"><i class='bx bx-time-five'></i> ${item.time}</div>
                    <div class="content" style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="${isCompleted ? 'text-decoration: line-through;' : ''}">
                            <h4>${item.title}</h4>
                            <span>${item.desc || ''}</span>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button class="fin-btn" style="background:none; border:none; color:${isCompleted ? 'var(--accent-1)' : 'var(--text-muted)'}; cursor:pointer;" ${isCompleted ? 'disabled' : ''}>
                                <i class='bx ${isCompleted ? 'bxs-check-circle' : 'bx-check-circle'}'></i>
                            </button>
                            <button class="del-btn" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">
                                <i class='bx bx-trash'></i>
                            </button>
                        </div>
                    </div>
                `;
                
                if (!isCompleted) {
                    div.querySelector('.fin-btn').onclick = () => {
                        logProgress('planner', item.title, item.desc || 'Study session completed');
                        savedPlannerItems[index].completed = true;
                        savePlanner();
                    };
                }
                
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
        if (addPlannerBtn) addPlannerBtn.onclick = () => { if (plannerForm) plannerForm.style.display = 'block'; };
        const cancelPlannerBtn = document.getElementById('cancelPlannerBtn');
        if (cancelPlannerBtn) cancelPlannerBtn.onclick = () => { if (plannerForm) plannerForm.style.display = 'none'; };
        const savePlannerBtn = document.getElementById('savePlannerBtn');
        if (savePlannerBtn) {
            savePlannerBtn.onclick = () => {
                const t = document.getElementById('plannerTime')?.value;
                const h = document.getElementById('plannerTitle')?.value;
                const d = document.getElementById('plannerDesc')?.value;
                if (t && h) {
                    savedPlannerItems.push({ time: t, title: h, desc: d });
                    savePlanner();
                    if (plannerForm) plannerForm.style.display = 'none';
                }
            };
        }

        // 6. AI Chatbot
        const chatToggle = document.getElementById('chatToggle');
        const chatbotWindow = document.getElementById('chatbotWindow');
        const chatClose = document.getElementById('chatClose');
        const chatBody = document.getElementById('chatBody');
        const chatInput = document.getElementById('chatInput');
        const chatSend = document.getElementById('chatSend');

        if (chatToggle && chatbotWindow) {
            chatToggle.onclick = () => {
                chatbotWindow.classList.toggle('active');
                if (chatbotWindow.classList.contains('active') && chatInput) chatInput.focus();
            };
        }
        if (chatClose && chatbotWindow) chatClose.onclick = () => chatbotWindow.classList.remove('active');

        if (chatBody) {
            chatBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn && btn.parentElement.classList.contains('quick-prompts')) {
                    if (chatInput) chatInput.value = btn.textContent;
                    handleSendMessage();
                    btn.parentElement.style.display = 'none';
                }
            });
        }

        async function handleSendMessage() {
            if (!chatInput) return;
            const msg = chatInput.value.trim();
            if (!msg) return;

            const userMsgEl = document.createElement('div');
            userMsgEl.className = 'chat-msg user';
            userMsgEl.textContent = msg;
            chatBody.appendChild(userMsgEl);
            chatInput.value = '';
            chatBody.scrollTop = chatBody.scrollHeight;

            const typingEl = document.createElement('div');
            typingEl.className = 'chat-msg bot typing';
            typingEl.id = 'typing-indicator';
            typingEl.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
            chatBody.appendChild(typingEl);
            chatBody.scrollTop = chatBody.scrollHeight;

            try {
                const res = await apiFetch('/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
                const ti = document.getElementById('typing-indicator');
                if (ti) ti.remove();
                const botMsg = res.success ? res.response : "I'm sorry, I couldn't connect. Try asking about REC departments!";
                const botMsgEl = document.createElement('div');
                botMsgEl.className = 'chat-msg bot';
                botMsgEl.innerHTML = botMsg.replace(/\n/g, '<br>');
                chatBody.appendChild(botMsgEl);
                chatBody.scrollTop = chatBody.scrollHeight;
            } catch(e) {
                const ti = document.getElementById('typing-indicator');
                if (ti) ti.remove();
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

        // 8. Study Progress Capsule
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

            const milestones = [
                { threshold: 0, name: 'Daily Hustle', target: 'Reach 25% to unlock', icon: 'bx-medal' },
                { threshold: 25, name: 'Productivity Pro', target: 'Reach 50% for next rank', icon: 'bx-trophy' },
                { threshold: 50, name: 'Study Master', target: 'Reach 75% for ultimate title', icon: 'bx-crown' },
                { threshold: 75, name: 'Academic Legend', target: 'Finish all goals!', icon: 'bx-star' },
                { threshold: 100, name: 'Task Conqueror', target: 'Day Complete! 🔥', icon: 'bxs-zap' }
            ];
            let current = milestones[0];
            milestones.forEach(m => { if (percentage >= m.threshold) current = m; });
            const mName = document.getElementById('milestoneName');
            const mTarget = document.getElementById('milestoneTarget');
            const mIcon = document.querySelector('.milestone-icon i');
            if (mName) mName.textContent = current.name;
            if (mTarget) mTarget.textContent = current.target;
            if (mIcon) mIcon.className = `bx ${current.icon}`;

            // ✅ FEATURE #8: Subject-level mini progress bars from downloads
            if (barsContainer) {
                barsContainer.innerHTML = '';
                const subMap = {};
                completedWork.forEach(item => {
                    if ((item.type === 'note' || item.type === 'download') && item.desc && item.desc.includes('Subject:')) {
                        const s = item.desc.split('Subject:')[1].trim();
                        subMap[s] = (subMap[s] || 0) + 1;
                    }
                });
                Object.keys(subMap).slice(0, 3).forEach(s => {
                    const prog = Math.min(100, subMap[s] * 20);
                    barsContainer.insertAdjacentHTML('beforeend', `
                        <div class="mini-bar-item">
                            <span>${s}</span>
                            <div class="bar-track">
                                <div class="bar-fill" style="width:${prog}%; background:var(--accent-1);"></div>
                            </div>
                        </div>
                    `);
                });
            }
        }

        // ──────────────────────────────────────────────────────────────
        // ✅ FEATURE #7: Browse Faculty — proper profile cards
        // ──────────────────────────────────────────────────────────────
        const facultyResultsGrid = document.getElementById('facultyResultsGrid');
        const facultyModal = document.getElementById('facultyModal');
        const closeFacultyModal = document.getElementById('closeFacultyModal');
        const modalSubjectsView = document.getElementById('modalSubjectsView');
        const modalNotesView = document.getElementById('modalNotesView');
        const backToSubjects = document.getElementById('backToSubjects');

        async function renderFaculty() {
            if (!facultyResultsGrid) return;
            facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px;"><i class="bx bx-loader-alt bx-spin" style="font-size:32px; color:var(--primary);"></i></div>';
            const res = await apiFetch('/faculty');
            if (!res.success || !res.data) {
                facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No faculty found.</div>';
                return;
            }

            facultyResultsGrid.innerHTML = '';
            // Add faculty-cards class to grid for proper layout
            facultyResultsGrid.className = 'faculty-cards-grid';

            res.data.forEach(fac => {
                const cfg = getDeptConfig(fac.department || '');
                const initial = (fac.name || 'F')[0].toUpperCase();
                const subjectCount = fac.subject_count || fac.subjects_count || '–';
                const noteCount = fac.note_count || fac.notes_count || '–';

                const card = document.createElement('div');
                card.className = 'faculty-profile-card';
                card.style.setProperty('--dept-color', cfg.color);
                card.innerHTML = `
                    <div class="faculty-card-glow"></div>
                    <div class="faculty-card-body">
                        <div class="faculty-avatar-large" style="background: linear-gradient(135deg, ${cfg.color}, ${cfg.color}99);">
                            ${initial}
                        </div>
                        <h3 class="faculty-card-name">${fac.name}</h3>
                        <span class="faculty-dept-badge" style="background:${cfg.color}22; color:${cfg.color}; border:1px solid ${cfg.color}44;">
                            ${fac.department || 'Faculty'}
                        </span>
                        <div class="faculty-card-stats">
                            <div class="faculty-stat">
                                <span class="fac-stat-value">${subjectCount}</span>
                                <span class="fac-stat-label">Subjects</span>
                            </div>
                            <div class="faculty-stat-divider"></div>
                            <div class="faculty-stat">
                                <span class="fac-stat-value">${noteCount}</span>
                                <span class="fac-stat-label">Notes</span>
                            </div>
                        </div>
                        <button class="faculty-view-btn view-faculty-btn" style="--dept-color:${cfg.color};">
                            <i class='bx bx-file-find'></i> View Notes
                        </button>
                    </div>
                `;
                card.querySelector('.view-faculty-btn').onclick = (e) => {
                    e.stopPropagation();
                    openFacultyModal(fac);
                };
                card.onclick = () => openFacultyModal(fac);
                facultyResultsGrid.appendChild(card);
            });
        }

        async function openFacultyModal(faculty) {
            if (!facultyModal) return;
            modalSubjectsView.style.display = 'block';
            modalNotesView.style.display = 'none';

            document.getElementById('modalFacultyName').textContent = faculty.name;
            document.getElementById('modalFacultyDept').textContent = faculty.department || 'Rajalakshmi Engineering College';
            document.getElementById('modalFacultyAvatar').textContent = (faculty.name || 'F')[0].toUpperCase();

            const modalSubjectsList = document.getElementById('modalSubjectsList');
            modalSubjectsList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px;"><i class="bx bx-loader-alt bx-spin" style="font-size:24px;"></i></div>';
            
            facultyModal.classList.add('show');

            try {
                const res = await apiFetch(`/faculty/${faculty.id}/notes`);
                if (res.success && res.data) {
                    const notes = res.data;
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
                console.error('Modal fetch error', error);
                modalSubjectsList.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Failed to load subjects.</div>';
            }
        }

        function wireModalButtons(container, subjectName) {
            // Wire bookmark buttons
            container.querySelectorAll('.bookmark-note-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const noteId = btn.getAttribute('data-id');
                    const noteTitle = btn.closest('.modal-note-item')?.querySelector('h5')?.textContent || '';
                    toggleBookmark(noteId, noteTitle);
                };
            });

            // Wire download buttons
            container.querySelectorAll('.download-note').forEach(btn => {
                btn.onclick = () => {
                    const url = btn.getAttribute('data-url');
                    const id = btn.getAttribute('data-id');
                    const name = btn.getAttribute('data-title');
                    const sub = btn.getAttribute('data-subject') || subjectName;
                    apiFetch(`/notes/${id}/download`, { method: 'POST' });
                    // ✅ FEATURE #8: Log download to progress
                    logProgress('download', name, `Subject: ${sub}`);
                    if (url) window.open(url, '_blank');
                    else showToast('File URL not available', 'error');
                };
            });
        }

        function showSubjectNotes(subject) {
            modalSubjectsView.style.display = 'none';
            modalNotesView.style.display = 'block';
            document.getElementById('modalSelectedSubjectTitle').textContent = subject.name;

            const container = document.getElementById('modalUnitsContainer');
            container.innerHTML = '';

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
                                    <button class="icon-btn-outline bookmark-note-btn ${bookmarkedNoteIds.includes(note.id) ? 'bookmarked' : ''}" data-id="${note.id}" title="Bookmark">
                                        <i class='bx ${bookmarkedNoteIds.includes(note.id) ? 'bxs-bookmark' : 'bx-bookmark'}'></i>
                                    </button>
                                    <button class="icon-btn-outline download-note" data-url="${note.file_url}" data-id="${note.id}" data-title="${note.title}" data-subject="${subject.name}">
                                        <i class='bx bx-download'></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
                container.appendChild(section);
            });

            wireModalButtons(container, subject.name);
        }

        if (closeFacultyModal) closeFacultyModal.onclick = () => facultyModal.classList.remove('show');
        if (backToSubjects) {
            backToSubjects.onclick = () => {
                modalNotesView.style.display = 'none';
                modalSubjectsView.style.display = 'block';
            };
        }

        window.onclick = (event) => {
            if (event.target === facultyModal) facultyModal.classList.remove('show');
        };

        // 11. Top Rated Notes with bookmark buttons
        const topRatedGrid = document.getElementById('topRatedNotesGrid');
        async function renderTopRatedNotes() {
            if (!topRatedGrid) return;
            topRatedGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;"><i class="bx bx-loader-alt bx-spin"></i></div>';
            const res = await apiFetch('/notes?limit=4&sort=downloads');
            if (res.success && res.data) {
                topRatedGrid.innerHTML = '';
                res.data.forEach(note => {
                    const isBookmarked = bookmarkedNoteIds.includes(note.id);
                    const card = document.createElement('div');
                    card.className = 'note-card';
                    card.innerHTML = `
                        <div class="note-icon type-pdf"><i class='bx bxs-file-pdf'></i></div>
                        <div class="note-details">
                            <h4>${note.title}</h4>
                            <p>${note.downloads || 0} downloads</p>
                        </div>
                        <button class="icon-btn-outline bookmark-note-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${note.id}" title="Bookmark">
                            <i class='bx ${isBookmarked ? 'bxs-bookmark' : 'bx-bookmark'}'></i>
                        </button>
                        <button class="icon-btn-outline download-note" data-url="${note.file_url || note.fileUrl}" data-id="${note.id}" data-title="${note.title}" data-subject="${note.subject_name || ''}" title="Download">
                            <i class='bx bx-download'></i>
                        </button>
                    `;
                    topRatedGrid.appendChild(card);
                });

                // Wire top-rated bookmark/download buttons
                wireModalButtons(topRatedGrid, '');
            }
        }

        // Initial render calls
        startLiveClock();
        renderTasks();
        renderPlanner();
        updateStudyProgress();
        syncBookmarks();
        renderTopRatedNotes();
        renderAnnouncements();
        
        const hash = window.location.hash.substring(1);
        if (hash && navItems[hash]) {
            switchView(hash);
        } else {
            switchView('dashboard');
        }

    } catch (e) {
        console.error('Error parsing user data', e);
        window.location.href = 'login.html';
    }
});
