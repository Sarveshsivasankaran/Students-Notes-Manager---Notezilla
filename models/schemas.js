/**
 * MongoDB Database Schemas for Notezilla
 * Faculty-Structured Academic Repository
 * 
 * Collections:
 * - User (Students, Staff, Admin)
 * - Faculty (Staff Profiles)
 * - Subject (Course/Subject Details)
 * - Note (PDF/File Metadata)
 * - Rating (Feedback System)
 * - StudentBookmark (Saved Notes)
 */

const mongoose = require('mongoose');

// ==================== USER SCHEMA ====================
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name'],
        trim: true,
        minlength: 2
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['student', 'staff', 'admin'],
        default: 'student'
    },
    // Student specific fields
    department: {
        type: String,
        trim: true
    },
    semester: {
        type: Number,
        min: 1,
        max: 8
    },
    // Staff specific fields
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Faculty'
    },
    isApproved: {
        type: Boolean,
        default: false // Staff needs admin approval
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== FACULTY SCHEMA ====================
const facultySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    qualification: {
        type: String,
        trim: true
    },
    yearsTeaching: {
        type: Number,
        min: 0
    },
    department: {
        type: String,
        required: true
    },
    subjects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
    }],
    officeHours: {
        type: String,
        default: 'Not specified'
    },
    availability: {
        type: String,
        enum: ['available', 'busy', 'on-leave'],
        default: 'available'
    },
    bio: {
        type: String,
        default: ''
    },
    profileImage: {
        type: String,
        default: null
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalDownloads: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== SUBJECT SCHEMA ====================
const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Subject name required'],
        trim: true
    },
    code: {
        type: String,
        trim: true
    },
    department: {
        type: String,
        required: true
    },
    semester: {
        type: Number,
        required: true,
        min: 1,
        max: 8
    },
    credits: {
        type: Number,
        default: 4
    },
    faculty: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Faculty'
    }],
    syllabus: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== NOTE SCHEMA ====================
const noteSchema = new mongoose.Schema({
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    faculty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Faculty',
        required: true
    },
    title: {
        type: String,
        required: [true, 'Note title required'],
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['notes', 'ppt', 'assignment', 'pyq', 'solution', 'other'],
        default: 'notes'
    },
    unit: {
        type: Number,
        default: 1
    },
    semester: {
        type: Number,
        min: 1,
        max: 8
    },
    year: {
        type: Number,
        default: new Date().getFullYear()
    },
    // File storage (cloud path, not base64)
    fileUrl: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number // in bytes
    },
    // AI Features
    aiSummary: {
        type: String,
        default: null
    },
    keyPoints: [String],
    flashcards: [{
        question: String,
        answer: String
    }],
    syllabusCoverage: {
        type: Number, // percentage
        default: 0
    },
    // Metadata
    version: {
        type: Number,
        default: 1
    },
    previousVersions: [{
        version: Number,
        fileUrl: String,
        uploadedAt: Date
    }],
    downloads: {
        type: Number,
        default: 0
    },
    isVerified: {
        type: Boolean,
        default: false // Admin verification
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== RATING SCHEMA ====================
const ratingSchema = new mongoose.Schema({
    note: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Note',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clarity: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    completeness: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    helpfulness: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    averageRating: {
        type: Number,
        default: function () {
            return (this.clarity + this.completeness + this.helpfulness) / 3;
        }
    },
    review: {
        type: String,
        trim: true,
        maxlength: 500
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== BOOKMARK SCHEMA ====================
const bookmarkSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    note: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Note',
        required: true
    },
    savedAt: {
        type: Date,
        default: Date.now
    }
});

// ==================== Create Models ====================
const User = mongoose.model('User', userSchema);
const Faculty = mongoose.model('Faculty', facultySchema);
const Subject = mongoose.model('Subject', subjectSchema);
const Note = mongoose.model('Note', noteSchema);
const Rating = mongoose.model('Rating', ratingSchema);
const StudentBookmark = mongoose.model('StudentBookmark', bookmarkSchema);

module.exports = {
    User,
    Faculty,
    Subject,
    Note,
    Rating,
    StudentBookmark,
    userSchema,
    facultySchema,
    subjectSchema,
    noteSchema,
    ratingSchema,
    bookmarkSchema
};
