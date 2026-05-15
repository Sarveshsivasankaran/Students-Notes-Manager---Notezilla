/**
 * Notezilla Server - Faculty-Structured Academic Repository
 * Supabase PostgreSQL Backend with Role-Based Authentication
 */

const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const upload = multer({ storage: multer.memoryStorage() });
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { supabase, initializeDatabase } = require('./models/db');

const app = express();
const http = require('http');
const server = http.createServer(app);
const { initializeSocket } = require('./socket-handler');
const io = initializeSocket(server);
const aiService = require('./ai-service');

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
const GOOGLE_DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1M6qdcTlfx_PofE0FkpZMTVibaXvuZEV_';
const GOOGLE_DRIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_DRIVE_BASE_URL = 'https://drive.google.com';
const driveRepositoryCache = {
    data: null,
    expiresAt: 0,
    promise: null
};

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

function decodeHtmlEntities(value = '') {
    return String(value)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function stripHtmlTags(value = '') {
    return String(value).replace(/<[^>]+>/g, '');
}

// ==================== PUBLIC ENDPOINTS ====================

/**
 * Get Public Stats for landing page
 */
app.get('/api/public/stats', async (req, res) => {
    try {
        const { count: notesCount } = await supabase.from('notes').select('*', { count: 'exact', head: true });
        const { count: facultyCount } = await supabase.from('faculty').select('*', { count: 'exact', head: true });
        const { count: studentsCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student');
        const { count: deptsCount } = await supabase.from('subjects').select('department', { count: 'exact', head: true }); // Approximated by distinct departments if possible, or just count subjects/unique depts

        // For departments, let's just get the unique count if we want to be precise, or hardcode if the list is static
        const { data: depts } = await supabase.from('subjects').select('department');
        const uniqueDepts = depts ? [...new Set(depts.map(d => d.department))].length : 0;

        res.json({
            success: true,
            data: {
                notes: notesCount || 0,
                faculty: facultyCount || 0,
                students: studentsCount || 0,
                departments: uniqueDepts || 8 // Fallback to 8 if none found
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

function getDrivePreviewUrl(url = '') {
    const fileMatch = url.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
        return `${GOOGLE_DRIVE_BASE_URL}/file/d/${fileMatch[1]}/preview`;
    }

    try {
        const parsed = new URL(url);
        const fileId = parsed.searchParams.get('id');
        if (fileId) {
            return `${GOOGLE_DRIVE_BASE_URL}/file/d/${fileId}/preview`;
        }
    } catch (error) {
        return url;
    }

    return url;
}

async function fetchPublicDriveFolderHtml(folderId) {
    const response = await fetch(`${GOOGLE_DRIVE_BASE_URL}/embeddedfolderview?id=${encodeURIComponent(folderId)}`, {
        headers: {
            'User-Agent': 'Notezilla/2.0'
        },
        redirect: 'follow'
    });

    if (!response.ok) {
        throw new Error(`Google Drive request failed with status ${response.status}`);
    }

    return response.text();
}

function parsePublicDriveFolderHtml(html = '') {
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const entryRegex = /<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div><\/a>/gim;
    const entries = [];
    let match;

    while ((match = entryRegex.exec(html)) !== null) {
        const entryId = match[1];
        const entryUrl = match[2];
        const entryName = decodeHtmlEntities(stripHtmlTags(match[3])).trim();
        const entryType = entryUrl.includes('/drive/folders/') ? 'folder' : 'file';

        entries.push({
            id: entryId,
            name: entryName || (entryType === 'folder' ? 'Untitled Folder' : 'Untitled File'),
            type: entryType,
            url: entryUrl,
            previewUrl: entryType === 'file' ? getDrivePreviewUrl(entryUrl) : null
        });
    }

    return {
        title: decodeHtmlEntities(stripHtmlTags(titleMatch ? titleMatch[1] : '')).trim(),
        entries
    };
}

async function buildPublicDriveTree(folderId, visited = new Set()) {
    if (visited.has(folderId)) {
        return null;
    }

    visited.add(folderId);

    const html = await fetchPublicDriveFolderHtml(folderId);
    const parsed = parsePublicDriveFolderHtml(html);

    const children = (await Promise.all(parsed.entries.map(async (entry) => {
        if (entry.type === 'folder') {
            try {
                const childTree = await buildPublicDriveTree(entry.id, visited);
                if (!childTree) {
                    return null;
                }

                return {
                    ...childTree,
                    name: childTree.name || entry.name,
                    url: childTree.url || entry.url
                };
            } catch (error) {
                console.error(`[Google Drive Repository] Failed to expand folder ${entry.id}:`, error.message || error);
                return {
                    ...entry,
                    source: 'drive',
                    children: [],
                    directFolderCount: 0,
                    directFileCount: 0,
                    folderCount: 0,
                    fileCount: 0,
                    error: 'Unable to load this folder right now.'
                };
            }
        }

        return {
            ...entry,
            source: 'drive',
            extension: path.extname(entry.name || '').toLowerCase()
        };
    }))).filter(Boolean);

    const directFolderCount = children.filter((child) => child.type === 'folder').length;
    const directFileCount = children.filter((child) => child.type === 'file').length;
    const folderCount = children.reduce((sum, child) => (
        child.type === 'folder' ? sum + 1 + (child.folderCount || 0) : sum
    ), 0);
    const fileCount = children.reduce((sum, child) => (
        child.type === 'file' ? sum + 1 : sum + (child.fileCount || 0)
    ), 0);

    return {
        id: folderId,
        type: 'folder',
        source: 'drive',
        name: parsed.title || 'Untitled Folder',
        url: `${GOOGLE_DRIVE_BASE_URL}/drive/folders/${folderId}`,
        children,
        directFolderCount,
        directFileCount,
        folderCount,
        fileCount
    };
}

async function getDriveFacultyRepository(forceRefresh = false) {
    const cacheStillValid = driveRepositoryCache.data && driveRepositoryCache.expiresAt > Date.now();
    if (!forceRefresh && cacheStillValid) {
        return driveRepositoryCache.data;
    }

    if (driveRepositoryCache.promise) {
        return driveRepositoryCache.promise;
    }

    driveRepositoryCache.promise = (async () => {
        try {
            const root = await buildPublicDriveTree(GOOGLE_DRIVE_ROOT_FOLDER_ID, new Set());
            const payload = {
                rootFolderId: GOOGLE_DRIVE_ROOT_FOLDER_ID,
                rootUrl: `${GOOGLE_DRIVE_BASE_URL}/drive/folders/${GOOGLE_DRIVE_ROOT_FOLDER_ID}`,
                fetchedAt: new Date().toISOString(),
                root,
                faculties: (root.children || []).filter((child) => child.type === 'folder')
            };

            driveRepositoryCache.data = payload;
            driveRepositoryCache.expiresAt = Date.now() + GOOGLE_DRIVE_CACHE_TTL_MS;

            return payload;
        } finally {
            driveRepositoryCache.promise = null;
        }
    })();

    return driveRepositoryCache.promise;
}

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

        if (!['student', 'staff'].includes(role)) {
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

// ==================== USER PRODUCTIVITY & SYNC ROUTES ====================

/**
 * GET User Planner Tasks
 */
app.get('/api/user/planner', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('planner_tasks')
            .select('*')
            .eq('user_id', req.userId)
            .order('task_time', { ascending: true });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * ADD Planner Task
 */
app.post('/api/user/planner', authenticateToken, async (req, res) => {
    try {
        const { title, description, task_time } = req.body;
        const { data, error } = await supabase
            .from('planner_tasks')
            .insert({ user_id: req.userId, title, description, task_time })
            .select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * UPDATE Planner Task (Mark complete)
 */
app.put('/api/user/planner/:id', authenticateToken, async (req, res) => {
    try {
        const { is_completed } = req.body;
        const { data, error } = await supabase
            .from('planner_tasks')
            .update({ is_completed })
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE Planner Task
 */
app.delete('/api/user/planner/:id', authenticateToken, async (req, res) => {
    try {
        const { error } = await supabase
            .from('planner_tasks')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.userId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET Todo Tasks
 */
app.get('/api/user/tasks', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('todo_tasks')
            .select('*')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * ADD Todo Task
 */
app.post('/api/user/tasks', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        const { data, error } = await supabase
            .from('todo_tasks')
            .insert({ user_id: req.userId, text })
            .select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * TOGGLE Todo Task
 */
app.put('/api/user/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { is_completed } = req.body;
        const { data, error } = await supabase
            .from('todo_tasks')
            .update({ is_completed })
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE Todo Task
 */
app.delete('/api/user/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('todo_tasks')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }
        res.json({ success: true, deletedId: data.id });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET Progress Stats
 */
app.get('/api/user/progress', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('progress_stats')
            .select('*')
            .eq('user_id', req.userId)
            .maybeSingle();
        if (error) throw error;
        res.json({ success: true, data: data || { total_tasks_done: 0, planner_sessions: 0, productivity_score: 0 } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * UPDATE Progress Stats (Sync)
 */
app.post('/api/user/progress/sync', authenticateToken, async (req, res) => {
    try {
        const { total_tasks_done, planner_sessions } = req.body;
        
        // Productivity Score = weighted metric based on completion rate
        // Assuming weight: Tasks 40%, Planner 60%
        const score = (total_tasks_done * 5) + (planner_sessions * 10); // Simplified formula
        
        const { data, error } = await supabase
            .from('progress_stats')
            .upsert({ 
                user_id: req.userId, 
                total_tasks_done, 
                planner_sessions, 
                productivity_score: Math.min(100, score),
                updated_at: new Date()
            })
            .select().single();
        
        if (error) throw error;
        
        // Real-time notification via Socket.io
        io.to(`user_${req.userId}`).emit('progress_synced', data);
        
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET Activity Logs
 */
app.get('/api/user/activity', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * ADD Activity Log
 */
app.post('/api/user/activity', authenticateToken, async (req, res) => {
    try {
        const { action_type, title, description } = req.body;
        const { data, error } = await supabase
            .from('activity_logs')
            .insert({ user_id: req.userId, action_type, title, description })
            .select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== STAR SYSTEM ROUTES ====================

/**
 * STAR an Entity
 */
app.post('/api/stars', authenticateToken, async (req, res) => {
    try {
        const { entity_type, entity_id } = req.body;
        const { data, error } = await supabase
            .from('stars')
            .insert({ user_id: req.userId, entity_type, entity_id })
            .select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
            return res.json({ success: true, message: 'Already starred' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * UNSTAR an Entity
 */
app.delete('/api/stars', authenticateToken, async (req, res) => {
    try {
        const { entity_type, entity_id } = req.body;
        const { error } = await supabase
            .from('stars')
            .delete()
            .eq('user_id', req.userId)
            .eq('entity_type', entity_type)
            .eq('entity_id', entity_id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET Top Rated Materials (Most Starred)
 */
app.get('/api/stars/top', async (req, res) => {
    try {
        const { type } = req.query; // 'subject', 'faculty', 'note'
        const { data, error } = await supabase
            .from('stars')
            .select('entity_id, count(*)')
            .eq('entity_type', type)
            // .group('entity_id') // Supabase/PostgREST doesn't support group by easily like this
            // We'll use a RPC (Stored Procedure) or just fetch and process
        
        // For simplicity in this demo, let's assume we have a view or RPC
        const { data: topData, error: topError } = await supabase.rpc('get_top_starred', { p_entity_type: type });
        
        if (topError) throw topError;
        res.json({ success: true, data: topData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== FACULTY ROUTES ====================

/**
 * GET Current Faculty Profile
 * GET /api/faculty/me
 */
app.get('/api/faculty/me', authenticateToken, requireRole(['staff']), async (req, res) => {
    try {
        const { data: faculty, error } = await supabase
            .from('faculty')
            .select(`
                *,
                users:user_id(name, email)
            `)
            .eq('user_id', req.userId)
            .single();

        if (error) throw error;

        // Add name from users relation to the root for ease
        if (faculty.users) {
            faculty.name = faculty.users.name;
        }

        res.status(200).json({ success: true, data: faculty });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
});

/**
 * Scrape Office Hours from Timetable Image
 * POST /api/faculty/scrape-timetable
 */
app.post('/api/faculty/scrape-timetable', authenticateToken, requireRole(['staff']), upload.single('timetable'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image provided' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'Gemini API is not configured on the server.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const imageParts = [
            {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype
                }
            }
        ];

        const prompt = "Analyze this timetable image and extract the free periods or break times that a faculty member could use for 'Office Hours'. Return ONLY a concise, sensible string indicating suggested Office Hours (e.g., 'Mon 10:00-11:00 AM, Wed 2:00-4:00 PM'). Keep it very brief.";

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text().trim();

        res.status(200).json({
            success: true,
            office_hours: responseText,
            message: "Extracted office hours from timetable"
        });
    } catch (error) {
        console.error('OCR Error:', error);
        res.status(500).json({ success: false, message: 'Failed to extract office hours from image' });
    }
});

/**
 * Update Current Faculty Profile
 * PUT /api/faculty/me
 */
app.put('/api/faculty/me', authenticateToken, requireRole(['staff']), upload.single('photo'), async (req, res) => {
    try {
        const { bio, office_hours, qualifications } = req.body;
        let photo_url = req.body.photo_url || ''; // Keep old URL if explicitly passed

        // If a new file is uploaded, simulate Drive upload
        if (req.file) {
            photo_url = `https://api.dicebear.com/6.x/initials/svg?seed=P${Date.now()}`; // Simulated generated avatar URL based on success
        }

        const { data, error } = await supabase
            .from('faculty')
            .update({
                photo_url,
                qualifications,
                bio,
                office_hours
            })
            .eq('user_id', req.userId)
            .select()
            .single();

        if (error) {
            if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
                // Fallback if photo_url/qualifications columns were not added to DB yet
                const { data: fbData, error: fbError } = await supabase
                    .from('faculty')
                    .update({ bio, office_hours })
                    .eq('user_id', req.user.userId)
                    .select()
                    .single();

                if (fbError) throw fbError;

                return res.status(200).json({
                    success: true,
                    data: fbData,
                    message: "Profile updated (Warning: photo_url/qualifications columns missing in DB. Please run: ALTER TABLE faculty ADD COLUMN photo_url text, ADD COLUMN qualifications text;)"
                });
            }
            throw error;
        }

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error updating profile' });
    }
});

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
            subject_id: note.subject_id,
            subjects: note.subjects,
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
 * GET /api/drive/faculty-repository
 * Returns the shared Google Drive faculty folder tree.
 */
app.get('/api/drive/faculty-repository', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
        const repository = await getDriveFacultyRepository(forceRefresh);

        return res.status(200).json({
            success: true,
            data: repository
        });
    } catch (error) {
        console.error('[Google Drive Repository] Error fetching shared folder tree:', error);
        return res.status(502).json({
            success: false,
            message: 'Failed to fetch the shared Google Drive faculty repository.'
        });
    }
});

/**
 * POST /api/drive/sync
 * Integrates Notezilla with Google Drive Root Folders
 */
app.post('/api/drive/sync', authenticateToken, requireRole(['staff']), async (req, res) => {
    try {
        console.log('[Google Drive Sync] Manual sync requested by Staff ID:', req.userId);

        const repository = await getDriveFacultyRepository(true);

        return res.status(200).json({
            success: true,
            message: 'Shared Google Drive faculty folders refreshed successfully.',
            meta: {
                syncedCount: repository.faculties.length,
                mappedFiles: repository.root.fileCount || 0,
                totalFolders: repository.root.folderCount || 0,
                rootFolderId: repository.rootFolderId,
                fetchedAt: repository.fetchedAt
            }
        });

    } catch (error) {
        console.error('[Google Drive Sync] Error during synchronization:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to synchronize with Google Drive. Please contact admin.'
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

        // Get faculty ID to ensure ownership
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

        if (currentNote.faculty_id !== faculty.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to edit this note'
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
 * DELETE Reject/Remove Staff (Admin Only)
 * DELETE /api/admin/reject-staff/:userId
 */
app.delete('/api/admin/reject-staff/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', req.params.userId)
            .eq('role', 'staff');

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Staff request removed successfully'
        });
    } catch (error) {
        console.error('Staff rejection error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing staff request'
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

/**
 * DELETE Reject/Remove Note (Admin Only)
 * DELETE /api/admin/reject-note/:id
 */
app.delete('/api/admin/reject-note/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Note request removed successfully'
        });
    } catch (error) {
        console.error('Note rejection error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing note request'
        });
    }
});

// ==================== CHATBOT ROUTE ====================

const NOTEZILLA_ASSISTANT_CONTEXT = `
You are Aadhi, the AI support assistant for Notezilla.

Product analysis:
Notezilla is a faculty-structured academic repository for Rajalakshmi Engineering College. It helps students find verified study material by department, semester, subject, faculty, unit, and content type. It helps staff publish and maintain academic material. It helps admins keep uploaded content and staff access trustworthy.

Primary user types and needs:
Students:
- Sign up with an @rajalakshmi.edu.in email, log in, browse subjects, open notes, download files, bookmark useful materials, rate clarity/completeness/helpfulness, and ask how to find content for their department or semester.
- Common queries include account signup problems, where to find notes, why a note is missing, how to bookmark, how ratings work, and how to contact or identify faculty content.

Staff:
- Register as staff, wait for admin approval, complete their profile, map or find subjects, upload notes/question papers/assignments/e-books, sync Google Drive files, update materials, and understand why uploaded content is not visible until verified.
- Common queries include approval status, upload steps, subject mapping, office-hour extraction from timetable images, profile updates, and note verification.

Admins:
- Approve or reject staff accounts, verify or reject pending notes, monitor repository quality, and troubleshoot missing or unverified content.
- Common queries include staff approval flow, pending notes, verification rules, and moderation responsibilities.

Public visitors:
- Need to understand what Notezilla is, who can use it, how to create an account, and why institutional email validation is required.

Known product rules:
- Student accounts must use @rajalakshmi.edu.in email addresses.
- Staff accounts require admin approval before full access.
- Staff uploads require admin verification before students can rely on them as published material.
- Supported departments include CSE, ECE, EEE, MECH, CIVIL, and BioMed.
- Notes can be organized by department, semester, subject, faculty, unit, and material type.
- Ratings focus on clarity, completeness, and helpfulness.

Answer style:
- Give concise, practical help in simple text.
- Prefer exact next steps inside Notezilla over generic advice.
- If a query needs account-specific data you cannot see, say what the user should check in the app.
- Do not invent live database values, pending counts, file names, or approval status.
- Do not use markdown tables. Short bullets are okay when they make steps clearer.
`;

function buildChatUserProfile(userContext = {}) {
    const safe = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : 'not provided';

    return [
        `Role: ${safe(userContext.role)}`,
        `Name: ${safe(userContext.name)}`,
        `Department: ${safe(userContext.department)}`,
        `Semester: ${safe(userContext.semester)}`
    ].join('\n');
}

/**
 * POST Ollama/LangChain Chatbot Helper
 * POST /api/chat
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userContext } = req.body;
        const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 1500) : '';

        if (!cleanMessage) {
            return res.status(200).json({
                success: true,
                response: "Please type a question about Notezilla, your account, notes, uploads, or approvals."
            });
        }

        const [{ ChatOllama }, { ChatPromptTemplate }, { StringOutputParser }] = await Promise.all([
            import('@langchain/ollama'),
            import('@langchain/core/prompts'),
            import('@langchain/core/output_parsers')
        ]);

        const ollamaHeaders = process.env.OLLAMA_API_KEY
            ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
            : undefined;

        const model = new ChatOllama({
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            model: process.env.OLLAMA_MODEL || 'gemma4:31b-cloud',
            temperature: 0.25,
            headers: ollamaHeaders
        });

        const prompt = ChatPromptTemplate.fromMessages([
            ['system', NOTEZILLA_ASSISTANT_CONTEXT],
            ['human', 'Current user profile:\n{userProfile}\n\nUser question:\n{message}']
        ]);

        const chain = prompt.pipe(model).pipe(new StringOutputParser());
        const responseText = await chain.invoke({
            userProfile: buildChatUserProfile(userContext),
            message: cleanMessage
        });

        return res.status(200).json({
            success: true,
            provider: 'ollama',
            model: process.env.OLLAMA_MODEL || 'gemma4:31b-cloud',
            response: responseText.trim() || "Sorry, I'm having trouble analyzing that right now."
        });
    } catch (error) {
        console.error('Ollama/LangChain Chat error:', error);
        res.status(500).json({
            success: false,
            message: 'Error interacting with the AI model. Make sure the service is available and gemma4:31b-cloud is configured.'
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

// ==================== AI ANALYSIS & CHAT ROUTES ====================

/**
 * ANALYZE a Note (passes buffer directly to Gemini multimodal)
 */
app.post('/api/notes/:id/analyze', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: note, error } = await supabase.from('notes').select('*').eq('id', id).single();
        if (error || !note) return res.status(404).json({ success: false, message: 'Note not found' });

        if (note.ai_summary) {
            return res.json({ success: true, data: { summary: note.ai_summary, keyConcepts: note.key_concepts, contextExplanation: note.context_explanation } });
        }

        let downloadUrl = note.file_url;
        const driveMatch = downloadUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (driveMatch) downloadUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}&confirm=t`;
        else if (downloadUrl.includes('drive.google.com') && downloadUrl.match(/[?&]id=([^&]+)/)) downloadUrl = `https://drive.google.com/uc?export=download&id=${downloadUrl.match(/[?&]id=([^&]+)/)[1]}&confirm=t`;

        const response = await fetch(downloadUrl);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        const ext = (note.file_name || '').split('.').pop().toLowerCase();
        const mimeType = aiService.getMimeType(ext);
        console.log(`[Analyze Note] id=${id} ext=${ext} mime=${mimeType} size=${fileBuffer.length}`);

        const analysis = await aiService.analyzeBuffer(fileBuffer, mimeType);
        await supabase.from('notes').update({ ai_summary: analysis.summary, key_concepts: analysis.keyConcepts, context_explanation: analysis.contextExplanation }).eq('id', id);
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('AI Analysis Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * CHAT with Note
 */
app.post('/api/notes/:id/chat', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const { data: note, error } = await supabase.from('notes').select('*').eq('id', id).single();
        if (error || !note) return res.status(404).json({ success: false, message: 'Note not found' });

        let downloadUrl = note.file_url;
        const driveMatch = downloadUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (driveMatch) downloadUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}&confirm=t`;
        else if (downloadUrl.includes('drive.google.com') && downloadUrl.match(/[?&]id=([^&]+)/)) downloadUrl = `https://drive.google.com/uc?export=download&id=${downloadUrl.match(/[?&]id=([^&]+)/)[1]}&confirm=t`;

        const response = await fetch(downloadUrl);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        const ext = (note.file_name || '').split('.').pop().toLowerCase();
        const mimeType = aiService.getMimeType(ext);
        const botResponse = await aiService.chatWithBuffer(fileBuffer, mimeType, message);
        res.json({ success: true, response: botResponse });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const driveAnalysisCache = {};

/**
 * ANALYZE a Drive File (passes buffer directly to Gemini multimodal)
 */
app.post('/api/drive/analyze', authenticateToken, async (req, res) => {
    try {
        const { fileId, fileName } = req.body;
        if (!fileId) return res.status(400).json({ success: false, message: 'fileId is required' });
        if (driveAnalysisCache[fileId] && driveAnalysisCache[fileId].analysis) {
            return res.json({ success: true, data: driveAnalysisCache[fileId].analysis });
        }
        const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
        const response = await fetch(driveDownloadUrl);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        const ext = (fileName || '').split('.').pop().toLowerCase();
        const mimeType = aiService.getMimeType(ext);
        console.log(`[Drive Analyze] fileId=${fileId} ext=${ext} mime=${mimeType} size=${fileBuffer.length}`);
        const analysis = await aiService.analyzeBuffer(fileBuffer, mimeType);
        driveAnalysisCache[fileId] = { fileBuffer, mimeType, analysis };
        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('Drive AI Analysis Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * CHAT with Drive File
 */
app.post('/api/drive/chat', authenticateToken, async (req, res) => {
    try {
        const { fileId, fileName, message } = req.body;
        if (!fileId) return res.status(400).json({ success: false, message: 'fileId is required' });
        let fileBuffer, mimeType;
        if (driveAnalysisCache[fileId] && driveAnalysisCache[fileId].fileBuffer) {
            fileBuffer = driveAnalysisCache[fileId].fileBuffer;
            mimeType = driveAnalysisCache[fileId].mimeType;
        } else {
            const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
            const response = await fetch(driveDownloadUrl);
            fileBuffer = Buffer.from(await response.arrayBuffer());
            const ext = (fileName || '').split('.').pop().toLowerCase();
            mimeType = aiService.getMimeType(ext);
            driveAnalysisCache[fileId] = { fileBuffer, mimeType, analysis: null };
        }
        const botResponse = await aiService.chatWithBuffer(fileBuffer, mimeType, message);
        res.json({ success: true, response: botResponse });
    } catch (error) {
        console.error('Drive AI Chat Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== DSA MODULE ROUTES ====================

const DSA_MAX_DAY = 14;

const dsaConceptPlan = [
    'Arrays and Traversal',
    'Two Pointers',
    'Sliding Window',
    'Hash Maps',
    'Stacks',
    'Queues',
    'Linked Lists',
    'Binary Search',
    'Recursion',
    'Sorting',
    'Trees',
    'Graphs',
    'Dynamic Programming',
    'Greedy Algorithms'
];

const dsaLanguageMeta = {
    python: {
        label: 'Python',
        extension: 'py',
        syntax: 'for i, value in enumerate(values):\n    print(i, value)',
        example: 'numbers = [2, 4, 6, 8]\nfor index, value in enumerate(numbers):\n    print(index, value)'
    },
    cpp: {
        label: 'C++',
        extension: 'cpp',
        syntax: 'for (int i = 0; i < values.size(); i++) {\n    cout << i << " " << values[i] << "\\n";\n}',
        example: 'vector<int> values = {2, 4, 6, 8};\nfor (int i = 0; i < values.size(); i++) {\n    cout << values[i] << "\\n";\n}'
    },
    java: {
        label: 'Java',
        extension: 'java',
        syntax: 'for (int i = 0; i < values.length; i++) {\n    System.out.println(values[i]);\n}',
        example: 'int[] values = {2, 4, 6, 8};\nfor (int value : values) {\n    System.out.println(value);\n}'
    },
    c: {
        label: 'C',
        extension: 'c',
        syntax: 'for (int i = 0; i < n; i++) {\n    printf("%d\\n", values[i]);\n}',
        example: 'int values[] = {2, 4, 6, 8};\nint n = 4;\nfor (int i = 0; i < n; i++) {\n    printf("%d\\n", values[i]);\n}'
    }
};

function daysBetween(startDate) {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return 0;
    const today = new Date();
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return Math.max(0, Math.floor((todayUtc - startUtc) / 86400000));
}

function normalizeDsaArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {
            return value.split(/\r?\n/).map(item => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
        }
    }
    return [];
}

function normalizeDsaLinks(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'object') return Object.values(value).flat().filter(Boolean);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === 'object') return Object.values(parsed).flat().filter(Boolean);
        } catch (_) {
            return [];
        }
    }
    return [];
}

function buildFallbackDsaContent(day, language) {
    const concept = dsaConceptPlan[(day - 1) % dsaConceptPlan.length];
    const meta = dsaLanguageMeta[language] || dsaLanguageMeta.python;
    return {
        id: `fallback-${day}-${language}`,
        day,
        programming_language: language,
        concept,
        explanation: `${concept} is a core DSA topic. Focus on the data shape, the invariant you maintain while scanning or recursing, and the time-space tradeoff before writing code.`,
        syntax: meta.syntax,
        example_code: meta.example,
        logic_breakdown: [
            'Restate the input and expected output in plain language.',
            'Identify the operation that repeats across the collection or state.',
            'Track only the minimum state needed to prove correctness.',
            'Check edge cases such as empty input, one element, duplicates, and large constraints.'
        ],
        practice_problem: `Solve one ${concept} problem in ${meta.label}. Write the brute force approach first, then improve the time or space complexity and note the reason for the improvement.`,
        external_links: [],
        youtube_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${concept} DSA ${meta.label}`)}`
    };
}

function normalizeDsaContent(row, day, language) {
    const fallback = buildFallbackDsaContent(day, language);
    const content = row || fallback;
    return {
        ...fallback,
        ...content,
        day: content.day || day,
        programming_language: content.programming_language || language,
        example_code: content.example_code || content.example || fallback.example_code,
        logic_breakdown: normalizeDsaArray(content.logic_breakdown).length ? normalizeDsaArray(content.logic_breakdown) : fallback.logic_breakdown,
        external_links: normalizeDsaLinks(content.external_links),
        youtube_url: content.youtube_url || fallback.youtube_url
    };
}

function buildDsaSearchLinks(concept) {
    const query = encodeURIComponent(concept);
    return [
        {
            platform: 'LeetCode',
            title: `Search LeetCode: ${concept}`,
            url: `https://leetcode.com/problemset/?search=${query}`,
            source: 'search'
        },
        {
            platform: 'HackerRank',
            title: `Search HackerRank: ${concept}`,
            url: `https://www.hackerrank.com/search?term=${query}`,
            source: 'search'
        }
    ];
}

function extractDsaLinksFromHtml(html, platform, concept) {
    const links = [];
    const hrefRegex = /href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;

    while ((match = hrefRegex.exec(html)) && links.length < 4) {
        let url = decodeHtmlEntities(match[1]);
        const label = stripHtmlTags(decodeHtmlEntities(match[2])).replace(/\s+/g, ' ').trim();
        const decodedMatch = url.match(/[?&]uddg=([^&]+)/);
        if (decodedMatch) url = decodeURIComponent(decodedMatch[1]);
        if (url.startsWith('/')) url = platform === 'LeetCode' ? `https://leetcode.com${url}` : `https://www.hackerrank.com${url}`;

        const isLeetcode = platform === 'LeetCode' && /^https:\/\/leetcode\.com\/problems\/[^/?#]+/i.test(url);
        const isHackerrank = platform === 'HackerRank' && /^https:\/\/www\.hackerrank\.com\/challenges\/[^/?#]+/i.test(url);
        if ((isLeetcode || isHackerrank) && !links.some(link => link.url === url)) {
            links.push({
                platform,
                title: label || `${platform} practice: ${concept}`,
                url,
                source: 'scraped'
            });
        }
    }

    return links;
}

async function scrapeDsaLinks(concept) {
    const fallbackLinks = buildDsaSearchLinks(concept);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
        const searches = [
            { platform: 'LeetCode', query: `site:leetcode.com/problems ${concept}` },
            { platform: 'HackerRank', query: `site:hackerrank.com/challenges ${concept}` }
        ];

        const responses = await Promise.all(searches.map(async item => {
            const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(item.query)}`;
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 Notezilla DSA Learning Bot' }
            });
            const html = await response.text();
            return extractDsaLinksFromHtml(html, item.platform, concept);
        }));

        const scraped = responses.flat();
        return scraped.length ? [...scraped, ...fallbackLinks] : fallbackLinks;
    } catch (_) {
        return fallbackLinks;
    } finally {
        clearTimeout(timeout);
    }
}

async function getOrCreateDsaProgress(userId, language) {
    const { data: existing, error } = await supabase
        .from('dsa_user_progress')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error && !String(error.message || '').includes('does not exist')) throw error;
    if (existing) return existing;

    const created = {
        user_id: userId,
        preferred_language: language,
        start_date: new Date().toISOString(),
        current_day: 1,
        completed_days: [],
        topic_status: {},
        code_drafts: {},
        streak: 0,
        total_minutes: 0,
        last_activity_at: new Date().toISOString()
    };

    const { data, error: insertError } = await supabase
        .from('dsa_user_progress')
        .insert(created)
        .select('*')
        .single();

    if (insertError) throw insertError;
    return data;
}

function buildDsaStats(progress, day) {
    const completedDays = normalizeDsaArray(progress.completed_days);
    const topicStatus = progress.topic_status || {};
    const codeDrafts = progress.code_drafts || {};
    return {
        currentDay: day,
        completedCount: completedDays.length,
        completionPercent: Math.min(100, Math.round((completedDays.length / DSA_MAX_DAY) * 100)),
        streak: progress.streak || 0,
        totalMinutes: progress.total_minutes || 0,
        todayStatus: {
            ...(topicStatus[String(day)] || {}),
            codeDraft: codeDrafts[String(day)] || ''
        }
    };
}

/**
 * GET Daily DSA Content
 */
app.get('/api/dsa/daily', authenticateToken, async (req, res) => {
    try {
        // Get user preferred language
        const { data: user } = await supabase
            .from('users')
            .select('preferred_dsa_language')
            .eq('id', req.userId)
            .single();
        
        if (!user.preferred_dsa_language) {
            return res.json({ success: false, needsLanguage: true });
        }

        const progress = await getOrCreateDsaProgress(req.userId, user.preferred_dsa_language);
        const day = Math.min(DSA_MAX_DAY, Math.max(progress.current_day || 1, daysBetween(progress.start_date) + 1));
        
        let { data, error } = await supabase
            .from('dsa_content')
            .select('*')
            .eq('day', day)
            .eq('programming_language', user.preferred_dsa_language)
            .maybeSingle();
        
        if (error) {
            const message = String(error.message || '');
            if (message.includes('does not exist') || message.includes('relation')) {
                data = null;
            } else {
                throw error;
            }
        }
        const content = normalizeDsaContent(data, day, user.preferred_dsa_language);
        const scrapedLinks = await scrapeDsaLinks(content.concept);
        const externalLinks = [...content.external_links, ...scrapedLinks]
            .filter((link, index, all) => link && link.url && all.findIndex(item => item.url === link.url) === index)
            .slice(0, 8);

        res.json({
            success: true,
            data: {
                ...content,
                external_links: externalLinks,
                progress: buildDsaStats(progress, day),
                language_meta: dsaLanguageMeta[user.preferred_dsa_language] || dsaLanguageMeta.python
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * SET User DSA Language Preference
 */
app.post('/api/dsa/preference', authenticateToken, async (req, res) => {
    try {
        const { language } = req.body;
        if (!dsaLanguageMeta[language]) {
            return res.status(400).json({ success: false, message: 'Unsupported DSA language' });
        }

        await supabase
            .from('users')
            .update({ preferred_dsa_language: language })
            .eq('id', req.userId);

        const progress = await getOrCreateDsaProgress(req.userId, language);
        await supabase
            .from('dsa_user_progress')
            .update({ preferred_language: language, updated_at: new Date().toISOString() })
            .eq('id', progress.id);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * UPDATE User DSA Learning Progress
 */
app.post('/api/dsa/progress', authenticateToken, async (req, res) => {
    try {
        const { day, status = {}, codeDraft = '', minutes = 0, advance = false } = req.body;
        const safeDay = Number(day);
        if (!Number.isInteger(safeDay) || safeDay < 1 || safeDay > DSA_MAX_DAY) {
            return res.status(400).json({ success: false, message: 'Invalid DSA day' });
        }

        const { data: user } = await supabase
            .from('users')
            .select('preferred_dsa_language')
            .eq('id', req.userId)
            .single();

        if (!user.preferred_dsa_language) {
            return res.json({ success: false, needsLanguage: true });
        }

        const progress = await getOrCreateDsaProgress(req.userId, user.preferred_dsa_language);
        const completedDays = new Set(normalizeDsaArray(progress.completed_days).map(Number));
        const topicStatus = progress.topic_status || {};
        const codeDrafts = progress.code_drafts || {};
        const now = new Date().toISOString();
        const nextStatus = {
            ...(topicStatus[String(safeDay)] || {}),
            ...status,
            updatedAt: now
        };

        if (status.completed) completedDays.add(safeDay);
        if (typeof codeDraft === 'string') codeDrafts[String(safeDay)] = codeDraft;
        topicStatus[String(safeDay)] = nextStatus;

        const lastActivityDate = progress.last_activity_at ? new Date(progress.last_activity_at) : null;
        const todayKey = new Date().toISOString().slice(0, 10);
        const lastKey = lastActivityDate && !Number.isNaN(lastActivityDate.getTime()) ? lastActivityDate.toISOString().slice(0, 10) : null;
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);
        const streak = lastKey === todayKey
            ? (progress.streak || 0)
            : (lastKey === yesterdayKey ? (progress.streak || 0) + 1 : 1);

        const nextCurrentDay = advance || status.completed
            ? Math.min(DSA_MAX_DAY, Math.max(progress.current_day || 1, safeDay + 1))
            : Math.max(progress.current_day || 1, safeDay);

        const update = {
            current_day: nextCurrentDay,
            completed_days: [...completedDays].sort((a, b) => a - b),
            topic_status: topicStatus,
            code_drafts: codeDrafts,
            streak,
            total_minutes: (progress.total_minutes || 0) + Math.max(0, Number(minutes) || 0),
            last_activity_at: now,
            updated_at: now
        };

        const { data, error } = await supabase
            .from('dsa_user_progress')
            .update(update)
            .eq('id', progress.id)
            .select('*')
            .single();

        if (error) throw error;

        const payload = {
            userId: req.userId,
            day: safeDay,
            progress: buildDsaStats(data, Math.min(DSA_MAX_DAY, nextCurrentDay)),
            topicStatus: {
                ...(data.topic_status[String(safeDay)] || {}),
                codeDraft: (data.code_drafts || {})[String(safeDay)] || ''
            }
        };

        io.to(`user_${req.userId}`).emit('dsa_progress_updated', payload);
        res.json({ success: true, data: payload });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});



// Get top rated study materials
app.get('/api/top-materials', async (req, res) => {
    try {
        const { data, error } = await supabase.rpc('get_top_starred');
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║  📝 Notezilla Server                   ║
    ║  Port: ${PORT}                             
    ║  Database: Supabase PostgreSQL         ║
    ║  Status: ✅ Running                    ║
    ╚════════════════════════════════════════╝
    `);
});
