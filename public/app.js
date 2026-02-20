/**
 * Notezilla App
 * Complete frontend logic with authentication and MongoDB backend
 */

const API_URL = 'http://localhost:5000/api';

class Notezilla {
    constructor() {
        const isBrowser = (typeof window !== 'undefined' && typeof document !== 'undefined');
        this.isBrowser = isBrowser;

        // Safe access to storage when in browser
        this.token = isBrowser && (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : null;
        try {
            this.user = isBrowser && (typeof localStorage !== 'undefined') ? JSON.parse(localStorage.getItem('user') || 'null') : null;
        } catch (e) {
            this.user = null;
        }

        // If not running in browser, skip DOM operations
        if (!isBrowser) {
            this.notes = [];
            this.currentFilter = 'all';
            this.currentCategory = 'All';
            this.editingNoteId = null;
            return;
        }

        // If not authenticated, redirect to login
        if (!this.token || !this.user) {
            window.location.href = 'login.html';
            return;
        }

        this.notes = [];
        this.currentFilter = 'all';
        this.currentCategory = 'All';
        this.editingNoteId = null;

        // DOM Elements
        this.notesGrid = document.getElementById('notes-grid');
        this.noteModal = document.getElementById('note-modal');
        this.noteForm = document.getElementById('note-form');
        this.addNoteBtn = document.getElementById('add-note-btn');
        this.closeModalBtn = document.getElementById('close-modal');
        this.cancelNoteBtn = document.getElementById('cancel-note');
        this.searchInput = document.getElementById('search-input');
        this.themeToggle = document.getElementById('theme-toggle');
        this.categoryFilter = document.getElementById('category-filter');
        this.navItems = document.querySelectorAll('.nav-item');
        this.categoryDatalist = document.getElementById('category-options');
        this.logoutBtn = document.getElementById('logout-btn');

        // User info
        this.userNameEl = document.getElementById('userName');
        this.userEmailEl = document.getElementById('userEmail');
        this.userAvatarEl = document.getElementById('userAvatar');

        this.init();
    }

    init() {
        this.setupUserProfile();
        this.loadNotes();
        this.setupEventListeners();
        this.setupTheme();
    }

    setupUserProfile() {
        this.userNameEl.textContent = this.user.name || 'User';
        this.userEmailEl.textContent = this.user.email || 'email@example.com';
        const initials = (this.user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase();
        this.userAvatarEl.textContent = initials;
    }

    setupEventListeners() {
        // Modal controls
        this.addNoteBtn.addEventListener('click', () => this.openModal());
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelNoteBtn.addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === this.noteModal) this.closeModal();
        });

        // Form submission
        this.noteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // Search
        this.searchInput.addEventListener('input', () => this.renderNotes());

        // Sidebar Navigation
        this.navItems.forEach(item => {
            item.addEventListener('click', () => {
                this.navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.currentFilter = item.id.replace('nav-', '');
                this.renderNotes();
            });
        });

        // Theme Toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());

        // Logout
        this.logoutBtn.addEventListener('click', () => this.logout());
    }

    setupTheme() {
        const savedTheme = localStorage.getItem('notezilla-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    updateThemeIcon(theme) {
        const icon = this.themeToggle.querySelector('i');
        icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        lucide.createIcons();
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('notezilla-theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    async loadNotes() {
        try {
            const response = await fetch(`${API_URL}/notes`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (!data.success) {
                // Token might be invalid
                if (response.status === 401) {
                    this.logout();
                    return;
                }
                console.error('Error loading notes:', data.message);
                return;
            }

            this.notes = data.notes;
            this.renderNotes();
            this.renderCategories();
        } catch (error) {
            console.error('Error loading notes:', error);
            alert('Error loading notes. Make sure the server is running on http://localhost:3000');
        }
    }

    renderNotes() {
        let notesToRender = this.notes;

        // Apply filter
        if (this.currentFilter === 'fav') {
            notesToRender = notesToRender.filter(note => note.isFavorite);
        } else if (this.currentFilter === 'archive') {
            notesToRender = notesToRender.filter(note => note.isArchived);
        } else {
            notesToRender = notesToRender.filter(note => !note.isArchived);
        }

        // Apply category filter
        if (this.currentCategory && this.currentCategory !== 'All') {
            notesToRender = notesToRender.filter(note => note.category === this.currentCategory);
        }

        // Apply search filter
        const searchTerm = this.searchInput.value.toLowerCase();
        if (searchTerm) {
            notesToRender = notesToRender.filter(note =>
                note.title.toLowerCase().includes(searchTerm) ||
                note.content.toLowerCase().includes(searchTerm) ||
                note.category.toLowerCase().includes(searchTerm)
            );
        }

        this.notesGrid.innerHTML = '';

        if (notesToRender.length === 0) {
            this.notesGrid.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="notebook-pen" size="48"></i>
                    <p>No notes found. ${this.currentFilter === 'fav' ? 'Add some favorites!' : 'Start by creating one!'}</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        notesToRender.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'note-card';
            noteEl.style.borderLeftColor = note.color || '#6366f1';

            const truncatedContent = note.content.substring(0, 100) + (note.content.length > 100 ? '...' : '');
            const createdDate = new Date(note.createdAt).toLocaleDateString();

            noteEl.innerHTML = `
                <div class="note-header">
                    <h3>${this.escapeHtml(note.title)}</h3>
                    <div class="note-actions">
                        <button class="action-btn favorite-btn" data-id="${note._id}" title="Favorite">
                            <i data-lucide="star" size="18"></i>
                        </button>
                        <button class="action-btn edit-btn" data-id="${note._id}" title="Edit">
                            <i data-lucide="edit-2" size="18"></i>
                        </button>
                        <button class="action-btn delete-btn" data-id="${note._id}" title="Delete">
                            <i data-lucide="trash-2" size="18"></i>
                        </button>
                    </div>
                </div>
                <p class="note-category">${this.escapeHtml(note.category)}</p>
                <p class="note-content">${this.escapeHtml(truncatedContent)}</p>
                <p class="note-date">${createdDate}</p>
                ${note.isFavorite ? '<span class="favorite-badge">⭐ Favorite</span>' : ''}
            `;

            noteEl.querySelector('.favorite-btn').addEventListener('click', () => this.toggleFavorite(note._id, note.isFavorite));
            noteEl.querySelector('.edit-btn').addEventListener('click', () => this.editNote(note));
            noteEl.querySelector('.delete-btn').addEventListener('click', () => this.deleteNote(note._id));

            this.notesGrid.appendChild(noteEl);
        });

        lucide.createIcons();
    }

    renderCategories() {
        const categories = [...new Set(this.notes.map(note => note.category))];
        this.categoryFilter.innerHTML = '';

        const allBtn = document.createElement('button');
        allBtn.className = 'category-btn active';
        allBtn.textContent = 'All';
        allBtn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            allBtn.classList.add('active');
            this.currentCategory = 'All';
            this.renderNotes();
        });
        this.categoryFilter.appendChild(allBtn);

        categories.forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = category;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = category;
                this.renderNotes();
            });
            this.categoryFilter.appendChild(btn);
        });
    }

    openModal() {
        this.editingNoteId = null;
        document.getElementById('modal-title').textContent = 'Create New Note';
        this.noteForm.reset();
        this.noteModal.classList.add('active');
    }

    closeModal() {
        this.noteModal.classList.remove('active');
        this.editingNoteId = null;
        this.noteForm.reset();
    }

    editNote(note) {
        this.editingNoteId = note._id;
        document.getElementById('modal-title').textContent = 'Edit Note';
        document.getElementById('note-title').value = note.title;
        document.getElementById('note-category').value = note.category;
        document.getElementById('note-text').value = note.content;
        this.noteModal.classList.add('active');
    }

    async handleFormSubmit() {
        const title = document.getElementById('note-title').value.trim();
        const category = document.getElementById('note-category').value.trim();
        const content = document.getElementById('note-text').value.trim();

        if (!title || !category || !content) {
            alert('Please fill in all fields');
            return;
        }

        try {
            const url = this.editingNoteId
                ? `${API_URL}/notes/${this.editingNoteId}`
                : `${API_URL}/notes`;

            const method = this.editingNoteId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ title, category, content })
            });

            const data = await response.json();

            if (!data.success) {
                alert('Error saving note: ' + data.message);
                return;
            }

            this.closeModal();
            this.loadNotes();
        } catch (error) {
            console.error('Error saving note:', error);
            alert('Error saving note');
        }
    }

    async deleteNote(noteId) {
        if (!confirm('Are you sure you want to delete this note?')) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/notes/${noteId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (!data.success) {
                alert('Error deleting note: ' + data.message);
                return;
            }

            this.loadNotes();
        } catch (error) {
            console.error('Error deleting note:', error);
            alert('Error deleting note');
        }
    }

    async toggleFavorite(noteId, currentFavoriteStatus) {
        try {
            const note = this.notes.find(n => n._id === noteId);
            if (!note) return;

            const response = await fetch(`${API_URL}/notes/${noteId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    ...note,
                    isFavorite: !note.isFavorite
                })
            });

            const data = await response.json();

            if (!data.success) {
                alert('Error updating favorite: ' + data.message);
                return;
            }

            this.loadNotes();
        } catch (error) {
            console.error('Error updating favorite:', error);
            alert('Error updating favorite');
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize app when DOM is ready (and export for Node usage)
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.notezillaApp = new Notezilla();
    });
} else {
    try {
        // Export the class for Node-based tests or usage
        module.exports = Notezilla;
    } catch (e) {
        // ignore if module not available in the environment
    }
}
