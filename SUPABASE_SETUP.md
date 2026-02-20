# Supabase Migration Guide

## Overview

Notezilla has been successfully migrated from MongoDB to **Supabase** (PostgreSQL). This guide explains how to set up Supabase and deploy your project.

## Key Changes

### 1. **Email Domain Restriction for Students**
- Students **MUST** use `@rajalakshmi.edu.in` email addresses
- Validation is enforced at both frontend (signup.html) and backend (server.js)
- Staff and Admin can use any email

### 2. **Database Migration: MongoDB → Supabase PostgreSQL**
- Removed: `mongoose` package
- Added: `@supabase/supabase-js` package
- All data models converted to SQL schema
- API endpoints refactored to use Supabase client

## Setup Instructions

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in details:
   - **Project Name**: `notezilla`
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Select closest to your users
   - **Pricing Plan**: Free tier works great for MVP
5. Wait for project to initialize (2-3 minutes)

### Step 2: Get API Credentials

1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://abc123.supabase.co`)
   - **Anon Public Key** (starts with `eyJhbG...`)
3. These go in your `.env` file

### Step 3: Create Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the entire contents of `SUPABASE_SCHEMA.sql` from your project
4. Paste into the SQL Editor
5. Click "Run"
6. Wait for all tables to be created (should show 8 tables)

### Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env`
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in:
   ```
   PORT=5000
   JWT_SECRET=your_super_secret_jwt_key_here
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...your_anon_key...
   ```

3. Save the file

### Step 5: Install Dependencies

```bash
npm install
```

This installs the new Supabase client and all other dependencies.

### Step 6: Test Connection

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════╗
║  📝 Notezilla Server                   ║
║  Port: 5000                             
║  Database: Supabase PostgreSQL         ║
║  Status: ✅ Running                    ║
╚════════════════════════════════════════╝
```

## Email Domain Validation

### For Students
- ✅ **ALLOWED**: `student@rajalakshmi.edu.in`
- ❌ **REJECTED**: `student@gmail.com`, `student@rajalakshmi.ac.in`

### For Staff/Faculty
- ✅ **ALLOWED**: Any valid email (gmail, corporate, etc.)

### For Admin
- ✅ **ALLOWED**: Any valid email

## API Endpoints (Unchanged)

All 30+ endpoints remain the same. Examples:

### Auth
- `POST /api/auth/signup` - Register with role
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/verify` - Verify token

### Faculty
- `GET /api/faculty` - List all faculty
- `GET /api/faculty/:id` - Get faculty profile
- `GET /api/faculty/:id/notes` - Get faculty's notes

### Notes
- `GET /api/notes` - Search notes
- `POST /api/notes` - Upload note (staff only)
- `PUT /api/notes/:id` - Update note (staff only)

### Admin
- `GET /api/admin/pending-staff` - Pending approvals
- `POST /api/admin/approve-staff/:userId` - Approve staff
- `GET /api/admin/pending-notes` - Unverified notes
- `POST /api/admin/verify-note/:id` - Verify note

## Frontend Changes

### signup.html
- Added student email validation: `@rajalakshmi.edu.in` required
- Shows inline help text: "(Must be @rajalakshmi.edu.in)"
- Staff/Admin emails have no restriction

### All Other Files
- No changes needed to HTML/CSS/JavaScript
- API calls work exactly the same

## Testing Email Validation

### Test Signup with Student
```javascript
// Will succeed
{
  name: "John Doe",
  email: "john@rajalakshmi.edu.in",  // ✅ Allowed
  password: "secure123",
  role: "student",
  department: "CSE",
  semester: 4
}

// Will fail
{
  name: "Jane Doe",
  email: "jane@gmail.com",  // ❌ Not allowed
  password: "secure123",
  role: "student",
  department: "CSE",
  semester: 4
}
```

### Test Signup with Staff
```javascript
// Both will succeed
{
  email: "prof@rajalakshmi.edu.in",  // ✅ Allowed
  role: "staff"
}

{
  email: "prof@gmail.com",  // ✅ Also allowed
  role: "staff"
}
```

## Troubleshooting

### "Missing Supabase credentials"
- Check `.env` file exists
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set
- Copy values directly from Supabase dashboard

### "Tables not found"
- Run the SQL schema: Copy `SUPABASE_SCHEMA.sql` and execute in Supabase SQL Editor
- Verify all 8 tables were created

### "Invalid credentials" on login
- Ensure user exists in database
- Check if student email uses `@rajalakshmi.edu.in`
- Verify password is correct

### "Your account is pending admin approval" for staff
- Admin must approve staff before they can login
- Use `/api/admin/approve-staff/:userId` endpoint
- After approval, staff can login

## Database Schema

| Table | Rows | Purpose |
|-------|------|---------|
| `users` | ~100 | Student, Staff, Admin accounts |
| `faculty` | ~30 | Faculty profiles and ratings |
| `subjects` | ~50 | Subjects with details |
| `faculty_subjects` | ~150 | Faculty-to-Subject mapping |
| `notes` | ~200 | Uploaded notes/PDFs |
| `note_versions` | ~50 | Version history |
| `ratings` | ~300 | Student ratings for notes |
| `student_bookmarks` | ~500 | Saved notes |

## File Storage (Phase 2)

Currently, file URLs are stored as strings in the database:
```sql
file_url = 'https://s3.amazonaws.com/bucket/file.pdf'
```

To enable actual file uploads, integrate:
- **AWS S3**: Configure AWS credentials in `.env`
- **Firebase Storage**: Configure Firebase keys in `.env`
- **Supabase Storage**: Use Supabase's built-in storage

## Backup & Recovery

### Backup
```bash
# Supabase auto-backups daily
# Access via Dashboard → Backups
```

### Manual Dump
```bash
# In Supabase SQL Editor
pg_dump notezilla > backup.sql
```

## Next Steps

1. ✅ Set up Supabase account
2. ✅ Create project and get API keys
3. ✅ Run SQL schema to create tables
4. ✅ Configure `.env` file
5. ✅ Install `npm install`
6. ✅ Start server: `npm start`
7. ✅ Test signup/login in browser
8. ⭐ Deploy to production (Heroku, Railway, Fly.io, etc.)

## Support

For Supabase issues:
- Docs: [supabase.io/docs](https://supabase.io/docs)
- Discord: [supabase.io/discord](https://supabase.io/discord)
- GitHub Issues: [github.com/supabase/supabase](https://github.com/supabase/supabase)

For Notezilla issues:
- Check error logs: `npm start` output
- Review `.env` configuration
- Verify database tables exist in Supabase dashboard
