# Notezilla - Quick Reference Card

## 🚀 Start (60 seconds)

```bash
npm install
npm start
# Open http://localhost:3000/public/signup.html
```

## 👥 User Roles

| Role | Signup | Approval | Can Do |
|------|--------|----------|--------|
| **Student** | ✅ Email + dept + sem | ✅ Auto | Browse, rate, bookmark notes |
| **Staff** | ✅ Email only | ⏳ Admin | Upload notes (after approval) |
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
DELETE /api/bookmarks/{id}     # Unsave note
```

### Staff Upload
```
POST   /api/notes              # Upload (needs token)
PUT    /api/notes/:id          # Update own notes
POST   /api/notes/:id/download # Track downloads
```

### Admin
```
GET    /api/admin/pending-staff     # Pending approvals
POST   /api/admin/approve-staff/:id # Approve account
GET    /api/admin/pending-notes     # Unverified content
POST   /api/admin/verify-note/:id   # Publish note
```

## 📄 Pages

| Page | URL | For | Purpose |
|------|-----|-----|---------|
| Signup | `/public/signup.html` | New users | Register with role selection |
| Login | `/public/login.html` | All | Get authentication token |
| Browse | `/public/faculty-browse.html` | Students | Discover faculty, subjects, notes |
| Upload | `/public/staff-upload.html` | Faculty | Submit course materials |
| Dashboard | `/index.html` | All | Main hub (legacy) |

## 🎨 Colors & Theme

- Primary: `#6366f1` (Indigo)
- Secondary: `#8b5cf6` (Purple)
- Success: `#22c55e` (Green)
- Error: `#ef4444` (Red)
- Font: Outfit (Google Fonts)
- Icons: Lucide (CDN)

## 🔒 Authentication

```javascript
// Login
const token = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});

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
Cloud Storage (S3/Firebase)
    ↓
Store URL in MongoDB
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

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| MongoDB error | Ensure `mongod` running or check Atlas connection |
| CORS error | Update origin in `app.use(cors())` |
| Token invalid | Login again, token expired |
| Cannot upload | Only staff can upload, must be approved |
| Note not visible | Admin must verify before publication |

## 📝 Environment (.env)

```env
MONGODB_URI=mongodb://localhost:27017/notezilla
JWT_SECRET=your_secret_key_here
NODE_ENV=development
PORT=3000
```

## ✅ Test Checklist

- [ ] Student signup with department/semester
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
- [ ] Use MongoDB Atlas
- [ ] Configure AWS S3/Firebase
- [ ] Enable HTTPS
- [ ] Create first admin
- [ ] Test all workflows
- [ ] Setup error logging
- [ ] Configure email (optional)

## 📱 Responsive Breakpoints

- Mobile: < 600px
- Tablet: 600px - 1024px
- Desktop: > 1024px

All pages auto-adapt ✨

## 🎓 Learning Paths

### Student:
1. Sign up → Browse faculty → Explore subjects → Download notes → Rate → Bookmark

### Staff:
1. Sign up → Wait approval → Login → Upload notes → Track downloads → See ratings

### Admin:
1. Manual account → Dashboard → Approve staff → Verify notes → View stats

---

**Questions?** Check SETUP.md for complete API documentation and examples.
