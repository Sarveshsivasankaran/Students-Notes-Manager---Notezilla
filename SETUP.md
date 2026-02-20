# Notezilla - Faculty-Structured Academic Repository

## 🎯 Project Overview

Notezilla is a modern academic content management platform that enables:
- **Students** to browse faculty profiles, access subject materials, rate notes, and save favorites
- **Faculty** to organize and upload educational content with version control
- **Admin** to approve faculty accounts, verify content quality, and manage the platform

## 🏗️ Architecture

### Database Collections
- **User** - Authentication & role management (Student/Staff/Admin)
- **Faculty** - Faculty profiles with subjects, ratings, and metrics
- **Subject** - Course/subject definitions with faculty assignments
- **Note** - Educational materials (PDFs) with metadata, AI summaries, versions
- **Rating** - Student feedback on note clarity, completeness, helpfulness
- **StudentBookmark** - Save/bookmark functionality for students

### File Storage
- PDFs stored in cloud (AWS S3 or Firebase) - NOT in MongoDB
- Metadata stored in MongoDB with fileUrl reference

## ⚙️ Technology Stack

```
Frontend: HTML5, CSS3, Vanilla JavaScript
Backend: Node.js + Express.js v5.2.1
Database: MongoDB + Mongoose ODM v8.23.0
Authentication: JWT + bcryptjs
File Upload: Cloud-ready (S3/Firebase integration needed)
Icons: Lucide Icons (CDN)
```

## 📋 Prerequisites

- **Node.js** v16+ 
- **MongoDB** v4.4+ (local or Atlas cloud)
- **npm** or **yarn**

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup MongoDB
```bash
# Option A: Local MongoDB
mongod

# Option B: MongoDB Atlas (Cloud)
# Create cluster at https://www.mongodb.com/cloud/atlas
# Copy connection string
```

### 3. Create .env File
```bash
cp .env.example .env
```

Edit `.env`:
```env
MONGODB_URI=mongodb://localhost:27017/notezilla
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/notezilla

JWT_SECRET=your_super_secret_key_change_this_in_production

# Cloud Storage (optional - Phase 2)
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### 4. Start the Server
```bash
npm start
# Server runs on http://localhost:3000
```

### 5. Open in Browser
- Login: `http://localhost:3000/public/login.html`
- SignUp: `http://localhost:3000/public/signup.html`

## 👥 User Roles & Workflows

### Student Flow
1. Sign up with email, password, department, semester
2. Browse faculty → Browse subjects → View notes
3. Rate notes (clarity, completeness, helpfulness)
4. Bookmark/save notes for later
5. Download notes and track progress

### Staff (Faculty) Flow
1. Request account (email required)
2. Wait for admin approval
3. Once approved, get access to upload interface
4. Upload notes: PDF file → metadata → select subject
5. Track download statistics
6. Update notes with version control
7. View student ratings and feedback

### Admin Flow
1. Access admin dashboard
2. Approve pending staff accounts
3. Verify/approve uploaded notes
4. View platform analytics
5. Moderate content

## 📡 API Endpoints

### Auth
- `POST /api/auth/signup` - Register user
- `POST /api/auth/login` - Login
- `GET /api/auth/verify` - Verify token

### Faculty
- `GET /api/faculty` - List all faculty
- `GET /api/faculty/:id` - Faculty profile
- `GET /api/faculty/:id/notes` - Faculty's notes

### Subjects
- `GET /api/subjects` - List subjects (filterable)
- `GET /api/subjects/:id` - Subject details with notes

### Notes
- `GET /api/notes` - Search/filter notes
- `GET /api/notes/:id` - Note details
- `POST /api/notes` - Upload note (staff only)
- `PUT /api/notes/:id` - Update note (staff only)
- `POST /api/notes/:id/download` - Track downloads

### Ratings
- `POST /api/ratings` - Submit rating (student only)
- `GET /api/ratings/note/:noteId` - Get rating stats

### Bookmarks
- `GET /api/bookmarks` - Get user bookmarks (student)
- `POST /api/bookmarks` - Save note (student)
- `DELETE /api/bookmarks/:noteId` - Remove bookmark (student)

### Admin
- `GET /api/admin/pending-staff` - Pending approvals
- `POST /api/admin/approve-staff/:userId` - Approve staff
- `GET /api/admin/pending-notes` - Unverified notes
- `POST /api/admin/verify-note/:noteId` - Verify content

## 📁 Project Structure

```
├── server.js                 # Express server & API endpoints
├── models/
│   └── schemas.js           # MongoDB schemas (User, Faculty, Subject, etc)
├── public/
│   ├── login.html           # Login page
│   ├── signup.html          # Signup with role selection
│   ├── app.js               # Frontend app logic
│   ├── script.js            # Notes dashboard
│   └── style.css            # Global styles (purple theme)
├── index.html               # Main dashboard
├── package.json             # Dependencies
├── .env.example             # Environment template
└── .gitignore               # Git ignore rules
```

## 🎨 Design System

- **Primary Color**: Purple (#6366f1, #8b5cf6) - Rajalakshmi theme
- **Font**: Outfit (Google Fonts)
- **Icons**: Lucide Icons (CDN)
- **Responsive**: Mobile-first design

## 🔐 Authentication Flow

1. User signs up with role (student/staff)
2. Password hashed with bcryptjs (10 salt rounds)
3. JWT token issued (7-day expiry)
4. Staff accounts require admin approval before login
5. Token stored in localStorage
6. Each API request includes Authorization header

## ⚠️ Important Notes

### For Staff Uploads
- Configure S3 or Firebase before deploying
- File uploads currently accept fileUrl string (for now)
- In Phase 2: implement actual multipart file uploads

### For Production
- Change JWT_SECRET to strong value
- Use MongoDB Atlas instead of local
- Enable CORS properly for your domain
- Implement rate limiting
- Add HTTPS
- Use environment variables for all secrets

## 🐛 Troubleshooting

### "Connection refused" error
```bash
# Check MongoDB is running
mongod

# Check server port
lsof -i :3000
```

### "Module not found"
```bash
rm -rf node_modules
npm install
```

### CORS errors
- Update CORS origin in server.js if using different port
- Check `app.use(cors())` configuration

### Token expiration
- Clear localStorage and login again
- Tokens expire after 7 days

## 📚 API Usage Examples

### Student Login & Browse Notes
```javascript
// 1. Login
const loginRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@example.com', password: 'password' })
});
const { token } = await loginRes.json();
localStorage.setItem('token', token);

// 2. Get subjects
const subjectsRes = await fetch('/api/subjects?department=CSE&semester=3');
const subjects = await subjectsRes.json();

// 3. Get notes for subject
const notesRes = await fetch(`/api/notes?subject=${subjectId}`);
const notes = await notesRes.json();

// 4. Rate a note
await fetch('/api/ratings', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
        noteId,
        clarity: 5,
        completeness: 4,
        helpfulness: 5,
        review: 'Great notes!'
    })
});

// 5. Bookmark note
await fetch('/api/bookmarks', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ noteId })
});
```

### Staff Upload Notes
```javascript
// After admin approval, staff can upload
const uploadRes = await fetch('/api/notes', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${staffToken}`
    },
    body: JSON.stringify({
        subject: subjectId,
        title: 'Data Structures - Unit 1',
        type: 'notes',        // notes, ppt, assignment, pyq, solution
        unit: 1,
        semester: 3,
        fileUrl: 'https://s3.amazonaws.com/bucket/notes.pdf',
        fileName: 'Data_Structures_Unit1.pdf'
    })
});
```

## 📞 Support

For issues:
1. Check server console for error logs
2. Verify MongoDB connection
3. Check .env file configuration
4. Clear browser cache and localStorage

## 🎓 What's Included (MVP)

✅ Authentication (role-based)
✅ Faculty listing & profiles
✅ Subject browsing
✅ Notes upload (metadata)
✅ Notes download tracking
✅ Basic search
✅ Star/bookmark system
✅ Rating system (3 metrics)
✅ Staff approval workflow
✅ Admin verification
✅ Beautiful purple UI

## 🚧 Phase 2 Features (Not Included)

⏳ AI-generated summaries
⏳ Flashcard generation
⏳ Key points extraction
⏳ Advanced search with filters
⏳ Faculty availability booking
⏳ Analytics dashboard
⏳ Video support
⏳ Live chat with faculty

## 📜 License

Academic use only. Internal deployment for Rajalakshmi Engineering College.

---

**Ready to ship!** 🚀 Follow the Quick Start steps above to get running in < 5 minutes.
