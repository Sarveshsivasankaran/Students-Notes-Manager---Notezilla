# Notezilla - Quick Reference Card

## 🚀 Start (60 seconds)

```
bash
npm install
npm start
# Open http://localhost:5000/public/signup.html
```

## 👥 User Roles

| Role | Signup | Approval | Can Do |
|------|--------|----------|--------|
| **Student** | ✅ @rajalakshmi.edu.in + dept + sem | ✅ Auto | Browse, rate, bookmark notes |
| **Staff** | ✅ Any email | ⏳ Admin | Upload notes (after approval) |
| **Admin** | ❌ Manual only | ✅ Auto | Approve staff, verify notes, view stats |

## 🗂️ Database

```
User (email, password, role, isApproved)
  ↓
Faculty (name, subjects[], averageRating, downloads)
Subject (name, code, department, semester, faculty[])
Note (title, type, fileUrl, downloads, isVerified, ratings)
Rating (clarity, completeness, helpfulness scores)
StudentBookmark (noteId, studentId)
```

## 🔑 Key Endpoints

### Auth
```
POST   /api/auth/signup        # Register
POST   /api/auth/login         # Login → get token
GET    /api/auth/verify        # Check token
```

### Browse
```
GET    /api/faculty            # All faculty
GET    /api/subjects           # All subjects
GET    /api/notes              # Search notes
```

### Engage
```
POST   /api/ratings            # Rate note
POST   /api/bookmarks          # Save note
DELETE /api/bookmarks/:noteId  # Unsave note
```

### Staff Upload
```
POST   /api/notes              # Upload (needs token)
PUT    /api/notes/:id          # Update own notes
POST   /api/notes/:id/download # Track downloads
```

### Admin
```
GET    /api/admin/pending-staff      # Pending approvals
POST   /api/admin/approve-staff/:id  # Approve account
GET    /api/admin/pending-notes      # Unverified content
POST   /api/admin/verify-note/:id    # Publish note
```

## 📄 Pages

| Page | URL | For | Purpose |
|------|-----|-----|---------|
| Signup | `/public/signup.html` | New users | Register with role selection |
| Login | `/public/login.html` | All | Get authentication token |
| Browse | `/public/faculty-browse.html` | Students | Discover faculty, subjects, notes |
| Faculty Detail | `/public/faculty-detail.html` | Students | View faculty profile and notes |
| Note Detail | `/public/note-detail.html` | Students | View note with ratings |
| Upload | `/public/staff-upload.html` | Faculty | Submit course materials |
| Admin | `/public/admin.html` | Admin | Approve and verify |
| Landing | `/public/index.html` | All | Landing page |

## 🎨 Colors & Theme

- Primary: `#6366f1` (Indigo)
- Secondary: `#8b5cf6` (Purple)
- Success: `#22c55e` (Green)
- Error: `#ef4444` (Red)
- Font: Outfit (Google Fonts)

## 🔒 Authentication

```
javascript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const data = await response.json();
const token = data.token;

// Use token
headers: { 'Authorization': `Bearer ${token}` }
```

## 📊 Rating System

3 metrics (1-5 scale):
- **Clarity**: How well-explained?
- **Completeness**: Is everything covered?
- **Helpfulness**: Did it help you learn?

## 🔄 File Flow

```
Student/Faculty
    ↓
Upload/Select File
    ↓
Cloud Storage (S3/Firebase/Supabase Storage)
    ↓
Store URL in Supabase PostgreSQL
    ↓
Admin Verification
    ↓
Visible to Students
```

## 🚨 Important Notes

1. **Files**: Store in cloud, not database
2. **Passwords**: Hashed with bcryptjs (10 rounds)
3. **Tokens**: Expire in 7 days
4. **Staff**: Blocked until admin approves
5. **Notes**: Hidden until admin verifies
6. **Students**: Must use @rajalakshmi.edu.in email

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Supabase error | Check SUPABASE_URL and SUPABASE_ANON_KEY in .env |
| Table not found | Run SUPABASE_SCHEMA.sql in Supabase SQL Editor |
| CORS error | Update origin in `app.use(cors())` |
| Token invalid | Login again, token expired |
| Cannot upload | Only staff can upload, must be approved |
| Note not visible | Admin must verify before publication |
| Student email rejected | Students must use @rajalakshmi.edu.in |

## 📝 Environment (.env)

```
env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_secret_key_here
NODE_ENV=development
PORT=5000
```

## ✅ Test Checklist

- [ ] Student signup with @rajalakshmi.edu.in email
- [ ] Staff signup with any email
- [ ] Staff signup and wait for approval
- [ ] Admin approves staff
- [ ] Staff uploads note
- [ ] Admin verifies note
- [ ] Student sees note
- [ ] Student rates note
- [ ] Student bookmarks note
- [ ] Search/filter works
- [ ] Download tracking increments

## 🎯 MVP Complete

✅ Authentication (3 roles)
✅ Email domain validation (@rajalakshmi.edu.in)
✅ Faculty profiles
✅ Subject browsing
✅ Note uploads
✅ Ratings (3-metric)
✅ Bookmarks/saves
✅ Admin verification
✅ Beautiful UI
✅ Full documentation

## 🚀 Deploy Checklist

- [ ] Change JWT_SECRET
- [ ] Use Supabase (not local)
- [ ] Configure storage (Supabase Storage or S3)
- [ ] Enable HTTPS
- [ ] Create first admin manually in Supabase
- [ ] Test all workflows

## 📱 Responsive Breakpoints

- Mobile: < 600px
- Tablet: 600px - 1024px
- Desktop: > 1024px

All pages auto-adapt ✨

## 🎓 Learning Paths

### Student:
1. Sign up with @rajalakshmi.edu.in → Browse faculty → Explore subjects → Download notes → Rate → Bookmark

### Staff:
1. Sign up → Wait approval → Login → Upload notes → Track downloads → See ratings

### Admin:
1. Manual account → Dashboard → Approve staff → Verify notes → View stats

---

**Questions?** Check README.md or GET_STARTED.md for complete setup instructions.
