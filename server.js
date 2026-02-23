/**
 * Notezilla Server - Faculty-Structured Academic Repository
 * Supabase PostgreSQL Backend with Role-Based Authentication
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { supabase, initializeDatabase } = require('./models/db');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Also serve the public folder under /public to support direct links like /public/index.html
app.use('/public', express.static(path.join(__dirname, 'public')));

// Initialize database
initializeDatabase().catch(err => console.error('DB init error:', err));

// JWT Secret
const jwtSecret = process.env.JWT_SECRET || 'notezilla_secret_key_2024';

// ==================== HELPER FUNCTIONS ====================

/**
 * Authenticate JWT Token and Extract User Info
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid token' });
        }
        req.userId = user.userId;
        req.userRole = user.role;
        next();
    });
};

/**
 * Role-based access control middleware
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.userRole)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }
        next();
    };
};

// ==================== AUTH ROUTES ====================

/**
 * User Registration (Student, Staff, Admin)
 * POST /api/auth/signup
 */
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password, role, department, semester } = req.body;

        // Validation
        if (!name || !email || !password || !role) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (!['student', 'staff', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        // Student email domain validation - ONLY @rajalakshmi.edu.in allowed
        if (role === 'student' && !email.endsWith('@rajalakshmi.edu.in')) {
            return res.status(400).json({
                success: false,
                message: 'Students must use @rajalakshmi.edu.in email address'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        if (role === 'student' && (!department || !semester)) {
            return res.status(400).json({
                success: false,
                message: 'Department and semester are required for students'
            });
        }

        // Check if email already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle(); // Better than single() for existence check

        if (checkError) {
            console.error('Email check error:', checkError);
            throw checkError;
        }

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash password
        const salt = await bcryptjs.genSalt(10);
        const hashedPassword = await bcryptjs.hash(password, salt);

        // Create user
        const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({
                name,
                email: email.toLowerCase(),
                password: hashedPassword,
                role,
                department: role === 'student' ? department : null,
                semester: role === 'student' ? parseInt(semester) : null,
                is_approved: role === 'staff' ? false : true
            })
            .select('*')
            .single();

        if (userError) {
            console.error('User creation error:', userError);
            throw userError;
        }

        // If staff, create faculty record
        if (role === 'staff') {
            const { error: facultyError } = await supabase
                .from('faculty')
                .insert({
                    user_id: newUser.id
                });

            if (facultyError) {
                throw facultyError;
            }
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: newUser.id, role: newUser.role },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: role === 'staff' ? 'Registration successful! Awaiting admin approval.' : 'User registered successfully',
            token,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isApproved: newUser.is_approved
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        const msg = (error && (error.message || error.msg)) ? (error.message || error.msg) : 'Server error during signup';
        res.status(500).json({
            success: false,
            message: msg
        });
    }
});

/**
 * User Login
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Validate student email domain
        if (email.includes('@rajalakshmi.edu.in') && !email.endsWith('@rajalakshmi.edu.in')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid student email format'
            });
        }

        // Find user
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email.toLowerCase())
            .single();

        if (fetchError || !user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Verify password
        const isPasswordValid = await bcryptjs.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if staff is approved
        if (user.role === 'staff' && !user.is_approved) {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending admin approval'
            });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isApproved: user.is_approved
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        const msg = (error && (error.message || error.msg)) ? (error.message || error.msg) : 'Server error during login';
        res.status(500).json({
            success: false,
            message: msg
        });
    }
});

/**
 * Verify Token
 * GET /api/auth/verify
 */
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('id, name, email, role')
            .eq('id', req.userId)
            .single();

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Token verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error verifying token'
        });
    }
});

// ==================== FACULTY ROUTES ====================

/**
 * GET All Faculty with Filters
 * GET /api/faculty?department=CSE&availability=available
 */
app.get('/api/faculty', async (req, res) => {
    try {
        const { department, availability } = req.query;

        let query = supabase
            .from('faculty')
            .select(`
                id,
                user_id,
                users(name, email, department),
                bio,
                office_hours,
                availability,
                average_rating,
                total_downloads
            `);

        if (availability) {
            query = query.eq('availability', availability);
        }

        if (department) {
            query = query.eq('users.department', department);
        }

        const { data, error } = await query;

        if (error) throw error;

        const formattedData = data.map(faculty => ({
            id: faculty.id,
            name: faculty.users?.name || 'Unknown',
            email: faculty.users?.email || '',
            bio: faculty.bio,
            availability: faculty.availability,
            averageRating: faculty.average_rating,
            totalDownloads: faculty.total_downloads,
            officeHours: faculty.office_hours
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Faculty list error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching faculty'
        });
    }
});

/**
 * GET Faculty Profile
 * GET /api/faculty/:id
 */
app.get('/api/faculty/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('faculty')
            .select(`
                id,
                user_id,
                users(name, email, department),
                bio,
                office_hours,
                availability,
                average_rating,
                total_downloads
            `)
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({
                success: false,
                message: 'Faculty not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: data.id,
                name: data.users?.name || 'Unknown',
                email: data.users?.email || '',
                bio: data.bio,
                availability: data.availability,
                averageRating: data.average_rating,
                totalDownloads: data.total_downloads,
                officeHours: data.office_hours
            }
        });
    } catch (error) {
        console.error('Faculty detail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching faculty'
        });
    }
});

/**
 * GET Faculty Notes
 * GET /api/faculty/:id/notes?semester=4&type=notes
 */
app.get('/api/faculty/:id/notes', async (req, res) => {
    try {
        const { semester, type } = req.query;

        let query = supabase
            .from('notes')
            .select(`
                id,
                title,
                type,
                subject_id,
                subjects(name, code),
                unit,
                semester,
                file_url,
                file_name,
                is_verified,
                version,
                downloads,
                created_at
            `)
            .eq('faculty_id', req.params.id)
            .eq('is_verified', true);

        if (semester) {
            query = query.eq('semester', parseInt(semester));
        }

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        const formattedData = data.map(note => ({
            id: note.id,
            title: note.title,
            type: note.type,
            unit: note.unit,
            semester: note.semester,
            fileUrl: note.file_url,
            fileName: note.file_name,
            version: note.version,
            downloads: note.downloads,
            subject: note.subjects?.name || 'Unknown',
            createdAt: note.created_at
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Faculty notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching faculty notes'
        });
    }
});

// ==================== SUBJECT ROUTES ====================

/**
 * GET All Subjects with Filters
 * GET /api/subjects?department=CSE&semester=4
 */
app.get('/api/subjects', async (req, res) => {
    try {
        const { department, semester } = req.query;

        let query = supabase
            .from('subjects')
            .select(`
                id,
                name,
                code,
                department,
                semester,
                credits,
                description
            `);

        if (department) {
            query = query.eq('department', department);
        }

        if (semester) {
            query = query.eq('semester', parseInt(semester));
        }

        const { data, error } = await query.order('semester, code');

        if (error) throw error;

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Subjects list error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subjects'
        });
    }
});

/**
 * GET Subject Details with Notes
 * GET /api/subjects/:id
 */
app.get('/api/subjects/:id', async (req, res) => {
    try {
        const { data: subject, error: subjectError } = await supabase
            .from('subjects')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (subjectError || !subject) {
            return res.status(404).json({
                success: false,
                message: 'Subject not found'
            });
        }

        // Get notes for this subject
        const { data: notes, error: notesError } = await supabase
            .from('notes')
            .select(`
                id,
                title,
                type,
                unit,
                file_url,
                file_name,
                downloads,
                is_verified
            `)
            .eq('subject_id', req.params.id)
            .eq('is_verified', true)
            .order('created_at', { ascending: false });

        if (notesError) throw notesError;

        res.status(200).json({
            success: true,
            data: {
                ...subject,
                notes: notes || []
            }
        });
    } catch (error) {
        console.error('Subject detail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subject'
        });
    }
});

// ==================== NOTES ROUTES ====================

/**
 * Search and Filter Notes
 * GET /api/notes?search=calculus&type=notes&subject=CSE101
 */
app.get('/api/notes', async (req, res) => {
    try {
        const { search, type, subject, semester } = req.query;

        let query = supabase
            .from('notes')
            .select(`
                id,
                title,
                type,
                unit,
                semester,
                file_url,
                file_name,
                downloads,
                is_verified,
                faculty_id,
                subject_id,
                subjects(name, code),
                faculty(user_id, users(name))
            `)
            .eq('is_verified', true);

        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        if (type) {
            query = query.eq('type', type);
        }

        if (subject) {
            query = query.eq('subject_id', subject);
        }

        if (semester) {
            query = query.eq('semester', parseInt(semester));
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const formattedData = data.map(note => ({
            id: note.id,
            title: note.title,
            type: note.type,
            unit: note.unit,
            semester: note.semester,
            fileUrl: note.file_url,
            fileName: note.file_name,
            downloads: note.downloads,
            subject: note.subjects?.name || 'Unknown',
            faculty: note.faculty?.users?.name || 'Unknown'
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Notes search error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching notes'
        });
    }
});

/**
 * GET Note Details with Ratings
 * GET /api/notes/:id
 */
app.get('/api/notes/:id', async (req, res) => {
    try {
        const { data: note, error: noteError } = await supabase
            .from('notes')
            .select(`
                *,
                subjects(name, code),
                faculty(user_id, users(name, email))
            `)
            .eq('id', req.params.id)
            .single();

        if (noteError || !note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Get ratings
        const { data: ratings } = await supabase
            .from('ratings')
            .select('clarity_rating, completeness_rating, helpfulness_rating, review_text')
            .eq('note_id', req.params.id);

        const avgRatings = ratings && ratings.length > 0 ? {
            clarity: (ratings.reduce((sum, r) => sum + (r.clarity_rating || 0), 0) / ratings.length).toFixed(1),
            completeness: (ratings.reduce((sum, r) => sum + (r.completeness_rating || 0), 0) / ratings.length).toFixed(1),
            helpfulness: (ratings.reduce((sum, r) => sum + (r.helpfulness_rating || 0), 0) / ratings.length).toFixed(1)
        } : null;

        res.status(200).json({
            success: true,
            data: {
                ...note,
                avgRatings,
                totalRatings: ratings?.length || 0
            }
        });
    } catch (error) {
        console.error('Note detail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching note'
        });
    }
});

/**
 * POST Upload Note (Staff Only)
 * POST /api/notes
 */
app.post('/api/notes', authenticateToken, requireRole(['staff']), async (req, res) => {
    try {
        const { subject_id, title, type, unit, semester, file_url, file_name } = req.body;

        if (!subject_id || !title || !type || !file_url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Get faculty ID
        const { data: faculty } = await supabase
            .from('faculty')
            .select('id')
            .eq('user_id', req.userId)
            .single();

        if (!faculty) {
            return res.status(403).json({
                success: false,
                message: 'Faculty profile not found'
            });
        }

        // Create note
        const { data: note, error } = await supabase
            .from('notes')
            .insert({
                subject_id,
                faculty_id: faculty.id,
                title,
                type,
                unit: unit || null,
                semester: semester || null,
                file_url,
                file_name,
                is_verified: false
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Note uploaded successfully. Awaiting admin verification.',
            data: note
        });
    } catch (error) {
        console.error('Note upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading note'
        });
    }
});

/**
 * PUT Update Note (Staff Only, Creates Version)
 * PUT /api/notes/:id
 */
app.put('/api/notes/:id', authenticateToken, requireRole(['staff']), async (req, res) => {
    try {
        const { title, type, file_url, file_name } = req.body;

        // Get current note
        const { data: currentNote } = await supabase
            .from('notes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (!currentNote) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Save current version
        const { error: versionError } = await supabase
            .from('note_versions')
            .insert({
                note_id: req.params.id,
                version: currentNote.version,
                file_url: currentNote.file_url,
                file_name: currentNote.file_name,
                file_size: null
            });

        if (versionError) throw versionError;

        // Update note
        const { data: updatedNote, error } = await supabase
            .from('notes')
            .update({
                title: title || currentNote.title,
                type: type || currentNote.type,
                file_url: file_url || currentNote.file_url,
                file_name: file_name || currentNote.file_name,
                version: currentNote.version + 1,
                is_verified: false
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Note updated. New version pending verification.',
            data: updatedNote
        });
    } catch (error) {
        console.error('Note update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating note'
        });
    }
});

/**
 * POST Track Note Download
 * POST /api/notes/:id/download
 */
app.post('/api/notes/:id/download', async (req, res) => {
    try {
        const { data: note } = await supabase
            .from('notes')
            .select('downloads')
            .eq('id', req.params.id)
            .single();

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Increment download count
        const { data: updated, error } = await supabase
            .from('notes')
            .update({ downloads: (note.downloads || 0) + 1 })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Download recorded',
            downloads: updated.downloads
        });
    } catch (error) {
        console.error('Download tracking error:', error);
        res.status(500).json({
            success: false,
            message: 'Error tracking download'
        });
    }
});

// ==================== RATING ROUTES ====================

/**
 * POST Rate Note (Student Only)
 * POST /api/ratings
 */
app.post('/api/ratings', authenticateToken, requireRole(['student']), async (req, res) => {
    try {
        const { note_id, clarity_rating, completeness_rating, helpfulness_rating, review_text } = req.body;

        if (!note_id || !clarity_rating || !completeness_rating || !helpfulness_rating) {
            return res.status(400).json({
                success: false,
                message: 'Missing required rating fields'
            });
        }

        // Check if rating exists
        const { data: existingRating } = await supabase
            .from('ratings')
            .select('id')
            .eq('note_id', note_id)
            .eq('student_id', req.userId)
            .single();

        if (existingRating) {
            // Update existing
            const { data: updated, error } = await supabase
                .from('ratings')
                .update({
                    clarity_rating,
                    completeness_rating,
                    helpfulness_rating,
                    review_text
                })
                .eq('id', existingRating.id)
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({
                success: true,
                message: 'Rating updated',
                data: updated
            });
        }

        // Create new rating
        const { data: rating, error } = await supabase
            .from('ratings')
            .insert({
                note_id,
                student_id: req.userId,
                clarity_rating,
                completeness_rating,
                helpfulness_rating,
                review_text
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Rating submitted',
            data: rating
        });
    } catch (error) {
        console.error('Rating error:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting rating'
        });
    }
});

/**
 * GET Rating Statistics
 * GET /api/ratings/note/:id
 */
app.get('/api/ratings/note/:id', async (req, res) => {
    try {
        const { data: ratings, error } = await supabase
            .from('ratings')
            .select('clarity_rating, completeness_rating, helpfulness_rating, review_text')
            .eq('note_id', req.params.id);

        if (error) throw error;

        if (!ratings || ratings.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    totalRatings: 0,
                    averageRatings: null
                }
            });
        }

        const avgRatings = {
            clarity: (ratings.reduce((sum, r) => sum + (r.clarity_rating || 0), 0) / ratings.length).toFixed(1),
            completeness: (ratings.reduce((sum, r) => sum + (r.completeness_rating || 0), 0) / ratings.length).toFixed(1),
            helpfulness: (ratings.reduce((sum, r) => sum + (r.helpfulness_rating || 0), 0) / ratings.length).toFixed(1)
        };

        res.status(200).json({
            success: true,
            data: {
                totalRatings: ratings.length,
                averageRatings: avgRatings
            }
        });
    } catch (error) {
        console.error('Rating stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching rating statistics'
        });
    }
});

// ==================== BOOKMARK ROUTES ====================

/**
 * GET Student Bookmarks
 * GET /api/bookmarks
 */
app.get('/api/bookmarks', authenticateToken, requireRole(['student']), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('student_bookmarks')
            .select(`
                note_id,
                notes(
                    id,
                    title,
                    type,
                    file_url,
                    file_name,
                    subjects(name)
                )
            `)
            .eq('student_id', req.userId)
            .order('saved_at', { ascending: false });

        if (error) throw error;

        const formattedData = data.map(b => ({
            noteId: b.note_id,
            title: b.notes?.title,
            type: b.notes?.type,
            fileUrl: b.notes?.file_url,
            fileName: b.notes?.file_name,
            subject: b.notes?.subjects?.name
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Bookmarks fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching bookmarks'
        });
    }
});

/**
 * POST Add Bookmark
 * POST /api/bookmarks
 */
app.post('/api/bookmarks', authenticateToken, requireRole(['student']), async (req, res) => {
    try {
        const { note_id } = req.body;

        if (!note_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing note_id'
            });
        }

        // Check if already bookmarked
        const { data: existing } = await supabase
            .from('student_bookmarks')
            .select('id')
            .eq('student_id', req.userId)
            .eq('note_id', note_id)
            .single();

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Note already bookmarked'
            });
        }

        // Create bookmark
        const { data: bookmark, error } = await supabase
            .from('student_bookmarks')
            .insert({
                student_id: req.userId,
                note_id
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            message: 'Note bookmarked',
            data: bookmark
        });
    } catch (error) {
        console.error('Bookmark error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding bookmark'
        });
    }
});

/**
 * DELETE Bookmark
 * DELETE /api/bookmarks/:noteId
 */
app.delete('/api/bookmarks/:noteId', authenticateToken, requireRole(['student']), async (req, res) => {
    try {
        const { error } = await supabase
            .from('student_bookmarks')
            .delete()
            .eq('student_id', req.userId)
            .eq('note_id', req.params.noteId);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Bookmark removed'
        });
    } catch (error) {
        console.error('Bookmark delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing bookmark'
        });
    }
});

// ==================== ADMIN ROUTES ====================

/**
 * GET Pending Staff Approvals (Admin Only)
 * GET /api/admin/pending-staff
 */
app.get('/api/admin/pending-staff', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, department, created_at')
            .eq('role', 'staff')
            .eq('is_approved', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Pending staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending staff'
        });
    }
});

/**
 * POST Approve Staff (Admin Only)
 * POST /api/admin/approve-staff/:userId
 */
app.post('/api/admin/approve-staff/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { error } = await supabase
            .from('users')
            .update({ is_approved: true })
            .eq('id', req.params.userId)
            .eq('role', 'staff');

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Staff approved successfully'
        });
    } catch (error) {
        console.error('Staff approval error:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving staff'
        });
    }
});

/**
 * GET Pending Notes Verification (Admin Only)
 * GET /api/admin/pending-notes
 */
app.get('/api/admin/pending-notes', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('notes')
            .select(`
                id,
                title,
                type,
                file_url,
                faculty(user_id, users(name, email)),
                subjects(name),
                created_at
            `)
            .eq('is_verified', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const formattedData = data.map(note => ({
            id: note.id,
            title: note.title,
            type: note.type,
            fileUrl: note.file_url,
            faculty: note.faculty?.users?.name || 'Unknown',
            subject: note.subjects?.name || 'Unknown',
            createdAt: note.created_at
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error('Pending notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending notes'
        });
    }
});

/**
 * POST Verify Note (Admin Only)
 * POST /api/admin/verify-note/:id
 */
app.post('/api/admin/verify-note/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { error } = await supabase
            .from('notes')
            .update({ is_verified: true })
            .eq('id', req.params.id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Note verified successfully'
        });
    } catch (error) {
        console.error('Note verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying note'
        });
    }
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║  📝 Notezilla Server                   ║
    ║  Port: ${PORT}                             
    ║  Database: Supabase PostgreSQL         ║
    ║  Status: ✅ Running                    ║
    ╚════════════════════════════════════════╝
    `);
});
