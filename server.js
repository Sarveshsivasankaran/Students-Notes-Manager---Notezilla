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
const fsp = require('fs/promises');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const { supabase, initializeDatabase } = require('./models/db');
const pgPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const app = express();
const http = require('http');
const server = http.createServer(app);
const { initializeSocket, notifyRepositoryUpdate, getPresenceSnapshot } = require('./socket-handler');
const io = initializeSocket(server);
const aiService = require('./ai-service');
const compilerService = require('./compiler-service');
const {
    formatFreeHours,
    getFacultyAvailability,
    parseTimetableAnalysis
} = require('./faculty-timetable-utils');
const { corsOrigin } = require('./deployment-config');
const {
    CURRICULUM_STREAMS,
    GATE_PLACEMENT_CODES,
    parseSyllabusUnits,
    getCourseOutcomesAndBooks
} = require('./curriculum-utils');

// Middleware
app.set('trust proxy', 1);
app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']
}));
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
 * Optional Authentication Middleware
 * Extracts userId if valid JWT Bearer token is provided, otherwise continues anonymously
 */
const optionalAuthenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        jwt.verify(token, jwtSecret, (err, user) => {
            if (!err && user) {
                req.userId = user.userId;
                req.userRole = user.role;
            }
            next();
        });
    } else {
        next();
    }
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

app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        service: 'notezilla-api',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

/**
 * Get Public Stats for landing page
 */
app.get('/api/public/stats', async (req, res) => {
    try {
        const [notesResult, facultyResult, studentsResult, departmentsResult] = await Promise.all([
            supabase.from('notes').select('*', { count: 'exact', head: true }),
            supabase.from('faculty').select('*', { count: 'exact', head: true }),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
            supabase.from('subjects').select('department')
        ]);

        const queryError = notesResult.error || facultyResult.error || studentsResult.error || departmentsResult.error;
        if (queryError) throw queryError;

        let driveNotes = 0;
        let driveFaculty = 0;
        try {
            const repository = await getDriveFacultyRepository(false);
            driveNotes = repository?.root?.fileCount || 0;
            driveFaculty = repository?.faculties?.length || 0;
        } catch (driveError) {
            console.warn('[Public Stats] Drive repository unavailable:', driveError.message || driveError);
        }

        const depts = departmentsResult.data || [];
        const uniqueDepts = depts ? [...new Set(depts.map(d => d.department))].length : 0;
        const presence = getPresenceSnapshot();

        res.json({
            success: true,
            data: {
                activeUsers: presence.activeUsers,
                students: studentsResult.count || 0,
                notes: Math.max(notesResult.count || 0, driveNotes),
                faculty: Math.max(facultyResult.count || 0, driveFaculty),
                departments: uniqueDepts,
                updatedAt: new Date().toISOString()
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
        if (role === 'staff' && !department) {
            return res.status(400).json({
                success: false,
                message: 'Department is required for faculty profiles'
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
                department,
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
                department: newUser.department,
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
                department: user.department,
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

const TIMETABLE_DIR = process.env.TIMETABLE_DIR
    ? path.resolve(process.env.TIMETABLE_DIR)
    : path.join(__dirname, 'data', 'timetables');
const TIMETABLE_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp'
};

const getTimetableUserKey = (userId) => String(userId).replace(/[^a-zA-Z0-9-]/g, '');

async function findTimetableFile(userId) {
    const userKey = getTimetableUserKey(userId);
    for (const [extension, mime] of Object.entries(TIMETABLE_TYPES)) {
        const filePath = path.join(TIMETABLE_DIR, `${userKey}.${extension}`);
        try {
            const [buffer, stats] = await Promise.all([fsp.readFile(filePath), fsp.stat(filePath)]);
            return { filePath, buffer, mime, updatedAt: stats.mtime.toISOString() };
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
    return null;
}

/**
 * GET the signed-in user's current timetable image.
 */
app.get('/api/user/timetable', authenticateToken, async (req, res) => {
    try {
        const current = await findTimetableFile(req.userId);
        if (!current) return res.json({ success: true, data: null });
        res.json({
            success: true,
            data: {
                imageUrl: `data:${current.mime};base64,${current.buffer.toString('base64')}`,
                updatedAt: current.updatedAt
            }
        });
    } catch (error) {
        console.error('Timetable fetch error:', error);
        res.status(500).json({ success: false, message: 'Unable to load your timetable' });
    }
});

/**
 * Upload or replace the signed-in user's timetable image.
 */
app.post('/api/user/timetable', authenticateToken, upload.single('timetable'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Choose a timetable image first' });
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(413).json({ success: false, message: 'Timetable image must be 5 MB or smaller' });
        }

        const { default: imageType } = await import('image-type');
        const detected = await imageType(req.file.buffer);
        if (!detected || !['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime)) {
            return res.status(415).json({ success: false, message: 'Upload a valid PNG, JPG or WebP image' });
        }

        await fsp.mkdir(TIMETABLE_DIR, { recursive: true });
        const userKey = getTimetableUserKey(req.userId);
        await Promise.all(Object.keys(TIMETABLE_TYPES).map(async extension => {
            try {
                await fsp.unlink(path.join(TIMETABLE_DIR, `${userKey}.${extension}`));
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }));

        const extension = detected.ext === 'jpeg' ? 'jpg' : detected.ext;
        await fsp.writeFile(path.join(TIMETABLE_DIR, `${userKey}.${extension}`), req.file.buffer);
        res.json({
            success: true,
            data: {
                imageUrl: `data:${detected.mime};base64,${req.file.buffer.toString('base64')}`,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Timetable upload error:', error);
        res.status(500).json({ success: false, message: 'Unable to save your timetable' });
    }
});

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
        const cutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
        const [tasksResult, plannerResult, activityResult] = await Promise.all([
            supabase.from('todo_tasks').select('id, is_completed').eq('user_id', req.userId),
            supabase.from('planner_tasks').select('id, is_completed').eq('user_id', req.userId),
            supabase.from('activity_logs').select('action_type, created_at').eq('user_id', req.userId).gte('created_at', cutoff)
        ]);

        const queryError = tasksResult.error || plannerResult.error || activityResult.error;
        if (queryError) throw queryError;

        const tasks = tasksResult.data || [];
        const planner = plannerResult.data || [];
        const activity = activityResult.data || [];
        const completedTasks = tasks.filter(item => item.is_completed).length;
        const completedSessions = planner.filter(item => item.is_completed).length;
        const totalGoals = tasks.length + planner.length;
        const completedGoals = completedTasks + completedSessions;
        const completionRate = totalGoals ? completedGoals / totalGoals : 0;
        const studyActivities = activity.filter(item => item.action_type === 'note').length;
        const activeDays = new Set(activity.map(item => new Date(item.created_at).toISOString().slice(0, 10))).size;
        const engagementRate = Math.min(1, activeDays / 10);
        const productivityScore = Math.round(((completionRate * 0.75) + (engagementRate * 0.25)) * 100);

        res.json({
            success: true,
            data: {
                total_tasks_done: completedTasks,
                planner_sessions: completedSessions,
                productivity_score: productivityScore,
                total_tasks: tasks.length,
                total_planner_sessions: planner.length,
                completed_goals: completedGoals,
                total_goals: totalGoals,
                note_views: studyActivities,
                active_days: activeDays,
                period_days: 30
            }
        });
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
        const cutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', req.userId)
            .gte('created_at', cutoff)
            .order('created_at', { ascending: false })
            .limit(100);
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

        // Organically update topic mastery when a note is studied
        if (action_type === 'note' && title) {
            try {
                // Extract subject from description if available (e.g., "Subject: Database Management Systems")
                let subjectId = null;
                const subjectMatch = (description || '').match(/Subject:\s*([^,\n]+)/i);
                if (subjectMatch) {
                    const subjectName = subjectMatch[1].trim();
                    const { data: matchedSub } = await supabase
                        .from('subjects')
                        .select('id')
                        .ilike('name', `%${subjectName}%`)
                        .limit(1)
                        .maybeSingle();
                    if (matchedSub) subjectId = matchedSub.id;
                }

                // Check existing mastery record for this topic
                const { data: existing } = await supabase
                    .from('student_topic_mastery')
                    .select('*')
                    .eq('student_id', req.userId)
                    .eq('topic_name', title.trim())
                    .maybeSingle();

                if (existing) {
                    const newCount = (existing.review_count || 1) + 1;
                    const newMastery = Math.min(100, (existing.mastery_level || 40) + 15);
                    const newStatus = newMastery >= 80 ? 'mastered' : newMastery < 60 ? 'review_needed' : 'learning';

                    await supabase
                        .from('student_topic_mastery')
                        .update({
                            review_count: newCount,
                            mastery_level: newMastery,
                            status: newStatus,
                            last_tested_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                } else {
                    await supabase
                        .from('student_topic_mastery')
                        .insert({
                            student_id: req.userId,
                            subject_id: subjectId,
                            topic_name: title.trim(),
                            mastery_level: 45,
                            status: 'learning',
                            review_count: 1,
                            last_tested_at: new Date().toISOString()
                        });
                }
            } catch (masteryErr) {
                console.warn('Organic mastery update notice:', masteryErr.message);
            }
        }

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== AI LEARNING ANALYTICS & PROGRESS DASHBOARD ====================

/**
 * GET /api/user/analytics/learning-graph
 * Fetches comprehensive knowledge radar data, 30-day activity matrix,
 * weak concepts diagnostics, and spaced repetition decay alerts.
 * Strictly driven by real database subjects and authentic user actions.
 */
app.get('/api/user/analytics/learning-graph', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const cutoff30 = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
        const cutoff30Iso = cutoff30.toISOString();

        // 1. Fetch user info & learning profile
        const [userRes, profileRes] = await Promise.all([
            supabase.from('users').select('id, name, department, semester').eq('id', userId).single(),
            supabase.from('student_learning_profiles').select('*').eq('student_id', userId).maybeSingle()
        ]);

        const user = userRes.data || {};
        let profile = profileRes.data;

        // Auto-initialize default profile if not exists
        if (!profile) {
            const { data: newProfile } = await supabase
                .from('student_learning_profiles')
                .insert({
                    student_id: userId,
                    target_cgpa: 8.50,
                    study_pace: 'balanced',
                    weekly_study_hours: 12,
                    learning_style: 'visual',
                    strengths: ['Analytical Thinking', 'Consistent Daily Study'],
                    weak_topics: []
                })
                .select()
                .maybeSingle();
            profile = newProfile || {
                target_cgpa: 8.50,
                study_pace: 'balanced',
                weekly_study_hours: 12,
                learning_style: 'visual',
                strengths: ['Analytical Thinking'],
                weak_topics: []
            };
        }

        // 2. Fetch student topic mastery records (strictly from genuine database actions)
        const { data: masteryRecords, error: masteryErr } = await supabase
            .from('student_topic_mastery')
            .select('*, subjects(id, name, code, department)')
            .eq('student_id', userId)
            .order('mastery_level', { ascending: true });

        if (masteryErr) console.warn('Topic mastery fetch warning:', masteryErr.message);

        let topicMastery = masteryRecords || [];

        // Fetch real curriculum subjects for student's department & semester
        const { data: deptSubjects } = await supabase
            .from('subjects')
            .select('id, name, code, department, semester')
            .eq('department', user.department || 'CSE')
            .order('semester, code')
            .limit(6);

        // 3. Calculate Radar Graph Vertices
        let radarData = [];
        if (topicMastery.length > 0) {
            const subjectClusterMap = {};
            topicMastery.forEach(item => {
                const subjName = item.subjects?.name || item.topic_name.split(' ')[0] || 'Core Domain';
                if (!subjectClusterMap[subjName]) {
                    subjectClusterMap[subjName] = { total: 0, count: 0, topics: [] };
                }
                subjectClusterMap[subjName].total += Number(item.mastery_level || 0);
                subjectClusterMap[subjName].count += 1;
                subjectClusterMap[subjName].topics.push(item.topic_name);
            });

            radarData = Object.keys(subjectClusterMap).map(subj => {
                const data = subjectClusterMap[subj];
                return {
                    subject: subj,
                    mastery: Math.round(data.total / (data.count || 1)),
                    topic_count: data.count,
                    topics: data.topics
                };
            });
        } else if (deptSubjects && deptSubjects.length > 0) {
            // New student: populate radar axes with their real department subjects awaiting study
            radarData = deptSubjects.map(sub => ({
                subject: sub.name,
                code: sub.code,
                mastery: 0,
                topic_count: 0,
                topics: []
            }));
        } else {
            radarData = [
                { subject: 'Algorithms & Data Structures', mastery: 0, topic_count: 0, topics: [] },
                { subject: 'System Programming', mastery: 0, topic_count: 0, topics: [] },
                { subject: 'Database Systems', mastery: 0, topic_count: 0, topics: [] },
                { subject: 'Computer Networks', mastery: 0, topic_count: 0, topics: [] }
            ];
        }

        // 3. Fetch 30-day activity logs for heatmap matrix
        const { data: rawActivities } = await supabase
            .from('activity_logs')
            .select('action_type, title, created_at')
            .eq('user_id', userId)
            .gte('created_at', cutoff30Iso)
            .order('created_at', { ascending: true });

        const activities = rawActivities || [];

        // Build continuous 30-day date map
        const activityMatrix = [];
        const dateCountMap = {};
        activities.forEach(act => {
            const dayStr = act.created_at ? act.created_at.slice(0, 10) : '';
            if (dayStr) {
                dateCountMap[dayStr] = (dateCountMap[dayStr] || 0) + 1;
            }
        });

        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() - (i * 24 * 60 * 60 * 1000));
            const dStr = d.toISOString().slice(0, 10);
            const count = dateCountMap[dStr] || 0;
            // Activity intensity scale: 0 (none), 1 (1-2), 2 (3-4), 3 (5-7), 4 (8+)
            const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 7 ? 3 : 4;
            activityMatrix.push({
                date: dStr,
                count,
                level,
                day_name: d.toLocaleDateString('en-US', { weekday: 'short' })
            });
        }
        // 4. Identify Weak Concepts (< 60% mastery) from real tested topics
        const weakConcepts = topicMastery
            .filter(t => Number(t.mastery_level) < 60)
            .sort((a, b) => Number(a.mastery_level) - Number(b.mastery_level))
            .map(t => ({
                id: t.id,
                topic_name: t.topic_name,
                subject_name: t.subjects?.name || 'Academic Subject',
                mastery_level: Number(t.mastery_level),
                status: t.status,
                review_count: t.review_count || 0,
                last_tested_at: t.last_tested_at,
                recommended_action: Number(t.mastery_level) < 45
                    ? 'Critical: Review high-yield notes & schedule revision'
                    : 'Practice targeted questions to reach proficiency'
            }));

        // 6. Spaced Repetition Decay Alerts (topics tested > 12 days ago)
        const nowMs = Date.now();
        const retentionAlerts = topicMastery
            .filter(t => {
                if (!t.last_tested_at) return true;
                const daysDiff = (nowMs - new Date(t.last_tested_at).getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff >= 12;
            })
            .map(t => {
                const daysSince = Math.round((nowMs - new Date(t.last_tested_at || nowMs).getTime()) / (1000 * 60 * 60 * 24));
                return {
                    id: t.id,
                    topic_name: t.topic_name,
                    subject_name: t.subjects?.name || 'Core',
                    days_since_review: Math.max(1, daysSince),
                    urgency: daysSince >= 20 ? 'High' : 'Medium'
                };
            });

        // 7. Overall Aggregate Metrics
        const totalMasterySum = topicMastery.reduce((acc, curr) => acc + Number(curr.mastery_level || 0), 0);
        const overallMastery = topicMastery.length ? Math.round(totalMasterySum / topicMastery.length) : 0;
        const activeDaysCount = Object.keys(dateCountMap).length;

        res.json({
            success: true,
            data: {
                profile,
                overall_mastery: overallMastery,
                radar_data: radarData,
                topic_mastery: topicMastery,
                weak_concepts: weakConcepts,
                retention_alerts: retentionAlerts,
                activity_matrix: activityMatrix,
                stats: {
                    total_topics: topicMastery.length,
                    mastered_count: topicMastery.filter(t => Number(t.mastery_level) >= 80).length,
                    learning_count: topicMastery.filter(t => Number(t.mastery_level) >= 60 && Number(t.mastery_level) < 80).length,
                    weak_count: weakConcepts.length,
                    active_days_30: activeDaysCount,
                    total_study_actions: activities.length
                }
            }
        });
    } catch (error) {
        console.error('Learning graph error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/user/analytics/mastery-update
 * Updates a topic mastery record after practice, quiz, or self-assessment.
 */
app.post('/api/user/analytics/mastery-update', authenticateToken, async (req, res) => {
    try {
        const { topic_id, topic_name, subject_id, mastery_level, status } = req.body;
        const userId = req.userId;

        let result;
        if (topic_id) {
            const { data, error } = await supabase
                .from('student_topic_mastery')
                .update({
                    mastery_level: Math.max(0, Math.min(100, parseInt(mastery_level))),
                    status: status || (parseInt(mastery_level) >= 80 ? 'mastered' : parseInt(mastery_level) < 60 ? 'review_needed' : 'learning'),
                    last_tested_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', topic_id)
                .eq('student_id', userId)
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else if (topic_name) {
            const calculatedStatus = status || (parseInt(mastery_level) >= 80 ? 'mastered' : parseInt(mastery_level) < 60 ? 'review_needed' : 'learning');
            const { data, error } = await supabase
                .from('student_topic_mastery')
                .upsert({
                    student_id: userId,
                    subject_id: subject_id || null,
                    topic_name: topic_name.trim(),
                    mastery_level: Math.max(0, Math.min(100, parseInt(mastery_level))),
                    status: calculatedStatus,
                    last_tested_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'student_id,subject_id,topic_name' })
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            return res.status(400).json({ success: false, message: 'topic_id or topic_name is required' });
        }

        // Log learning activity
        await supabase.from('activity_logs').insert({
            user_id: userId,
            action_type: 'mastery',
            title: `Practiced ${result.topic_name}`,
            description: `Updated mastery to ${result.mastery_level}% (${result.status})`
        });

        // Real-time broadcast
        io.to(`user_${userId}`).emit('learning_graph_updated', {
            topic_id: result.id,
            topic_name: result.topic_name,
            mastery_level: result.mastery_level,
            status: result.status
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Mastery update error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/user/analytics/profile
 * Fetches user diagnostic learning profile
 */
app.get('/api/user/analytics/profile', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('student_learning_profiles')
            .select('*')
            .eq('student_id', req.userId)
            .maybeSingle();

        if (error) throw error;
        res.json({
            success: true,
            data: data || {
                target_cgpa: 8.50,
                study_pace: 'balanced',
                weekly_study_hours: 12,
                learning_style: 'visual',
                strengths: ['Consistent Daily Practice'],
                weak_topics: []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * PUT /api/user/analytics/profile
 * Updates student diagnostic preferences and goals
 */
app.put('/api/user/analytics/profile', authenticateToken, async (req, res) => {
    try {
        const { target_cgpa, study_pace, weekly_study_hours, learning_style, strengths, weak_topics } = req.body;
        const { data, error } = await supabase
            .from('student_learning_profiles')
            .upsert({
                student_id: req.userId,
                target_cgpa: target_cgpa ? parseFloat(target_cgpa) : 8.50,
                study_pace: study_pace || 'balanced',
                weekly_study_hours: weekly_study_hours ? parseInt(weekly_study_hours) : 12,
                learning_style: learning_style || 'visual',
                strengths: strengths || [],
                weak_topics: weak_topics || [],
                updated_at: new Date().toISOString()
            }, { onConflict: 'student_id' })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/user/analytics/recovery-plan
 * AI Weak Concept Recovery Engine: generates a targeted 3-step recovery guide
 */
app.post('/api/user/analytics/recovery-plan', authenticateToken, async (req, res) => {
    try {
        const { topic_name, subject_name, mastery_level } = req.body;
        if (!topic_name) return res.status(400).json({ success: false, message: 'topic_name is required' });

        const prompt = `As an expert AI Academic Tutor for Notezilla, create a high-impact remedial recovery plan for a student struggling with the topic "${topic_name}" in subject "${subject_name || 'Engineering'}". Their current mastery score is ${mastery_level || 40}%.

Respond with JSON only in this exact format:
{
  "topic": "${topic_name}",
  "diagnostic_reason": "Brief explanation of why students find this concept tricky and where common misconceptions occur.",
  "recovery_steps": [
    { "step": 1, "title": "Core Intuition", "action": "Clear 2-sentence intuitive mental model to understand the principle without confusing jargon." },
    { "step": 2, "title": "Key Rule / Formula", "action": "The essential algorithm, theorem, formula, or relationship to memorize." },
    { "step": 3, "title": "Micro Practice Drill", "action": "A quick practice challenge or question the student can solve right now to verify understanding." }
  ],
  "retention_tip": "A practical mnemonic or tip for the next review."
}`;

        let plan;
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    plan = JSON.parse(jsonMatch[0]);
                }
            }
        } catch (aiErr) {
            console.warn('AI Recovery generation fallback:', aiErr.message);
        }

        if (!plan) {
            // High-quality deterministic fallback
            plan = {
                topic: topic_name,
                diagnostic_reason: `Students typically struggle with ${topic_name} due to intricate edge cases and abstract state transitions.`,
                recovery_steps: [
                    { step: 1, title: 'Foundational Intuition', action: `Break down ${topic_name} into its core components. Visualize how input data transforms at each step before looking at complex formulas.` },
                    { step: 2, title: 'Step-by-Step Rule Verification', action: 'Write out the primary rules, constraints, and standard patterns on paper. Contrast with the most common edge case.' },
                    { step: 3, title: 'Targeted Micro Drill', action: `Solve 2 fundamental problems focusing purely on ${topic_name} without using calculators or lookups.` }
                ],
                retention_tip: 'Schedule your next quick 5-minute refresher in 48 hours to lock in long-term memory retention.'
            };
        }

        res.json({ success: true, data: plan });
    } catch (error) {
        console.error('Recovery plan error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

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

function isMissingFacultyProfileColumnError(error) {
    const message = String(error?.message || '');
    return /(photo_url|qualifications|free_hours|timetable_updated_at)/i.test(message)
        && /(column|schema cache|does not exist|could not find)/i.test(message);
}

function getPublicFacultyAvailability(faculty) {
    return getFacultyAvailability({
        freeHours: faculty.free_hours,
        manualAvailability: faculty.availability,
        timeZone: process.env.FACULTY_TIMEZONE || 'Asia/Kolkata',
        dayStart: '08:00',
        dayEnd: '17:00'
    });
}

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
                users:user_id(name, email, department)
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
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(413).json({ success: false, message: 'Timetable image must be 5 MB or smaller' });
        }

        const { default: imageType } = await import('image-type');
        const detected = await imageType(req.file.buffer);
        if (!detected || !['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime)) {
            return res.status(415).json({ success: false, message: 'Upload a valid PNG, JPG or WebP timetable image' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'Gemini API is not configured on the server.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: process.env.GEMINI_TIMETABLE_MODEL || 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        });

        const imageParts = [
            {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: detected.mime
                }
            }
        ];

        const prompt = `Read this faculty timetable carefully. Identify only genuine unassigned/free teaching periods during the visible working week. Do not mark a period free when a subject, lab, tutorial, meeting, or other duty is present. Ignore lunch and institutional breaks unless the timetable explicitly treats them as consultable free time.

Return only JSON with this exact structure:
{
  "free_hours": [
    { "day": "Monday", "slots": [{ "start": "10:00", "end": "11:00" }] }
  ]
}

Use full English weekday names and 24-hour HH:MM times. If a cell or time label is unreadable, omit it instead of guessing.`;

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text().trim();
        const freeHours = parseTimetableAnalysis(responseText);
        if (freeHours.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'No reliable free periods could be read. Upload a clearer, straight timetable image with visible day and time labels.'
            });
        }

        const officeHours = formatFreeHours(freeHours);
        const timetableUpdatedAt = new Date().toISOString();
        let { data: faculty, error: updateError } = await supabase
            .from('faculty')
            .update({
                office_hours: officeHours,
                free_hours: freeHours,
                timetable_updated_at: timetableUpdatedAt
            })
            .eq('user_id', req.userId)
            .select('*')
            .single();

        if (updateError && isMissingFacultyProfileColumnError(updateError)) {
            const fallback = await supabase
                .from('faculty')
                .update({ office_hours: officeHours })
                .eq('user_id', req.userId)
                .select('*')
                .single();
            faculty = fallback.data;
            updateError = fallback.error;
        }
        if (updateError) throw updateError;

        res.status(200).json({
            success: true,
            office_hours: officeHours,
            free_hours: freeHours,
            timetable_updated_at: timetableUpdatedAt,
            faculty,
            message: 'Free hours extracted and saved for live availability tracking'
        });
    } catch (error) {
        console.error('OCR Error:', error);
        res.status(500).json({ success: false, message: 'Failed to extract free hours from the timetable image' });
    }
});

/**
 * Update Current Faculty Profile
 * PUT /api/faculty/me
 */
app.put('/api/faculty/me', authenticateToken, requireRole(['staff']), upload.single('photo'), async (req, res) => {
    try {
        const { bio, office_hours, qualifications, availability, department } = req.body;
        const safeAvailability = ['available', 'on_leave', 'unavailable'].includes(availability)
            ? availability
            : 'available';
        let photo_url = String(req.body.photo_url || '').trim();

        if (req.file) {
            if (req.file.size > 2 * 1024 * 1024) {
                return res.status(413).json({ success: false, message: 'Profile photo must be 2 MB or smaller' });
            }
            const { default: imageType } = await import('image-type');
            const detected = await imageType(req.file.buffer);
            if (!detected || !['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime)) {
                return res.status(415).json({ success: false, message: 'Upload a valid PNG, JPG or WebP profile photo' });
            }
            photo_url = `data:${detected.mime};base64,${req.file.buffer.toString('base64')}`;
        } else if (photo_url && !/^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(photo_url)) {
            photo_url = '';
        }

        if (department) {
            const { error: userError } = await supabase
                .from('users')
                .update({ department, updated_at: new Date().toISOString() })
                .eq('id', req.userId);
            if (userError) throw userError;
        }

        const { data, error } = await supabase
            .from('faculty')
            .update({
                photo_url,
                qualifications,
                bio,
                office_hours,
                availability: safeAvailability,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', req.userId)
            .select()
            .single();

        if (error) {
            if (isMissingFacultyProfileColumnError(error)) {
                // Fallback if photo_url/qualifications columns were not added to DB yet
                const { data: fbData, error: fbError } = await supabase
                    .from('faculty')
                    .update({ bio, office_hours, availability: safeAvailability, updated_at: new Date().toISOString() })
                    .eq('user_id', req.userId)
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
        res.set('Cache-Control', 'no-store, max-age=0');
        const { department, availability } = req.query;

        let query = supabase
            .from('faculty')
            .select(`
                *,
                users:user_id(name, email, department, is_approved)
            `);

        const { data, error } = await query;

        if (error) throw error;

        const formattedData = data.filter(faculty => faculty.users?.is_approved !== false)
            .filter(faculty => !department || faculty.users?.department === department)
            .map(faculty => {
                const liveAvailability = getPublicFacultyAvailability(faculty);
                return {
                    id: faculty.id,
                    userId: faculty.user_id,
                    name: faculty.users?.name || 'Unknown',
                    email: faculty.users?.email || '',
                    department: faculty.users?.department || '',
                    bio: faculty.bio,
                    qualifications: faculty.qualifications || '',
                    photoUrl: faculty.photo_url || '',
                    availability: liveAvailability.status,
                    availabilityReason: liveAvailability.reason,
                    averageRating: faculty.average_rating,
                    totalDownloads: faculty.total_downloads,
                    timetableUpdatedAt: faculty.timetable_updated_at || null
                };
            })
            .filter(faculty => !availability || faculty.availability === availability);

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
        res.set('Cache-Control', 'no-store, max-age=0');
        const { data, error } = await supabase
            .from('faculty')
            .select(`
                *,
                users:user_id(name, email, department, is_approved)
            `)
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({
                success: false,
                message: 'Faculty not found'
            });
        }

        const liveAvailability = getPublicFacultyAvailability(data);
        res.status(200).json({
            success: true,
            data: {
                id: data.id,
                userId: data.user_id,
                name: data.users?.name || 'Unknown',
                email: data.users?.email || '',
                department: data.users?.department || '',
                bio: data.bio,
                qualifications: data.qualifications || '',
                photoUrl: data.photo_url || '',
                availability: liveAvailability.status,
                availabilityReason: liveAvailability.reason,
                averageRating: data.average_rating,
                totalDownloads: data.total_downloads,
                timetableUpdatedAt: data.timetable_updated_at || null
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

// ==================== COURSE & CURRICULUM EXPLORER ROUTES ====================

/**
 * GET Curriculum Streams & Available Academic Tracks
 * GET /api/curriculum/streams
 */
app.get('/api/curriculum/streams', (req, res) => {
    try {
        res.status(200).json({
            success: true,
            streams: CURRICULUM_STREAMS
        });
    } catch (error) {
        console.error('Curriculum streams error:', error);
        res.status(500).json({ success: false, message: 'Error fetching curriculum streams' });
    }
});

/**
 * GET All Subjects with Curriculum Stream Filters, Faculty Mapping & Notes Count
 * GET /api/subjects?department=CSE&semester=4&curriculum_stream=all&search=algo&enrolled_only=false
 */
app.get('/api/subjects', optionalAuthenticateToken, async (req, res) => {
    try {
        const { department, semester, curriculum_stream, search, enrolled_only } = req.query;
        const studentId = req.userId || null;

        if (pgPool) {
            let whereClauses = [];
            let params = [];
            let pIdx = 1;

            if (department && department !== 'all') {
                whereClauses.push(`s.department = $${pIdx++}`);
                params.push(department);
            }

            if (semester && semester !== 'all') {
                whereClauses.push(`s.semester = $${pIdx++}`);
                params.push(parseInt(semester));
            }

            if (search) {
                const cleanSearch = String(search).trim();
                whereClauses.push(`(s.name ILIKE $${pIdx} OR s.code ILIKE $${pIdx} OR s.description ILIKE $${pIdx})`);
                params.push(`%${cleanSearch}%`);
                pIdx++;
            }

            // Stream filtering
            if (curriculum_stream === 'gate_placement') {
                const codeList = Array.from(GATE_PLACEMENT_CODES);
                whereClauses.push(`s.code = ANY($${pIdx++})`);
                params.push(codeList);
            } else if (curriculum_stream === 'foundation_stem') {
                whereClauses.push(`s.semester IN (1, 2)`);
            }

            if (enrolled_only === 'true' && studentId) {
                whereClauses.push(`sce.id IS NOT NULL`);
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Query subjects with joined faculty, verified notes count, and student enrollment status
            const querySql = `
                SELECT 
                    s.id,
                    s.code,
                    s.name,
                    s.department,
                    s.semester,
                    s.credits,
                    s.description,
                    s.syllabus,
                    f.id as faculty_id,
                    u.name as faculty_name,
                    f.qualifications as faculty_qualifications,
                    f.office_hours as faculty_office_hours,
                    f.photo_url as faculty_photo_url,
                    f.average_rating as faculty_rating,
                    COUNT(DISTINCT n.id) as notes_count,
                    CASE WHEN sce.id IS NOT NULL THEN true ELSE false END as is_enrolled,
                    ROUND(AVG(stm.mastery_level), 0) as student_mastery
                FROM subjects s
                LEFT JOIN faculty_subjects fs ON s.id = fs.subject_id
                LEFT JOIN faculty f ON fs.faculty_id = f.id
                LEFT JOIN users u ON f.user_id = u.id
                LEFT JOIN notes n ON s.id = n.subject_id AND n.is_verified = true
                LEFT JOIN student_course_enrollments sce ON s.id = sce.subject_id AND sce.student_id = $${pIdx}
                LEFT JOIN student_topic_mastery stm ON s.id = stm.subject_id AND stm.student_id = $${pIdx}
                ${whereSql}
                GROUP BY s.id, s.code, s.name, s.department, s.semester, s.credits, s.description, s.syllabus, f.id, u.name, f.qualifications, f.office_hours, f.photo_url, f.average_rating, sce.id
                ORDER BY s.semester ASC, s.code ASC;
            `;

            params.push(studentId);

            const result = await pgPool.query(querySql, params);
            const enrichedSubjects = result.rows.map(sub => {
                const units = parseSyllabusUnits(sub.syllabus, sub.code, sub.name);
                return {
                    id: sub.id,
                    code: sub.code,
                    name: sub.name,
                    department: sub.department,
                    semester: sub.semester,
                    credits: sub.credits || 3,
                    description: sub.description,
                    syllabus: sub.syllabus,
                    units_count: units.length,
                    units_summary: units.map(u => ({ unit_number: u.unit_number, title: u.title })),
                    notes_count: parseInt(sub.notes_count || 0),
                    is_enrolled: Boolean(sub.is_enrolled),
                    mastery_score: sub.student_mastery ? parseInt(sub.student_mastery) : null,
                    is_gate_placement: GATE_PLACEMENT_CODES.has(sub.code),
                    faculty: sub.faculty_name ? {
                        id: sub.faculty_id,
                        name: sub.faculty_name,
                        qualifications: sub.faculty_qualifications,
                        office_hours: sub.faculty_office_hours,
                        photo_url: sub.faculty_photo_url,
                        rating: sub.faculty_rating || '4.80'
                    } : null
                };
            });

            return res.status(200).json({
                success: true,
                count: enrichedSubjects.length,
                data: enrichedSubjects,
                streams: CURRICULUM_STREAMS
            });
        }

        // Graceful Supabase fallback if pgPool not active
        let query = supabase.from('subjects').select('*');
        if (department && department !== 'all') query = query.eq('department', department);
        if (semester && semester !== 'all') query = query.eq('semester', parseInt(semester));
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

        const { data, error } = await query.order('semester, code');
        if (error) throw error;

        return res.status(200).json({
            success: true,
            count: (data || []).length,
            data: data || [],
            streams: CURRICULUM_STREAMS
        });
    } catch (error) {
        console.error('Subjects list error:', error);
        res.status(500).json({ success: false, message: 'Error fetching subjects' });
    }
});

/**
 * GET Course Curriculum Deep-Dive
 * Full 5-Unit breakdown, mapped unit notes, textbooks, course outcomes, and faculty profile
 * GET /api/subjects/:id/curriculum
 */
app.get('/api/subjects/:id/curriculum', optionalAuthenticateToken, async (req, res) => {
    try {
        const subjectId = req.params.id;
        const studentId = req.userId || null;

        if (pgPool) {
            // Fetch subject with assigned faculty
            const subRes = await pgPool.query(`
                SELECT 
                    s.id,
                    s.code,
                    s.name,
                    s.department,
                    s.semester,
                    s.credits,
                    s.description,
                    s.syllabus,
                    f.id as faculty_id,
                    u.name as faculty_name,
                    u.email as faculty_email,
                    f.bio as faculty_bio,
                    f.qualifications as faculty_qualifications,
                    f.office_hours as faculty_office_hours,
                    f.photo_url as faculty_photo_url,
                    f.average_rating as faculty_rating,
                    f.availability as faculty_availability,
                    CASE WHEN sce.id IS NOT NULL THEN true ELSE false END as is_enrolled
                FROM subjects s
                LEFT JOIN faculty_subjects fs ON s.id = fs.subject_id
                LEFT JOIN faculty f ON fs.faculty_id = f.id
                LEFT JOIN users u ON f.user_id = u.id
                LEFT JOIN student_course_enrollments sce ON s.id = sce.subject_id AND sce.student_id = $2
                WHERE s.id = $1;
            `, [subjectId, studentId]);

            if (subRes.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Course not found' });
            }

            const subject = subRes.rows[0];

            // Fetch verified notes for this subject
            const notesRes = await pgPool.query(`
                SELECT 
                    id,
                    title,
                    type,
                    unit,
                    file_url,
                    file_name,
                    file_size,
                    downloads,
                    ai_summary,
                    key_concepts,
                    created_at
                FROM notes
                WHERE subject_id = $1 AND is_verified = true
                ORDER BY unit ASC, created_at DESC;
            `, [subjectId]);

            // Parse 5 units
            const units = parseSyllabusUnits(subject.syllabus, subject.code, subject.name);

            // Map notes to each unit
            units.forEach(u => {
                u.notes = notesRes.rows.filter(n => parseInt(n.unit) === u.unit_number);
            });

            // Get outcomes and textbooks
            const catalog = getCourseOutcomesAndBooks(subject.code, subject.name, subject.department);

            return res.status(200).json({
                success: true,
                data: {
                    id: subject.id,
                    code: subject.code,
                    name: subject.name,
                    department: subject.department,
                    semester: subject.semester,
                    credits: subject.credits || 3,
                    regulation: catalog.regulation,
                    credits_breakdown: catalog.credits_breakdown,
                    description: subject.description,
                    is_enrolled: Boolean(subject.is_enrolled),
                    is_gate_placement: GATE_PLACEMENT_CODES.has(subject.code),
                    units,
                    notes_count: notesRes.rows.length,
                    textbooks: catalog.books,
                    course_outcomes: catalog.outcomes,
                    faculty: subject.faculty_name ? {
                        id: subject.faculty_id,
                        name: subject.faculty_name,
                        email: subject.faculty_email,
                        bio: subject.faculty_bio,
                        qualifications: subject.faculty_qualifications,
                        office_hours: subject.faculty_office_hours,
                        photo_url: subject.faculty_photo_url,
                        rating: subject.faculty_rating || '4.80',
                        availability: subject.faculty_availability || 'available'
                    } : null
                }
            });
        }

        // Fallback for simple single subject query
        const { data: subject, error: subjectError } = await supabase
            .from('subjects')
            .select('*')
            .eq('id', subjectId)
            .single();

        if (subjectError || !subject) {
            return res.status(404).json({ success: false, message: 'Subject not found' });
        }

        const { data: notes } = await supabase
            .from('notes')
            .select('*')
            .eq('subject_id', subjectId)
            .eq('is_verified', true);

        const units = parseSyllabusUnits(subject.syllabus, subject.code, subject.name);
        units.forEach(u => {
            u.notes = (notes || []).filter(n => parseInt(n.unit) === u.unit_number);
        });

        const catalog = getCourseOutcomesAndBooks(subject.code, subject.name, subject.department);

        res.status(200).json({
            success: true,
            data: {
                ...subject,
                units,
                notes_count: (notes || []).length,
                textbooks: catalog.books,
                course_outcomes: catalog.outcomes
            }
        });
    } catch (error) {
        console.error('Curriculum deep-dive error:', error);
        res.status(500).json({ success: false, message: 'Error fetching curriculum details' });
    }
});

/**
 * Toggle Student Course Enrollment / Semester Pinning
 * POST /api/subjects/:id/enroll
 */
app.post('/api/subjects/:id/enroll', authenticateToken, async (req, res) => {
    try {
        const subjectId = req.params.id;
        const studentId = req.userId;

        if (!pgPool) {
            return res.status(500).json({ success: false, message: 'Database pool not available' });
        }

        // Check if subject exists
        const subCheck = await pgPool.query('SELECT id, code, name, semester, credits FROM subjects WHERE id = $1;', [subjectId]);
        if (subCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Subject not found' });
        }
        const subject = subCheck.rows[0];

        // Check current enrollment
        const enrCheck = await pgPool.query(
            'SELECT id FROM student_course_enrollments WHERE student_id = $1 AND subject_id = $2;',
            [studentId, subjectId]
        );

        let isEnrolled = false;
        let actionMessage = '';

        if (enrCheck.rows.length > 0) {
            // Unenroll / unpin
            await pgPool.query(
                'DELETE FROM student_course_enrollments WHERE student_id = $1 AND subject_id = $2;',
                [studentId, subjectId]
            );
            isEnrolled = false;
            actionMessage = `Unpinned ${subject.code} from your semester courses`;
        } else {
            // Enroll / pin
            await pgPool.query(
                'INSERT INTO student_course_enrollments (student_id, subject_id, semester, status) VALUES ($1, $2, $3, $4);',
                [studentId, subjectId, subject.semester, 'active']
            );
            isEnrolled = true;
            actionMessage = `Pinned ${subject.code} (${subject.name}) to your active semester courses!`;
        }

        // Calculate total enrolled semester credits
        const statsRes = await pgPool.query(`
            SELECT 
                COUNT(DISTINCT s.id) as enrolled_count,
                COALESCE(SUM(s.credits), 0) as total_credits
            FROM student_course_enrollments sce
            JOIN subjects s ON sce.subject_id = s.id
            WHERE sce.student_id = $1;
        `, [studentId]);

        const enrolledCount = parseInt(statsRes.rows[0].enrolled_count || 0);
        const totalCredits = parseInt(statsRes.rows[0].total_credits || 0);

        res.status(200).json({
            success: true,
            is_enrolled: isEnrolled,
            message: actionMessage,
            enrolled_count: enrolledCount,
            total_credits: totalCredits,
            subject: {
                id: subject.id,
                code: subject.code,
                name: subject.name,
                credits: subject.credits
            }
        });
    } catch (error) {
        console.error('Course enrollment error:', error);
        res.status(500).json({ success: false, message: 'Error updating course enrollment' });
    }
});

/**
 * GET Student Enrolled Courses
 * GET /api/user/enrolled-courses
 */
app.get('/api/user/enrolled-courses', authenticateToken, async (req, res) => {
    try {
        const studentId = req.userId;
        if (!pgPool) {
            return res.status(500).json({ success: false, message: 'Database pool not available' });
        }

        const result = await pgPool.query(`
            SELECT 
                s.id,
                s.code,
                s.name,
                s.department,
                s.semester,
                s.credits,
                s.description,
                s.syllabus,
                u.name as faculty_name,
                f.office_hours as faculty_office_hours,
                f.photo_url as faculty_photo_url,
                COUNT(DISTINCT n.id) as notes_count,
                sce.enrolled_at
            FROM student_course_enrollments sce
            JOIN subjects s ON sce.subject_id = s.id
            LEFT JOIN faculty_subjects fs ON s.id = fs.subject_id
            LEFT JOIN faculty f ON fs.faculty_id = f.id
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN notes n ON s.id = n.subject_id AND n.is_verified = true
            WHERE sce.student_id = $1
            GROUP BY s.id, s.code, s.name, s.department, s.semester, s.credits, s.description, s.syllabus, u.name, f.office_hours, f.photo_url, sce.enrolled_at
            ORDER BY s.semester ASC, s.code ASC;
        `, [studentId]);

        const totalCredits = result.rows.reduce((sum, r) => sum + (parseInt(r.credits) || 3), 0);

        res.status(200).json({
            success: true,
            count: result.rows.length,
            total_credits: totalCredits,
            data: result.rows
        });
    } catch (error) {
        console.error('Enrolled courses error:', error);
        res.status(500).json({ success: false, message: 'Error fetching enrolled courses' });
    }
});

/**
 * Legacy Subject Details with Notes (Maintained for Backwards Compatibility)
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

        notifyRepositoryUpdate({
            notes: repository.root.fileCount || 0,
            faculty: repository.faculties.length || 0,
            updatedAt: repository.fetchedAt
        });

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
 * GET Most Bookmarked Notes across all users
 * GET /api/bookmarks/top
 */
app.get('/api/bookmarks/top', authenticateToken, async (req, res) => {
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
            `);

        if (error) throw error;

        const counts = new Map();
        (data || []).forEach((bookmark) => {
            if (!bookmark.notes) return;
            const existing = counts.get(bookmark.note_id) || {
                id: bookmark.note_id,
                title: bookmark.notes.title,
                type: bookmark.notes.type,
                file_url: bookmark.notes.file_url,
                file_name: bookmark.notes.file_name,
                subject_name: bookmark.notes.subjects?.name,
                bookmark_count: 0
            };
            existing.bookmark_count += 1;
            counts.set(bookmark.note_id, existing);
        });

        const topNotes = [...counts.values()]
            .sort((a, b) => b.bookmark_count - a.bookmark_count || a.title.localeCompare(b.title))
            .slice(0, 6);

        res.json({ success: true, data: topNotes });
    } catch (error) {
        console.error('Most bookmarked notes error:', error);
        res.status(500).json({ success: false, message: 'Error fetching most bookmarked notes' });
    }
});

/**
 * GET Student Bookmarks
 * GET /api/bookmarks
 */
app.get('/api/bookmarks', authenticateToken, requireRole(['student', 'staff', 'admin']), async (req, res) => {
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
app.post('/api/bookmarks', authenticateToken, requireRole(['student', 'staff', 'admin']), async (req, res) => {
    try {
        const { note_id, file_name, file_url, faculty_name, subject_name } = req.body;

        let dbNoteId = note_id;

        if (!dbNoteId) {
            if (!file_name || !file_url) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing note_id or file details'
                });
            }

            // Check if note already exists in database by file_url
            const { data: existingNote } = await supabase
                .from('notes')
                .select('id')
                .eq('file_url', file_url)
                .maybeSingle();

            if (existingNote) {
                dbNoteId = existingNote.id;
            } else {
                // Look up a staff account and ensure it has a faculty profile.
                let facultyId = null;
                let facultyUserId = null;
                if (faculty_name) {
                    const { data: facultyUser } = await supabase
                        .from('users')
                        .select('id')
                        .eq('role', 'staff')
                        .ilike('name', `%${faculty_name}%`)
                        .maybeSingle();

                    if (facultyUser) {
                        facultyUserId = facultyUser.id;
                        const { data: facultyProfile } = await supabase
                            .from('faculty')
                            .select('id')
                            .eq('user_id', facultyUser.id)
                            .maybeSingle();
                        if (facultyProfile) facultyId = facultyProfile.id;
                    }
                }

                // Reuse any faculty profile when a folder-to-staff match is unavailable.
                if (!facultyId) {
                    const { data: firstFaculty } = await supabase
                        .from('faculty')
                        .select('id, user_id')
                        .limit(1)
                        .maybeSingle();
                    if (firstFaculty) {
                        facultyId = firstFaculty.id;
                        facultyUserId = firstFaculty.user_id;
                    }
                }

                // Older databases may contain staff users without their faculty profile.
                // Create the missing profile so Drive notes can satisfy notes.faculty_id.
                if (!facultyId) {
                    if (!facultyUserId) {
                        const { data: firstStaff } = await supabase
                            .from('users')
                            .select('id')
                            .eq('role', 'staff')
                            .limit(1)
                            .maybeSingle();
                        facultyUserId = firstStaff?.id || null;
                    }

                    if (facultyUserId) {
                        const { data: ensuredFaculty, error: facultyError } = await supabase
                            .from('faculty')
                            .upsert({ user_id: facultyUserId }, { onConflict: 'user_id' })
                            .select('id')
                            .single();
                        if (facultyError) throw facultyError;
                        facultyId = ensuredFaculty.id;
                    }
                }

                // Look up subject ID by subject_name
                let subjectId = null;
                if (subject_name) {
                    const { data: subject } = await supabase
                        .from('subjects')
                        .select('id')
                        .ilike('name', `%${subject_name}%`)
                        .maybeSingle();
                    if (subject) subjectId = subject.id;
                }

                // Fallback subject if not found
                if (!subjectId) {
                    const { data: firstSubject } = await supabase
                        .from('subjects')
                        .select('id')
                        .limit(1)
                        .maybeSingle();
                    if (firstSubject) subjectId = firstSubject.id;
                }

                if (!facultyId || !subjectId) {
                    return res.status(400).json({
                        success: false,
                        message: 'Could not associate note with faculty or subject'
                    });
                }

                // Create the note
                const { data: newNote, error: createError } = await supabase
                    .from('notes')
                    .insert({
                        faculty_id: facultyId,
                        subject_id: subjectId,
                        title: file_name,
                        type: 'notes',
                        unit: 1,
                        semester: 4,
                        file_url: file_url,
                        file_name: file_name,
                        is_verified: true
                    })
                    .select('id')
                    .single();

                if (createError) throw createError;
                dbNoteId = newNote.id;
            }
        }

        // Check if already bookmarked
        const { data: existing } = await supabase
            .from('student_bookmarks')
            .select('id')
            .eq('student_id', req.userId)
            .eq('note_id', dbNoteId)
            .maybeSingle();

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Note already bookmarked'
            });
        }

        // Create bookmark
        const { data: bookmark, error: bookmarkError } = await supabase
            .from('student_bookmarks')
            .insert({
                student_id: req.userId,
                note_id: dbNoteId
            })
            .select()
            .single();

        if (bookmarkError) throw bookmarkError;

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
app.delete('/api/bookmarks/:noteId', authenticateToken, requireRole(['student', 'staff', 'admin']), async (req, res) => {
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
You are "Aadhi", the official AI Support Assistant for Notezilla.

STRICT BEHAVIOR RULES:
1. ONLY answer questions directly related to:
   - Notezilla (features, navigation, how to search/download/bookmark, DSA dynamic study roadmap, built-in compiler, profile, and roles).
   - Rajalakshmi Engineering College (REC) academic departments, location, and info.
   - The creator of Notezilla: Sarvesh Sivasankaran (widely known as Solo-P-Leveller).
2. If a user asks questions outside this scope (e.g., general programming questions unrelated to the DSA console, general history, writing creative content, or unrelated off-topic queries), politely refuse, explaining that your knowledge is limited strictly to Notezilla, Rajalakshmi Engineering College, and its creator.
3. SECURITY FIRST: Under no circumstances should you disclose backend details, database secrets, database keys, config files, passwords, or personal private details. If asked to show system secrets, refuse politely.

--- notezilla platform navigation ---
- Students: Can search subjects, download notes, bookmark study materials, rate notes, access the Daily DSA roadmap, write code in the local compiler/sandbox, track study statistics (streak, completion percentage, study minutes). Student emails must end in "@rajalakshmi.edu.in".
- Staff: Register as staff, map subjects, upload verified notes/question papers/assignments, sync with Google Drive, and view pending note status. Staff notes must be approved by admins before they are public.
- Admins: Approve pending staff, verify/reject uploaded notes, manage the repository.

--- about rajalakshmi engineering college (rec) ---
- REC is a premier autonomous engineering college located in Thandalam, Chennai, Tamil Nadu, India, affiliated with Anna University.
- Mapped departments: CSE (Computer Science & Engineering), ECE (Electronics & Communication Engineering), EEE (Electrical & Electronics Engineering), MECH (Mechanical Engineering), CIVIL (Civil Engineering), and BioMed (Biomedical Engineering).

--- about the creator ---
- Notezilla was envisioned, designed, and fully developed by Sarvesh Sivasankaran, who codes under the developer handle "Solo-P-Leveller".
- He created Notezilla as a premium academic repository solution to facilitate note accessibility, automated Drive updates, AI study analysis, and sandbox DSA practice for the engineering student community.

Answer Style:
- Give concise, practical help in simple text.
- Be polite, encouraging, and clear.
- Do not make up database values, pending counts, or filenames.
- Do not use markdown tables. Short bullet points are allowed.
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
 * POST /api/chat
 * Centralized Aadhi AI Academic Tutor Endpoint
 * Supports contextual tutoring modes: 'explain', 'socratic', 'exam_drill', 'general'
 * Injects student learning profile, weak topics, and returns speechText for TTS
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userContext, tutorMode, academicContext, voiceActive } = req.body;
        const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 1500) : '';

        if (!cleanMessage) {
            return res.status(200).json({
                success: true,
                response: "Hello! I'm Aadhi, your AI Academic Tutor. How can I help you master your curriculum today?",
                speechText: "Hello! I am Aadhi, your AI Academic Tutor. How can I help you master your curriculum today?"
            });
        }

        // Dynamically enrich student academic profile if authenticated
        let mergedUserContext = { ...(userContext || {}) };
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, jwtSecret);
                if (decoded && decoded.id) {
                    const [userRes, profileRes, weakRes] = await Promise.all([
                        supabase.from('users').select('name, department, semester, role').eq('id', decoded.id).maybeSingle(),
                        supabase.from('student_learning_profiles').select('*').eq('student_id', decoded.id).maybeSingle(),
                        supabase.from('student_topic_mastery').select('topic_name, mastery_level').eq('student_id', decoded.id).lt('mastery_level', 60).limit(5)
                    ]);

                    if (userRes.data) {
                        mergedUserContext.name = userRes.data.name || mergedUserContext.name;
                        mergedUserContext.department = userRes.data.department || mergedUserContext.department;
                        mergedUserContext.semester = userRes.data.semester || mergedUserContext.semester;
                        mergedUserContext.role = userRes.data.role || mergedUserContext.role;
                    }

                    if (profileRes.data) {
                        mergedUserContext.target_cgpa = profileRes.data.target_cgpa;
                        mergedUserContext.study_pace = profileRes.data.study_pace;
                        mergedUserContext.learning_style = profileRes.data.learning_style;
                        mergedUserContext.strengths = profileRes.data.strengths;
                    }

                    if (weakRes.data && weakRes.data.length > 0) {
                        mergedUserContext.weak_topics = weakRes.data.map(w => `${w.topic_name} (${w.mastery_level}%)`);
                    }
                }
            } catch (_) {
                // Anonymous or unverified token - proceed with supplied userContext
            }
        }

        const tutorResult = await aiService.chatWithAadhi(
            cleanMessage,
            mergedUserContext,
            tutorMode || 'explain',
            academicContext || {}
        );

        return res.status(200).json({
            success: true,
            provider: 'google-gemini',
            model: 'gemini-2.5-flash',
            response: (tutorResult.response || '').trim() || "I'm having trouble analyzing that topic right now. Please try again.",
            speechText: (tutorResult.speechText || '').trim()
        });
    } catch (error) {
        console.error('Aadhi AI Tutor error:', error);
        res.status(500).json({
            success: false,
            message: 'Error interacting with Aadhi AI Tutor. Please try again later.'
        });
    }
});

// ==================== SMART CLASS RECORDER ENDPOINTS ====================

/**
 * Process Class Recording & Generate AI Summary, Notes, Action Items & Timestamps
 * POST /api/ai/process-lecture
 */
app.post('/api/ai/process-lecture', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        const { transcript, title, subjectName, classType, durationSeconds } = req.body;
        const audioBuffer = req.file ? req.file.buffer : null;
        const audioMimeType = req.file ? req.file.mimetype : 'audio/webm';

        if (!audioBuffer && (!transcript || typeof transcript !== 'string' || !transcript.trim())) {
            return res.status(400).json({ success: false, message: 'Please record audio or provide a valid lecture transcript.' });
        }

        const metadata = {
            title: title || 'Class Lecture Recording',
            subjectName: subjectName || 'General Academic Course',
            classType: classType || 'lecture',
            durationSeconds: parseInt(durationSeconds) || 0
        };

        // Invoke AI processing with Whisper / Gemini Multimodal Audio transcription
        const aiOutput = await aiService.processClassLecture(transcript || '', metadata, audioBuffer, audioMimeType);


        // Save session output to database
        const finalTranscript = (aiOutput.transcript || transcript || '').trim();
        const { data: record, error: saveError } = await supabase
            .from('class_recordings')
            .insert({
                user_id: req.userId,
                title: metadata.title,
                class_type: metadata.classType,
                subject_name: metadata.subjectName,
                duration_seconds: metadata.durationSeconds,
                transcript: finalTranscript,
                summary: aiOutput.summary || '',
                key_concepts: aiOutput.key_concepts || [],
                action_items: aiOutput.action_items || [],
                structured_notes: aiOutput.structured_notes || '',
                revision_questions: aiOutput.revision_questions || [],
                timestamps: aiOutput.timestamps || []
            })
            .select()
            .single();

        if (saveError) {
            console.error('[Class Recorder] Save to DB error:', saveError);
        }

        // Log activity
        try {
            await supabase.from('activity_logs').insert({
                user_id: req.userId,
                action_type: 'class_recorded',
                title: `Recorded Class: ${metadata.title}`,
                description: `Processed ${metadata.classType} transcript for ${metadata.subjectName}`
            });
        } catch (_) {}

        res.json({
            success: true,
            data: record || {
                user_id: req.userId,
                title: metadata.title,
                class_type: metadata.classType,
                subject_name: metadata.subjectName,
                duration_seconds: metadata.durationSeconds,
                transcript: finalTranscript,
                ...aiOutput
            }
        });
    } catch (error) {
        console.error('Process class lecture error:', error);
        res.status(500).json({ success: false, message: error.message || 'Error processing lecture recording.' });
    }
});

/**
 * Get All Saved Class Recordings for Current Student
 * GET /api/user/class-recordings
 */
app.get('/api/user/class-recordings', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('class_recordings')
            .select('id, title, class_type, subject_name, duration_seconds, summary, created_at, timestamps, action_items')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        console.error('Fetch class recordings error:', error);
        res.status(500).json({ success: false, message: 'Unable to fetch your class recordings.' });
    }
});

/**
 * Get Specific Class Recording Session Details
 * GET /api/user/class-recordings/:id
 */
app.get('/api/user/class-recordings/:id', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('class_recordings')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, message: 'Class recording not found.' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Fetch class recording error:', error);
        res.status(500).json({ success: false, message: 'Error retrieving class recording details.' });
    }
});

/**
 * Search Inside a Lecture (Transcript & Timestamp Query)
 * POST /api/user/class-recordings/:id/search
 */
app.post('/api/user/class-recordings/:id/search', authenticateToken, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || !query.trim()) {
            return res.status(400).json({ success: false, message: 'Provide a search query.' });
        }

        const { data: record, error } = await supabase
            .from('class_recordings')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !record) {
            return res.status(404).json({ success: false, message: 'Recording not found.' });
        }

        const cleanQuery = query.trim().toLowerCase();
        const matches = [];

        // Match against timestamps
        if (Array.isArray(record.timestamps)) {
            record.timestamps.forEach(t => {
                const text = `${t.timestamp} ${t.topic || ''} ${t.details || ''}`.toLowerCase();
                if (text.includes(cleanQuery)) {
                    matches.push({
                        type: 'timestamp',
                        timestamp: t.timestamp,
                        topic: t.topic,
                        details: t.details,
                        snippet: `${t.timestamp} — ${t.topic}: ${t.details || ''}`
                    });
                }
            });
        }

        // Match against transcript sentences
        const sentences = record.transcript.split(/(?<=[.!?])\s+/);
        sentences.forEach((sentence, idx) => {
            if (sentence.toLowerCase().includes(cleanQuery)) {
                matches.push({
                    type: 'transcript',
                    sentenceIndex: idx,
                    snippet: sentence.trim()
                });
            }
        });

        res.json({
            success: true,
            query: cleanQuery,
            totalMatches: matches.length,
            matches
        });
    } catch (error) {
        console.error('Search inside lecture error:', error);
        res.status(500).json({ success: false, message: 'Error searching inside lecture.' });
    }
});

/**
 * Delete a Class Recording Session
 * DELETE /api/user/class-recordings/:id
 */
app.delete('/api/user/class-recordings/:id', authenticateToken, async (req, res) => {
    try {
        const { error } = await supabase
            .from('class_recordings')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.userId);

        if (error) throw error;
        res.json({ success: true, message: 'Class recording deleted successfully.' });
    } catch (error) {
        console.error('Delete class recording error:', error);
        res.status(500).json({ success: false, message: 'Error deleting class recording.' });
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

async function fetchNoteFileBuffer(note) {
    let downloadUrl = note.file_url;
    const driveMatch = downloadUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) downloadUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}&confirm=t`;
    else if (downloadUrl.includes('drive.google.com') && downloadUrl.match(/[?&]id=([^&]+)/)) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${downloadUrl.match(/[?&]id=([^&]+)/)[1]}&confirm=t`;
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`File download failed with status ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

function getDocumentExtension(fileName = '') {
    const cleanName = String(fileName).split(/[?#]/, 1)[0];
    const extension = path.extname(cleanName).slice(1).toLowerCase();
    return extension || 'pdf';
}

async function extractSelectableDocumentText(fileBuffer, fileName) {
    const mimeType = aiService.getMimeType(getDocumentExtension(fileName));
    const text = await aiService.extractText(fileBuffer, mimeType);
    if (!text || !text.trim()) {
        const error = new Error('No selectable text was found in this document');
        error.statusCode = 422;
        throw error;
    }
    return text.trim().slice(0, 1_000_000);
}

/**
 * Stream note content to the authenticated, selectable PDF viewer.
 */
app.get('/api/notes/:id/content', authenticateToken, async (req, res) => {
    try {
        const { data: note, error } = await supabase
            .from('notes')
            .select('file_url, file_name')
            .eq('id', req.params.id)
            .single();
        if (error || !note) return res.status(404).json({ success: false, message: 'Note not found' });

        const fileBuffer = await fetchNoteFileBuffer(note);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${(note.file_name || 'note.pdf').replace(/["\r\n]/g, '')}"`);
        res.send(fileBuffer);
    } catch (error) {
        console.error('Note content error:', error);
        res.status(500).json({ success: false, message: 'Failed to load note content' });
    }
});

/**
 * Stream a Google Drive PDF to the authenticated, selectable PDF viewer.
 */
app.post('/api/drive/content', authenticateToken, async (req, res) => {
    try {
        const { fileId } = req.body;
        if (!fileId) return res.status(400).json({ success: false, message: 'fileId is required' });
        const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`);
        if (!response.ok) throw new Error(`Drive download failed with status ${response.status}`);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', 'application/pdf');
        res.send(fileBuffer);
    } catch (error) {
        console.error('Drive content error:', error);
        res.status(500).json({ success: false, message: 'Failed to load Drive content' });
    }
});

/**
 * Return extracted text for selectable Word, PowerPoint, PDF, and text previews.
 */
app.get('/api/notes/:id/text', authenticateToken, async (req, res) => {
    try {
        const { data: note, error } = await supabase
            .from('notes')
            .select('file_url, file_name')
            .eq('id', req.params.id)
            .single();
        if (error || !note) return res.status(404).json({ success: false, message: 'Note not found' });

        const fileBuffer = await fetchNoteFileBuffer(note);
        const text = await extractSelectableDocumentText(fileBuffer, note.file_name || note.file_url);
        res.json({ success: true, text });
    } catch (error) {
        console.error('Note text extraction error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to extract document text' });
    }
});

app.post('/api/drive/text', authenticateToken, async (req, res) => {
    try {
        const { fileId, fileName } = req.body;
        if (!fileId) return res.status(400).json({ success: false, message: 'fileId is required' });

        const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`);
        if (!response.ok) throw new Error(`Drive download failed with status ${response.status}`);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        const text = await extractSelectableDocumentText(fileBuffer, fileName);
        res.json({ success: true, text });
    } catch (error) {
        console.error('Drive text extraction error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to extract Drive document text' });
    }
});

/**
 * ANALYZE a Note (passes buffer directly to Gemini multimodal)
 */
app.post('/api/notes/:id/analyze', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: note, error } = await supabase.from('notes').select('*').eq('id', id).single();
        if (error || !note) return res.status(404).json({ success: false, message: 'Note not found' });

        // Always generate fresh analysis (clear old stored data)
        await supabase.from('notes').update({ ai_summary: null, key_concepts: null, context_explanation: null }).eq('id', id);

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
        res.status(500).json({ success: false, message: 'Failed to analyze note. Please try again later.' });
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
        console.error('Chat with Note Error:', error);
        res.status(500).json({ success: false, message: 'Failed to interact with Aadhi. Please try again later.' });
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
        // Always generate fresh analysis (skip cache)
        delete driveAnalysisCache[fileId];
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
        res.status(500).json({ success: false, message: 'Failed to analyze Drive file. Please try again later.' });
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
        res.status(500).json({ success: false, message: 'Failed to query Drive file. Please try again later.' });
    }
});

/**
 * Generate a study aid directly from text selected in the document viewer.
 */
app.post('/api/study-tools/selection', authenticateToken, async (req, res) => {
    try {
        const action = String(req.body.action || '').toLowerCase();
        const selectedText = String(req.body.selectedText || '').replace(/\s+/g, ' ').trim();

        if (!['flashcards', 'explain'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Unsupported study action' });
        }
        if (selectedText.length < 3) {
            return res.status(400).json({ success: false, message: 'Select a longer passage first' });
        }
        if (selectedText.length > 12000) {
            return res.status(400).json({ success: false, message: 'The selected passage is too long. Select a smaller section.' });
        }

        const response = await aiService.generateSelectionStudyAid(selectedText, action);
        res.json({ success: true, response });
    } catch (error) {
        console.error('Selected text study tool error:', error);
        res.status(500).json({ success: false, message: 'Failed to create this study aid. Please try again later.' });
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
        example: 'numbers = [2, 4, 6, 8]\nfor value in numbers:\n    print(value)',
        exampleOutput: '2\n4\n6\n8'
    },
    cpp: {
        label: 'C++',
        extension: 'cpp',
        syntax: 'for (int i = 0; i < values.size(); i++) {\n    cout << i << " " << values[i] << "\\n";\n}',
        example: '#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    vector<int> values = {2, 4, 6, 8};\n    for (int value : values) cout << value << "\\n";\n    return 0;\n}',
        exampleOutput: '2\n4\n6\n8'
    },
    java: {
        label: 'Java',
        extension: 'java',
        syntax: 'for (int i = 0; i < values.length; i++) {\n    System.out.println(values[i]);\n}',
        example: 'public class Main {\n    public static void main(String[] args) {\n        int[] values = {2, 4, 6, 8};\n        for (int value : values) System.out.println(value);\n    }\n}',
        exampleOutput: '2\n4\n6\n8'
    },
    c: {
        label: 'C',
        extension: 'c',
        syntax: 'for (int i = 0; i < n; i++) {\n    printf("%d\\n", values[i]);\n}',
        example: '#include <stdio.h>\n\nint main(void) {\n    int values[] = {2, 4, 6, 8};\n    int n = 4;\n    for (int i = 0; i < n; i++) printf("%d\\n", values[i]);\n    return 0;\n}',
        exampleOutput: '2\n4\n6\n8'
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

function buildDsaStarterCode(language) {
    const templates = {
        python: `import sys

def solve():
    raw_input = sys.stdin.read().strip()
    # TODO: parse raw_input, solve the practice problem, and print the answer.

if __name__ == "__main__":
    solve()
`,
        c: `#include <stdio.h>

int main(void) {
    /* TODO: read stdin, solve the practice problem, and print the answer. */
    return 0;
}
`,
        cpp: `#include <iostream>
#include <string>
using namespace std;

int main() {
    // TODO: read stdin, solve the practice problem, and print the answer.
    return 0;
}
`,
        java: `import java.io.BufferedReader;
import java.io.InputStreamReader;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        // TODO: read stdin, solve the practice problem, and print the answer.
    }
}
`
    };
    return templates[language] || templates.python;
}

function buildDsaFallbackSolution(language) {
    const solutions = {
        python: `import sys

values = sys.stdin.read().strip().split()
print(" ".join(reversed(values)))
`,
        c: `#include <stdio.h>

int main(void) {
    int values[1000];
    int count = 0;
    while (count < 1000 && scanf("%d", &values[count]) == 1) count++;
    for (int i = count - 1; i >= 0; i--) {
        if (i < count - 1) printf(" ");
        printf("%d", values[i]);
    }
    printf("\\n");
    return 0;
}
`,
        cpp: `#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<long long> values;
    long long value;
    while (cin >> value) values.push_back(value);
    reverse(values.begin(), values.end());
    for (size_t i = 0; i < values.size(); i++) {
        if (i) cout << ' ';
        cout << values[i];
    }
    cout << '\\n';
    return 0;
}
`,
        java: `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        List<String> values = new ArrayList<>();
        String line;
        while ((line = reader.readLine()) != null) {
            for (String value : line.trim().split("\\\\s+")) {
                if (!value.isEmpty()) values.add(value);
            }
        }
        Collections.reverse(values);
        System.out.println(String.join(" ", values));
    }
}
`
    };
    return solutions[language] || solutions.python;
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
        practice_problem: `Read one line of space-separated integers and print the integers in reverse order. For example, input "1 2 3" must produce "3 2 1". Use this exercise to practise ${concept} in ${meta.label}.`,
        starter_code: buildDsaStarterCode(language),
        solution_code: buildDsaFallbackSolution(language),
        test_cases: [
            { input: '1 2 3', expected_output: '3 2 1' },
            { input: '10', expected_output: '10' },
            { input: '5 -2 8 0', expected_output: '0 8 -2 5' }
        ],
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
        // The saved preference is authoritative. Older AI responses did not
        // include this field, which made Java/Python lessons run as C.
        programming_language: language,
        schema_version: 2,
        example_code: content.example_code || content.example || fallback.example_code,
        starter_code: content.starter_code || fallback.starter_code,
        solution_code: content.solution_code || fallback.solution_code,
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
        const progress = await getOrCreateDsaProgress(req.userId, 'python');
        const learningGoal = progress.topic_status?._metadata?.learning_goal;
        const preferredLanguage = progress.preferred_language;

        if (!learningGoal || !preferredLanguage) {
            return res.json({ success: false, needsLanguage: true });
        }

        const day = Math.min(DSA_MAX_DAY, Math.max(1, progress.current_day || 1));
        
        let content = progress.topic_status?.[String(day)]?.custom_content;
        const legacyContent = content;
        const needsLessonRefresh = !content
            || Number(content.schema_version || 0) < 2
            || !String(content.solution_code || '').trim();
        
        if (needsLessonRefresh) {
            const concept = dsaConceptPlan[(day - 1) % dsaConceptPlan.length];
            console.log(`[DSA Module] Generating Day ${day} (${concept}) for User ${req.userId} with goal ${learningGoal} in ${preferredLanguage}...`);
            
            try {
                const generatedContent = await aiService.generateDailyDSA(day, concept, preferredLanguage, learningGoal);
                if (!String(generatedContent?.solution_code || '').trim()
                    || normalizeDsaArray(generatedContent?.test_cases).length === 0) {
                    throw new Error('Generated DSA lesson is missing its executable solution contract');
                }
                content = generatedContent;
            } catch (err) {
                console.error('[DSA Module] Gemini generation failed, using fallback:', err);
                content = buildFallbackDsaContent(day, preferredLanguage);
            }

            content = normalizeDsaContent(content, day, preferredLanguage);

            // Update user progress to cache the generated lesson
            const topicStatus = progress.topic_status || {};
            topicStatus[String(day)] = {
                ...(topicStatus[String(day)] || {}),
                custom_content: content
            };

            const codeDrafts = { ...(progress.code_drafts || {}) };
            const existingDraft = String(codeDrafts[String(day)] || '').trim();
            const legacyExample = String(legacyContent?.example_code || legacyContent?.example || '').trim();
            const isLegacyGeneratedDraft = existingDraft && (
                existingDraft === legacyExample
                || /TODO:\s*(?:parse raw_input|read stdin), solve the practice problem/i.test(existingDraft)
            );
            if (isLegacyGeneratedDraft) delete codeDrafts[String(day)];
            progress.code_drafts = codeDrafts;

            await supabase
                .from('dsa_user_progress')
                .update({
                    topic_status: topicStatus,
                    code_drafts: codeDrafts,
                    updated_at: new Date().toISOString()
                })
                .eq('id', progress.id);
        }

        content = normalizeDsaContent(content, day, preferredLanguage);

        const scrapedLinks = await scrapeDsaLinks(content.concept);
        const externalLinks = [...(content.external_links || []), ...scrapedLinks]
            .filter((link, index, all) => link && link.url && all.findIndex(item => item.url === link.url) === index)
            .slice(0, 8);

        res.json({
            success: true,
            data: {
                ...content,
                day,
                external_links: externalLinks,
                progress: buildDsaStats(progress, day),
                learning_goal: learningGoal,
                language_meta: dsaLanguageMeta[preferredLanguage] || dsaLanguageMeta.python
            }
        });
    } catch (error) {
        console.error('[DSA Daily] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch daily DSA lesson. Please try again later.' });
    }
});

/**
 * SET User DSA Language & Goal Preference
 */
app.post('/api/dsa/preference', authenticateToken, async (req, res) => {
    try {
        const { language, learningGoal } = req.body;
        if (!dsaLanguageMeta[language]) {
            return res.status(400).json({ success: false, message: 'Unsupported DSA language' });
        }
        if (!learningGoal) {
            return res.status(400).json({ success: false, message: 'Learning goal is required' });
        }

        const progress = await getOrCreateDsaProgress(req.userId, language);
        const topicStatus = progress.topic_status || {};
        if (!topicStatus._metadata) {
            topicStatus._metadata = {};
        }
        topicStatus._metadata.learning_goal = learningGoal;

        const languageChanged = progress.preferred_language !== language;
        if (languageChanged) {
            Object.keys(topicStatus).forEach(key => {
                if (key === '_metadata' || !topicStatus[key] || typeof topicStatus[key] !== 'object') return;
                delete topicStatus[key].custom_content;
            });
        }

        await supabase
            .from('dsa_user_progress')
            .update({ 
                preferred_language: language, 
                topic_status: topicStatus, 
                code_drafts: languageChanged ? {} : (progress.code_drafts || {}),
                start_date: new Date().toISOString(), // Reset to today so day calculations start fresh
                updated_at: new Date().toISOString() 
            })
            .eq('id', progress.id);

        res.json({ success: true });
    } catch (error) {
        console.error('[DSA Preference] Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save DSA preference. Please try again later.' });
    }
});

/**
 * RUN & CHECK Compiler Endpoint
 */
app.post('/api/dsa/run', authenticateToken, async (req, res) => {
    try {
        const { code, language, day } = req.body;
        const safeDay = Number(day);
        
        if (!code) {
            return res.status(400).json({ success: false, message: 'Code cannot be empty' });
        }
        if (String(code).length > 100000) {
            return res.status(400).json({ success: false, message: 'Code is too long to run' });
        }
        if (!Number.isInteger(safeDay) || safeDay < 1 || safeDay > DSA_MAX_DAY) {
            return res.status(400).json({ success: false, message: 'Invalid DSA day' });
        }

        const progress = await getOrCreateDsaProgress(req.userId, language || 'python');
        const content = progress.topic_status?.[String(safeDay)]?.custom_content;
        const effectiveLanguage = dsaLanguageMeta[progress.preferred_language]
            ? progress.preferred_language
            : 'python';
        
        let testCases = normalizeDsaArray(content?.test_cases).filter(testCase =>
            testCase && typeof testCase === 'object' && Object.prototype.hasOwnProperty.call(testCase, 'expected_output')
        );
        if (!testCases || testCases.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'This lesson has no valid test cases yet. Refresh the lesson before running your code.'
            });
        }

        const execution = await compilerService.executeCode(code, effectiveLanguage, testCases);

        res.json({
            success: true,
            results: execution.results,
            executionEngine: 'sandbox',
            compiler: execution.compiler
        });
    } catch (error) {
        console.error('[DSA Run] Error:', error);
        const isServiceError = error.code === 'COMPILER_SERVICE_UNAVAILABLE';
        res.status(isServiceError ? 503 : 500).json({
            success: false,
            message: isServiceError
                ? error.message
                : 'Code execution failed. Please check your syntax and try again.'
        });
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

        const progress = await getOrCreateDsaProgress(req.userId, 'python');
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
        console.error('Update progress error:', error);
        res.status(500).json({ success: false, message: 'Failed to update DSA progress. Please try again later.' });
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
