document.addEventListener('DOMContentLoaded', () => {
    // 1. Sidebar Toggle Logic
    const body = document.querySelector('body');
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('#toggle-sidebar');
    
    // Toggle sidebar
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('close');
    });

    // Handle responsive sidebar behavior
    const handleResize = () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.add('close');
        } else {
            sidebar.classList.remove('close');
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // 2. User Data Population
    const userString = localStorage.getItem('user');
    if (userString) {
        try {
            const user = JSON.parse(userString);
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
            
            // Basic role check
            if (user.role !== 'student') {
                console.warn("User is not a student");
            }
        } catch (e) {
            console.error("Error parsing user data", e);
        }
    } else {
        // If not logged in, redirect to login
        window.location.href = 'login.html';
    }

    // 3. Section & Dropdown Logic
    const dashboardView = document.getElementById('dashboard-view');
    const profileView = document.getElementById('profile-view');
    const subjectsView = document.getElementById('subjects-view');
    const announcementsView = document.getElementById('announcements-view');
    const notesView = document.getElementById('notes-view');
    const progressView = document.getElementById('progress-view');
    const bookmarksView = document.getElementById('bookmarks-view');
    const facultyView = document.getElementById('faculty-view');
    const navDashboard = document.getElementById('nav-dashboard');
    const navProfile = document.getElementById('nav-profile');
    const navSubjects = document.getElementById('nav-subjects');
    const navAnnouncements = document.getElementById('nav-announcements');
    const navNotes = document.getElementById('nav-notes');
    const navProgress = document.getElementById('nav-progress');
    const navBookmarks = document.getElementById('nav-bookmarks');
    const navFaculty = document.getElementById('nav-faculty');
    const showAllNotif = document.getElementById('show-all-notif');
    const dropdownProfileLink = document.getElementById('dropdown-profile-link');

    function switchView(viewName) {
        // Update Nav Active State
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(view => view.style.display = 'none');

        if (viewName === 'top-overview') {
            if (dashboardView) dashboardView.style.display = 'flex';
            if (navDashboard) navDashboard.classList.add('active');
        } else if (viewName === 'profile') {
            if (profileView) profileView.style.display = 'flex';
            if (navProfile) navProfile.classList.add('active');
        } else if (viewName === 'subjects') {
            if (subjectsView) subjectsView.style.display = 'flex';
            if (navSubjects) navSubjects.classList.add('active');
            renderSubjects();
        } else if (viewName === 'announcements') {
            if (announcementsView) announcementsView.style.display = 'flex';
            if (navAnnouncements) navAnnouncements.classList.add('active');
            renderAnnouncements();
        } else if (viewName === 'notes') {
            if (notesView) notesView.style.display = 'flex';
            if (navNotes) navNotes.classList.add('active');
            renderNotes();
        } else if (viewName === 'progress') {
            if (progressView) progressView.style.display = 'flex';
            if (navProgress) navProgress.classList.add('active');
            renderProgress();
        } else if (viewName === 'bookmarks') {
            if (bookmarksView) bookmarksView.style.display = 'flex';
            if (navBookmarks) navBookmarks.classList.add('active');
            renderBookmarks();
        } else if (viewName === 'faculty') {
            if (facultyView) facultyView.style.display = 'flex';
            if (navFaculty) navFaculty.classList.add('active');
            renderFaculty();
        }
        
        // Close dropdowns when switching view
        closeAllDropdowns();
    }

    if (navDashboard) navDashboard.addEventListener('click', () => switchView('top-overview'));
    if (navProfile) navProfile.addEventListener('click', () => switchView('profile'));
    if (navSubjects) navSubjects.addEventListener('click', () => switchView('subjects'));
    if (navAnnouncements) navAnnouncements.addEventListener('click', () => switchView('announcements'));
    if (navNotes) navNotes.addEventListener('click', () => switchView('notes'));
    if (navProgress) navProgress.addEventListener('click', () => switchView('progress'));
    if (navBookmarks) navBookmarks.addEventListener('click', () => switchView('bookmarks'));
    if (navFaculty) navFaculty.addEventListener('click', () => switchView('faculty'));
    if (showAllNotif) showAllNotif.addEventListener('click', () => switchView('announcements'));

    // Study Progress "Details" Link Navigation
    const viewStudyProgressDetails = document.getElementById('viewStudyProgressDetails');
    if (viewStudyProgressDetails) {
        viewStudyProgressDetails.addEventListener('click', () => switchView('progress'));
    }
    if (dropdownProfileLink) dropdownProfileLink.addEventListener('click', () => switchView('profile'));

    // Topbar Dropdown Toggles
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const profileMenuBtn = document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    const toggleDropdown = (e, dropdown) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('show');
        closeAllDropdowns();
        if (!isOpen) dropdown.classList.add('show');
    };

    const closeAllDropdowns = () => {
        if (notificationDropdown) notificationDropdown.classList.remove('show');
        if (profileDropdown) profileDropdown.classList.remove('show');
    };

    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => toggleDropdown(e, notificationDropdown));
    }
    if (profileMenuBtn && profileDropdown) {
        profileMenuBtn.addEventListener('click', (e) => toggleDropdown(e, profileDropdown));
    }

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.topbar-item')) {
            closeAllDropdowns();
        }
    });

    // 4. Logout Functionality
    const logoutBtn = document.getElementById('logoutBtn');
    const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    };

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener('click', handleLogout);

    // 4.1 Explore Subjects Logic (REC Dataset)
    const recSubjects = [
        // CSE - 4th Sem (R2021)
        { id: "CS3401", title: "Theory of Computation", dept: "CSE", sem: 4, notes: 15 },
        { id: "CS3491", title: "Artificial Intelligence and Machine Learning", dept: "CSE", sem: 4, notes: 22 },
        { id: "CS3492", title: "Database Management Systems", dept: "CSE", sem: 4, notes: 30 },
        { id: "CS3402", title: "Operating Systems", dept: "CSE", sem: 4, notes: 25 },
        { id: "CS3411", title: "Operating Systems Laboratory", dept: "CSE", sem: 4, notes: 10 },
        
        // IT - 4th Sem (R2019/R2021)
        { id: "IT19441", title: "Operating Systems", dept: "IT", sem: 4, notes: 18 },
        { id: "IT19442", title: "Microprocessors and Microcontrollers", dept: "IT", sem: 4, notes: 15 },
        { id: "IT19421", title: "Soft Skills", dept: "IT", sem: 4, notes: 8 },
        { id: "IT3401", title: "Web Technologies", dept: "IT", sem: 4, notes: 24 },

        // ECE - 4th Sem (R2021)
        { id: "EC3451", title: "Linear Integrated Circuits", dept: "ECE", sem: 4, notes: 20 },
        { id: "EC3452", title: "Communication Systems", dept: "ECE", sem: 4, notes: 28 },
        { id: "EC3491", title: "Communication Systems Laboratory", dept: "ECE", sem: 4, notes: 12 },
        { id: "EC3492", title: "Digital Signal Processing", dept: "ECE", sem: 4, notes: 25 },

        // EEE - 4th Sem (R2021)
        { id: "EE3401", title: "Transmission and Distribution", dept: "EEE", sem: 4, notes: 15 },
        { id: "EE3402", title: "Linear Integrated Circuits", dept: "EEE", sem: 4, notes: 18 },
        { id: "EE3403", title: "Measurements and Instrumentation", dept: "EEE", sem: 4, notes: 12 },
        { id: "EE3404", title: "Microprocessor and Microcontroller", dept: "EEE", sem: 4, notes: 20 },
        { id: "EE3405", title: "Electrical Machines II", dept: "EEE", sem: 4, notes: 22 },

        // Mechanical - 4th Sem (R2021)
        { id: "ME3491", title: "Theory of Machines", dept: "MECH", sem: 4, notes: 18 },
        { id: "ME3451", title: "Thermal Engineering", dept: "MECH", sem: 4, notes: 20 },
        { id: "ME3492", title: "Hydraulics and Pneumatics", dept: "MECH", sem: 4, notes: 15 },
        { id: "ME3493", title: "Manufacturing Technology", dept: "MECH", sem: 4, notes: 22 },
        { id: "CE3491", title: "Strength of Materials", dept: "MECH", sem: 4, notes: 25 },

        // Civil - 4th Sem (R2021)
        { id: "CE3401", title: "Applied Hydraulics Engineering", dept: "CIVIL", sem: 4, notes: 15 },
        { id: "CE3402", title: "Concrete Technology", dept: "CIVIL", sem: 4, notes: 18 },
        { id: "CE3403", title: "Strength of Materials", dept: "CIVIL", sem: 4, notes: 20 },
        { id: "GE3451", title: "Environmental Sciences and Sustainability", dept: "CIVIL", sem: 4, notes: 12 },

        // AI & DS - 4th Sem (R2023)
        { id: "MA23434", title: "Optimization Techniques for AI", dept: "AI&DS", sem: 4, notes: 15 },
        { id: "AI23431", title: "Web Technology and Mobile Application", dept: "AI&DS", sem: 4, notes: 20 },
        { id: "CS23431", title: "Operating Systems", dept: "AI&DS", sem: 4, notes: 18 },
        { id: "CS23432", title: "Software Construction", dept: "AI&DS", sem: 4, notes: 14 },

        // Biotechnology - 4th Sem (R2021)
        { id: "BT3401", title: "Molecular Biology", dept: "BIOTECH", sem: 4, notes: 25 },
        { id: "BT3402", title: "Fluid Flow and Heat Transfer", dept: "BIOTECH", sem: 4, notes: 20 },
        { id: "BT3451", title: "Analytical Techniques in BIOTECH", dept: "BIOTECH", sem: 4, notes: 18 },
        { id: "BT3491", title: "Chemical Process Calculations", dept: "BIOTECH", sem: 4, notes: 15 },
        { id: "BT3452", title: "Industrial Enzymology", dept: "BIOTECH", sem: 4, notes: 22 }
    ];

    const subjectsResultsGrid = document.getElementById('subjectsResultsGrid');
    const subjectSearchInput = document.getElementById('subjectSearchInput');

    const renderSubjects = (filterText = '') => {
        if (!subjectsResultsGrid) return;
        subjectsResultsGrid.innerHTML = '';
        
        const filtered = recSubjects.filter(sub => 
            sub.title.toLowerCase().includes(filterText.toLowerCase()) || 
            sub.id.toLowerCase().includes(filterText.toLowerCase()) ||
            sub.dept.toLowerCase().includes(filterText.toLowerCase())
        );

        if (filtered.length === 0) {
            subjectsResultsGrid.innerHTML = `
                <div class="col-span-3" style="text-align:center; padding: 40px; color: var(--text-muted);">
                    <i class='bx bx-search-alt' style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>No subjects found for "${filterText}"</p>
                </div>
            `;
            return;
        }

        filtered.forEach(sub => {
            const card = document.createElement('div');
            card.className = 'subject-card';
            card.innerHTML = `
                <span class="code">${sub.id}</span>
                <h3>${sub.title}</h3>
                <div class="subject-card-footer">
                    <div class="subject-info">
                        <span>${sub.dept} Dept</span>
                        <span>Semester ${sub.sem}</span>
                    </div>
                    <button class="subject-btn">${sub.notes} Notes</button>
                </div>
            `;
            subjectsResultsGrid.appendChild(card);
        });
    };

    if (subjectSearchInput) {
        subjectSearchInput.addEventListener('input', (e) => {
            renderSubjects(e.target.value);
        });
    }

    // Default render for popular tags
    document.querySelectorAll('.subject-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            if (subjectSearchInput) {
                subjectSearchInput.value = tag.textContent;
                renderSubjects(tag.textContent);
            }
        });
    });

    renderSubjects();

    // 4.2 Announcements Logic
    const notificationsData = [
        { icon: 'bx-file', title: 'New notes uploaded', text: 'Dr. Ramesh uploaded DBMS Unit 4 notes.', time: '2 hours ago', unread: true },
        { icon: 'bx-calendar-event', title: 'Assignment Due', text: 'OS Lab Assignment 4 is due by 11:59 PM tomorrow.', time: '5 hours ago', unread: true },
        { icon: 'bx-badge-check', title: 'Review Approved', text: 'Your review for DSA Notes has been approved.', time: 'Yesterday', unread: false },
        { icon: 'bx-info-circle', title: 'Portal Maintenance', text: 'Server maintenance scheduled for Sunday, 2 AM - 4 AM.', time: '2 days ago', unread: false },
        { icon: 'bx-error-circle', title: 'Exam Registration', text: 'Last date for Semester exam registration is approaching.', time: '3 days ago', unread: false }
    ];

    const announcementsListFull = document.getElementById('announcements-list-full');

    function renderAnnouncements() {
        if (!announcementsListFull) return;
        announcementsListFull.innerHTML = '';

        notificationsData.forEach(notif => {
            const item = document.createElement('div');
            item.className = `notif-item ${notif.unread ? 'unread' : ''}`;
            item.style.padding = '20px 24px';
            item.innerHTML = `
                <div class="notif-icon"><i class='bx ${notif.icon}'></i></div>
                <div class="notif-text">
                    <h4 style="font-size: 14px; margin-bottom: 4px;">${notif.title}</h4>
                    <p style="margin-bottom: 6px;">${notif.text}</p>
                    <span>${notif.time}</span>
                </div>
            `;
            announcementsListFull.appendChild(item);
        });
    }

    // 4.3 Access Notes Logic (Subject/Faculty Search)
    const notesData = [
        { id: 1, title: "Data Structures - Unit 1 Overview", subject: "Data Structures", faculty: "Dr. Ramesh Babu", type: "pdf", size: "2.4 MB", rating: 4.8 },
        { id: 2, title: "Operating Systems - Memory Mgmt", subject: "Operating Systems", faculty: "Prof. S. Kumar", type: "pdf", size: "1.8 MB", rating: 4.5 },
        { id: 3, title: "DBMS SQL Queries Presentation", subject: "Database Mgmt Systems", faculty: "Dr. Anita Raj", type: "ppt", size: "5.6 MB", rating: 4.9 },
        { id: 4, title: "Machine Learning - Neural Nets", subject: "Machine Learning", faculty: "Dr. P. Velu", type: "pdf", size: "4.2 MB", rating: 4.7 },
        { id: 5, title: "Cyber Security Fundamentals", subject: "Cyber Security", faculty: "Prof. G. Reddy", type: "ppt", size: "3.1 MB", rating: 4.6 },
        { id: 6, title: "Design & Analysis of Algorithms Unit 3", subject: "Design & Analysis of Alg.", faculty: "Dr. Ramesh Babu", type: "pdf", size: "2.1 MB", rating: 4.8 },
        { id: 7, title: "Introduction to Soft. Engineering", subject: "Software Engineering", faculty: "Prof. Meena", type: "pdf", size: "1.5 MB", rating: 4.4 },
        { id: 8, title: "Discrete Math - Logical Props", subject: "Discrete Mathematics", faculty: "Prof. Raghavan", type: "pdf", size: "1.9 MB", rating: 4.3 }
    ];

    const notesResultsGrid = document.getElementById('notesResultsGrid');
    const notesSearchInput = document.getElementById('notesSearchInput');
    let currentNoteTypeFilter = 'all';

    function renderNotes(filterText = '') {
        if (!notesResultsGrid) return;
        notesResultsGrid.innerHTML = '';

        const filtered = notesData.filter(note => {
            const matchesSearch = note.title.toLowerCase().includes(filterText.toLowerCase()) || 
                                  note.subject.toLowerCase().includes(filterText.toLowerCase()) ||
                                  note.faculty.toLowerCase().includes(filterText.toLowerCase());
            
            const matchesType = currentNoteTypeFilter === 'all' || note.type === currentNoteTypeFilter;

            return matchesSearch && matchesType;
        });

        if (filtered.length === 0) {
            notesResultsGrid.innerHTML = `
                <div class="col-span-3" style="text-align:center; padding: 40px; color: var(--text-muted);">
                    <i class='bx bx-file-blank' style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p>No study materials found for your search.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(note => {
            const isBookmarked = bookmarkedNoteIds.includes(note.id);
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
                <div class="note-icon type-${note.type}">
                    <i class='bx ${note.type === 'pdf' ? 'bxs-file-pdf' : 'bxs-file-blank'}'></i>
                </div>
                <div class="note-details">
                    <h4>${note.title}</h4>
                    <p>👨‍🏫 ${note.faculty}</p>
                    <div class="note-meta">
                        <span class="rating"><i class='bx bxs-star'></i> ${note.rating}</span>
                        <span class="reviews">${note.size}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn-outline bookmark-btn" data-id="${note.id}" title="${isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}">
                        <i class='bx ${isBookmarked ? 'bxs-bookmark-heart' : 'bx-bookmark-heart'}' style="color: ${isBookmarked ? '#ef4444' : ''}"></i>
                    </button>
                    <button class="icon-btn-outline download-btn" data-id="${note.id}" title="Download Note">
                        <i class='bx bx-download'></i>
                    </button>
                </div>
            `;

            card.querySelector('.download-btn').onclick = (e) => {
                e.stopPropagation();
                logProgress('note', note.title, `Subject: ${note.subject}`);
                alert(`Starting download: ${note.title}`);
            };

            card.querySelector('.bookmark-btn').onclick = (e) => {
                e.stopPropagation();
                toggleBookmark(note.id);
            };

            notesResultsGrid.appendChild(card);
        });
    }

    // Bookmarks Logic
    let bookmarkedNoteIds = [];
    try {
        const stored = localStorage.getItem('bookmarkedNotes');
        if (stored) {
            bookmarkedNoteIds = JSON.parse(stored);
            if (!Array.isArray(bookmarkedNoteIds)) bookmarkedNoteIds = [];
        }
    } catch(e) {
        bookmarkedNoteIds = [];
    }

    function toggleBookmark(noteId) {
        if (bookmarkedNoteIds.includes(noteId)) {
            bookmarkedNoteIds = bookmarkedNoteIds.filter(id => id !== noteId);
        } else {
            bookmarkedNoteIds.push(noteId);
        }
        localStorage.setItem('bookmarkedNotes', JSON.stringify(bookmarkedNoteIds));
        
        // Re-render current view to show changes
        if (notesView && notesView.style.display === 'flex') {
            renderNotes(notesSearchInput.value);
        } else if (bookmarksView && bookmarksView.style.display === 'flex') {
            renderBookmarks();
        }
    }

    function renderBookmarks() {
        const savedGrid = document.getElementById('savedNotesGrid');
        const recommendedGrid = document.getElementById('recommendedNotesGrid');
        
        if (!savedGrid || !recommendedGrid) return;

        // 1. Render Saved Notes
        savedGrid.innerHTML = '';
        const savedNotes = notesData.filter(n => bookmarkedNoteIds.includes(n.id));

        if (savedNotes.length === 0) {
            savedGrid.innerHTML = `
                <div class="col-span-3" style="text-align:center; padding: 40px; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px dashed var(--border-light);">
                    <i class='bx bx-bookmark' style="font-size: 40px; margin-bottom: 12px; opacity: 0.2;"></i>
                    <p style="color: var(--text-muted);">You haven't bookmarked any notes yet.</p>
                </div>
            `;
        } else {
            savedNotes.forEach(note => {
                const card = document.createElement('div');
                card.className = 'note-card';
                card.innerHTML = `
                    <div class="note-icon type-${note.type}">
                        <i class='bx ${note.type === 'pdf' ? 'bxs-file-pdf' : 'bxs-file-blank'}'></i>
                    </div>
                    <div class="note-details">
                        <h4>${note.title}</h4>
                        <p>${note.subject}</p>
                        <div class="note-meta">
                            <span class="rating"><i class='bx bxs-star'></i> ${note.rating}</span>
                            <span class="reviews">by ${note.faculty}</span>
                        </div>
                    </div>
                    <button class="icon-btn-outline remove-bookmark" data-id="${note.id}"><i class='bx bxs-trash' style="color: #ef4444;"></i></button>
                `;
                card.querySelector('.remove-bookmark').onclick = () => toggleBookmark(note.id);
                savedGrid.appendChild(card);
            });
        }

        // 2. Render Recommendations (Mock logic)
        recommendedGrid.innerHTML = '';
        // Suggest 3 notes that aren't bookmarked and have high ratings
        const recommendations = notesData
            .filter(n => !bookmarkedNoteIds.includes(n.id))
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 3);

        recommendations.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
                <div class="note-icon type-${note.type}" style="background: rgba(99, 102, 241, 0.1);">
                    <i class='bx bxs-hot' style="color: #f59e0b;"></i>
                </div>
                <div class="note-details">
                    <span class="badge" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); font-size: 10px; padding: 2px 8px; margin-bottom: 4px;">Recommended</span>
                    <h4>${note.title}</h4>
                    <p>${note.subject}</p>
                </div>
                <button class="btn btn-outline bookmark-rec" style="padding: 6px 12px; font-size: 12px;">Save</button>
            `;
            card.querySelector('.bookmark-rec').onclick = () => toggleBookmark(note.id);
            recommendedGrid.appendChild(card);
        });
    }

    if (notesSearchInput) {
        notesSearchInput.addEventListener('input', (e) => {
            renderNotes(e.target.value);
        });
    }

    document.querySelectorAll('.note-filter-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            document.querySelectorAll('.note-filter-tag').forEach(t => t.classList.remove('active'));
            tag.classList.add('active');
            currentNoteTypeFilter = tag.dataset.type;
            renderNotes(notesSearchInput ? notesSearchInput.value : '');
        });
    });

    // 4.4 Progress Tracker Logic
    let completedWork = [];
    try {
        const stored = localStorage.getItem('completedWork');
        if (stored) {
            completedWork = JSON.parse(stored);
            if (!Array.isArray(completedWork)) completedWork = [];
        }
    } catch(e) {
        completedWork = [];
    }

    const logProgress = (type, title, desc = '') => {
        const newItem = {
            id: Date.now(),
            type: type, // 'task' or 'planner'
            title: title,
            desc: desc,
            timestamp: new Date().toISOString(),
            bookmarked: false
        };
        completedWork.unshift(newItem); // Newest first
        localStorage.setItem('completedWork', JSON.stringify(completedWork));
        if (progressView && progressView.style.display === 'flex') {
            renderProgress();
        }
        updateBadgeCounts();
    };

    const renderProgress = () => {
        const historyList = document.getElementById('progress-history-list');
        const totalTasksEl = document.getElementById('totalTasksCount');
        const totalSessionsEl = document.getElementById('totalSessionsCount');
        const pScoreEl = document.getElementById('productivityScore');
        
        if (!historyList) return;

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const recentWork = completedWork.filter(item => new Date(item.timestamp) > oneMonthAgo);
        
        // Stats
        const taskCount = recentWork.filter(i => i.type === 'task').length;
        const sessionCount = recentWork.filter(i => i.type === 'planner').length;
        if (totalTasksEl) totalTasksEl.textContent = taskCount;
        if (totalSessionsEl) totalSessionsEl.textContent = sessionCount;
        
        // Mock Productivity Score calculation (matches dashboard capsule)
        const score = Math.min(100, (taskCount * 5 + sessionCount * 10 + recentWork.filter(i => i.type === 'note').length * 2));
        if (pScoreEl) pScoreEl.textContent = `${score}%`;

        historyList.innerHTML = '';
        if (recentWork.length === 0) {
            historyList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">No activity logged in the last 30 days.</div>';
            return;
        }

        recentWork.forEach((item, index) => {
            const date = new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const div = document.createElement('div');
            div.className = 'notif-item';
            div.style.padding = '16px 24px';
            div.style.borderBottom = '1px solid var(--border-light)';
            div.innerHTML = `
                <div class="notif-icon" style="background: ${item.type === 'task' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)'}; color: ${item.type === 'task' ? '#10b981' : 'var(--primary)'};">
                    <i class='bx ${item.type === 'task' ? 'bx-check-double' : 'bx-calendar-heart'}'></i>
                </div>
                <div class="notif-text">
                    <h4 style="font-size: 14px; margin-bottom: 2px;">${item.title} ${item.bookmarked ? '<i class="bx bxs-bookmark" style="color: #fbbf24; margin-left: 4px;"></i>' : ''}</h4>
                    <p style="font-size: 12px; margin-bottom: 4px;">${item.desc || (item.type === 'task' ? 'Completed task' : 'Study session finished')}</p>
                    <span style="font-size: 11px; opacity: 0.6;">${date}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn-outline pg-bookmark" data-id="${item.id}" title="Bookmark" style="border:none; background:transparent; font-size:18px; cursor:pointer; color:${item.bookmarked ? '#fbbf24' : 'var(--text-muted)'};">
                        <i class='bx ${item.bookmarked ? 'bxs-bookmark' : 'bx-bookmark'}'></i>
                    </button>
                    <button class="icon-btn-outline pg-delete" data-id="${item.id}" title="Delete" style="border:none; background:transparent; font-size:18px; cursor:pointer; color:var(--text-muted);">
                        <i class='bx bx-x'></i>
                    </button>
                </div>
            `;
            
            // Delete specific item
            div.querySelector('.pg-delete').onclick = () => {
                completedWork = completedWork.filter(w => w.id !== item.id);
                localStorage.setItem('completedWork', JSON.stringify(completedWork));
                renderProgress();
            };

            // Bookmark specific item
            div.querySelector('.pg-bookmark').onclick = () => {
                const target = completedWork.find(w => w.id === item.id);
                if (target) {
                    target.bookmarked = !target.bookmarked;
                    localStorage.setItem('completedWork', JSON.stringify(completedWork));
                    renderProgress();
                }
            };

            historyList.appendChild(div);
        });
    };

    const clearProgressBtn = document.getElementById('clearProgressBtn');
    if (clearProgressBtn) {
        clearProgressBtn.onclick = () => {
            if (confirm('Are you sure you want to clear your entire work history? This cannot be undone.')) {
                completedWork = [];
                localStorage.setItem('completedWork', JSON.stringify(completedWork));
                renderProgress();
            }
        };
    }

    const updateBadgeCounts = () => {
        // Mock update for badge counters if needed
    };

    // 4. To-Do List Interactivity
    const taskList = document.getElementById('taskList');
    const addTaskInput = document.querySelector('.add-task input');
    const addTaskBtn = document.querySelector('.add-task button');
    
    // Load tasks from localStorage or initialize empty defaults
    let savedTasks = [];
    try {
        const stored = localStorage.getItem('studentTasks');
        if (stored) {
            savedTasks = JSON.parse(stored);
            if (!Array.isArray(savedTasks)) savedTasks = [];
        }
    } catch(e) {
        savedTasks = [];
    }
    
    const renderTasks = () => {
        if (!taskList) return;
        taskList.innerHTML = '';
        let uncheckedCount = 0;
        
        savedTasks.forEach((task, index) => {
            if (!task.completed) uncheckedCount++;
            
            const li = document.createElement('li');
            li.className = 'task-item';
            
            li.innerHTML = `
                <label class="checkbox-container">
                    <input type="checkbox" ${task.completed ? 'checked' : ''}>
                    <span class="checkmark"></span>
                    <span class="task-text ${task.completed ? 'completed' : ''}">${task.text}</span>
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="delete-task-btn" data-index="${index}" title="Delete task" style="background:transparent;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;opacity:0.6;display:flex;height:24px;width:24px;align-items:center;justify-content:center;border-radius:4px;">
                        <i class='bx bx-trash'></i>
                    </button>
                </div>
            `;
            
            // Toggle task completion
            li.querySelector('input').addEventListener('change', (e) => {
                savedTasks[index].completed = e.target.checked;
                if (e.target.checked) {
                    logProgress('task', task.text);
                }
                saveTasks();
            });
            
            // Handle hover state manually due to inline style
            const deleteBtn = li.querySelector('.delete-task-btn');
            deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.color = '#ef4444'; deleteBtn.style.opacity = '1'; });
            deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.color = 'var(--text-muted)'; deleteBtn.style.opacity = '0.6'; });
            
            // Delete task
            deleteBtn.addEventListener('click', () => {
                savedTasks.splice(index, 1);
                saveTasks();
            });

            taskList.appendChild(li);
        });
        
        const countBadge = document.querySelector('.count-badge');
        if (countBadge) {
            countBadge.textContent = `${uncheckedCount} left`;
        }
    };

    const saveTasks = () => {
        localStorage.setItem('studentTasks', JSON.stringify(savedTasks));
        renderTasks();
        updateStudyProgress();
    };

    if (addTaskBtn && addTaskInput) {
        const addNewTask = () => {
            const text = addTaskInput.value.trim();
            if (text) {
                savedTasks.push({ text, completed: false });
                saveTasks();
                addTaskInput.value = '';
            }
        };

        addTaskBtn.addEventListener('click', addNewTask);
        addTaskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addNewTask();
        });
    }

    renderTasks();

    // 5. Daily Planner Interactivity
    const plannerTimeline = document.getElementById('plannerTimeline');
    const addPlannerBtn = document.getElementById('addPlannerBtn');
    const plannerForm = document.getElementById('plannerForm');
    const cancelPlannerBtn = document.getElementById('cancelPlannerBtn');
    const savePlannerBtn = document.getElementById('savePlannerBtn');

    // Default static items shown if local storage is empty
    const defaultPlannerItems = [
        { time: "09:00", title: "Data Structures Lecture", desc: "Review Trees & Graphs notes" },
        { time: "11:30", title: "Database Management", desc: "Complete SQL assignment" },
        { time: "14:00", title: "Study Session", desc: "Operating Systems Prep" }
    ];

    let savedPlannerItems = [];
    try {
        const stored = localStorage.getItem('studentPlanner');
        if (stored) {
            savedPlannerItems = JSON.parse(stored);
        } else {
            savedPlannerItems = [...defaultPlannerItems];
        }
    } catch(e) {
        savedPlannerItems = [...defaultPlannerItems];
    }

    // Format 24h time to 12h AM/PM
    const formatTime = (timeStr) => {
        if (!timeStr) return "";
        let [hours, minutes] = timeStr.split(':');
        hours = parseInt(hours, 10);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    };

    const renderPlanner = () => {
        if (!plannerTimeline) return;
        plannerTimeline.innerHTML = '';
        
        // Sort items by time implicitly by doing a string comparison on HH:MM
        savedPlannerItems.sort((a, b) => (a.time || "").localeCompare(b.time || ""));

        // Find current time to highlight "active" timeline
        const now = new Date();
        const curMinutes = now.getHours() * 60 + now.getMinutes();
        let activeIndex = -1;
        let minDiff = Infinity;

        savedPlannerItems.forEach((item, index) => {
            if (item.time) {
                const [h, m] = item.time.split(':');
                const itemMins = parseInt(h) * 60 + parseInt(m);
                if (itemMins <= curMinutes && (curMinutes - itemMins) < minDiff) {
                    minDiff = curMinutes - itemMins;
                    activeIndex = index;
                }
            }
        });

        // If no active index found behind us, just mark the first one if it exists
        if (activeIndex === -1 && savedPlannerItems.length > 0) activeIndex = 0;

        savedPlannerItems.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `timeline-item ${index === activeIndex ? 'active' : ''}`;
            const isCompleted = item.completed || false;
            
            div.innerHTML = `
                <div class="time"><i class='bx bx-time-five'></i> ${formatTime(item.time)}</div>
                <div class="content" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div class="planner-text" style="flex: 1; min-width: 0;">
                        <h4 style="${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${item.title}</h4>
                        <span style="${isCompleted ? 'opacity: 0.5;' : ''}">${item.desc}</span>
                    </div>
                    <div class="planner-actions" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <button class="finish-planner-btn" data-index="${index}" title="${isCompleted ? 'Completed!' : 'Mark as completed'}" style="background:transparent; border:none; color:${isCompleted ? '#10b981' : 'var(--text-muted)'}; font-size:18px; cursor:pointer; transition: color 0.3s ease, transform 0.2s ease;">
                            <i class='bx ${isCompleted ? 'bxs-check-circle' : 'bx-check-circle'}'></i>
                        </button>
                        <button class="delete-planner-btn" data-index="${index}" title="Remove session" style="background:transparent; border:none; color:var(--text-muted); font-size:16px; cursor:pointer; transition: color 0.3s ease;">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </div>
            `;

            // Tick button - toggle green (completed) instead of removing
            const finishBtn = div.querySelector('.finish-planner-btn');
            finishBtn.addEventListener('click', () => {
                if (!savedPlannerItems[index].completed) {
                    savedPlannerItems[index].completed = true;
                    logProgress('planner', item.title, item.desc);
                    savePlanner();
                }
            });
            finishBtn.addEventListener('mouseenter', () => { if (!savedPlannerItems[index].completed) finishBtn.style.color = '#10b981'; });
            finishBtn.addEventListener('mouseleave', () => { if (!savedPlannerItems[index].completed) finishBtn.style.color = 'var(--text-muted)'; });

            // Delete button
            const deleteBtn = div.querySelector('.delete-planner-btn');
            deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.color = '#ef4444'; });
            deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.color = 'var(--text-muted)'; });
            deleteBtn.addEventListener('click', () => {
                savedPlannerItems.splice(index, 1);
                savePlanner();
            });

            plannerTimeline.appendChild(div);
        });

        if (savedPlannerItems.length === 0) {
            plannerTimeline.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding: 20px 0;">No sessions planned for today.</div>';
        }
    };

    const savePlanner = () => {
        localStorage.setItem('studentPlanner', JSON.stringify(savedPlannerItems));
        renderPlanner();
        updateStudyProgress();
    };

    if (addPlannerBtn && plannerForm) {
        addPlannerBtn.addEventListener('click', () => {
            plannerForm.style.display = plannerForm.style.display === 'none' ? 'block' : 'none';
        });

        cancelPlannerBtn.addEventListener('click', () => {
            plannerForm.style.display = 'none';
        });

        savePlannerBtn.addEventListener('click', () => {
            const time = document.getElementById('plannerTime').value;
            const title = document.getElementById('plannerTitle').value.trim();
            const desc = document.getElementById('plannerDesc').value.trim();

            if (time && title) {
                savedPlannerItems.push({ time, title, desc });
                savePlanner();
                // Reset form
                document.getElementById('plannerTime').value = '';
                document.getElementById('plannerTitle').value = '';
                document.getElementById('plannerDesc').value = '';
                plannerForm.style.display = 'none';
            } else {
                alert('Please provide at least a time and a title.');
            }
        });
    }

    renderPlanner();

    // 6. AI Chatbot Interactivity
    const chatbotWidget = document.getElementById('chatbotWidget');
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatWindow = document.getElementById('chatWindow');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatMessages = document.getElementById('chatMessages');

    if (chatToggleBtn && closeChatBtn && chatWindow) {
        // Toggle Open/Close
        chatToggleBtn.addEventListener('click', () => {
            chatWindow.classList.add('open');
            chatToggleBtn.style.transform = 'scale(0)';
            chatInput.focus();
        });

        closeChatBtn.addEventListener('click', () => {
            chatWindow.classList.remove('open');
            chatToggleBtn.style.transform = '';
        });

        // Send Message
        const handleSendMessage = () => {
            const msg = chatInput.value.trim();
            if (msg) {
                // Add user message
                const userMsgHtml = `
                    <div class="message user">
                        <div class="msg-content">${msg}</div>
                        <div class="msg-time">Just now</div>
                    </div>
                `;
                chatMessages.insertAdjacentHTML('beforeend', userMsgHtml);
                chatInput.value = '';
                
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;

                // Simulate bot typing
                setTimeout(() => {
                    const botMsgHtml = `
                        <div class="message bot">
                            <div class="msg-content">
                                <div class="typing-indicator" style="display: flex; gap: 4px;">
                                    <div style="width:6px;height:6px;background:var(--text-muted);border-radius:50%;animation:pulse 1s infinite;"></div>
                                    <div style="width:6px;height:6px;background:var(--text-muted);border-radius:50%;animation:pulse 1s infinite 0.2s;"></div>
                                    <div style="width:6px;height:6px;background:var(--text-muted);border-radius:50%;animation:pulse 1s infinite 0.4s;"></div>
                                </div>
                            </div>
                        </div>
                    `;
                    chatMessages.insertAdjacentHTML('beforeend', botMsgHtml);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    
                    // Replace typing with actual response
                    setTimeout(() => {
                        chatMessages.lastElementChild.remove();
                        const response = getBotResponse(msg);
                        const responseHtml = `
                            <div class="message bot">
                                <div class="msg-content">
                                    ${response}
                                </div>
                                <div class="msg-time">Just now</div>
                            </div>
                        `;
                        chatMessages.insertAdjacentHTML('beforeend', responseHtml);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }, 1000);
                }, 500);
            }
        };

        sendChatBtn.addEventListener('click', handleSendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });

        // Quick Prompts
        const quickPromptBtns = document.querySelectorAll('.quick-prompts button');
        quickPromptBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                chatInput.value = e.target.textContent;
                handleSendMessage();
                // Hide quick prompts after use
                e.target.parentElement.style.display = 'none';
            });
        });
    }

    // 7. Live Clock for Daily Planner
    function startLiveClock() {
        const timeEl = document.getElementById('currentTimeDisplay');
        const dateEl = document.getElementById('currentDateDisplay');
        
        if (!timeEl || !dateEl) return;

        const update = () => {
            const now = new Date();
            // Time
            timeEl.textContent = now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit', 
                hour12: true 
            });
            // Date
            dateEl.textContent = now.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
        };

        update();
        setInterval(update, 1000);
    }

    startLiveClock();

    // 8. Study Progress Capsule Logic
    function updateStudyProgress() {
        const circle = document.getElementById('progressCircle');
        const valueText = document.getElementById('progressValue');
        const barsContainer = document.getElementById('progressSubjectBars');
        
        // Status metrics elements
        const completedVal = document.getElementById('progressWorkCompleted');
        const inProgressVal = document.getElementById('progressInProgress');
        const todoVal = document.getElementById('progressYetToComplete');

        if (!circle || !valueText) return;

        // 1. Calculate Overall Progress
        const totalTasks = savedTasks.length;
        const completedTasksCount = savedTasks.filter(t => t.completed).length;

        const today = new Date().toISOString().split('T')[0];
        const completedTodayCount = completedWork.filter(item => 
            item.type === 'planner' && item.timestamp.startsWith(today)
        ).length;
        
        const totalPlannerSessions = completedTodayCount + savedPlannerItems.length;

        const totalItems = totalTasks + totalPlannerSessions;
        const completedItems = completedTasksCount + completedTodayCount;

        let percentage = 0;
        if (totalItems > 0) {
            percentage = Math.round((completedItems / totalItems) * 100);
        }

        valueText.textContent = `${percentage}%`;
        circle.style.setProperty('--percent', percentage); // Update for CSS variable logic
        circle.style.strokeDashoffset = 251 - (251 * percentage) / 100;

        // Update status metrics
        if (completedVal) completedVal.textContent = completedItems;
        if (inProgressVal) inProgressVal.textContent = savedPlannerItems.length;
        if (todoVal) todoVal.textContent = totalTasks - completedTasksCount;

        // 1.1 Add Adaptive Scaling & Goal Bar (New Enhancement)
        const statCircle = document.querySelector('.stat-circle');
        const goalBar = document.getElementById('goalProgressBar');
        const goalText = document.getElementById('goalPercentageText');

        if (statCircle) {
            const scaleFactor = 1 + (percentage / 100) * 0.15; // Grows from 1.0 to 1.15
            statCircle.style.transform = `scale(${scaleFactor})`;
        }

        if (goalBar) goalBar.style.width = `${percentage}%`;
        if (goalText) goalText.textContent = `${percentage}%`;

        // 1.2 Daily Milestones Logic
        const milestoneName = document.getElementById('milestoneName');
        const milestoneTarget = document.getElementById('milestoneTarget');
        const milestoneIcon = document.querySelector('.milestone-icon i');
        const milestoneCard = document.getElementById('activeMilestone');

        const milestones = [
            { threshold: 0, name: "Daily Hustle", target: "Reach 25% to unlock", icon: "bx-medal" },
            { threshold: 25, name: "Productivity Pro", target: "Reach 50% for next rank", icon: "bx-trophy" },
            { threshold: 50, name: "Study Master", target: "Reach 75% for ultimate title", icon: "bx-crown" },
            { threshold: 75, name: "Academic Legend", target: "Finish all goals!", icon: "bx-star" },
            { threshold: 100, name: "Task Conqueror", target: "Day Complete! 🔥", icon: "bxs-zap" }
        ];

        let currentMilestone = milestones[0];
        for (let m of milestones) {
            if (percentage >= m.threshold) {
                currentMilestone = m;
            }
        }

        if (milestoneName) milestoneName.textContent = currentMilestone.name;
        if (milestoneTarget) milestoneTarget.textContent = currentMilestone.target;
        if (milestoneIcon) {
            milestoneIcon.className = `bx ${currentMilestone.icon}`;
        }
        
        // Add a subtle glow if milestone just changed or reached high level
        if (milestoneCard && percentage >= currentMilestone.threshold) {
            milestoneCard.style.border = `1px solid ${percentage >= 100 ? '#4f46e5' : 'var(--primary-light)'}`;
            milestoneCard.style.boxShadow = `0 0 15px ${percentage >= 100 ? 'rgba(79, 70, 229, 0.2)' : 'rgba(99, 102, 241, 0.1)'}`;
        }

        // 2. Aggregate Data for accurate stats
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const recentWork = completedWork.filter(item => new Date(item.timestamp) > oneMonthAgo);

        // Subjects Completed (Engaged with)
        const subjectEngagement = {}; // { subjectTitle: count }
        recentWork.forEach(item => {
            if (item.desc && item.desc.includes('Subject:')) {
                const sub = item.desc.split('Subject:')[1].trim();
                subjectEngagement[sub] = (subjectEngagement[sub] || 0) + 1;
            }
        });

        const activeSubjects = Object.keys(subjectEngagement);
        if (subjectsText) subjectsText.textContent = `${activeSubjects.length} Subjects Engaged`;

        // Notes Reviewed (downloads + bookmark counts)
        const noteEvents = recentWork.filter(i => i.type === 'note').length;
        if (notesText) notesText.textContent = `${noteEvents} Notes Reviewed`;

        // 3. Dynamic Progress Bars (Top 2 subjects)
        if (barsContainer) {
            barsContainer.innerHTML = '';
            const sortedSubjects = activeSubjects.sort((a, b) => subjectEngagement[b] - subjectEngagement[a]).slice(0, 2);
            
            if (sortedSubjects.length === 0) {
                // Fallback if no activity
                barsContainer.innerHTML = `
                    <div class="mini-bar-item">
                        <span>No subject activity yet</span>
                        <div class="bar-track"><div class="bar-fill" style="width: 0%; background: var(--border-light);"></div></div>
                    </div>
                `;
            } else {
                sortedSubjects.forEach((sub, idx) => {
                    const engagementLevel = Math.min(100, subjectEngagement[sub] * 20);
                    const color = idx === 0 ? 'var(--accent-1)' : 'var(--accent-2)';
                    const barItem = document.createElement('div');
                    barItem.className = 'mini-bar-item';
                    barItem.innerHTML = `
                        <span>${sub}</span>
                        <div class="bar-track">
                            <div class="bar-fill" style="width: ${engagementLevel}%; background: ${color};"></div>
                        </div>
                    `;
                    barsContainer.appendChild(barItem);
                });
            }
        }
    }

    // Initial Progress Update
    updateStudyProgress();

    // 9. AI Chatbot Knowledge Base & Logic
    function getBotResponse(query) {
        const q = query.toLowerCase();
        
        // REC Knowledge Base
        const recInfo = {
            departments: [
                "Computer Science & Engineering (CSE)",
                "Information Technology (IT)",
                "Electronics & Communication (ECE)",
                "Electrical & Electronics (EEE)",
                "Mechanical Engineering",
                "Civil Engineering",
                "Biotechnology",
                "Biomedical Engineering",
                "Aeronautical Engineering",
                "Automobile Engineering",
                "Chemical Engineering",
                "Mechatronics Engineering",
                "Food Technology",
                "Artificial Intelligence & Data Science",
                "Management Studies (MBA)"
            ],
            facilities: {
                hostel: "REC provides comfortable on-campus accommodation for both boys and girls with modern amenities, 24/7 security, and hygienic dining.",
                library: "The Central Library is well-stocked with thousands of technical books, journals, and e-resources, providing a quiet and resource-rich environment for students.",
                transport: "The college operates a fleet of buses covering various parts of Chennai and neighboring areas for the convenience of students and staff.",
                sports: "A variety of sports facilities are available, including a large playground for cricket and football, as well as indoor courts for badminton and basketball.",
                medical: "A dedicated medical center with qualified doctors and emergency care is available on campus.",
                labs: "State-of-the-art laboratories are available for all departments, equipped with the latest technology for practical learning."
            },
            contact: {
                campus: "Rajalakshmi Nagar, Thandalam, Chennai - 602 105. Phone: +91-44-37181111",
                admin: "# 69 New Avadi Road, Kilpauk, Chennai - 600 010. Phone: +91-44-26442472",
                email: "admin@rajalakshmi.edu.in or principal@rajalakshmi.edu.in"
            }
        };

        if (q.includes('department') || q.includes('course') || q.includes('branch')) {
            return `Rajalakshmi Engineering College (REC) offers a wide range of programs. Major departments include:<br><br>• ${recInfo.departments.slice(0, 8).join('<br>• ')}<br>...and many more specializations!`;
        }
        
        if (q.includes('hostel') || q.includes('stay') || q.includes('accommodation')) {
            return recInfo.facilities.hostel;
        }

        if (q.includes('library') || q.includes('books')) {
            return recInfo.facilities.library;
        }

        if (q.includes('transport') || q.includes('bus')) {
            return recInfo.facilities.transport;
        }

        if (q.includes('contact') || q.includes('address') || q.includes('phone') || q.includes('call') || q.includes('email')) {
            return `You can reach REC at:<br><br><b>Campus:</b> ${recInfo.contact.campus}<br><b>Admin Office:</b> ${recInfo.contact.admin}<br><b>Email:</b> ${recInfo.contact.email}`;
        }

        if (q.includes('sports') || q.includes('gym') || q.includes('game')) {
            return recInfo.facilities.sports;
        }

        if (q.includes('lab') || q.includes('facility')) {
            return `REC is known for its world-class facilities, including: ${recInfo.facilities.labs}`;
        }

        if (q.includes('hi') || q.includes('hello') || q.includes('hey')) {
            return "Hello! I'm your REC Student Assistant. How can I help you today?";
        }

        if (q.includes('note') || q.includes('study') || q.includes('material')) {
            return "You can find all study materials in the 'Access Notes' section of the sidebar! Just search by subject or faculty.";
        }

        if (q.includes('progress') || q.includes('track')) {
            return "Your study progress is tracked in real-time on your dashboard. You can see more details in the 'Study Progress Tracker' section.";
        }

        return "I'm not sure I understand. You can ask me about REC departments, hostel facilities, contact details, or how to navigate this portal!";
    }

    // 10. Browse Faculty Logic
    // 10. Browse Faculty Logic
    const recFaculty = [
        // ========== CSE Faculty ==========
        { name: "Dr. V. Murali Bhaskaran", role: "Professor & Dean Academics", dept: "CSE", color: "var(--accent-1)", initials: "MB", subjects: ["CS3401", "Algorithms & AI"], rating: 4.9 },
        { name: "Dr. N. Sankar Ram", role: "Professor & HOD", dept: "CSE", color: "var(--accent-2)", initials: "SR", subjects: ["CS3491", "Machine Learning"], rating: 4.8 },
        { name: "Dr. K. Devaki", role: "Professor", dept: "CSE", color: "var(--accent-3)", initials: "KD", subjects: ["CS3401", "Design & Analysis of Algorithms"], rating: 5.0 },
        { name: "Dr. K. Jayashree", role: "Professor", dept: "CSE", color: "var(--accent-4)", initials: "KJ", subjects: ["CS3492", "Database Management Systems"], rating: 4.7 },
        { name: "Dr. R. Josphine Leela", role: "Professor", dept: "CSE", color: "var(--accent-1)", initials: "JL", subjects: ["CS3491", "Artificial Intelligence"], rating: 4.8 },
        { name: "Dr. T. Tamilvizhi", role: "Professor", dept: "CSE", color: "var(--accent-2)", initials: "TT", subjects: ["CS3492", "Database Systems"], rating: 4.7 },
        { name: "Mr. S. Vinod Kumar", role: "Associate Professor", dept: "CSE", color: "var(--accent-3)", initials: "VK", subjects: ["CS3491", "Software Engineering"], rating: 4.6 },
        { name: "Dr. P. Revathy", role: "Associate Professor", dept: "CSE", color: "var(--accent-4)", initials: "PR", subjects: ["CS3401", "Theory of Computation"], rating: 4.8 },
        { name: "Mr. S. Suresh Kumar", role: "Associate Professor", dept: "CSE", color: "var(--accent-1)", initials: "SK", subjects: ["CS3491", "Cyber Security"], rating: 4.5 },
        { name: "Ms. D. Sorna Shanthi", role: "Associate Professor", dept: "CSE", color: "var(--accent-2)", initials: "SS", subjects: ["CS3492", "DBMS Lab"], rating: 4.7 },
        { name: "Mrs. Priya Vijay", role: "Associate Professor", dept: "CSE", color: "var(--accent-3)", initials: "PV", subjects: ["CS3491", "Operating Systems"], rating: 4.6 },
        { name: "Dr. U. Karthikeyan", role: "Associate Professor", dept: "CSE", color: "var(--accent-4)", initials: "UK", subjects: ["CS3401", "Computer Networks"], rating: 4.5 },
        { name: "Dr. S. Ramesh", role: "Associate Professor", dept: "CSE", color: "var(--accent-1)", initials: "SR", subjects: ["CS3491", "Computer Vision"], rating: 4.7 },
        { name: "Ms. V. Sumathy", role: "Assistant Professor SG", dept: "CSE", color: "var(--accent-2)", initials: "VS", subjects: ["CS3491", "AI Principles"], rating: 4.4 },
        { name: "Ms. S. Ponmani", role: "Assistant Professor SG", dept: "CSE", color: "var(--accent-3)", initials: "SP", subjects: ["CS3492", "Web Technologies"], rating: 4.9 },
        { name: "Mrs. R. Kavitha", role: "Assistant Professor", dept: "CSE", color: "var(--accent-4)", initials: "RK", subjects: ["CS3401", "Data Structures"], rating: 4.3 },
        { name: "Ms. M. Indumathi", role: "Assistant Professor", dept: "CSE", color: "var(--accent-1)", initials: "MI", subjects: ["CS3492", "Cloud Computing"], rating: 4.4 },

        // ========== IT Faculty ==========
        { name: "Dr. P. Valarmathie", role: "Professor & HOD", dept: "IT", color: "var(--accent-1)", initials: "PV", subjects: ["IT3401", "Operating Systems"], rating: 4.8 },
        { name: "Dr. R. Kumar", role: "Professor", dept: "IT", color: "var(--accent-2)", initials: "RK", subjects: ["IT3401", "Computer Networks"], rating: 4.7 },
        { name: "Dr. R. Anandkumar", role: "Associate Professor", dept: "IT", color: "var(--accent-3)", initials: "RA", subjects: ["IT3402", "Microprocessors"], rating: 4.9 },
        { name: "Ms. R. Rajalakshmi", role: "Assistant Professor", dept: "IT", color: "var(--accent-4)", initials: "RR", subjects: ["IT3401", "Software Engineering"], rating: 4.5 },
        { name: "Mrs. P. Selvi", role: "Assistant Professor", dept: "IT", color: "var(--accent-1)", initials: "PS", subjects: ["IT3402", "Embedded Systems"], rating: 4.6 },
        { name: "Mr. V. Raj Kumar", role: "Assistant Professor", dept: "IT", color: "var(--accent-2)", initials: "VR", subjects: ["IT3401", "Data Mining"], rating: 4.5 },
        { name: "Mrs. K. Sangeetha", role: "Assistant Professor", dept: "IT", color: "var(--accent-3)", initials: "KS", subjects: ["IT3402", "Web Development"], rating: 4.4 },
        { name: "Mr. A. Senthilkumar", role: "Assistant Professor", dept: "IT", color: "var(--accent-4)", initials: "AS", subjects: ["IT3401", "DBMS"], rating: 4.3 },

        // ========== ECE Faculty ==========
        { name: "Dr. Sasikumar S", role: "Professor & Dean R&D", dept: "ECE", color: "var(--accent-1)", initials: "SS", subjects: ["EC3452", "Communication Systems"], rating: 4.9 },
        { name: "Dr. G. Nirmala Priya", role: "Professor & HOD", dept: "ECE", color: "var(--accent-2)", initials: "NP", subjects: ["EC3451", "Linear Integrated Circuits"], rating: 4.8 },
        { name: "Dr. Chandra I", role: "Professor", dept: "ECE", color: "var(--accent-3)", initials: "CI", subjects: ["EC3492", "Digital Signal Processing"], rating: 4.7 },
        { name: "Dr. S. Ashok Kumar", role: "Professor", dept: "ECE", color: "var(--accent-4)", initials: "AK", subjects: ["EC3452", "VLSI Design"], rating: 4.9 },
        { name: "Dr. T. Roosefert Mohan", role: "Associate Professor", dept: "ECE", color: "var(--accent-1)", initials: "RM", subjects: ["EC3451", "Antenna & RF Design"], rating: 4.6 },
        { name: "Dr. S. Mohamed Nizar", role: "Assistant Professor", dept: "ECE", color: "var(--accent-2)", initials: "MN", subjects: ["EC3451", "Circuit Theory"], rating: 4.5 },
        { name: "Mrs. P. Vijayalakshmi", role: "Associate Professor", dept: "ECE", color: "var(--accent-3)", initials: "PV", subjects: ["EC3492", "Embedded Systems"], rating: 4.6 },
        { name: "Mr. R. Manikandan", role: "Assistant Professor", dept: "ECE", color: "var(--accent-4)", initials: "RM", subjects: ["EC3452", "Wireless Networks"], rating: 4.4 },
        { name: "Dr. N. Padmapriya", role: "Associate Professor", dept: "ECE", color: "var(--accent-1)", initials: "NP", subjects: ["EC3451", "Microwave Engineering"], rating: 4.7 },

        // ========== EEE Faculty ==========
        { name: "Dr. C. Kamalakannan", role: "Professor & HOD", dept: "EEE", color: "var(--accent-3)", initials: "CK", subjects: ["EE3401", "Power Systems"], rating: 4.8 },
        { name: "Dr. R. Seyezhai", role: "Professor", dept: "EEE", color: "var(--accent-4)", initials: "RS", subjects: ["EE3404", "Power Electronics"], rating: 4.9 },
        { name: "Dr. M. Balasubramanian", role: "Associate Professor", dept: "EEE", color: "var(--accent-1)", initials: "MB", subjects: ["EE3401", "Electrical Machines"], rating: 4.7 },
        { name: "Lekshmi Sree", role: "Assistant Professor", dept: "EEE", color: "var(--accent-2)", initials: "LS", subjects: ["EE3401", "Machines Lab"], rating: 4.4 },
        { name: "Nandini G Iyer", role: "Assistant Professor", dept: "EEE", color: "var(--accent-3)", initials: "NI", subjects: ["EE3404", "Microcontrollers"], rating: 4.7 },
        { name: "Arulmozhi Muruganantham", role: "Assistant Professor", dept: "EEE", color: "var(--accent-4)", initials: "AM", subjects: ["EE3408", "Control Systems"], rating: 4.6 },
        { name: "Sivakumar P", role: "Assistant Professor", dept: "EEE", color: "var(--accent-1)", initials: "SP", subjects: ["EE3401", "Measurements"], rating: 4.5 },
        { name: "Mrs. G. Sumathi", role: "Assistant Professor", dept: "EEE", color: "var(--accent-2)", initials: "GS", subjects: ["EE3404", "Transmission & Dist."], rating: 4.3 },

        // ========== Mechanical Faculty ==========
        { name: "Dr. S. P. Srinivasan", role: "Professor & HOD", dept: "MECH", color: "var(--accent-1)", initials: "SP", subjects: ["ME3491", "Theory of Machines"], rating: 4.9 },
        { name: "Dr. P. K. Nagarajan", role: "Professor", dept: "MECH", color: "var(--accent-2)", initials: "PK", subjects: ["ME3451", "Heat Transfer"], rating: 4.8 },
        { name: "Dr. A. Paramasivam", role: "Professor", dept: "MECH", color: "var(--accent-3)", initials: "AP", subjects: ["ME3491", "Manufacturing Technology"], rating: 4.7 },
        { name: "Dr. Venkateshwaran N", role: "Professor", dept: "MECH", color: "var(--accent-4)", initials: "VN", subjects: ["ME3451", "Thermal Engineering"], rating: 4.8 },
        { name: "Mr. S. Arulmurugan", role: "Assistant Professor", dept: "MECH", color: "var(--accent-1)", initials: "SA", subjects: ["ME3491", "Strength of Materials"], rating: 4.5 },
        { name: "Mr. M. Rajkumar", role: "Assistant Professor", dept: "MECH", color: "var(--accent-2)", initials: "MR", subjects: ["ME3491", "Fluid Mechanics"], rating: 4.6 },
        { name: "Dr. N. Pragadish", role: "Associate Professor", dept: "MECH", color: "var(--accent-3)", initials: "NP", subjects: ["ME3451", "CAD/CAM"], rating: 4.8 },
        { name: "Mr. K. Thirunavukkarasu", role: "Assistant Professor", dept: "MECH", color: "var(--accent-4)", initials: "KT", subjects: ["ME3491", "Dynamics of Machinery"], rating: 4.4 },

        // ========== Civil Faculty ==========
        { name: "Dr. S. Geetha", role: "Professor & HOD", dept: "CIVIL", color: "var(--accent-1)", initials: "SG", subjects: ["CE3401", "Hydraulics & Irrigation"], rating: 4.9 },
        { name: "Dr. R. Malathy", role: "Professor", dept: "CIVIL", color: "var(--accent-2)", initials: "RM", subjects: ["CE3403", "Structural Engineering"], rating: 4.8 },
        { name: "Mrs. Ramya Elumalai", role: "Assistant Professor", dept: "CIVIL", color: "var(--accent-3)", initials: "RE", subjects: ["CE3403", "Strength of Materials"], rating: 4.6 },
        { name: "Mr. M. Sankar", role: "Assistant Professor", dept: "CIVIL", color: "var(--accent-4)", initials: "MS", subjects: ["CE3401", "Surveying"], rating: 4.5 },
        { name: "Mrs. S. Dhivya", role: "Assistant Professor", dept: "CIVIL", color: "var(--accent-1)", initials: "SD", subjects: ["CE3403", "Structural Analysis"], rating: 4.7 },
        { name: "Dr. K. Senthilkumar", role: "Associate Professor", dept: "CIVIL", color: "var(--accent-2)", initials: "KS", subjects: ["CE3401", "Environmental Eng."], rating: 4.6 },
        { name: "Mr. P. Aravindhan", role: "Assistant Professor", dept: "CIVIL", color: "var(--accent-3)", initials: "PA", subjects: ["CE3403", "Concrete Technology"], rating: 4.4 },

        // ========== AI & DS Faculty ==========
        { name: "Mr. J. M. Gnanasekar", role: "Professor & HOD", dept: "AI&DS", color: "var(--accent-1)", initials: "GN", subjects: ["AD3491", "Optimization Techniques"], rating: 4.9 },
        { name: "Mrs. A. Beulah", role: "Associate Professor", dept: "AI&DS", color: "var(--accent-2)", initials: "AB", subjects: ["AD3491", "Web Technologies"], rating: 4.8 },
        { name: "Dr. S. Ramesh", role: "Associate Professor", dept: "AI&DS", color: "var(--accent-3)", initials: "SR", subjects: ["AD3491", "Machine Learning"], rating: 4.7 },
        { name: "Mrs. R. Preethi", role: "Assistant Professor", dept: "AI&DS", color: "var(--accent-4)", initials: "RP", subjects: ["AD3491", "Deep Learning"], rating: 4.5 },
        { name: "Mr. S. Vigneshwaran", role: "Assistant Professor", dept: "AI&DS", color: "var(--accent-1)", initials: "SV", subjects: ["AD3491", "NLP"], rating: 4.4 },
        { name: "Ms. T. Deepika", role: "Assistant Professor", dept: "AI&DS", color: "var(--accent-2)", initials: "TD", subjects: ["AD3491", "Data Analytics"], rating: 4.6 },

        // ========== Biotechnology Faculty ==========
        { name: "Dr. K. Sathya", role: "Professor & HOD", dept: "BIOTECH", color: "var(--accent-1)", initials: "KS", subjects: ["BT3401", "Molecular Biology"], rating: 4.8 },
        { name: "Dr. R. Jayasree", role: "Professor", dept: "BIOTECH", color: "var(--accent-2)", initials: "RJ", subjects: ["BT3402", "Bioprocess Engineering"], rating: 4.7 },
        { name: "Dr. M. Sankar", role: "Professor", dept: "BIOTECH", color: "var(--accent-3)", initials: "MS", subjects: ["BT3401", "Biochemistry"], rating: 4.6 },
        { name: "Mr. R. Rohith Kumar", role: "Assistant Professor", dept: "BIOTECH", color: "var(--accent-4)", initials: "RK", subjects: ["BT3402", "Genetic Engineering"], rating: 4.5 },
        { name: "Dr. P. Lakshmi Priya", role: "Associate Professor", dept: "BIOTECH", color: "var(--accent-1)", initials: "LP", subjects: ["BT3401", "Immunology"], rating: 4.7 },
        { name: "Mrs. S. Nandhini", role: "Assistant Professor", dept: "BIOTECH", color: "var(--accent-2)", initials: "SN", subjects: ["BT3402", "Microbiology"], rating: 4.4 }
    ];

    const facultyResultsGrid = document.getElementById('facultyResultsGrid');
    const facultySearchInput = document.getElementById('facultySearchInput');
    const facultyDeptFilters = document.getElementById('facultyDeptFilters');
    let currentFacultyDept = 'all';

    function renderFaculty() {
        if (!facultyResultsGrid) return;
        facultyResultsGrid.innerHTML = '';
        const filterText = facultySearchInput ? facultySearchInput.value.toLowerCase() : '';

        const filtered = recFaculty.filter(fac => {
            const matchesText = fac.name.toLowerCase().includes(filterText) || 
                               fac.dept.toLowerCase().includes(filterText) ||
                               fac.subjects.some(s => s.toLowerCase().includes(filterText));
            
            const matchesDept = currentFacultyDept === 'all' || fac.dept === currentFacultyDept;
            
            return matchesText && matchesDept;
        });

        if (filtered.length === 0) {
            facultyResultsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No faculty found matching your search.</div>';
            return;
        }

        filtered.forEach(fac => {
            const card = document.createElement('div');
            card.className = 'note-card'; // Reuse note-card styling for consistency
            card.innerHTML = `
                <div class="note-icon" style="background: ${fac.color}22; color: ${fac.color}; font-weight: bold; font-size: 18px; display: flex; align-items: center; justify-content: center;">
                    ${fac.initials}
                </div>
                <div class="note-details">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <h4>${fac.name}</h4>
                        <div class="rating-badge" style="background: rgba(255, 193, 7, 0.1); color: #ffca28; padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                            <i class='bx bxs-star'></i> ${fac.rating}
                        </div>
                    </div>
                    <p style="color: var(--primary); font-weight: 500;">${fac.role}</p>
                    <p style="font-size: 12px; margin-top: 4px; opacity: 0.8;">${fac.dept} Department</p>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px;">
                        ${fac.subjects.map(s => `<span class="badge" style="background: rgba(255,255,255,0.05); font-size: 10px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-light);">${s}</span>`).join('')}
                    </div>
                </div>
                <button class="icon-btn-outline" title="View Profile"><i class='bx bx-user'></i></button>
            `;
            facultyResultsGrid.appendChild(card);
        });
    }

    if (facultySearchInput) {
        facultySearchInput.addEventListener('input', () => renderFaculty());
    }

    if (facultyDeptFilters) {
        const filters = facultyDeptFilters.querySelectorAll('.subject-tag');
        filters.forEach(filter => {
            filter.addEventListener('click', () => {
                // Update active state
                filters.forEach(f => f.classList.remove('active'));
                filter.classList.add('active');
                
                // Update filter and re-render
                currentFacultyDept = filter.getAttribute('data-dept');
                renderFaculty();
            });
        });
    }
});
