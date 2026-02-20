/**
 * Notezilla Script
 * Core logic for managing student notes using LocalStorage
 */

class Notezilla {
    constructor() {
        const savedNotes = JSON.parse(localStorage.getItem('notezilla-notes'));
        if (!savedNotes || savedNotes.length === 0) {
            this.notes = [
                {
                    id: 1,
                    title: "Welcome to Notezilla! 🚀",
                    category: "General",
                    content: "Notezilla is your premium student companion. Organize your notes by category, favorite the important ones, and keep everything synced to your browser's local storage.",
                    isFavorite: true,
                    isArchived: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                {
                    id: 2,
                    title: "Chemistry: Periodic Table",
                    category: "Science",
                    content: "Remember to study the Alkali metals for the upcoming quiz. Focused on Group 1: Lithium, Sodium, Potassium...",
                    isFavorite: false,
                    isArchived: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ];
            localStorage.setItem('notezilla-notes', JSON.stringify(this.notes));
        } else {
            this.notes = savedNotes;
        }
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

        this.init();
    }

    init() {
        this.renderNotes();
        this.renderCategories();
        this.setupEventListeners();
        this.setupTheme();
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
    }

    setupTheme() {
        const savedTheme = localStorage.getItem('notezilla-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('notezilla-theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = this.themeToggle.querySelector('i');
        if (theme === 'dark') {
            icon.setAttribute('data-lucide', 'sun');
        } else {
            icon.setAttribute('data-lucide', 'moon');
        }
        lucide.createIcons();
    }

    openModal(note = null) {
        const modalTitle = document.getElementById('modal-title');
        if (note) {
            modalTitle.innerText = 'Edit Note';
            document.getElementById('note-title').value = note.title;
            document.getElementById('note-category').value = note.category;
            document.getElementById('note-text').value = note.content;
            this.editingNoteId = note.id;
        } else {
            modalTitle.innerText = 'Create New Note';
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

    handleFormSubmit() {
        const title = document.getElementById('note-title').value;
        const category = document.getElementById('note-category').value || 'General';
        const content = document.getElementById('note-text').value;

        if (this.editingNoteId) {
            // Update existing
            const index = this.notes.findIndex(n => n.id === this.editingNoteId);
            this.notes[index] = {
                ...this.notes[index],
                title,
                category,
                content,
                updatedAt: new Date().toISOString()
            };
        } else {
            // Create new
            const newNote = {
                id: Date.now(),
                title,
                category,
                content,
                isFavorite: false,
                isArchived: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.notes.unshift(newNote);
        }

        this.saveAndRender();
        this.closeModal();
    }

    deleteNote(id) {
        if (confirm('Are you sure you want to delete this note?')) {
            this.notes = this.notes.filter(n => n.id !== id);
            this.saveAndRender();
        }
    }

    toggleFavorite(id) {
        const note = this.notes.find(n => n.id === id);
        if (note) {
            note.isFavorite = !note.isFavorite;
            this.saveAndRender();
        }
    }

    toggleArchive(id) {
        const note = this.notes.find(n => n.id === id);
        if (note) {
            note.isArchived = !note.isArchived;
            this.saveAndRender();
        }
    }

    exportNote(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        const timestamp = new Date(note.updatedAt).toLocaleString();
        const text = `
-----------------------------------------
TITLE: ${note.title}
CATEGORY: ${note.category}
LAST MODIFIED: ${timestamp}
-----------------------------------------

${note.content}

-----------------------------------------
Generated by Notezilla
        `.trim();

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    copyToClipboard(id, event) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        const originalIcon = icon.getAttribute('data-lucide');

        navigator.clipboard.writeText(`${note.title}\n\n${note.content}`).then(() => {
            icon.setAttribute('data-lucide', 'check');
            btn.style.color = '#10b981'; // Green
            lucide.createIcons();

            setTimeout(() => {
                icon.setAttribute('data-lucide', originalIcon);
                btn.style.color = '';
                lucide.createIcons();
            }, 2000);
        });
    }

    saveAndRender() {
        localStorage.setItem('notezilla-notes', JSON.stringify(this.notes));
        this.renderNotes();
        this.renderCategories();
        this.updateDatalist();
    }

    updateDatalist() {
        const uniqueCategories = [...new Set(this.notes.map(n => n.category))];
        const defaultCategories = ["General", "Mathematics", "Science", "History", "Personal"];
        const allCategories = [...new Set([...defaultCategories, ...uniqueCategories])];

        this.categoryDatalist.innerHTML = allCategories
            .map(cat => `<option value="${cat}">`)
            .join('');
    }

    renderCategories() {
        const categories = ['All', ...new Set(this.notes.map(n => n.category))];
        this.categoryFilter.innerHTML = categories.map(cat => `
            <button class="nav-item ${this.currentCategory === cat ? 'active' : ''}" onclick="app.setCategoryFilter('${cat}')">
                <i data-lucide="tag"></i>
                <span>${cat}</span>
            </button>
        `).join('');
        lucide.createIcons();
    }

    setCategoryFilter(cat) {
        this.currentCategory = cat;
        this.renderNotes();
        this.renderCategories();
    }

    getRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;

        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) return `${diffInDays}d ago`;

        return date.toLocaleDateString();
    }

    renderNotes() {
        const searchTerm = this.searchInput.value.toLowerCase();

        let filteredNotes = this.notes.filter(note => {
            const matchesSearch = note.title.toLowerCase().includes(searchTerm) ||
                note.content.toLowerCase().includes(searchTerm);

            const matchesCategory = this.currentCategory === 'All' || note.category === this.currentCategory;

            let matchesNav = true;
            if (this.currentFilter === 'fav') matchesNav = note.isFavorite;
            if (this.currentFilter === 'archive') matchesNav = note.isArchived;
            else if (this.currentFilter === 'all') matchesNav = !note.isArchived;

            return matchesSearch && matchesCategory && matchesNav;
        });

        if (filteredNotes.length === 0) {
            this.notesGrid.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="notebook-pen" size="48"></i>
                    <p>${searchTerm ? 'No matches found.' : 'You have no notes here.'}</p>
                </div>
            `;
        } else {
            this.notesGrid.innerHTML = filteredNotes.map(note => `
                <div class="note-card" onclick="app.handleNoteClick(event, ${note.id})">
                    <span class="category-tag">${note.category}</span>
                    <h3>${note.title}</h3>
                    <p>${note.content}</p>
                    <div class="note-footer">
                        <span class="note-date">${this.getRelativeTime(note.updatedAt)}</span>
                        <div class="note-actions">
                            <button class="action-btn" title="Copy to Clipboard" onclick="app.copyToClipboard(${note.id}, event); event.stopPropagation();">
                                <i data-lucide="copy"></i>
                            </button>
                            <button class="action-btn" title="Export to Text" onclick="app.exportNote(${note.id}); event.stopPropagation();">
                                <i data-lucide="download"></i>
                            </button>
                            <button class="action-btn" title="Toggle Favorite" onclick="app.toggleFavorite(${note.id}); event.stopPropagation();">
                                <i data-lucide="star" style="${note.isFavorite ? 'fill: #fbbf24; color: #fbbf24;' : ''}"></i>
                            </button>
                            <button class="action-btn" title="${note.isArchived ? 'Unarchive' : 'Archive'}" onclick="app.toggleArchive(${note.id}); event.stopPropagation();">
                                <i data-lucide="${note.isArchived ? 'rotate-ccw' : 'archive'}"></i>
                            </button>
                            <button class="action-btn delete" title="Delete Note" onclick="app.deleteNote(${note.id}); event.stopPropagation();">
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
        // If clicking on actions, don't open modal
        if (event.target.closest('.action-btn')) return;

        const note = this.notes.find(n => n.id === id);
        if (note) this.openModal(note);
    }
}

// Global instance
const app = new Notezilla();
