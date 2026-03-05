# 📝 Notezilla 2.0 - Academic Notes Management System

**Notezilla** is a premium student notes management platform with full-stack capabilities. It features a beautiful modern UI, secure user authentication with role-based access control, and Supabase PostgreSQL database integration for reliable data persistence.

## ✨ Features

### User Management
- 🎭 **Three User Roles**: Students, Staff (Faculty), and Administrators
- 🔐 **Secure Authentication**: JWT tokens with bcrypt password hashing
- 📧 **Email Verification**: Students must use @rajalakshmi.edu.in email domain
- ✅ **Admin Approval System**: Staff accounts require administrator approval

### For Students
- 👨‍🏫 **Browse Faculty**: View faculty profiles and their ratings
- 📚 **Explore Subjects**: Browse subjects by department and semester
- 📄 **Access Notes**: Download verified course materials
- ⭐ **Rate & Review**: Rate notes on clarity, completeness, and helpfulness
- 🔖 **Bookmarks**: Save favorite notes for quick access
- 🔍 **Search & Filter**: Find notes by title, type, department, or semester

### For Staff/Faculty
- 📤 **Upload Notes**: Share course materials with students
- 📊 **Track Downloads**: Monitor note download statistics
- 📝 **Version Control**: Update notes while preserving version history

### For Administrators
- 👥 **Staff Management**: Approve or reject faculty registrations
- ✅ **Content Verification**: Review and verify uploaded notes
- 📈 **Dashboard**: Monitor platform activity

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v14 or higher)
- **Supabase Account** (Free tier works)
- **npm** or **yarn**

### Installation

1. **Clone the repository**
```
bash
git clone <repository-url>
cd notezilla
```

2. **Install dependencies**
```
bash
npm install
```

3. **Setup Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to SQL Editor and run the contents of `SUPABASE_SCHEMA.sql`
   - Get your project URL and anon key from Project Settings > API

4. **Setup environment variables**
Create a `.env` file:
```
env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_secret_key_here
PORT=5000
```

5. **Start the server**
```
bash
npm run dev
```

The server will run on `http://localhost:5000`

6. **Open the application**
Open your browser and go to:
```
http://localhost:5000/public/login.html
```

## 📋 Project Structure

```
notezilla/
├── models/
│   ├── db.js              # Supabase database configuration
│   └── schemas.js         # Database schemas (reference)
├── public/
│   ├── images/            # Logo and images
│   ├── login.html        # Login page
│   ├── signup.html       # Sign up page
│   ├── index.html        # Landing page
│   ├── faculty-browse.html # Student dashboard
│   ├── faculty-detail.html  # Faculty profile page
│   ├── note-detail.html  # Note details with ratings
│   ├── staff-upload.html # Staff note upload
│   ├── admin.html        # Admin dashboard
│   ├── app.js           # Legacy app logic
│   ├── script.js        # Legacy scripts
│   └── style.css        # Legacy styles
├── server.js             # Express server with API routes
├── SUPABASE_SCHEMA.sql   # Database schema
├── SUPABASE_SETUP.md     # Supabase setup guide
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## 🔧 API Endpoints

### Authentication
- **POST** `/api/auth/signup` - Register new user (student/staff)
- **POST** `/api/auth/login` - Login user
- **GET** `/api/auth/verify` - Verify JWT token

### Faculty
- **GET** `/api/faculty` - List all faculty with filters
- **GET** `/api/faculty/:id` - Get faculty profile
- **GET** `/api/faculty/:id/notes` - Get faculty's verified notes

### Subjects
- **GET** `/api/subjects` - List subjects with filters
- **GET** `/api/subjects/:id` - Get subject details with notes

### Notes
- **GET** `/api/notes` - Search/filter verified notes
- **GET** `/api/notes/:id` - Get note details
- **POST** `/api/notes` - Upload new note (staff only)
- **PUT** `/api/notes/:id` - Update note (staff only)
- **POST** `/api/notes/:id/download` - Track download

### Ratings
- **** `/api/rGETatings/note/:id` - Get note ratings
- **POST** `/api/ratings` - Submit rating (student only)

### Bookmarks
- **GET** `/api/bookmarks` - Get student's bookmarks
- **POST** `/api/bookmarks` - Add bookmark
- **DELETE** `/api/bookmarks/:noteId` - Remove bookmark

### Admin
- **GET** `/api/admin/pending-staff` - Get pending staff
- **POST** `/api/admin/approve-staff/:id` - Approve staff
- **GET** `/api/admin/pending-notes` - Get unverified notes
- **POST** `/api/admin/verify-note/:id` - Verify note

## 🔐 Authentication Flow

1. **Sign Up**: 
   - User selects role (Student/Staff)
   - Students must use @rajalakshmi.edu.in email
   - Staff require admin approval before uploading

2. **Login**: 
   - Credentials verified against database
   - JWT token generated with 7-day expiration
   - Token stored in localStorage

3. **Role-Based Access**:
   - Students: Browse, download, rate, bookmark
   - Staff: Upload, update notes
   - Admin: Approve staff, verify content

## 💾 Database Schema

### Users Table
```
sql
- id: UUID (primary key)
- name: text
- email: text (unique)
- password: text (hashed)
- role: text ('student', 'staff', 'admin')
- department: text
- semester: integer
- is_approved: boolean
- created_at: timestamp
```

### Faculty Table
```
sql
- id: UUID (primary key)
- user_id: UUID (references users)
- bio: text
- office_hours: text
- availability: text
- average_rating: decimal
- total_downloads: integer
```

### Subjects Table
```
sql
- id: UUID (primary key)
- name: text
- code: text (unique)
- department: text
- semester: integer
- credits: integer
```

### Notes Table
```
sql
- id: UUID (primary key)
- subject_id: UUID (references subjects)
- faculty_id: UUID (references faculty)
- title: text
- type: text ('notes', 'ppt', 'assignment', 'pyq', 'solution')
- unit: integer
- semester: integer
- file_url: text
- file_name: text
- is_verified: boolean
- version: integer
- downloads: integer
```

### Ratings Table
```
sql
- id: UUID (primary key)
- note_id: UUID (references notes)
- student_id: UUID (references users)
- clarity_rating: integer (1-5)
- completeness_rating: integer (1-5)
- helpfulness_rating: integer (1-5)
- review_text: text
```

### Student Bookmarks Table
```
sql
- id: UUID (primary key)
- student_id: UUID (references users)
- note_id: UUID (references notes)
- saved_at: timestamp
```

## 🎨 UI/UX Features

- **Modern Glassmorphism Design**: Beautiful dark theme with purple accents
- **Responsive Layout**: Works on desktop, tablet, and mobile
- **Real-time Search**: Find faculty, subjects, and notes instantly
- **Faculty Ratings**: See average ratings and download counts
- **Star Rating System**: Rate notes on multiple criteria
- **Tabbed Navigation**: Easy switching between views
- **Loading States**: Smooth loading indicators
- **Error Handling**: User-friendly error messages

## 🛠 Development

### Run in development mode:
```
bash
npm run dev
```

### Run in production:
```
bash
npm start
```

## 📦 Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: Supabase PostgreSQL
- **Authentication**: JWT (jsonwebtoken), bcryptjs

## 🔒 Security Features

- ✅ Password hashing with bcryptjs
- ✅ JWT token-based authentication
- ✅ Role-based access control
- ✅ CORS protection
- ✅ Protected API endpoints
- ✅ Automatic token expiration (7 days)
- ✅ Input validation
- ✅ Admin approval workflow

## 📝 Usage Examples

### Student Workflow
1. Sign up with @rajalakshmi.edu.in email
2. Browse faculty and subjects
3. Search for relevant notes
4. Download notes
5. Rate and review notes
6. Bookmark favorites

### Staff Workflow
1. Sign up with institutional email
2. Wait for admin approval
3. Upload course materials
4. Update notes as needed

### Admin Workflow
1. Login with admin credentials
2. Review pending staff registrations
3. Approve or reject staff
4. Verify uploaded notes

## 🚀 Deployment

### Deploy to Vercel/Render:
1. Set environment variables in hosting dashboard
2. Connect GitHub repository
3. Deploy automatically

### Custom Domain:
Configure your domain in the hosting provider's dashboard

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 👨‍💻 Author

Built with ❤️ by the Notezilla Team
For Rajalakshmi Engineering College

---

**Happy Note Taking!** 📚✨
