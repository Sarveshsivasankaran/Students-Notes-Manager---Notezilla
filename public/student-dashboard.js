// Initialize Socket.io
const socket = io(window.NotezillaRuntime.socketUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true
});

document.addEventListener('DOMContentLoaded', () => {
    function escapeHtml(value = '') {
        return String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }
    window.escapeHtml = escapeHtml;

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
        'dsa': { view: document.getElementById('dsa-view'), nav: document.getElementById('nav-dsa') },
        'class-recorder': { view: document.getElementById('class-recorder-view'), nav: document.getElementById('nav-class-recorder') }
    };

    function switchView(viewKey) {
        Object.values(navItems).forEach(item => {
            if (item.view) item.view.style.display = 'none';
            if (item.nav) item.nav.classList.remove('active');
        });

        const target = navItems[viewKey];
        if (target) {
            if (target.view) target.view.style.display = (viewKey === 'dashboard' || viewKey === 'profile' || viewKey === 'subjects' || viewKey === 'announcements' || viewKey === 'progress' || viewKey === 'bookmarks' || viewKey === 'faculty' || viewKey === 'dsa' || viewKey === 'class-recorder') ? 'flex' : 'block';
            if (target.nav) target.nav.classList.add('active');

            // Trigger specific renders
            if (viewKey === 'subjects') renderSubjects();
            if (viewKey === 'announcements') renderAnnouncements();
            if (viewKey === 'progress') renderProgress();
            if (viewKey === 'bookmarks') renderBookmarks();
            if (viewKey === 'faculty') renderFaculty();
            if (viewKey === 'class-recorder') renderClassRecorderLibrary();
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

    // ════════════════════════════════════════════════════════════
    // 4.1 COURSE & CURRICULUM EXPLORER CONTROLLER (Section 3 Upgrade)
    // ════════════════════════════════════════════════════════════
    let curriculumState = {
        stream: 'autonomous_2023',
        department: 'all',
        semester: 'all',
        enrolledOnly: false,
        searchQuery: '',
        courses: [],
        enrolledCredits: 0
    };

    const subjectsResultsGrid = document.getElementById('subjectsResultsGrid');
    const subjectSearchInput = document.getElementById('subjectSearchInput');
    const filterEnrolledToggleBtn = document.getElementById('filterEnrolledToggleBtn');
    const resetCurriculumFiltersBtn = document.getElementById('resetCurriculumFiltersBtn');
    const curriculumResultsCount = document.getElementById('curriculumResultsCount');
    const curriculumActiveFilterTag = document.getElementById('curriculumActiveFilterTag');
    const curriculumEnrolledCreditsVal = document.getElementById('curriculumEnrolledCreditsVal');
    const curriculumTotalCoursesCount = document.getElementById('curriculumTotalCoursesCount');

    // Modals & Elements
    const curriculumModal = document.getElementById('curriculumModal');
    const closeCurriculumModalBtn = document.getElementById('closeCurriculumModalBtn');
    const cModalPinBtn = document.getElementById('cModalPinBtn');
    let activeModalCourse = null;

    // Helper for department accent color
    const getDeptTheme = (dept = '') => {
        const d = String(dept).toUpperCase();
        if (d === 'CSE') return { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)' };
        if (d === 'IT') return { color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.3)' };
        if (d === 'ECE') return { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)' };
        if (d === 'EEE') return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
        if (d === 'MECH') return { color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.3)' };
        if (d === 'CIVIL') return { color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.3)' };
        if (d === 'BIOMED') return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
        if (d === 'AI&DS') return { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)' };
        return { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)' };
    };

    // Load active enrolled credits
    const loadEnrolledCredits = async () => {
        try {
            const res = await apiFetch('/user/enrolled-courses');
            if (res && res.success) {
                curriculumState.enrolledCredits = res.total_credits || 0;
                if (curriculumEnrolledCreditsVal) {
                    curriculumEnrolledCreditsVal.textContent = `${res.total_credits || 0} Credits`;
                }
            }
        } catch (e) {
            console.warn('Failed to load enrolled credits:', e);
        }
    };

    // Main fetch & render function
    const renderSubjects = async () => {
        if (!subjectsResultsGrid) return;

        subjectsResultsGrid.innerHTML = `
            <div class="col-span-3" style="text-align:center; padding: 60px 20px;">
                <i class="bx bx-loader-alt bx-spin" style="font-size: 38px; color: var(--primary);"></i>
                <p style="margin-top: 12px; color: var(--text-muted); font-size: 14px;">Loading curriculum roadmaps & verified notes...</p>
            </div>
        `;

        const params = new URLSearchParams();
        if (curriculumState.stream && curriculumState.stream !== 'all') params.set('curriculum_stream', curriculumState.stream);
        if (curriculumState.department && curriculumState.department !== 'all') params.set('department', curriculumState.department);
        if (curriculumState.semester && curriculumState.semester !== 'all') params.set('semester', curriculumState.semester);
        if (curriculumState.searchQuery) params.set('search', curriculumState.searchQuery);
        if (curriculumState.enrolledOnly) params.set('enrolled_only', 'true');

        try {
            const res = await apiFetch(`/subjects?${params.toString()}`);
            if (!res || !res.success || !res.data || res.data.length === 0) {
                subjectsResultsGrid.innerHTML = `
                    <div class="col-span-3 empty-curriculum-state glass-panel">
                        <i class='bx bx-book-content' style="font-size: 48px; color: var(--text-muted); margin-bottom: 12px;"></i>
                        <h3 style="font-size: 18px; margin-bottom: 6px;">No courses found</h3>
                        <p style="color: var(--text-muted); font-size: 14px; max-width: 440px; margin: 0 auto 16px;">
                            ${curriculumState.enrolledOnly ? 'You have not pinned any courses for this filter yet. Pin courses to build your active semester timetable!' : 'Try selecting a different department, semester, or search query.'}
                        </p>
                        <button class="btn-glass" onclick="window.resetCurriculumFilters()"><i class='bx bx-reset'></i> Reset Filters</button>
                    </div>
                `;
                if (curriculumResultsCount) curriculumResultsCount.textContent = 'Showing 0 Courses';
                return;
            }

            curriculumState.courses = res.data;
            if (curriculumTotalCoursesCount && !curriculumState.enrolledOnly && curriculumState.stream === 'autonomous_2023') {
                curriculumTotalCoursesCount.textContent = res.data.length;
            }
            if (curriculumResultsCount) {
                curriculumResultsCount.textContent = `Showing ${res.data.length} Course${res.data.length === 1 ? '' : 's'}`;
            }

            // Update active filter tag
            if (curriculumActiveFilterTag) {
                const streamName = curriculumState.stream === 'gate_placement' ? 'GATE & Placement Core' :
                                   curriculumState.stream === 'foundation_stem' ? 'Foundation STEM' :
                                   curriculumState.stream === 'all' ? 'All Curricula' : 'Autonomous Engineering (Reg 2023)';
                const deptText = curriculumState.department !== 'all' ? ` • Dept: ${curriculumState.department}` : '';
                const semText = curriculumState.semester !== 'all' ? ` • Sem ${curriculumState.semester}` : '';
                const pinText = curriculumState.enrolledOnly ? ' • [Pinned Only]' : '';
                curriculumActiveFilterTag.textContent = `${streamName}${deptText}${semText}${pinText}`;
            }

            subjectsResultsGrid.innerHTML = '';

            res.data.forEach(sub => {
                const theme = getDeptTheme(sub.department);
                const card = document.createElement('div');
                card.className = 'curriculum-course-card glass-panel';
                card.style.setProperty('--card-accent', theme.color);

                const facultyInitial = sub.faculty && sub.faculty.name ? sub.faculty.name.split(' ').filter(n => !n.startsWith('Dr.') && !n.startsWith('Prof.')).map(n => n[0]).join('').slice(0, 2) : 'AU';

                card.innerHTML = `
                    <div class="c-card-top">
                        <div class="c-card-badges">
                            <span class="c-dept-tag" style="background: ${theme.bg}; color: ${theme.color}; border: 1px solid ${theme.border};">
                                ${escapeHtml(sub.department || 'ENGG')}
                            </span>
                            <span class="c-sem-tag">SEM ${sub.semester}</span>
                            <span class="c-credits-tag">${sub.credits} CREDITS</span>
                            ${sub.is_gate_placement ? `<span class="c-gate-tag" title="Tested in GATE CS/IT & Tech Placements"><i class='bx bx-rocket'></i> GATE</span>` : ''}
                        </div>
                        <button class="c-pin-btn ${sub.is_enrolled ? 'pinned' : ''}" title="${sub.is_enrolled ? 'Unpin from Semester' : 'Pin to Semester'}" onclick="event.stopPropagation(); window.toggleCourseEnrollment('${sub.id}', this)">
                            <i class='bx ${sub.is_enrolled ? 'bxs-pin' : 'bx-pin'}'></i>
                        </button>
                    </div>

                    <div class="c-card-content" onclick="window.openCurriculumModal('${sub.id}')">
                        <div class="c-code-row">
                            <span class="c-course-code">${escapeHtml(sub.code)}</span>
                            ${sub.mastery_score ? `<span class="c-mastery-chip"><i class='bx bx-check-shield'></i> ${sub.mastery_score}% Mastery</span>` : ''}
                        </div>
                        <h3 class="c-course-title" title="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</h3>
                        <p class="c-course-desc">${escapeHtml(sub.description || 'Comprehensive syllabus following Autonomous Regulation 2023.')}</p>

                        <!-- Assigned Faculty Bar -->
                        <div class="c-card-faculty">
                            <div class="c-fac-mini-avatar" style="background: ${theme.bg}; color: ${theme.color};">
                                ${sub.faculty && sub.faculty.photo_url ? `<img src="${sub.faculty.photo_url}" alt="${escapeHtml(sub.faculty.name)}" onerror="this.style.display='none'">` : facultyInitial}
                            </div>
                            <div class="c-fac-mini-info">
                                <span class="c-fac-name">${sub.faculty ? escapeHtml(sub.faculty.name) : 'Autonomous Faculty Board'}</span>
                                <span class="c-fac-hours"><i class='bx bx-time'></i> ${sub.faculty && sub.faculty.office_hours ? escapeHtml(sub.faculty.office_hours.split('(')[0]) : 'Mon-Fri Regular Hours'}</span>
                            </div>
                        </div>

                        <!-- 5-Unit Progress Track Indicator -->
                        <div class="c-unit-timeline-bar" title="5 Standard Syllabus Units">
                            <span class="u-segment" title="Unit 1">U1</span>
                            <span class="u-segment" title="Unit 2">U2</span>
                            <span class="u-segment" title="Unit 3">U3</span>
                            <span class="u-segment" title="Unit 4">U4</span>
                            <span class="u-segment" title="Unit 5">U5</span>
                        </div>
                    </div>

                    <div class="c-card-footer">
                        <div class="c-notes-metric">
                            <i class='bx bx-file-blank'></i>
                            <span>${sub.notes_count} ${sub.notes_count === 1 ? 'Note' : 'Notes'}</span>
                        </div>
                        <div class="c-card-actions">
                            <button class="btn-glass c-action-btn c-deepdive-btn" onclick="window.openCurriculumModal('${sub.id}')">
                                <i class='bx bx-book-open'></i> Syllabus
                            </button>
                            <button class="btn-gradient c-action-btn c-tutor-btn" title="Launch Aadhi AI Tutor on this course" onclick="event.stopPropagation(); window.openAadhiTutor({ mode: 'explain', subject: '${escapeHtml(sub.code)}: ${escapeHtml(sub.name)}', initialPrompt: 'I want to study ${escapeHtml(sub.code)} (${escapeHtml(sub.name)}). Can you give me a high-level syllabus breakdown and explain the most crucial unit?' })">
                                <i class='bx bx-bot'></i> Ask Aadhi
                            </button>
                        </div>
                    </div>
                `;
                subjectsResultsGrid.appendChild(card);
            });
        } catch (err) {
            console.error('Failed to load curriculum courses:', err);
            subjectsResultsGrid.innerHTML = `
                <div class="col-span-3" style="text-align:center; padding: 40px; color: #ef4444;">
                    <p>Failed to load courses. Please check connection.</p>
                </div>
            `;
        }
    };

    // Curriculum Modal Open
    window.openCurriculumModal = async (courseId) => {
        if (!curriculumModal) return;
        curriculumModal.style.display = 'flex';
        document.body.classList.add('modal-open');

        const modalBody = document.getElementById('curriculumModalBody');
        if (modalBody) {
            modalBody.style.opacity = '0.5';
        }

        try {
            const res = await apiFetch(`/subjects/${courseId}/curriculum`);
            if (!res || !res.success || !res.data) {
                showToast('Failed to load course curriculum dossier', 'error');
                return;
            }

            const c = res.data;
            activeModalCourse = c;

            // Header tags
            const cCode = document.getElementById('cModalCode');
            const cDept = document.getElementById('cModalDept');
            const cCredits = document.getElementById('cModalCredits');
            const cPinStatus = document.getElementById('cModalPinStatus');
            const cPinBtn = document.getElementById('cModalPinBtn');

            if (cCode) cCode.textContent = c.code;
            if (cDept) cDept.textContent = c.department;
            if (cCredits) cCredits.textContent = `${c.credits} Credits`;
            if (cPinStatus) cPinStatus.style.display = c.is_enrolled ? 'inline-flex' : 'none';
            if (cPinBtn) {
                cPinBtn.innerHTML = c.is_enrolled ? `<i class='bx bxs-pin'></i> Unpin Course` : `<i class='bx bx-pin'></i> Pin Course`;
                cPinBtn.classList.toggle('active-pin', c.is_enrolled);
            }

            // Titles
            const cTitle = document.getElementById('cModalTitle');
            const cSub = document.getElementById('cModalSubtitle');
            if (cTitle) cTitle.textContent = c.name;
            if (cSub) cSub.textContent = `${c.code} • 5 Units • ${c.department} Department`;

            // 5 Units Roadmap - Clean Unit-Wise Blocks
            const unitsContainer = document.getElementById('cModalUnitsContainer');
            if (unitsContainer) {
                unitsContainer.innerHTML = '';
                (c.units || []).forEach(unit => {
                    const uCard = document.createElement('div');
                    uCard.className = 'c-unit-card glass-panel';
                    
                    const topicPillsHtml = (unit.topics || []).map(t => `<span class="unit-topic-pill">${escapeHtml(t)}</span>`).join('');

                    // Check for verified notes for this unit
                    let downloadBtnsHtml = '';
                    if (unit.notes && unit.notes.length > 0) {
                        downloadBtnsHtml = unit.notes.map(n => `
                            <button class="btn-glass u-download-btn" onclick="window.open('${escapeHtml(n.file_url)}', '_blank')" title="Download verified unit note">
                                <i class='bx bx-download'></i> Download Note
                            </button>
                        `).join('');
                    }

                    uCard.innerHTML = `
                        <div class="c-unit-header">
                            <div class="u-number-box">Unit ${unit.unit_number}</div>
                            <div class="u-title-box">
                                <h4>${escapeHtml(unit.title)}</h4>
                            </div>
                            <div class="u-unit-actions">
                                <button class="btn-gradient u-aadhi-btn" onclick="window.launchAadhiOnUnit('${escapeHtml(c.code)}', '${escapeHtml(c.name)}', ${unit.unit_number}, '${escapeHtml(unit.title)}')">
                                    <i class='bx bx-bot'></i> Ask Aadhi
                                </button>
                                ${downloadBtnsHtml}
                            </div>
                        </div>
                        <div class="c-unit-topics-box">
                            <div class="topics-pills-wrap">${topicPillsHtml}</div>
                        </div>
                    `;
                    unitsContainer.appendChild(uCard);
                });
            }

            if (modalBody) modalBody.style.opacity = '1';
        } catch (err) {
            console.error('Curriculum modal load error:', err);
            showToast('Error loading curriculum', 'error');
        }
    };

    // Close modal
    window.closeCurriculumModal = () => {
        if (curriculumModal) curriculumModal.style.display = 'none';
        document.body.classList.remove('modal-open');
        activeModalCourse = null;
    };
    if (closeCurriculumModalBtn) closeCurriculumModalBtn.addEventListener('click', window.closeCurriculumModal);

    // Toggle Enrollment
    window.toggleCourseEnrollment = async (courseId, btnElement) => {
        try {
            const res = await apiFetch(`/subjects/${courseId}/enroll`, { method: 'POST' });
            if (res && res.success) {
                showToast(res.message, res.is_enrolled ? 'success' : 'info');
                curriculumState.enrolledCredits = res.total_credits || 0;
                if (curriculumEnrolledCreditsVal) {
                    curriculumEnrolledCreditsVal.textContent = `${res.total_credits || 0} Credits`;
                }

                // If modal is open for this course, sync modal state
                if (activeModalCourse && activeModalCourse.id === courseId) {
                    activeModalCourse.is_enrolled = res.is_enrolled;
                    const cPinStatus = document.getElementById('cModalPinStatus');
                    const cPinBtn = document.getElementById('cModalPinBtn');
                    if (cPinStatus) cPinStatus.style.display = res.is_enrolled ? 'inline-flex' : 'none';
                    if (cPinBtn) {
                        cPinBtn.innerHTML = res.is_enrolled ? `<i class='bx bxs-pin'></i> Unpin Course` : `<i class='bx bx-pin'></i> Pin Course`;
                        cPinBtn.classList.toggle('active-pin', res.is_enrolled);
                    }
                }

                // Re-render grid to update card pin state
                renderSubjects();
            } else {
                showToast(res && res.message ? res.message : 'Unable to update enrollment', 'error');
            }
        } catch (e) {
            console.error('Enrollment toggle error:', e);
            showToast('Enrollment action failed', 'error');
        }
    };

    if (cModalPinBtn) {
        cModalPinBtn.addEventListener('click', () => {
            if (activeModalCourse) window.toggleCourseEnrollment(activeModalCourse.id, cModalPinBtn);
        });
    }

    // Launch Aadhi on Unit
    window.launchAadhiOnUnit = (code, name, unitNum, unitTitle) => {
        window.closeCurriculumModal();
        window.openAadhiTutor({
            mode: 'explain',
            subject: `${code}: ${name}`,
            topic: `Unit ${unitNum}: ${unitTitle}`,
            initialPrompt: `I am preparing for ${code} (${name}), specifically Unit ${unitNum}: ${unitTitle}. Can you break down the most essential concepts, formulas, and typical exam questions?`
        });
    };

    // Filter Listeners
    // 1. Stream Tabs
    const streamTabs = document.querySelectorAll('#curriculumStreamTabs .stream-tab-btn');
    streamTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            streamTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            curriculumState.stream = tab.getAttribute('data-stream');
            renderSubjects();
        });
    });

    // 2. Department Pills
    const deptPills = document.querySelectorAll('#curriculumDeptPills .filter-pill');
    deptPills.forEach(pill => {
        pill.addEventListener('click', () => {
            deptPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            curriculumState.department = pill.getAttribute('data-dept');
            renderSubjects();
        });
    });

    // 3. Semester Pills
    const semPills = document.querySelectorAll('#curriculumSemPills .filter-pill');
    semPills.forEach(pill => {
        pill.addEventListener('click', () => {
            semPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            curriculumState.semester = pill.getAttribute('data-sem');
            renderSubjects();
        });
    });

    // 4. "My Semester Courses" Enrolled Toggle Button
    if (filterEnrolledToggleBtn) {
        filterEnrolledToggleBtn.addEventListener('click', () => {
            curriculumState.enrolledOnly = !curriculumState.enrolledOnly;
            filterEnrolledToggleBtn.classList.toggle('active-enrolled-toggle', curriculumState.enrolledOnly);
            filterEnrolledToggleBtn.innerHTML = curriculumState.enrolledOnly ? `<i class='bx bxs-pin'></i> All Courses` : `<i class='bx bx-pin'></i> My Semester Courses`;
            renderSubjects();
        });
    }

    // 5. Search Input
    let searchDebounceTimer = null;
    if (subjectSearchInput) {
        subjectSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                curriculumState.searchQuery = e.target.value.trim();
                renderSubjects();
            }, 250);
        });
    }

    // 6. Reset Filters
    window.resetCurriculumFilters = () => {
        curriculumState.stream = 'autonomous_2023';
        curriculumState.department = 'all';
        curriculumState.semester = 'all';
        curriculumState.enrolledOnly = false;
        curriculumState.searchQuery = '';

        if (subjectSearchInput) subjectSearchInput.value = '';
        if (filterEnrolledToggleBtn) {
            filterEnrolledToggleBtn.classList.remove('active-enrolled-toggle');
            filterEnrolledToggleBtn.innerHTML = `<i class='bx bx-pin'></i> My Semester Courses`;
        }

        streamTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-stream') === 'autonomous_2023'));
        deptPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-dept') === 'all'));
        semPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-sem') === 'all'));

        renderSubjects();
    };
    if (resetCurriculumFiltersBtn) resetCurriculumFiltersBtn.addEventListener('click', window.resetCurriculumFilters);

    // Initial load of enrolled credits
    loadEnrolledCredits();

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

    // ── AI Learning Analytics & Progress Dashboard (Notezilla 2.0 Upgrade) ──
    let currentLearningAnalytics = null;

    const renderProgress = async () => {
        const historyList = document.getElementById('progress-history-list');
        if (!historyList) return;

        try {
            // Parallel fetch: AI Learning Analytics graph, recent activity, and progress stats
            const [analyticsRes, activityResponse, statsResponse] = await Promise.all([
                apiFetch('/user/analytics/learning-graph'),
                apiFetch('/user/activity'),
                apiFetch('/user/progress')
            ]);

            if (activityResponse.success) completedWork = activityResponse.data || [];
            if (statsResponse.success) applyProductivityStats(statsResponse.data);
            updateStudyProgress();

            if (analyticsRes && analyticsRes.success && analyticsRes.data) {
                currentLearningAnalytics = analyticsRes.data;
                applyLearningAnalytics(analyticsRes.data);
            }

            // Preserved chronological activity feed
            historyList.innerHTML = completedWork.length === 0 
                ? '<div style="text-align:center; padding: 40px; color:var(--text-muted);">No study activity in the last 30 days.</div>'
                : completedWork.map(item => `
                    <div class="notif-item" style="padding: 16px 24px; border-bottom: 1px solid var(--border-light);">
                        <div class="notif-icon"><i class='bx ${item.action_type === 'task' ? 'bx-check-double' : item.action_type === 'planner' ? 'bx-calendar-heart' : item.action_type === 'mastery' ? 'bx-pulse' : 'bx-book-reader'}'></i></div>
                        <div class="notif-text">
                            <h4>${escapeHtml(item.title)}</h4>
                            <p>${escapeHtml(item.description || (item.action_type === 'task' ? 'Completed task' : item.action_type === 'planner' ? 'Study session finished' : 'Studied a note'))}</p>
                            <span>${new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                    </div>
                `).join('');
        } catch (err) {
            console.error('Learning analytics render error:', err);
        }
    };

    /**
     * Bind all Analytics Data to UI (Radar, Heatmap, Weak Concepts, Watchlist, KPIs)
     */
    const applyLearningAnalytics = (data) => {
        const stats = data.stats || {};
        const profile = data.profile || {};

        // 1. KPI Cards
        const overallMastery = data.overall_mastery || 0;
        const overallValEl = document.getElementById('overallMasteryValue');
        const overallBarEl = document.getElementById('overallMasteryBar');
        const tierTagEl = document.getElementById('masteryTierTag');
        const masteryCountEl = document.getElementById('masteryCountMeta');

        if (overallValEl) overallValEl.textContent = `${overallMastery}%`;
        if (overallBarEl) overallBarEl.style.width = `${overallMastery}%`;
        if (tierTagEl) {
            if (overallMastery >= 80) {
                tierTagEl.textContent = 'Proficient';
                tierTagEl.style.background = 'rgba(16, 185, 129, 0.2)';
                tierTagEl.style.color = '#34d399';
            } else if (overallMastery >= 60) {
                tierTagEl.textContent = 'Developing';
                tierTagEl.style.background = 'rgba(99, 102, 241, 0.2)';
                tierTagEl.style.color = '#818cf8';
            } else {
                tierTagEl.textContent = 'Foundational';
                tierTagEl.style.background = 'rgba(239, 68, 68, 0.2)';
                tierTagEl.style.color = '#f87171';
            }
        }
        if (masteryCountEl) {
            masteryCountEl.textContent = `${stats.mastered_count || 0} of ${stats.total_topics || 0} topics mastered`;
        }

        // Profile KPI
        const targetCgpaEl = document.getElementById('targetCgpaDisplay');
        const paceTagEl = document.getElementById('studyPaceTag');
        const weeklyHoursEl = document.getElementById('weeklyHoursMeta');
        const learningStyleEl = document.getElementById('learningStyleMeta');

        if (targetCgpaEl) targetCgpaEl.textContent = parseFloat(profile.target_cgpa || 8.5).toFixed(2);
        if (paceTagEl) paceTagEl.textContent = (profile.study_pace || 'Balanced').charAt(0).toUpperCase() + (profile.study_pace || 'Balanced').slice(1);
        if (weeklyHoursEl) weeklyHoursEl.textContent = `${profile.weekly_study_hours || 12} hrs/week goal`;
        if (learningStyleEl) learningStyleEl.textContent = `${(profile.learning_style || 'Visual').charAt(0).toUpperCase() + (profile.learning_style || 'Visual').slice(1)} Learner`;

        // Activity KPI
        const activeDaysEl = document.getElementById('activeDaysCountDisplay');
        const activityActionsEl = document.getElementById('activityActionsMeta');
        if (activeDaysEl) activeDaysEl.textContent = stats.active_days_30 || 0;
        if (activityActionsEl) activityActionsEl.textContent = `${stats.total_study_actions || 0} total study actions`;

        // Weak Concepts KPI
        const weakCountEl = document.getElementById('weakTopicsCountDisplay');
        const decayMetaEl = document.getElementById('retentionDecayMeta');
        if (weakCountEl) weakCountEl.textContent = stats.weak_count || 0;
        if (decayMetaEl) decayMetaEl.textContent = `${(data.retention_alerts || []).length} retention decay alerts`;

        // 2. Render Knowledge Radar Chart (SVG)
        drawRadarChart(data.radar_data || []);

        // 3. Render 30-Day Activity Heatmap
        drawActivityHeatmap(data.activity_matrix || []);

        // 4. Render Weak Concept Recovery Cards
        renderWeakConcepts(data.weak_concepts || [], stats.total_topics || 0);

        // 5. Render Spaced Repetition Retention Watchlist
        renderRetentionWatchlist(data.retention_alerts || [], stats.total_topics || 0);
    };

    /**
     * Draw Interactive Dynamic SVG Knowledge Radar Chart
     */
    const drawRadarChart = (radarData) => {
        const svg = document.getElementById('radarSvg');
        const tooltip = document.getElementById('radarTooltip');
        const chipsContainer = document.getElementById('radarSubjectChips');
        if (!svg || !radarData || radarData.length === 0) return;

        svg.innerHTML = '';
        const cx = 220;
        const cy = 190;
        const R = 125;
        const numAxes = radarData.length;
        const angleStep = (2 * Math.PI) / numAxes;

        // SVG Defs: Gradients & Glow Filters
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <linearGradient id="radarPolyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6366f1" stop-opacity="0.45" />
                <stop offset="60%" stop-color="#a855f7" stop-opacity="0.30" />
                <stop offset="100%" stop-color="#ec4899" stop-opacity="0.15" />
            </linearGradient>
            <filter id="radarDotGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        `;
        svg.appendChild(defs);

        // Concentric Web Grid (5 levels: 20%, 40%, 60%, 80%, 100%)
        const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
        levels.forEach(lvl => {
            const webPoints = [];
            for (let i = 0; i < numAxes; i++) {
                const angle = i * angleStep - Math.PI / 2;
                const wx = cx + R * lvl * Math.cos(angle);
                const wy = cy + R * lvl * Math.sin(angle);
                webPoints.push(`${wx.toFixed(1)},${wy.toFixed(1)}`);
            }
            const webPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            webPoly.setAttribute('points', webPoints.join(' '));
            webPoly.setAttribute('fill', lvl === 1.0 ? 'rgba(255,255,255,0.015)' : 'none');
            webPoly.setAttribute('stroke', lvl === 1.0 ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.08)');
            webPoly.setAttribute('stroke-width', lvl === 1.0 ? '1.5' : '1');
            if (lvl < 1.0) webPoly.setAttribute('stroke-dasharray', '3,3');
            svg.appendChild(webPoly);
        });

        // Radiating Axis Lines & Axis Labels
        radarData.forEach((item, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const ax = cx + R * Math.cos(angle);
            const ay = cy + R * Math.sin(angle);

            // Axis line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', cx);
            line.setAttribute('y1', cy);
            line.setAttribute('x2', ax.toFixed(1));
            line.setAttribute('y2', ay.toFixed(1));
            line.setAttribute('stroke', 'rgba(255, 255, 255, 0.12)');
            line.setAttribute('stroke-width', '1');
            svg.appendChild(line);

            // Label
            const labelDist = R + 26;
            const lx = cx + labelDist * Math.cos(angle);
            const ly = cy + labelDist * Math.sin(angle);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', lx.toFixed(1));
            text.setAttribute('y', (ly + 4).toFixed(1));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#94a3b8');
            text.setAttribute('font-size', '11');
            text.setAttribute('font-weight', '500');

            // Format subject label for neat wrap
            const shortName = item.subject.length > 16 ? item.subject.slice(0, 14) + '..' : item.subject;
            text.textContent = shortName;
            svg.appendChild(text);
        });

        // Student Competency Polygon Points
        const polyPoints = [];
        const nodeCoordinates = [];
        radarData.forEach((item, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const rawMastery = typeof item.mastery === 'number' ? item.mastery : 0;
            // When mastery is 0, sit at minimal baseline circle (4% of radius) so unstudied state is visually honest
            const normalized = rawMastery <= 0 ? 0.04 : Math.max(10, Math.min(100, rawMastery)) / 100;
            const px = cx + R * normalized * Math.cos(angle);
            const py = cy + R * normalized * Math.sin(angle);
            polyPoints.push(`${px.toFixed(1)},${py.toFixed(1)}`);
            nodeCoordinates.push({ px, py, item, rawMastery });
        });

        // Fill Polygon
        const studentPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        studentPoly.setAttribute('points', polyPoints.join(' '));
        studentPoly.setAttribute('fill', 'url(#radarPolyGrad)');
        studentPoly.setAttribute('stroke', '#818cf8');
        studentPoly.setAttribute('stroke-width', '2.5');
        studentPoly.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(studentPoly);

        // Interactive Node Dots
        nodeCoordinates.forEach(({ px, py, item, rawMastery }) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', px.toFixed(1));
            circle.setAttribute('cy', py.toFixed(1));
            circle.setAttribute('r', '6');
            circle.setAttribute('fill', rawMastery === 0 ? '#64748b' : rawMastery >= 75 ? '#10b981' : rawMastery < 60 ? '#ef4444' : '#6366f1');
            circle.setAttribute('stroke', '#ffffff');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('filter', 'url(#radarDotGlow)');
            circle.style.cursor = 'pointer';
            circle.style.transition = 'transform 0.2s ease';

            circle.addEventListener('mouseenter', (e) => {
                circle.setAttribute('r', '8');
                if (tooltip) {
                    tooltip.innerHTML = `
                        <strong>${escapeHtml(item.subject)}</strong><br>
                        <span>Mastery: <strong>${rawMastery}%</strong></span><br>
                        <small style="color:#94a3b8;">${item.topic_count || 0} evaluated topic(s)</small>
                    `;
                    tooltip.style.display = 'block';
                    tooltip.style.left = `${px}px`;
                    tooltip.style.top = `${py}px`;
                }
            });

            circle.addEventListener('mouseleave', () => {
                circle.setAttribute('r', '6');
                if (tooltip) tooltip.style.display = 'none';
            });

            svg.appendChild(circle);
        });

        // Chips Breakdown
        if (chipsContainer) {
            chipsContainer.innerHTML = radarData.map(item => {
                const rawMastery = typeof item.mastery === 'number' ? item.mastery : 0;
                const tierClass = rawMastery === 0 ? 'zero' : rawMastery >= 75 ? 'high' : rawMastery >= 60 ? 'mid' : 'low';
                return `
                    <div class="radar-chip">
                        <strong>${escapeHtml(item.subject)}</strong>
                        <span class="chip-pct ${tierClass}">${rawMastery}%</span>
                    </div>
                `;
            }).join('');
        }
    };

    /**
     * Draw 30-Day Activity Heatmap Grid
     */
    const drawActivityHeatmap = (matrix) => {
        const grid = document.getElementById('heatmapDaysGrid');
        const tooltip = document.getElementById('heatmapTooltip');
        if (!grid || !matrix || matrix.length === 0) return;

        grid.innerHTML = '';
        let totalSessions = 0;
        let peakDay = { date: '', count: -1 };
        let currentStreak = 0;
        let countingStreak = true;

        matrix.forEach(dayItem => {
            totalSessions += (dayItem.count || 0);
            if (dayItem.count > peakDay.count) {
                peakDay = { date: dayItem.date, count: dayItem.count };
            }

            const cell = document.createElement('div');
            cell.className = `heatmap-day-cell level-${dayItem.level}`;
            cell.innerHTML = `
                <span class="cell-date-text">${dayItem.date.slice(8)}</span>
                <span class="cell-count-text">${dayItem.count > 0 ? dayItem.count : ''}</span>
            `;

            cell.addEventListener('mouseenter', (e) => {
                if (tooltip) {
                    const rect = cell.getBoundingClientRect();
                    const parentRect = grid.parentElement.getBoundingClientRect();
                    tooltip.innerHTML = `
                        <strong>${dayItem.day_name}, ${dayItem.date}</strong><br>
                        <span>${dayItem.count} study action(s) logged</span>
                    `;
                    tooltip.style.display = 'block';
                    tooltip.style.left = `${rect.left - parentRect.left + rect.width / 2}px`;
                    tooltip.style.top = `${rect.top - parentRect.top}px`;
                }
            });

            cell.addEventListener('mouseleave', () => {
                if (tooltip) tooltip.style.display = 'none';
            });

            grid.appendChild(cell);
        });

        // Compute streak from latest days backwards
        for (let j = matrix.length - 1; j >= 0; j--) {
            if (matrix[j].count > 0 && countingStreak) {
                currentStreak++;
            } else if (countingStreak && j !== matrix.length - 1) {
                // If today is empty, don't break immediately if yesterday was active
                countingStreak = false;
            }
        }

        // Populate summary stats
        const streakNumEl = document.getElementById('hmStreakNum');
        const peakDayEl = document.getElementById('hmPeakDayNum');
        const totalSessionsEl = document.getElementById('hmTotalSessionsNum');

        if (streakNumEl) streakNumEl.textContent = currentStreak;
        if (peakDayEl) peakDayEl.textContent = peakDay.count > 0 ? `${peakDay.date.slice(5)} (${peakDay.count})` : 'None';
        if (totalSessionsEl) totalSessionsEl.textContent = totalSessions;
    };

    /**
     * Render AI Weak Concept Diagnostics & Remedial Action Plans
     */
    const renderWeakConcepts = (weakList, totalAssessedTopics = 0) => {
        const container = document.getElementById('weakConceptsList');
        if (!container) return;

        if (totalAssessedTopics === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 28px; background: rgba(99, 102, 241, 0.08); border: 1px dashed rgba(99, 102, 241, 0.25); border-radius: 14px; color: #a5b4fc;">
                    <i class='bx bx-compass' style='font-size: 32px;'></i>
                    <h4 style="margin-top: 8px; font-weight: 700; color: #e0e7ff;">Ready for Your First Study Session</h4>
                    <p style="font-size: 13px; color: #cbd5e1; margin-top: 4px; max-width: 500px; margin-left: auto; margin-right: auto;">
                        Your knowledge graph builds organically as you study notes, complete self-assessments, and review concepts. Select any curriculum subject to begin!
                    </p>
                </div>
            `;
            return;
        }

        if (weakList.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 28px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 14px; color: #34d399;">
                    <i class='bx bx-check-shield' style='font-size: 32px;'></i>
                    <h4 style="margin-top: 8px; font-weight: 700;">Outstanding Academic Performance!</h4>
                    <p style="font-size: 13px; color: #a7f3d0; margin-top: 4px;">All assessed topics are above 60% proficiency. Keep up your daily streak!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = weakList.map(item => {
            const isCritical = item.mastery_level < 45;
            const badgeClass = isCritical ? 'critical' : 'review';
            const badgeLabel = isCritical ? 'Critical Attention' : 'Needs Review';
            const fillClass = isCritical ? 'low' : 'med';

            return `
                <div class="weak-concept-card">
                    <div>
                        <div class="w-card-header">
                            <div>
                                <span class="w-card-subject">${escapeHtml(item.subject_name)}</span>
                                <h4 class="w-card-title">${escapeHtml(item.topic_name)}</h4>
                            </div>
                            <span class="w-status-badge ${badgeClass}">${badgeLabel}</span>
                        </div>

                        <div class="w-mastery-row" style="margin-top: 12px;">
                            <div class="w-mastery-track">
                                <div class="w-mastery-fill ${fillClass}" style="width: ${item.mastery_level}%;"></div>
                            </div>
                            <span class="w-mastery-text">${item.mastery_level}%</span>
                        </div>

                        <div class="w-recommendation" style="margin-top: 10px;">
                            <i class='bx bx-bulb' style="color: #fbbf24; margin-right: 4px;"></i>
                            ${escapeHtml(item.recommended_action)}
                        </div>
                    </div>

                    <div class="w-card-actions">
                        <button class="w-btn-plan" onclick="window.openAIRecoveryModal('${escapeHtml(item.topic_name)}', '${escapeHtml(item.subject_name)}', ${item.mastery_level})">
                            <i class='bx bx-sparkles'></i> AI Plan
                        </button>
                        <button class="w-btn-tutor" style="padding: 7px 12px; border-radius: 8px; background: rgba(99,102,241,0.22); border: 1px solid rgba(99,102,241,0.4); color: #c7d2fe; cursor: pointer; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" onclick="window.openAadhiTutor({ mode: 'explain', subject: '${escapeHtml(item.subject_name)}', topic: '${escapeHtml(item.topic_name)}', initialPrompt: 'Explain ${escapeHtml(item.topic_name)} in ${escapeHtml(item.subject_name)} with an intuitive analogy.' })">
                            <i class='bx bx-microphone'></i> Voice Tutor
                        </button>
                        <button class="w-btn-test" onclick="window.openTopicTestModal('${item.id}', '${escapeHtml(item.topic_name)}', '${escapeHtml(item.subject_name)}', ${item.mastery_level})">
                            <i class='bx bx-check'></i> Test
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };

    /**
     * Render Spaced Repetition Retention Decay Watchlist
     */
    const renderRetentionWatchlist = (alerts, totalAssessedTopics = 0) => {
        const container = document.getElementById('retentionAlertsList');
        if (!container) return;

        if (totalAssessedTopics === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
                    <i class='bx bx-time-five' style="color: #818cf8; font-size: 18px; vertical-align: middle; margin-right: 6px;"></i>
                    Spaced repetition decay tracking activates as you review curriculum topics.
                </div>
            `;
            return;
        }

        if (alerts.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
                    <i class='bx bx-check-double' style="color: #10b981; font-size: 18px; vertical-align: middle; margin-right: 6px;"></i>
                    All reviewed topics are within healthy retention intervals (under 12 days since last session).
                </div>
            `;
            return;
        }

        container.innerHTML = alerts.map(alert => `
            <div class="retention-card">
                <div class="retention-info">
                    <h4>${escapeHtml(alert.topic_name)}</h4>
                    <p><i class='bx bx-time-five'></i> Last reviewed ${alert.days_since_review} days ago (${alert.urgency} Decay Risk)</p>
                </div>
                <button class="retention-btn" onclick="window.openTopicTestModal('${alert.id}', '${escapeHtml(alert.topic_name)}', '${escapeHtml(alert.subject_name || 'Core')}', 60)">
                    <i class='bx bx-refresh'></i> Refresh
                </button>
            </div>
        `).join('');
    };

    /**
     * Global Window Modal Handlers
     */
    window.openAIRecoveryModal = async (topicName, subjectName, masteryLevel) => {
        const modal = document.getElementById('aiRecoveryModal');
        const content = document.getElementById('recoveryModalContent');
        if (!modal || !content) return;

        modal.style.display = 'flex';
        content.innerHTML = `
            <div class="loading-spinner-box">
                <div class="spinner"></div>
                <p>Generating personalized recovery plan with Gemini AI...</p>
                <small style="color:var(--text-muted);">Formulating intuitive mental models & micro practice drills</small>
            </div>
        `;

        try {
            const res = await apiFetch('/user/analytics/recovery-plan', {
                method: 'POST',
                body: JSON.stringify({
                    topic_name: topicName,
                    subject_name: subjectName,
                    mastery_level: masteryLevel
                })
            });

            if (res.success && res.data) {
                const plan = res.data;
                content.innerHTML = `
                    <div class="ai-plan-container">
                        <div class="ai-plan-topic-banner">
                            <h3><i class='bx bx-book-open'></i> ${escapeHtml(plan.topic)}</h3>
                            <p class="ai-plan-diagnostic">${escapeHtml(plan.diagnostic_reason || '')}</p>
                        </div>

                        ${(plan.recovery_steps || []).map(s => `
                            <div class="ai-step-card">
                                <div class="ai-step-num">${s.step}</div>
                                <div class="ai-step-body">
                                    <h4>${escapeHtml(s.title)}</h4>
                                    <p>${escapeHtml(s.action)}</p>
                                </div>
                            </div>
                        `).join('')}

                        ${plan.retention_tip ? `
                            <div class="ai-retention-tip">
                                <strong><i class='bx bxs-bulb'></i> Memory Retention Rule:</strong> ${escapeHtml(plan.retention_tip)}
                            </div>
                        ` : ''}

                        <div class="modal-actions-row" style="margin-top: 14px; display: flex; gap: 10px; justify-content: flex-end;">
                            <button type="button" class="btn-gradient" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);" onclick="document.getElementById('aiRecoveryModal').style.display='none'; window.openAadhiTutor({ mode: 'explain', subject: '${escapeHtml(subjectName)}', topic: '${escapeHtml(topicName)}', initialPrompt: 'Explain ${escapeHtml(topicName)} in ${escapeHtml(subjectName)} step by step.' })">
                                <i class='bx bx-microphone'></i> Study with Voice Tutor
                            </button>
                            <button type="button" class="btn-gradient" onclick="document.getElementById('aiRecoveryModal').style.display='none'">
                                <i class='bx bx-check'></i> Got It
                            </button>
                        </div>
                    </div>
                `;
            } else {
                content.innerHTML = `<div style="color:#f87171; padding: 20px; text-align:center;">Failed to generate recovery plan: ${escapeHtml(res.message || 'Unknown error')}</div>`;
            }
        } catch (e) {
            content.innerHTML = `<div style="color:#f87171; padding: 20px; text-align:center;">Error calling AI engine: ${escapeHtml(e.message)}</div>`;
        }
    };

    window.openTopicTestModal = (topicId, topicName, subjectName, currentMastery) => {
        const modal = document.getElementById('topicTestModal');
        if (!modal) return;

        document.getElementById('testTopicId').value = topicId || '';
        document.getElementById('testTopicNameHeading').textContent = topicName || 'Academic Concept';
        document.getElementById('testTopicSubjectHeading').textContent = subjectName || 'Curriculum Subject';
        const slider = document.getElementById('testMasteryScoreSlider');
        const scoreVal = document.getElementById('sliderScoreVal');
        const statusSelect = document.getElementById('testTopicStatusSelect');

        if (slider) slider.value = currentMastery || 70;
        if (scoreVal) scoreVal.textContent = `${currentMastery || 70}%`;
        if (statusSelect) {
            statusSelect.value = (currentMastery >= 80) ? 'mastered' : (currentMastery < 60) ? 'review_needed' : 'learning';
        }

        modal.style.display = 'flex';
    };

    // Modal Close & Form Event Bindings
    const closeRecoveryBtn = document.getElementById('closeRecoveryModalBtn');
    if (closeRecoveryBtn) {
        closeRecoveryBtn.addEventListener('click', () => {
            document.getElementById('aiRecoveryModal').style.display = 'none';
        });
    }

    const closeProfileBtn = document.getElementById('closeProfileModalBtn');
    const cancelProfileBtn = document.getElementById('cancelProfileModalBtn');
    if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => document.getElementById('learningProfileModal').style.display = 'none');
    if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', () => document.getElementById('learningProfileModal').style.display = 'none');

    const editProfileBtn = document.getElementById('editLearningProfileBtn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            const modal = document.getElementById('learningProfileModal');
            if (!modal) return;
            const profile = currentLearningAnalytics?.profile || {};
            const cgpaInput = document.getElementById('profileTargetCgpa');
            const paceSelect = document.getElementById('profileStudyPace');
            const hoursInput = document.getElementById('profileWeeklyHours');
            const styleSelect = document.getElementById('profileLearningStyle');

            if (cgpaInput) cgpaInput.value = profile.target_cgpa || 8.50;
            if (paceSelect) paceSelect.value = profile.study_pace || 'balanced';
            if (hoursInput) hoursInput.value = profile.weekly_study_hours || 12;
            if (styleSelect) styleSelect.value = profile.learning_style || 'visual';

            modal.style.display = 'flex';
        });
    }

    const learningProfileForm = document.getElementById('learningProfileForm');
    if (learningProfileForm) {
        learningProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const target_cgpa = document.getElementById('profileTargetCgpa').value;
            const study_pace = document.getElementById('profileStudyPace').value;
            const weekly_study_hours = document.getElementById('profileWeeklyHours').value;
            const learning_style = document.getElementById('profileLearningStyle').value;

            const res = await apiFetch('/user/analytics/profile', {
                method: 'PUT',
                body: JSON.stringify({ target_cgpa, study_pace, weekly_study_hours, learning_style })
            });

            if (res.success) {
                document.getElementById('learningProfileModal').style.display = 'none';
                await renderProgress();
            } else {
                alert('Failed to save profile: ' + (res.message || 'Unknown error'));
            }
        });
    }

    const testSlider = document.getElementById('testMasteryScoreSlider');
    const sliderValDisplay = document.getElementById('sliderScoreVal');
    if (testSlider && sliderValDisplay) {
        testSlider.addEventListener('input', (e) => {
            sliderValDisplay.textContent = `${e.target.value}%`;
            const statusSelect = document.getElementById('testTopicStatusSelect');
            if (statusSelect) {
                const val = parseInt(e.target.value);
                statusSelect.value = val >= 80 ? 'mastered' : val < 60 ? 'review_needed' : 'learning';
            }
        });
    }

    const closeTestBtn = document.getElementById('closeTestModalBtn');
    const cancelTestBtn = document.getElementById('cancelTestModalBtn');
    if (closeTestBtn) closeTestBtn.addEventListener('click', () => document.getElementById('topicTestModal').style.display = 'none');
    if (cancelTestBtn) cancelTestBtn.addEventListener('click', () => document.getElementById('topicTestModal').style.display = 'none');

    const topicTestForm = document.getElementById('topicTestForm');
    if (topicTestForm) {
        topicTestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const topic_id = document.getElementById('testTopicId').value;
            const mastery_level = document.getElementById('testMasteryScoreSlider').value;
            const status = document.getElementById('testTopicStatusSelect').value;

            const res = await apiFetch('/user/analytics/mastery-update', {
                method: 'POST',
                body: JSON.stringify({ topic_id, mastery_level, status })
            });

            if (res.success) {
                document.getElementById('topicTestModal').style.display = 'none';
                await renderProgress();
            } else {
                alert('Failed to update topic mastery: ' + (res.message || 'Unknown error'));
            }
        });
    }

    const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
    if (refreshAnalyticsBtn) {
        refreshAnalyticsBtn.addEventListener('click', async () => {
            refreshAnalyticsBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Syncing...";
            await renderProgress();
            refreshAnalyticsBtn.innerHTML = "<i class='bx bx-refresh'></i> Sync Analytics";
        });
    }

    // Real-time socket listener for learning graph updates
    if (typeof socket !== 'undefined' && socket) {
        socket.on('learning_graph_updated', () => {
            renderProgress();
        });
    }


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

    // 6. Aadhi AI Academic Voice & Text Tutor (Phase 2 Upgrade)
    const chatToggle = document.getElementById('chatToggle');
    const chatbotWindow = document.getElementById('chatbotWindow');
    const chatClose = document.getElementById('chatClose');
    const chatBody = document.getElementById('chatBody');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    const chatMicBtn = document.getElementById('chatMicBtn');
    const chatAudioToggleBtn = document.getElementById('chatAudioToggleBtn');
    const chatAudioIcon = document.getElementById('chatAudioIcon');
    const chatVoiceFocusBtn = document.getElementById('chatVoiceFocusBtn');
    const aadhiStatusDot = document.getElementById('aadhiStatusDot');
    const aadhiModeBadge = document.getElementById('aadhiModeBadge');
    const aadhiSubStatus = document.getElementById('aadhiSubStatus');
    const aadhiVoiceWaveContainer = document.getElementById('aadhiVoiceWaveContainer');
    const voiceWaveStatusText = document.getElementById('voiceWaveStatusText');
    const voiceWaveStopBtn = document.getElementById('voiceWaveStopBtn');
    const chatSmartChips = document.getElementById('chatSmartChips');
    const tutorModesBar = document.getElementById('tutorModesBar');

    // Voice Focus Modal Elements
    const aadhiVoiceFocusModal = document.getElementById('aadhiVoiceFocusModal');
    const closeVoiceFocusModal = document.getElementById('closeVoiceFocusModal');
    const voiceOrbWrapper = document.getElementById('voiceOrbWrapper');
    const voiceFocusStateBadge = document.getElementById('voiceFocusStateBadge');
    const vfUserText = document.getElementById('vfUserText');
    const vfAadhiText = document.getElementById('vfAadhiText');
    const vfMainMicBtn = document.getElementById('vfMainMicBtn');
    const vfMicHintText = document.getElementById('vfMicHintText');
    const vfQuickPrompts = document.getElementById('vfQuickPrompts');

    // State Variables
    let activeTutorMode = 'explain';
    let autoSpeakEnabled = localStorage.getItem('notezilla_aadhi_autospeak') !== 'false';
    let isListening = false;
    let isSpeaking = false;
    let activeUtterance = null;
    let currentAcademicContext = { subject_name: '', subject_code: '', note_title: '', topic_name: '' };

    // Initial Audio Toggle UI Sync
    if (chatAudioToggleBtn && chatAudioIcon) {
        if (!autoSpeakEnabled) {
            chatAudioToggleBtn.classList.remove('active');
            chatAudioIcon.className = 'bx bx-volume-mute';
        }
    }

    // Toggle Chatbot Window
    if (chatToggle && chatbotWindow) {
        chatToggle.onclick = () => {
            chatbotWindow.classList.toggle('active');
            if (chatbotWindow.classList.contains('active')) {
                chatInput && chatInput.focus();
            }
        };
    }

    if (chatClose && chatbotWindow) {
        chatClose.onclick = () => {
            stopAadhiSpeech();
            stopVoiceRecognition();
            chatbotWindow.classList.remove('active');
        };
    }

    // Auto-Speak Toggle
    if (chatAudioToggleBtn && chatAudioIcon) {
        chatAudioToggleBtn.onclick = () => {
            autoSpeakEnabled = !autoSpeakEnabled;
            localStorage.setItem('notezilla_aadhi_autospeak', autoSpeakEnabled ? 'true' : 'false');
            chatAudioToggleBtn.classList.toggle('active', autoSpeakEnabled);
            chatAudioIcon.className = autoSpeakEnabled ? 'bx bx-volume-full' : 'bx bx-volume-mute';
            if (!autoSpeakEnabled) stopAadhiSpeech();
            showToast(autoSpeakEnabled ? 'Voice output enabled' : 'Voice output muted', 'info');
        };
    }

    // Maximize / Restore Aadhi Tutor (Voice + Text Typing)
    const toggleMaximizeAadhi = () => {
        if (!chatbotWindow) return;
        if (!chatbotWindow.classList.contains('active')) {
            chatbotWindow.classList.add('active');
        }
        const isMax = chatbotWindow.classList.toggle('maximized');
        const icon = document.getElementById('chatMaximizeIcon');
        const backdrop = document.getElementById('chatbotBackdrop');
        if (icon) {
            icon.className = isMax ? 'bx bx-collapse-alt' : 'bx bx-expand-alt';
        }
        if (backdrop) {
            backdrop.style.display = isMax ? 'block' : 'none';
        }
        document.body.classList.toggle('aadhi-maximized-open', isMax);
        if (isMax && chatInput) {
            setTimeout(() => chatInput.focus(), 100);
        }
    };

    if (chatVoiceFocusBtn) {
        chatVoiceFocusBtn.onclick = toggleMaximizeAadhi;
    }

    const chatbotBackdrop = document.getElementById('chatbotBackdrop');
    if (chatbotBackdrop) {
        chatbotBackdrop.onclick = () => {
            if (chatbotWindow && chatbotWindow.classList.contains('maximized')) {
                toggleMaximizeAadhi();
            }
        };
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (chatbotWindow && chatbotWindow.classList.contains('maximized')) {
                toggleMaximizeAadhi();
            }
        }
    });

    if (closeVoiceFocusModal && aadhiVoiceFocusModal) {
        closeVoiceFocusModal.onclick = () => {
            stopAadhiSpeech();
            stopVoiceRecognition();
            aadhiVoiceFocusModal.style.display = 'none';
        };
    }

    // Integrated Typing Input inside Focus Modal
    const vfTextInput = document.getElementById('vfTextInput');
    const vfTextSend = document.getElementById('vfTextSend');
    if (vfTextSend && vfTextInput) {
        vfTextSend.onclick = () => {
            const val = vfTextInput.value.trim();
            if (val) {
                handleSendMessage(val);
                vfTextInput.value = '';
            }
        };
        vfTextInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = vfTextInput.value.trim();
                if (val) {
                    handleSendMessage(val);
                    vfTextInput.value = '';
                }
            }
        });
    }

    // Status Helper
    const setTutorStatus = (status, text) => {
        if (aadhiStatusDot) {
            aadhiStatusDot.className = `aadhi-status-dot ${status}`;
        }
        if (aadhiSubStatus) {
            aadhiSubStatus.textContent = text || (status === 'listening' ? 'Listening to voice...' : status === 'thinking' ? 'Synthesizing lesson...' : status === 'speaking' ? 'Explaining verbally...' : 'Ready to teach • Voice & Text');
        }
        if (voiceOrbWrapper) {
            voiceOrbWrapper.className = `voice-orb-wrapper ${status}`;
        }
        if (voiceFocusStateBadge) {
            const labelMap = {
                idle: '<span class="pulse-dot"></span> Ready to Listen & Chat',
                listening: '<span class="pulse-dot" style="background:#ef4444;"></span> Listening to your voice...',
                thinking: '<span class="pulse-dot" style="background:#f59e0b;"></span> Formulating explanation...',
                speaking: '<span class="pulse-dot" style="background:#10b981;"></span> Aadhi Speaking...'
            };
            voiceFocusStateBadge.innerHTML = labelMap[status] || labelMap.idle;
        }
    };

    // ==================== SPEECH SYNTHESIS (TTS) ====================
    let selectedVoice = null;
    const initSpeechVoices = () => {
        if (!('speechSynthesis' in window)) return;
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;
        // Prioritize natural English accents (Indian English, UK, or Natural US)
        selectedVoice = voices.find(v => v.lang === 'en-IN' || v.name.toLowerCase().includes('india'))
            || voices.find(v => v.name.includes('Google UK English Female') || v.name.includes('Samantha') || v.name.includes('Natural'))
            || voices.find(v => v.lang.startsWith('en'))
            || voices[0];
    };

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = initSpeechVoices;
        initSpeechVoices();
    }

    const speakAadhiResponse = (text, activeBtn = null) => {
        if (!('speechSynthesis' in window) || !text) return;

        stopAadhiSpeech();

        activeUtterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) activeUtterance.voice = selectedVoice;
        activeUtterance.rate = 1.04;
        activeUtterance.pitch = 1.0;

        activeUtterance.onstart = () => {
            isSpeaking = true;
            setTutorStatus('speaking');
            if (aadhiVoiceWaveContainer) {
                aadhiVoiceWaveContainer.style.display = 'flex';
                if (voiceWaveStatusText) voiceWaveStatusText.textContent = 'Aadhi is explaining verbally...';
            }
            if (activeBtn) {
                activeBtn.classList.add('speaking');
                activeBtn.innerHTML = "<i class='bx bx-volume-full bx-flashing'></i> Playing...";
            }
        };

        activeUtterance.onend = () => {
            isSpeaking = false;
            setTutorStatus('idle');
            if (aadhiVoiceWaveContainer) aadhiVoiceWaveContainer.style.display = 'none';
            if (activeBtn) {
                activeBtn.classList.remove('speaking');
                activeBtn.innerHTML = "<i class='bx bx-volume-full'></i> Listen";
            }
        };

        activeUtterance.onerror = () => {
            isSpeaking = false;
            setTutorStatus('idle');
            if (aadhiVoiceWaveContainer) aadhiVoiceWaveContainer.style.display = 'none';
            if (activeBtn) {
                activeBtn.classList.remove('speaking');
                activeBtn.innerHTML = "<i class='bx bx-volume-full'></i> Listen";
            }
        };

        window.speechSynthesis.speak(activeUtterance);
    };

    const stopAadhiSpeech = () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        isSpeaking = false;
        if (aadhiVoiceWaveContainer && !isListening) {
            aadhiVoiceWaveContainer.style.display = 'none';
        }
        document.querySelectorAll('.msg-listen-btn.speaking').forEach(btn => {
            btn.classList.remove('speaking');
            btn.innerHTML = "<i class='bx bx-volume-full'></i> Listen";
        });
        setTutorStatus('idle');
    };

    if (voiceWaveStopBtn) {
        voiceWaveStopBtn.onclick = () => {
            stopAadhiSpeech();
            stopVoiceRecognition();
        };
    }

    // Listen Button Click in Chat Messages (Event Delegation)
    if (chatBody) {
        chatBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.msg-listen-btn');
            if (btn) {
                const msgBox = btn.closest('.chat-msg.bot');
                const speechText = msgBox?.dataset?.speech;
                if (btn.classList.contains('speaking')) {
                    stopAadhiSpeech();
                } else if (speechText) {
                    speakAadhiResponse(speechText, btn);
                }
            }
        });
    }

    // ==================== SPEECH RECOGNITION (STT) ====================
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        try {
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isListening = true;
                stopAadhiSpeech();
                setTutorStatus('listening');
                if (chatMicBtn) chatMicBtn.classList.add('listening');
                if (vfMainMicBtn) vfMainMicBtn.classList.add('listening');
                if (vfMicHintText) vfMicHintText.textContent = 'Listening to your voice... Speak clearly.';
                if (aadhiVoiceWaveContainer) {
                    aadhiVoiceWaveContainer.style.display = 'flex';
                    if (voiceWaveStatusText) voiceWaveStatusText.textContent = 'Listening to your voice...';
                }
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                const currentText = finalTranscript || interimTranscript;
                if (chatInput) chatInput.value = currentText;
                if (vfUserText) vfUserText.textContent = `"${currentText}"`;
            };

            recognition.onspeechend = () => {
                stopVoiceRecognition();
                const spokenText = chatInput?.value?.trim();
                if (spokenText) {
                    handleSendMessage(spokenText, true);
                }
            };

            recognition.onerror = (event) => {
                console.warn('Speech recognition notice:', event.error);
                stopVoiceRecognition();
                if (event.error === 'not-allowed') {
                    showToast('Microphone access blocked. Please enable permissions.', 'error');
                }
            };

            recognition.onend = () => {
                stopVoiceRecognition();
            };
        } catch (recErr) {
            console.warn('Web Speech Recognition init note:', recErr);
        }
    }

    const startVoiceRecognition = () => {
        if (!recognition) {
            showToast('Voice input is not supported in this browser. Try Chrome or Edge.', 'warning');
            return;
        }
        try {
            recognition.start();
        } catch (_) {
            recognition.stop();
        }
    };

    const stopVoiceRecognition = () => {
        isListening = false;
        if (chatMicBtn) chatMicBtn.classList.remove('listening');
        if (vfMainMicBtn) vfMainMicBtn.classList.remove('listening');
        if (vfMicHintText) vfMicHintText.textContent = 'Click microphone to speak';
        if (aadhiVoiceWaveContainer && !isSpeaking) {
            aadhiVoiceWaveContainer.style.display = 'none';
        }
        if (!isSpeaking) setTutorStatus('idle');
        try {
            if (recognition) recognition.stop();
        } catch (_) {}
    };

    if (chatMicBtn) {
        chatMicBtn.onclick = () => {
            if (isListening) stopVoiceRecognition();
            else startVoiceRecognition();
        };
    }

    if (vfMainMicBtn) {
        vfMainMicBtn.onclick = () => {
            if (isListening) stopVoiceRecognition();
            else startVoiceRecognition();
        };
    }

    // ==================== SEND MESSAGE CONTROLLER ====================
    async function handleSendMessage(customMsg = null, fromVoice = false) {
        const msg = (customMsg || chatInput?.value || '').trim();
        if (!msg) return;

        stopAadhiSpeech();

        // Add user message to thread
        const userMsgEl = document.createElement('div');
        userMsgEl.className = 'chat-msg user';
        userMsgEl.textContent = msg;
        chatBody.appendChild(userMsgEl);

        if (chatInput) chatInput.value = '';
        chatBody.scrollTop = chatBody.scrollHeight;

        // Update Voice Focus modal if active
        if (vfUserText) vfUserText.textContent = `"${msg}"`;

        // Show typing indicator
        setTutorStatus('thinking');
        const typingEl = document.createElement('div');
        typingEl.className = 'chat-msg bot typing';
        typingEl.id = 'typing-indicator';
        typingEl.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
        chatBody.appendChild(typingEl);
        chatBody.scrollTop = chatBody.scrollHeight;

        try {
            const res = await apiFetch('/chat', {
                method: 'POST',
                body: JSON.stringify({
                    message: msg,
                    tutorMode: activeTutorMode,
                    academicContext: currentAcademicContext,
                    voiceActive: fromVoice
                })
            });

            // Remove typing indicator
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) typingIndicator.remove();

            setTutorStatus('idle');

            const botMsg = res.success && res.response ? res.response : "I'm having trouble connecting right now. Please try asking again!";
            const speechText = res.speechText || botMsg;

            const botMsgEl = document.createElement('div');
            botMsgEl.className = 'chat-msg bot';
            botMsgEl.dataset.speech = speechText;

            // Rich formatting with marked
            const parsedHtml = (window.marked && typeof marked.parse === 'function') ? marked.parse(botMsg) : `<p>${escapeHtml(botMsg)}</p>`;
            botMsgEl.innerHTML = `
                <div class="bot-msg-content">${parsedHtml}</div>
                <div class="msg-voice-action">
                    <button class="msg-listen-btn" title="Listen to Aadhi speaking this">
                        <i class='bx bx-volume-full'></i> Listen
                    </button>
                </div>
            `;
            chatBody.appendChild(botMsgEl);

            // Render Math with KaTeX if available
            if (window.renderMathInElement) {
                try {
                    renderMathInElement(botMsgEl, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\(', right: '\\)', display: false },
                            { left: '\\[', right: '\\]', display: true }
                        ],
                        throwOnError: false
                    });
                } catch (_) {}
            }

            // Add code copy button if function exists
            if (typeof addCopyButton === 'function') addCopyButton(botMsgEl);

            // Update Voice Focus Modal Transcript
            if (vfAadhiText) {
                vfAadhiText.innerHTML = (window.marked && typeof marked.parse === 'function') ? marked.parse(botMsg) : escapeHtml(botMsg);
            }

            chatBody.scrollTop = chatBody.scrollHeight;

            // Auto-Speak if enabled or if user spoke
            if ((autoSpeakEnabled || fromVoice) && speechText) {
                const listenBtn = botMsgEl.querySelector('.msg-listen-btn');
                speakAadhiResponse(speechText, listenBtn);
            }
        } catch (e) {
            console.error('Aadhi Chat error:', e);
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) typingIndicator.remove();
            setTutorStatus('idle');
            showToast('Unable to reach Aadhi Tutor. Check your internet connection.', 'error');
        }
    }

    if (chatSend) chatSend.onclick = () => handleSendMessage();
    if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') handleSendMessage(); };

    // Global Window Access API for Contextual Tutoring from Notes & Diagnostics
    window.openAadhiTutor = (options = {}) => {
        const { mode, subject, note, topic, initialPrompt } = options;
        if (mode) updateTutorMode(mode);
        if (subject || note || topic) {
            currentAcademicContext = {
                subject_name: subject || '',
                note_title: note || '',
                topic_name: topic || ''
            };
        }

        if (chatbotWindow) {
            chatbotWindow.classList.add('active');
            if (chatInput) chatInput.focus();
        }

        if (initialPrompt) {
            handleSendMessage(initialPrompt);
        }
    };

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
    let rawDriveFacultyFolders = [];
    let facultyProfiles = [];
    let facultyAvailabilityRefreshInFlight = false;
    let activeFacultyDriveFilter = 'all';
    let activeFacultyModalStack = [];

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
        if (folder.department || folder.qualifications) {
            return [folder.department, folder.qualifications].filter(Boolean).join(' · ') || 'Faculty member';
        }
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
        values.push(
            folder.name || '',
            folder.department || '',
            folder.qualifications || '',
            folder.bio || ''
        );
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

        const liveAvailability = getFacultyAvailabilityBadge(folder).status;
        if (filter === 'available' && liveAvailability !== 'available') return false;
        if (filter === 'unavailable' && liveAvailability !== 'unavailable') return false;
        return true;
    }

    function normalizeFacultyName(value = '') {
        return String(value).toLowerCase().replace(/\b(?:dr|prof|mr|mrs|ms)\.?\b/g, '').replace(/[^a-z0-9]/g, '');
    }

    function mergeFacultyProfiles(profiles, folders) {
        const unusedFolders = new Set(folders);
        const mergedProfiles = profiles.map(profile => {
            const profileName = normalizeFacultyName(profile.name);
            const matchedFolder = folders.find(folder => {
                const folderName = normalizeFacultyName(folder.name);
                return folderName && profileName && (folderName === profileName || folderName.includes(profileName) || profileName.includes(folderName));
            });
            if (matchedFolder) unusedFolders.delete(matchedFolder);
            return {
                ...(matchedFolder || {}),
                ...profile,
                children: matchedFolder?.children || [],
                fileCount: matchedFolder?.fileCount || 0,
                folderCount: matchedFolder?.folderCount || 0,
                directFolderCount: matchedFolder?.directFolderCount || 0,
                directFileCount: matchedFolder?.directFileCount || 0,
                driveFolderId: matchedFolder?.id || null
            };
        });
        return [
            ...mergedProfiles,
            ...Array.from(unusedFolders).map(folder => ({ ...folder, availability: 'unavailable' }))
        ];
    }

    function getFacultyColor(name = '') {
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#0ea5e9', '#f59e0b'];
        const hash = [...String(name)].reduce((total, char) => total + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    function getFacultyAvailabilityBadge(faculty = {}) {
        const reason = String(faculty.availabilityReason || '');
        const isInExtractedFreePeriod = faculty.availability === 'available'
            && reason === 'free_period';

        if (isInExtractedFreePeriod) {
            return {
                status: 'available',
                label: 'Available now',
                description: 'Currently within an extracted free period'
            };
        }

        if (reason === 'on_leave') {
            return {
                status: 'unavailable',
                label: 'On leave',
                description: 'Marked on leave by the faculty member'
            };
        }

        return {
            status: 'unavailable',
            label: 'Unavailable now',
            description: reason === 'outside_working_hours'
                ? 'Outside working hours'
                : 'Not within an extracted free period'
        };
    }

    function closeFacultyPreviewPanel() {
        if (facultyFilePreviewPanel) facultyFilePreviewPanel.style.display = 'none';
        if (facultyFilePreviewFrame) facultyFilePreviewFrame.src = '';
    }

    function setupFacultyFilters() {
        if (!facultyDeptFilters) return;

        facultyDeptFilters.innerHTML = `
            <span class="subject-tag ${activeFacultyDriveFilter === 'all' ? 'active' : ''}" data-drive-filter="all">All</span>
            <span class="subject-tag ${activeFacultyDriveFilter === 'available' ? 'active' : ''}" data-drive-filter="available">Available</span>
            <span class="subject-tag ${activeFacultyDriveFilter === 'unavailable' ? 'active' : ''}" data-drive-filter="unavailable">Unavailable</span>
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
            rawDriveFacultyFolders = [];
            return false;
        }

        driveFacultyRoot = res.data.root;
        rawDriveFacultyFolders = Array.isArray(res.data.faculties)
            ? res.data.faculties
            : (driveFacultyRoot.children || []).filter((child) => child.type === 'folder');
        driveFacultyFolders = rawDriveFacultyFolders;
        return true;
    }

    async function loadFacultyProfiles() {
        const res = await apiFetch('/faculty');
        facultyProfiles = res.success && Array.isArray(res.data) ? res.data : [];
        return res.success;
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
            facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">No faculty profiles matched the current filters.</div>';
            return;
        }

        filteredFaculty.forEach((fac) => {
            const color = getFacultyColor(fac.name);
            const availabilityBadge = getFacultyAvailabilityBadge(fac);
            const card = document.createElement('div');
            card.className = 'faculty-profile-card';
            card.style.setProperty('--dept-color', color);
            card.innerHTML = `
                <div class="faculty-card-glow"></div>
                <div class="faculty-card-body">
                    <div class="faculty-avatar-large" style="background:${color}" data-faculty-avatar>${escapeHtml((fac.name || 'F').charAt(0).toUpperCase())}</div>
                    <h3 class="faculty-card-name">${escapeHtml(fac.name || 'Faculty Folder')}</h3>
                    <span class="faculty-dept-badge" style="background:${color}22;color:${color}">${escapeHtml(fac.department || 'Faculty')}</span>
                    <span class="faculty-card-availability ${availabilityBadge.status}" title="${escapeHtml(availabilityBadge.description)}"><i class='bx bx-radio-circle-marked'></i>${escapeHtml(availabilityBadge.label)}</span>
                    <div class="faculty-card-qualification">${escapeHtml(fac.qualifications || 'Qualifications not added')}</div>
                    <p class="faculty-card-bio">${escapeHtml(fac.bio || 'Open this profile to browse shared subjects and faculty availability.')}</p>
                    <div class="faculty-card-stats">
                        <div class="faculty-stat"><span class="fac-stat-value">${Number(fac.fileCount || 0)}</span><span class="fac-stat-label">Materials</span></div>
                    </div>
                    <button class="faculty-view-btn view-faculty-btn" type="button"><i class='bx bx-user'></i> View profile & materials</button>
                </div>
            `;
            if (fac.photoUrl) {
                const avatar = card.querySelector('[data-faculty-avatar]');
                avatar.textContent = '';
                const image = document.createElement('img');
                image.src = fac.photoUrl;
                image.alt = `${fac.name || 'Faculty'} profile photo`;
                avatar.appendChild(image);
            }
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

        const [driveLoaded, profilesLoaded] = await Promise.all([
            loadDriveFacultyRepository(),
            loadFacultyProfiles()
        ]);
        driveFacultyFolders = mergeFacultyProfiles(facultyProfiles, rawDriveFacultyFolders);

        if (!profilesLoaded && !driveLoaded) {
            facultyResultsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Unable to load faculty profiles right now.</div>';
            facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#ef4444;">Unable to load Google Drive folders right now.</div>';
            return;
        }

        setupFacultyFilters();
        if (driveLoaded && driveFacultyRoot) {
            renderDriveFolderContents(driveFacultyRoot, [driveFacultyRoot]);
        } else {
            facultyRepoGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);">Faculty profiles are available, but Drive materials could not be loaded.</div>';
        }
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
        const modalAvatar = document.getElementById('modalFacultyAvatar');
        modalAvatar.innerHTML = '';
        if (faculty.photoUrl) {
            const image = document.createElement('img');
            image.src = faculty.photoUrl;
            image.alt = `${faculty.name || 'Faculty'} profile photo`;
            modalAvatar.appendChild(image);
        } else {
            modalAvatar.textContent = (faculty.name || 'F').charAt(0).toUpperCase();
        }

        const profileSummary = document.getElementById('modalFacultyProfileSummary');
        const hasPublicProfile = Boolean(faculty.userId || faculty.email || faculty.bio || faculty.qualifications);
        profileSummary.hidden = !hasPublicProfile;
        if (hasPublicProfile) {
            document.getElementById('modalFacultyQualification').textContent = faculty.qualifications || faculty.department || 'Faculty profile';
            document.getElementById('modalFacultyBio').textContent = faculty.bio || 'This faculty member has not added a public biography yet.';
        }
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

    // Availability is computed by the backend in the college timezone. Refresh
    // it every minute while the directory is open so 08:00/17:00 and period
    // boundaries update without exposing the underlying free-hour schedule.
    window.setInterval(async () => {
        const facultyView = document.getElementById('faculty-view');
        if (!facultyView || getComputedStyle(facultyView).display === 'none' || facultyAvailabilityRefreshInFlight) return;
        facultyAvailabilityRefreshInFlight = true;
        try {
            if (await loadFacultyProfiles()) {
                driveFacultyFolders = mergeFacultyProfiles(facultyProfiles, rawDriveFacultyFolders);
                renderFacultyCards();
            }
        } finally {
            facultyAvailabilityRefreshInFlight = false;
        }
    }, 60 * 1000);

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
            'dsa-syntax-code': data.syntax,
            'dsa-example-code': data.example_code
        };
        Object.entries(mapping).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });

        const richTextFormatter = window.NotezillaDsaContentFormatter;
        const renderRichText = (id, value) => {
            const element = document.getElementById(id);
            if (!element) return;
            element.innerHTML = richTextFormatter?.toSafeHtml
                ? richTextFormatter.toSafeHtml(value)
                : escapeHtml(String(value || ''));
        };
        renderRichText('dsa-concept-explanation', data.explanation);
        renderRichText('dsa-practice-problem', data.practice_problem);
        
        // Render logic list
        const logicList = document.getElementById('dsa-logic-list');
        if (logicList) {
            logicList.innerHTML = '';
            (data.logic_breakdown || []).forEach(item => {
                const listItem = document.createElement('li');
                listItem.innerHTML = richTextFormatter?.toSafeHtml
                    ? richTextFormatter.toSafeHtml(item)
                    : escapeHtml(String(item || ''));
                logicList.appendChild(listItem);
            });
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
            // Start with an executable, test-matching reference solution. Keep
            // genuine student drafts, but migrate the old demonstration and
            // generic TODO placeholders that caused misleading sandbox failures.
            const draft = data.progress?.todayStatus?.codeDraft;
            const draftIsOldExample = draft && data.example_code
                && draft.trim() === data.example_code.trim();
            const draftIsGenericPlaceholder = draft
                && /TODO:\s*(?:parse raw_input|read stdin), solve the practice problem/i.test(draft);
            const executableDefault = data.solution_code || data.starter_code || '';
            codeEditor.value = (draftIsOldExample || draftIsGenericPlaceholder)
                ? executableDefault
                : (draft || executableDefault);
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
                    let executionFailed = false;
                    
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
                        if (tc.status === 'compile_error' || tc.status === 'runtime_error') executionFailed = true;
                    });
                    
                    const summary = document.createElement('div');
                    summary.style.marginTop = '15px';
                    summary.style.fontWeight = 'bold';
                    
                    if (allPassed) {
                        summary.textContent = '🎉 All test cases passed! Outstanding work!';
                        summary.style.color = '#10b981';
                    } else if (executionFailed) {
                        summary.textContent = 'The sandbox ran, but compilation or execution stopped with an error. Review the diagnostics above.';
                        summary.style.color = '#ef4444';
                    } else {
                        summary.textContent = 'The sandbox ran successfully, but your program output did not match the expected answers.';
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
        const supportsSelectableText = /\.(?:pdf|docx?|pptx?|xlsx?|ods|txt|md|csv)(?:$|[?#])/i.test(currentNoteFileName)
            || /\.(?:pdf|docx?|pptx?|xlsx?|ods|txt|md|csv)(?:$|[?#])/i.test(url);
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

    // ════════════════════════════════════════════════════════════
    // 6. SMART CLASS RECORDER & AI LECTURE SUMMARIZER (Engine 6)
    // ════════════════════════════════════════════════════════════
    let crMediaRecorder = null;
    let crAudioChunks = [];
    let crRecordingTimer = null;
    let crSecondsElapsed = 0;
    let crSpeechRecognition = null;
    let crAccumulatedTranscript = '';
    let crActiveRecordingSession = null;

    const crTitleInput = document.getElementById('crTitleInput');
    const crSubjectInput = document.getElementById('crSubjectInput');
    const crClassTypeSelect = document.getElementById('crClassTypeSelect');
    const crRecordingStatus = document.getElementById('crRecordingStatus');
    const crTimerDisplay = document.getElementById('crTimerDisplay');
    const crWaveContainer = document.getElementById('crWaveContainer');
    const crStartRecordBtn = document.getElementById('crStartRecordBtn');
    const crPauseRecordBtn = document.getElementById('crPauseRecordBtn');
    const crStopRecordBtn = document.getElementById('crStopRecordBtn');
    const crAudioFileInput = document.getElementById('crAudioFileInput');
    const crManualTranscriptText = document.getElementById('crManualTranscriptText');
    const crProcessManualBtn = document.getElementById('crProcessManualBtn');
    const crProcessingOverlay = document.getElementById('crProcessingOverlay');
    const crOutputDashboard = document.getElementById('crOutputDashboard');
    const crSearchInput = document.getElementById('crSearchInput');
    const crSearchResultsContainer = document.getElementById('crSearchResultsContainer');
    const crSearchResultsList = document.getElementById('crSearchResultsList');

    const formatTimer = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // Live Web Speech Recognition Initializer
    const initSpeechRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';

        rec.onresult = (e) => {
            let current = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    crAccumulatedTranscript += ' ' + e.results[i][0].transcript;
                } else {
                    current += e.results[i][0].transcript;
                }
            }
            if (crManualTranscriptText) {
                crManualTranscriptText.value = (crAccumulatedTranscript + ' ' + current).trim();
            }
        };

        rec.onerror = (e) => console.warn('Speech recognition warning:', e.error);
        rec.onend = () => {
            if (crMediaRecorder && crMediaRecorder.state === 'recording') {
                try { rec.start(); } catch (_) {}
            }
        };

        return rec;
    };

    // Start Live Recording
    const startClassRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            crAudioChunks = [];
            crMediaRecorder = new MediaRecorder(stream);

            crMediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) crAudioChunks.push(e.data);
            };

            crMediaRecorder.start(1000);
            crSecondsElapsed = 0;
            if (crTimerDisplay) crTimerDisplay.textContent = formatTimer(0);
            crRecordingTimer = setInterval(() => {
                crSecondsElapsed++;
                if (crTimerDisplay) crTimerDisplay.textContent = formatTimer(crSecondsElapsed);
            }, 1000);

            // Speech recognition
            crAccumulatedTranscript = '';
            crSpeechRecognition = initSpeechRecognition();
            if (crSpeechRecognition) {
                try { crSpeechRecognition.start(); } catch (_) {}
            }

            // UI updates
            if (crRecordingStatus) {
                crRecordingStatus.textContent = 'Recording Active';
                crRecordingStatus.style.background = 'rgba(239, 68, 68, 0.2)';
                crRecordingStatus.style.color = '#ef4444';
            }
            if (crWaveContainer) crWaveContainer.style.display = 'flex';
            if (crStartRecordBtn) crStartRecordBtn.style.display = 'none';
            if (crPauseRecordBtn) crPauseRecordBtn.style.display = 'inline-flex';
            if (crStopRecordBtn) crStopRecordBtn.style.display = 'inline-flex';

            showToast('Class recording started. Speak clearly into mic.', 'info');
        } catch (e) {
            console.error('Microphone access error:', e);
            showToast('Unable to access microphone. Check browser permissions.', 'error');
        }
    };

    // Pause / Resume Recording
    if (crPauseRecordBtn) {
        crPauseRecordBtn.addEventListener('click', () => {
            if (!crMediaRecorder) return;
            if (crMediaRecorder.state === 'recording') {
                crMediaRecorder.pause();
                clearInterval(crRecordingTimer);
                if (crSpeechRecognition) try { crSpeechRecognition.stop(); } catch (_) {}
                crRecordingStatus.textContent = 'Paused';
                crRecordingStatus.style.background = 'rgba(245, 158, 11, 0.2)';
                crRecordingStatus.style.color = '#f59e0b';
                crPauseRecordBtn.innerHTML = "<i class='bx bx-play-circle'></i> Resume";
            } else if (crMediaRecorder.state === 'paused') {
                crMediaRecorder.resume();
                crRecordingTimer = setInterval(() => {
                    crSecondsElapsed++;
                    if (crTimerDisplay) crTimerDisplay.textContent = formatTimer(crSecondsElapsed);
                }, 1000);
                if (crSpeechRecognition) try { crSpeechRecognition.start(); } catch (_) {}
                crRecordingStatus.textContent = 'Recording Active';
                crRecordingStatus.style.background = 'rgba(239, 68, 68, 0.2)';
                crRecordingStatus.style.color = '#ef4444';
                crPauseRecordBtn.innerHTML = "<i class='bx bx-pause-circle'></i> Pause";
            }
        });
    }

    // Stop & Process Lecture Recording with Whisper AI
    const stopClassRecording = async () => {
        if (!crMediaRecorder) return;

        clearInterval(crRecordingTimer);
        if (crSpeechRecognition) try { crSpeechRecognition.stop(); } catch (_) {}

        // Wait for MediaRecorder to stop and emit its final audio chunk
        if (crMediaRecorder.state !== 'inactive') {
            await new Promise((resolve) => {
                crMediaRecorder.onstop = resolve;
                try { crMediaRecorder.stop(); } catch (_) { resolve(); }
            });
        }
        
        if (crMediaRecorder.stream) {
            crMediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        if (crRecordingStatus) {
            crRecordingStatus.textContent = 'Idle';
            crRecordingStatus.style.background = 'rgba(255,255,255,0.06)';
            crRecordingStatus.style.color = 'var(--text-muted)';
        }
        if (crWaveContainer) crWaveContainer.style.display = 'none';
        if (crStartRecordBtn) crStartRecordBtn.style.display = 'inline-flex';
        if (crPauseRecordBtn) crPauseRecordBtn.style.display = 'none';
        if (crStopRecordBtn) crStopRecordBtn.style.display = 'none';

        // Build Audio Blob from crAudioChunks
        let audioBlob = null;
        if (crAudioChunks && crAudioChunks.length > 0) {
            const mimeType = crMediaRecorder.mimeType || 'audio/webm';
            audioBlob = new Blob(crAudioChunks, { type: mimeType });
        }

        const fallbackTranscript = crAccumulatedTranscript ? crAccumulatedTranscript.trim() : '';
        const duration = crSecondsElapsed || 0;

        await processLectureRecording(audioBlob, fallbackTranscript, duration);
    };

    if (crStartRecordBtn) crStartRecordBtn.addEventListener('click', startClassRecording);
    if (crStopRecordBtn) crStopRecordBtn.addEventListener('click', stopClassRecording);

    // Process Recorded Audio Blob or Transcript with Whisper AI Backend API
    const processLectureRecording = async (audioBlob = null, transcriptText = '', durationSec = 0) => {
        if (crProcessingOverlay) crProcessingOverlay.style.display = 'block';
        if (crOutputDashboard) crOutputDashboard.style.display = 'none';

        const formData = new FormData();
        if (audioBlob && audioBlob.size > 0) {
            const mime = audioBlob.type || 'audio/webm';
            const ext = mime.includes('mp4') ? 'mp4' : (mime.includes('ogg') ? 'ogg' : 'webm');
            formData.append('audio', audioBlob, `class-recording.${ext}`);
        }
        formData.append('title', (crTitleInput && crTitleInput.value.trim()) || 'Classroom Lecture');
        formData.append('subjectName', (crSubjectInput && crSubjectInput.value.trim()) || 'Academic Course');
        formData.append('classType', crClassTypeSelect ? crClassTypeSelect.value : 'lecture');
        formData.append('durationSeconds', durationSec);
        if (transcriptText) {
            formData.append('transcript', transcriptText);
        }

        try {
            const res = await fetch('/api/ai/process-lecture', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await res.json();
            if (crProcessingOverlay) crProcessingOverlay.style.display = 'none';

            if (res.ok && data && data.success && data.data) {
                crActiveRecordingSession = data.data;
                renderLectureOutputDashboard(data.data);
                renderClassRecorderLibrary();
                showToast('Smart Class Whisper AI session generated successfully!', 'success');
            } else {
                showToast((data && data.message) || 'Error processing lecture with Whisper AI', 'error');
            }
        } catch (err) {
            if (crProcessingOverlay) crProcessingOverlay.style.display = 'none';
            console.error('Lecture processing error:', err);
            showToast('Failed to send class recording to Whisper AI server', 'error');
        }
    };

    // Render Lecture Output Dashboard Tabs
    const renderLectureOutputDashboard = (session) => {
        if (!crOutputDashboard) return;
        crOutputDashboard.style.display = 'block';

        // Headers
        const crOutTitle = document.getElementById('crOutTitle');
        const crOutTypeBadge = document.getElementById('crOutTypeBadge');
        const crOutMeta = document.getElementById('crOutMeta');

        if (crOutTitle) crOutTitle.textContent = session.title || 'Classroom Lecture';
        if (crOutTypeBadge) crOutTypeBadge.textContent = (session.class_type || 'lecture').toUpperCase();
        if (crOutMeta) {
            const mins = Math.max(1, Math.round((session.duration_seconds || 0) / 60));
            crOutMeta.textContent = `Course: ${session.subject_name || 'General'} • Duration: ~${mins} mins • Recorded ${new Date(session.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        // 1. Summary
        const crSummaryText = document.getElementById('crSummaryText');
        if (crSummaryText) crSummaryText.textContent = session.summary || 'Summary generated by Aadhi Smart Class AI.';

        // Key Concepts
        const crConceptsList = document.getElementById('crConceptsList');
        if (crConceptsList) {
            const concepts = Array.isArray(session.key_concepts) ? session.key_concepts : [];
            crConceptsList.innerHTML = concepts.map(c => `
                <div style="padding: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; display: flex; align-items: flex-start; gap: 10px;">
                    <i class='bx bx-check-circle' style="color: #10b981; font-size: 18px; margin-top: 2px;"></i>
                    <span style="font-size: 13px; color: #e2e8f0; font-weight: 500;">${escapeHtml(c)}</span>
                </div>
            `).join('');
        }

        // 2. Structured Notes
        const crNotesContent = document.getElementById('crNotesContent');
        if (crNotesContent) {
            const notesMd = session.structured_notes || session.transcript || '';
            crNotesContent.innerHTML = (window.marked && typeof marked.parse === 'function') ? marked.parse(notesMd) : escapeHtml(notesMd);
            if (window.renderMathInElement) {
                renderMathInElement(crNotesContent, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false
                });
            }
        }

        // 3. Action Items
        const crActionItemsList = document.getElementById('crActionItemsList');
        const crActionCount = document.getElementById('crActionCount');
        const actionItems = Array.isArray(session.action_items) ? session.action_items : [];
        if (crActionCount) crActionCount.textContent = actionItems.length;

        if (crActionItemsList) {
            if (actionItems.length === 0) {
                crActionItemsList.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">No explicit action items or homework extracted from this session.</div>`;
            } else {
                crActionItemsList.innerHTML = actionItems.map((item, idx) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="badge" style="background: rgba(99,102,241,0.2); color: #818cf8; text-transform: uppercase;">${escapeHtml(item.type || 'TASK')}</span>
                            <div>
                                <h4 style="font-size: 14px; font-weight: 700; color: white; margin: 0 0 2px 0;">${escapeHtml(item.title)}</h4>
                                <p style="font-size: 12px; color: var(--text-muted); margin: 0;">Due: ${escapeHtml(item.dueDate || 'Soon')} &bull; ${escapeHtml(item.details || '')}</p>
                            </div>
                        </div>
                        <button class="btn-gradient" style="padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: 600; white-space: nowrap;" onclick="window.addActionItemToPlanner('${escapeHtml(item.title)}', '${escapeHtml(item.dueDate || '')}', '${escapeHtml(item.details || '')}')">
                            <i class='bx bx-plus-circle'></i> Add to Planner
                        </button>
                    </div>
                `).join('');
            }
        }

        // 4. Revision Questions
        const crQuestionsList = document.getElementById('crQuestionsList');
        const questions = Array.isArray(session.revision_questions) ? session.revision_questions : [];
        if (crQuestionsList) {
            if (questions.length === 0) {
                crQuestionsList.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">No revision questions available.</div>`;
            } else {
                crQuestionsList.innerHTML = questions.map((q, idx) => `
                    <div style="padding: 18px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 11px; font-weight: 700; color: #10b981; text-transform: uppercase;">Question ${idx + 1} &bull; ${escapeHtml(q.topic || 'Concept')}</span>
                        </div>
                        <h4 style="font-size: 14px; font-weight: 700; color: white; margin: 0 0 10px 0;">${escapeHtml(q.question)}</h4>
                        <button class="btn-glass" style="padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;" onclick="const ans = this.nextElementSibling; ans.style.display = ans.style.display === 'none' ? 'block' : 'none';">
                            <i class='bx bx-show'></i> Toggle Answer
                        </button>
                        <div style="display: none; margin-top: 10px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; border-radius: 6px; font-size: 13px; color: #e2e8f0;">
                            <strong>Answer:</strong> ${escapeHtml(q.answer)}
                        </div>
                    </div>
                `).join('');
            }
        }

        // 5. Timestamps
        const crTimestampsList = document.getElementById('crTimestampsList');
        const timestamps = Array.isArray(session.timestamps) ? session.timestamps : [];
        if (crTimestampsList) {
            if (timestamps.length === 0) {
                crTimestampsList.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">No timestamp markers extracted.</div>`;
            } else {
                crTimestampsList.innerHTML = timestamps.map(t => `
                    <div style="padding: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;">
                        <span class="badge" style="background: rgba(16,185,129,0.2); color: #10b981; font-family: monospace; font-size: 12px; margin-bottom: 8px; display: inline-block;">📌 ${escapeHtml(t.timestamp)}</span>
                        <h4 style="font-size: 13px; font-weight: 700; color: white; margin: 0 0 4px 0;">${escapeHtml(t.topic)}</h4>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 0;">${escapeHtml(t.details || '')}</p>
                    </div>
                `).join('');
            }
        }

        // 6. Transcript
        const crTranscriptText = document.getElementById('crTranscriptText');
        if (crTranscriptText) crTranscriptText.textContent = session.transcript || 'No transcript text stored.';
    };

    // Add action item directly into Notezilla Planner Tasks
    window.addActionItemToPlanner = async (title, dueDate, details) => {
        try {
            const res = await apiFetch('/user/planner', {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    description: details || 'Class lecture action item',
                    task_time: dueDate || 'Class Task'
                })
            });
            if (res && res.success) {
                showToast(`Added "${title}" to your Planner!`, 'success');
                renderPlanner();
            } else {
                showToast('Failed to add action item to Planner', 'error');
            }
        } catch (e) {
            console.error('Add action item error:', e);
            showToast('Failed to add task to Planner', 'error');
        }
    };

    // Search Inside Lecture Listener
    if (crSearchInput) {
        let searchDebounce = null;
        crSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(async () => {
                const query = e.target.value.trim();
                if (!query || !crActiveRecordingSession) {
                    if (crSearchResultsContainer) crSearchResultsContainer.style.display = 'none';
                    return;
                }

                try {
                    const res = await apiFetch(`/user/class-recordings/${crActiveRecordingSession.id}/search`, {
                        method: 'POST',
                        body: JSON.stringify({ query })
                    });

                    if (res && res.success && res.matches && res.matches.length > 0) {
                        if (crSearchResultsContainer) crSearchResultsContainer.style.display = 'block';
                        if (crSearchResultsList) {
                            crSearchResultsList.innerHTML = res.matches.map(m => `
                                <div style="padding: 10px 14px; background: rgba(255,255,255,0.04); border-radius: 8px; font-size: 12px; color: white; display: flex; align-items: center; justify-content: space-between;">
                                    <span>🔍 ${escapeHtml(m.snippet)}</span>
                                    ${m.timestamp ? `<span class="badge" style="background: rgba(16,185,129,0.2); color: #10b981;">📌 ${escapeHtml(m.timestamp)}</span>` : ''}
                                </div>
                            `).join('');
                        }
                    } else {
                        if (crSearchResultsContainer) crSearchResultsContainer.style.display = 'block';
                        if (crSearchResultsList) {
                            crSearchResultsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px;">No matches found for "${escapeHtml(query)}" inside this lecture.</div>`;
                        }
                    }
                } catch (err) {
                    console.error('Search lecture error:', err);
                }
            }, 300);
        });
    }

    // Dashboard Output Tab Switcher
    const crTabBtns = document.querySelectorAll('.cr-tab-btn');
    crTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            crTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tabKey = btn.getAttribute('data-tab');
            const contents = document.querySelectorAll('.cr-tab-content');
            contents.forEach(c => c.style.display = 'none');

            const targetId = `crTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`;
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.style.display = 'block';
        });
    });

    // Render Saved Class Recordings Gallery
    window.renderClassRecorderLibrary = async () => {
        const crSavedGrid = document.getElementById('crSavedGrid');
        const crSavedCountBadge = document.getElementById('crSavedCountBadge');
        if (!crSavedGrid) return;

        try {
            const res = await apiFetch('/user/class-recordings');
            if (res && res.success && Array.isArray(res.data)) {
                if (crSavedCountBadge) crSavedCountBadge.textContent = `${res.data.length} Session${res.data.length === 1 ? '' : 's'} Saved`;

                if (res.data.length === 0) {
                    crSavedGrid.innerHTML = `
                        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                            <i class='bx bx-microphone-off' style="font-size: 40px; margin-bottom: 8px;"></i>
                            <p style="margin: 0; font-size: 13px;">No class recordings saved yet. Click "Start Recording" or upload an audio file above!</p>
                        </div>
                    `;
                    return;
                }

                crSavedGrid.innerHTML = res.data.map(item => {
                    const mins = Math.max(1, Math.round((item.duration_seconds || 0) / 60));
                    const dateStr = new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                    return `
                        <div class="glass-panel" style="padding: 18px; border-radius: 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                    <span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; text-transform: uppercase;">${escapeHtml(item.class_type || 'LECTURE')}</span>
                                    <span style="font-size: 11px; color: var(--text-muted);">${dateStr}</span>
                                </div>
                                <h4 style="font-size: 15px; font-weight: 700; color: white; margin: 0 0 4px 0;">${escapeHtml(item.title)}</h4>
                                <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 12px 0;">Course: ${escapeHtml(item.subject_name || 'General')} &bull; ~${mins} mins</p>
                                <p style="font-size: 12px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(item.summary || 'Recorded class session.')}</p>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn-gradient" style="flex: 1; padding: 8px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;" onclick="window.openSavedLectureSession('${item.id}')">
                                    <i class='bx bx-book-open'></i> Open Session
                                </button>
                                <button class="btn-glass" style="padding: 8px 10px; border-radius: 8px; color: #ef4444;" onclick="window.deleteClassRecordingSession('${item.id}')" title="Delete session">
                                    <i class='bx bx-trash'></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) {
            console.error('Fetch saved recordings error:', err);
        }
    };

    // Open specific saved session
    window.openSavedLectureSession = async (id) => {
        try {
            const res = await apiFetch(`/user/class-recordings/${id}`);
            if (res && res.success && res.data) {
                crActiveRecordingSession = res.data;
                renderLectureOutputDashboard(res.data);
                window.scrollTo({ top: document.getElementById('crOutputDashboard').offsetTop - 80, behavior: 'smooth' });
            }
        } catch (e) {
            console.error('Open saved session error:', e);
            showToast('Unable to open recording session', 'error');
        }
    };

    // Delete session
    window.deleteClassRecordingSession = async (id) => {
        if (!confirm('Are you sure you want to delete this class recording session?')) return;
        try {
            const res = await apiFetch(`/user/class-recordings/${id}`, { method: 'DELETE' });
            if (res && res.success) {
                showToast('Session deleted', 'info');
                renderClassRecorderLibrary();
                if (crActiveRecordingSession && crActiveRecordingSession.id === id) {
                    if (crOutputDashboard) crOutputDashboard.style.display = 'none';
                    crActiveRecordingSession = null;
                }
            }
        } catch (e) {
            console.error('Delete session error:', e);
        }
    };

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
