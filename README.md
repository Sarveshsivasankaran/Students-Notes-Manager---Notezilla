# Notezilla 2.0

Notezilla is a full-stack academic notes platform for Rajalakshmi Engineering College. It combines a structured Supabase-backed repository with Google Drive faculty folders, role-based dashboards, real-time activity, AI study tools, productivity tracking, and a Daily DSA learning module.

## Highlights

### Student experience

- Browse subjects, faculty folders, and verified study materials.
- Preview PDFs inside the dashboard with a selectable text layer.
- Ask Aadhi questions about a note or generate a complete AI summary.
- Highlight PDF text to create flashcards or request a focused explanation.
- Bookmark database and Google Drive notes, with a personal Bookmarks view.
- Discover the most-bookmarked notes across the website.
- Rate notes for clarity, completeness, and helpfulness.
- Manage personal tasks and daily planner sessions.
- View a productivity score derived from completed goals and recent study activity.
- Upload and replace a private semester timetable image, then open it in a zoomable overlay.
- Follow a personalized 14-day Daily DSA roadmap with code execution and progress tracking.

### Staff and administration

- Staff registration with administrator approval.
- Faculty profiles, subject mapping, office-hour extraction, and repository management.
- Shared Google Drive faculty-folder synchronization.
- Note download tracking and note version updates.
- Administrator workflows for approving staff and verifying or rejecting notes.

### Platform features

- JWT authentication and role-based authorization.
- Supabase PostgreSQL persistence.
- Real-time Socket.IO presence and dashboard synchronization.
- Landing-page statistics sourced from Supabase and the live Google Drive repository.
- Aadhi general support chat powered through the configured AI provider.
- Responsive glassmorphism interface for desktop, tablet, and mobile.

## Technology stack

- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend: Node.js, Express 5
- Database: Supabase PostgreSQL
- Real-time events: Socket.IO
- Authentication: JWT and bcryptjs
- AI: Google Gemini and OpenRouter-compatible models
- Documents: PDF.js in the browser, plus PDF and Office parsing on the server
- Repository integration: Google Drive shared-folder tree

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project
- A publicly readable Google Drive repository folder, if Drive browsing is required
- Gemini and/or OpenRouter credentials for AI features

## Installation

1. Clone the repository and enter the project directory.

   ```bash
   git clone <repository-url>
   cd Students-Notes-Manager---Notezilla
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Create the Supabase tables.

   Run `UPDATED_SCHEMA.sql` in the Supabase SQL Editor. See `SUPABASE_SETUP.md` for additional setup guidance.

4. Create a `.env` file in the project root.

   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_key
   JWT_SECRET=replace_with_a_long_random_secret
   PORT=5000

   GOOGLE_DRIVE_ROOT_FOLDER_ID=your_shared_drive_root_folder_id

   GEMINI_API_KEY=your_gemini_api_key
   OPENROUTER_API_KEY=your_openrouter_api_key
   OPENROUTER_MODEL=your_preferred_openrouter_model
   ```

   AI features require the relevant provider key. Do not commit `.env`.

5. Start the development server.

   ```bash
   npm run dev
   ```

6. Open the application.

   - Landing page: `http://localhost:5000/`
   - Login: `http://localhost:5000/login.html`
   - Student dashboard: `http://localhost:5000/student-dashboard.html`

For production-style startup, use:

```bash
npm start
```

## Project structure

```text
.
|-- ai-service.js                 # AI analysis and Aadhi chat integration
|-- models/
|   |-- db.js                     # Supabase client
|   `-- schemas.js                # Schema reference models
|-- public/
|   |-- index.html                # Public landing page
|   |-- login.html                # Login
|   |-- signup.html               # Registration
|   |-- student-dashboard.html    # Student dashboard and PDF study tools
|   |-- student-dashboard.js      # Student dashboard behavior
|   |-- student-dashboard.css     # Student dashboard styling
|   |-- note-detail.html          # Note details, ratings, and bookmarks
|   |-- staff-upload.html         # Staff workspace
|   |-- admin.html                # Administrator workspace
|   `-- images/                   # Static images and branding
|-- server.js                     # Express API and application server
|-- socket-handler.js             # Real-time presence and notifications
|-- UPDATED_SCHEMA.sql            # Current Supabase schema
|-- SUPABASE_SCHEMA.sql           # Base schema reference
|-- SUPABASE_SETUP.md             # Supabase setup guide
`-- package.json                  # Scripts and dependencies
```

Uploaded timetable images are stored per user under `data/timetables/`. This directory is ignored by Git and should be placed on persistent storage when deploying the Express server.

## Main API groups

### Authentication

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/verify`

### Public data and repository

- `GET /api/public/stats`
- `GET /api/drive/faculty-repository`
- `POST /api/drive/sync` — staff only
- `GET /api/faculty`
- `GET /api/faculty/:id`
- `GET /api/subjects`
- `GET /api/subjects/:id`
- `GET /api/notes`
- `GET /api/notes/:id`

### Bookmarks and ratings

- `GET /api/bookmarks`
- `GET /api/bookmarks/top`
- `POST /api/bookmarks`
- `DELETE /api/bookmarks/:noteId`
- `GET /api/ratings/note/:id`
- `POST /api/ratings`

### AI note tools

- `POST /api/chat`
- `GET /api/notes/:id/content`
- `POST /api/notes/:id/analyze`
- `POST /api/notes/:id/chat`
- `POST /api/drive/content`
- `POST /api/drive/analyze`
- `POST /api/drive/chat`

### Productivity and timetable

- `GET|POST /api/user/tasks`
- `PUT|DELETE /api/user/tasks/:id`
- `GET|POST /api/user/planner`
- `PUT|DELETE /api/user/planner/:id`
- `GET /api/user/progress`
- `GET|POST /api/user/activity`
- `GET|POST /api/user/timetable`

### Daily DSA

- `GET /api/dsa/daily`
- `POST /api/dsa/preference`
- `POST /api/dsa/run`
- `POST /api/dsa/progress`

### Administration

- `GET /api/admin/pending-staff`
- `POST /api/admin/approve-staff/:userId`
- `DELETE /api/admin/reject-staff/:userId`
- `GET /api/admin/pending-notes`
- `POST /api/admin/verify-note/:id`
- `DELETE /api/admin/reject-note/:id`

Protected routes require:

```http
Authorization: Bearer <jwt-token>
```

## Real-time behavior

Socket.IO tracks connected website sessions and removes disconnected sessions from the online count. The landing page combines this presence stream with repository totals from Supabase and Google Drive. The real-time server also publishes progress synchronization, announcement, upload, and repository-update events for connected clients.

## Security notes

- Passwords are hashed with bcryptjs.
- JWTs carry the authenticated user identity and role.
- Server-side middleware protects role-specific routes.
- Students must register with the configured institutional email domain.
- Staff accounts require administrator approval.
- Timetable uploads are authenticated, limited to 5 MB, and validated as PNG, JPG, or WebP files.
- Secrets belong in `.env`; never expose provider or database keys in frontend code.

For a public deployment, review CORS settings, use a strong JWT secret, configure HTTPS, and use persistent storage for `data/timetables/`.

## License

ISC, as declared in `package.json`.

## Authors

Built by the Notezilla team for Rajalakshmi Engineering College.
