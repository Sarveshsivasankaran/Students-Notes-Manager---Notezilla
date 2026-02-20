/**
 * Notezilla Script - Backend Integration Version
 */

class Notezilla {
    constructor() {
        const isBrowser = (typeof window !== 'undefined' && typeof document !== 'undefined');
        this.isBrowser = isBrowser;

        this.token = isBrowser && (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : null;
        this.fullname = isBrowser && (typeof localStorage !== 'undefined') ? localStorage.getItem('fullname') : null;
        this.notes = [];
        this.currentFilter = 'all';
        this.currentCategory = 'All';
        this.editingNoteId = null;

        // If not running in a browser (e.g., Node), skip DOM-specific initialization
        if (!isBrowser) return;

        // Auth Check
        if (!this.token) {
            window.location.href = 'login.html';
            return;
        }

        // DOM Elements
        this.notesGrid = document.getElementById('notes-grid');
        this.noteModal = document.getElementById('note-modal');
        this.noteForm = document.getElementById('note-form');
        this.addNoteBtn = document.getElementById('add-note-btn');
        this.closeModalBtn = document.getElementById('close-modal');
        this.cancelNoteBtn = document.getElementById('cancel-note');
        this.searchInput = document.getElementById('search-input');
        this.categoryDropdown = document.getElementById('category-dropdown');
        this.userDisplay = document.getElementById('user-display');

        this.init();
    }

    async init() {
        if (this.userDisplay) this.userDisplay.innerText = this.fullname || 'Student';
        await this.fetchNotes();
        this.setupEventListeners();
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

        // Search & Category Filter
        this.searchInput.addEventListener('input', () => this.renderNotes());
        if (this.categoryDropdown) {
            this.categoryDropdown.addEventListener('change', (e) => {
                this.currentCategory = e.target.value;
                this.renderNotes();
            });
        }
    }

    async fetchNotes() {
        try {
            const res = await fetch('/api/notes', {
                headers: { 'x-auth-token': this.token }
            });
            if (res.status === 401) this.logout();
            this.notes = await res.json();
            this.renderNotes();
        } catch (err) {
            console.error('Error fetching notes:', err);
        }
    }

    openModal(note = null) {
        const modalTitle = document.getElementById('modal-title');
        if (note) {
            modalTitle.innerText = 'Update Note';
            document.getElementById('note-title').value = note.title;
            document.getElementById('note-category').value = note.category;
            document.getElementById('note-text').value = note.content;
            this.editingNoteId = note._id;
        } else {
            modalTitle.innerText = 'Capture Knowledge';
            this.noteForm.reset();
            this.editingNoteId = null;
        }
        this.noteModal.classList.add('active');
    }

    closeModal() {
        this.noteModal.classList.remove('active');
        this.noteForm.reset();
        this.editingNoteId = null;
    }

    async handleFormSubmit() {
        const title = document.getElementById('note-title').value;
        const category = document.getElementById('note-category').value;
        const content = document.getElementById('note-text').value;

        const body = { title, category, content };

        try {
            let res;
            if (this.editingNoteId) {
                res = await fetch(`/api/notes/${this.editingNoteId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-auth-token': this.token
                    },
                    body: JSON.stringify(body)
                });
            } else {
                res = await fetch('/api/notes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-auth-token': this.token
                    },
                    body: JSON.stringify(body)
                });
            }

            if (res.ok) {
                await this.fetchNotes();
                this.closeModal();
            }
        } catch (err) {
            console.error('Error saving note:', err);
        }
    }

    async deleteNote(id) {
        if (confirm('Are you sure you want to delete this note?')) {
            try {
                const res = await fetch(`/api/notes/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-auth-token': this.token }
                });
                if (res.ok) await this.fetchNotes();
            } catch (err) {
                console.error('Error deleting note:', err);
            }
        }
    }

    async toggleFavorite(id) {
        const note = this.notes.find(n => n._id === id);
        if (note) {
            try {
                const res = await fetch(`/api/notes/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-auth-token': this.token
                    },
                    body: JSON.stringify({ isFavorite: !note.isFavorite })
                });
                if (res.ok) await this.fetchNotes();
            } catch (err) {
                console.error('Error updating favorite:', err);
            }
        }
    }

    async toggleArchive(id) {
        const note = this.notes.find(n => n._id === id);
        if (note) {
            try {
                const res = await fetch(`/api/notes/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-auth-token': this.token
                    },
                    body: JSON.stringify({ isArchived: !note.isArchived })
                });
                if (res.ok) await this.fetchNotes();
            } catch (err) {
                console.error('Error archiving note:', err);
            }
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.renderNotes();
    }

    renderNotes() {
        const searchTerm = this.searchInput.value.toLowerCase();

        let filteredNotes = this.notes.filter(note => {
            const matchesSearch = note.title.toLowerCase().includes(searchTerm) ||
                note.content.toLowerCase().includes(searchTerm);

            const matchesCategory = this.currentCategory === 'All' || note.category === this.currentCategory;

            let matchesNav = true;
            if (this.currentFilter === 'fav') matchesNav = note.isFavorite;
            else if (this.currentFilter === 'archive') matchesNav = note.isArchived;
            else if (this.currentFilter === 'all') matchesNav = !note.isArchived;

            return matchesSearch && matchesCategory && matchesNav;
        });

        if (filteredNotes.length === 0) {
            this.notesGrid.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="notebook-pen" size="48"></i>
                    <p>${searchTerm ? 'No matches found.' : 'Your workspace is empty. Start your journey by creating a note!'}</p>
                </div>
            `;
        } else {
            this.notesGrid.innerHTML = filteredNotes.map(note => `
                <div class="note-card" onclick="app.handleNoteClick(event, '${note._id}')">
                    <span class="category-tag">${note.category}</span>
                    <h3>${note.title}</h3>
                    <p>${note.content}</p>
                    <div class="note-footer">
                        <span class="note-date">${new Date(note.updatedAt).toLocaleDateString()}</span>
                        <div class="note-actions">
                            <button class="action-btn" onclick="app.toggleFavorite('${note._id}'); event.stopPropagation();">
                                <i data-lucide="star" style="${note.isFavorite ? 'fill: #fbbf24; color: #fbbf24;' : ''}"></i>
                            </button>
                            <button class="action-btn" onclick="app.toggleArchive('${note._id}'); event.stopPropagation();">
                                <i data-lucide="${note.isArchived ? 'rotate-ccw' : 'archive'}"></i>
                            </button>
                            <button class="action-btn delete" onclick="app.deleteNote('${note._id}'); event.stopPropagation();">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        lucide.createIcons();
    }

    handleNoteClick(event, id) {
        if (event.target.closest('.action-btn')) return;
        const note = this.notes.find(n => n._id === id);
        if (note) this.openModal(note);
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('fullname');
        window.location.href = 'login.html';
    }
}

// Global instance helpers
function filterNav(type, btn) {
    document.querySelectorAll('.nav-pill button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    app.setFilter(type);
}

function logout() {
    app.logout();
}

// Only instantiate in a browser environment. Export class for Node usage/tests.
let app = null;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    app = new Notezilla();
    window.app = app;
} else {
    try {
        module.exports = Notezilla;
    } catch (e) {
        // ignore in browser-like environments where module is not defined
    }
}
