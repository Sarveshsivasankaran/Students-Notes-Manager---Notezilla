/**
 * Notezilla Database Seeding Script - COMPREHENSIVE
 * Populates Supabase with a large set of subjects, faculty, and notes
 */

const { supabase } = require('./models/db');
const bcryptjs = require('bcryptjs');

async function seed() {
    console.log('🚀 Starting Comprehensive Database Seeding...');

    try {
        // 1. Seed Subjects
        console.log('📚 Seeding Subjects...');
        const subjects = [
            // Semester 4 - CSE
            { code: "CS3492", name: "Database Management Systems", department: "CSE", semester: 4 },
            { code: "CS3491", name: "Artificial Intelligence and Machine Learning", department: "CSE", semester: 4 },
            { code: "CS3401", name: "Algorithms", department: "CSE", semester: 4 },
            { code: "CS3451", name: "Introduction to Operating Systems", department: "CSE", semester: 4 },
            { code: "GE3451", name: "Environmental Sciences and Sustainability", department: "CSE", semester: 4 },
            // Semester 6 - CSE
            { code: "CCS334", name: "Big Data Analytics", department: "CSE", semester: 6 },
            { code: "CCS335", name: "Cloud Computing", department: "CSE", semester: 6 },
            { code: "CS3691", name: "Embedded Systems and IOT", department: "CSE", semester: 6 },
            // Other Departments (Must match: CSE, ECE, EEE, MECH, CIVIL, BioMed)
            { code: "EC3452", name: "Communication Systems", department: "ECE", semester: 4 },
            { code: "EE3404", name: "Power Electronics", department: "EEE", semester: 4 },
            { code: "ME3491", name: "Theory of Machines", department: "MECH", semester: 4 },
            { code: "CE3401", name: "Applied Hydraulics Engineering", department: "CIVIL", semester: 4 },
            { code: "BM3401", name: "Bio-Medical Instrument.", department: "BioMed", semester: 4 }
        ];

        const { data: seededSubjects, error: subError } = await supabase
            .from('subjects')
            .upsert(subjects, { onConflict: 'code' })
            .select();

        if (subError) throw subError;
        console.log(`✅ Seeded ${seededSubjects.length} subjects.`);

        // 2. Seed Faculty Users
        console.log('👨‍🏫 Seeding Faculty Users...');
        const facultyData = [
            { name: "Dr. V. Murali Bhaskaran", email: "dean@rajalakshmi.edu.in", dept: "CSE", bio: "Professor & Dean Academics. Specializes in Algorithms and Data Structures." },
            { name: "Dr. N. Sankar Ram", email: "hodcse@rajalakshmi.edu.in", dept: "CSE", bio: "Professor & HOD of CSE department. Expert in Network Security." },
            { name: "Dr. K. Devaki", email: "devaki@rajalakshmi.edu.in", dept: "CSE", bio: "Expert in Theory of Computation and Compiler Design." },
            { name: "Prof. S. Ramesh Babu", email: "ramesh@rajalakshmi.edu.in", dept: "CSE", bio: "Assistant Professor specializing in Database Systems." },
            { name: "Dr. P. Kumar", email: "kumar@rajalakshmi.edu.in", dept: "ECE", bio: "Professor in Electronics and Communication Engineering." }
        ];

        const salt = await bcryptjs.genSalt(10);
        const hashedPassword = await bcryptjs.hash('Password123!', salt);

        const seededFacultyIds = [];

        for (const f of facultyData) {
            // Upsert User
            const { data: user, error: userError } = await supabase
                .from('users')
                .upsert({
                    name: f.name,
                    email: f.email,
                    password: hashedPassword,
                    role: 'staff',
                    department: f.dept,
                    is_approved: true
                }, { onConflict: 'email' })
                .select()
                .single();

            if (userError) {
                console.warn(`User error for ${f.email}:`, userError.message);
                continue;
            }

            // Upsert Faculty Profile
            const { data: prof, error: profError } = await supabase
                .from('faculty')
                .upsert({
                    user_id: user.id,
                    bio: f.bio,
                    availability: 'available',
                    average_rating: (4 + Math.random()).toFixed(1),
                    total_downloads: Math.floor(Math.random() * 200)
                }, { onConflict: 'user_id' })
                .select()
                .single();

            if (profError) throw profError;
            seededFacultyIds.push(prof.id);
        }
        console.log(`✅ Seeded ${seededFacultyIds.length} faculty profiles.`);

        // 3. Seed Notes
        console.log('📝 Seeding More Sample Notes...');
        const notesToSeed = [
            { title: "DBMS Unit 1 - Introduction to Relational Model", subject_code: "CS3492", faculty_email: "ramesh@rajalakshmi.edu.in", type: "notes", unit: 1, sem: 4 },
            { title: "DBMS Unit 2 - SQL Queries & Optimization", subject_code: "CS3492", faculty_email: "ramesh@rajalakshmi.edu.in", type: "notes", unit: 2, sem: 4 },
            { title: "OS Memory Management Deep Dive", subject_code: "CS3451", faculty_email: "hodcse@rajalakshmi.edu.in", type: "ebook", unit: 2, sem: 4 },
            { title: "AI Principles & Logic Structures", subject_code: "CS3491", faculty_email: "devaki@rajalakshmi.edu.in", type: "notes", unit: 1, sem: 4 },
            { title: "Algorithms Unit 3: Dynamic Programming", subject_code: "CS3401", faculty_email: "dean@rajalakshmi.edu.in", type: "notes", unit: 3, sem: 4 },
            { title: "Cloud Computing Architecture", subject_code: "CCS335", faculty_email: "hodcse@rajalakshmi.edu.in", type: "notes", unit: 1, sem: 6 }
        ];

        for (const n of notesToSeed) {
            const subject = seededSubjects.find(s => s.code === n.subject_code);
            const { data: user } = await supabase.from('users').select('id').eq('email', n.faculty_email).single();
            if (!user) continue;
            const { data: faculty } = await supabase.from('faculty').select('id').eq('user_id', user.id).single();
            if (!faculty || !subject) continue;

            await supabase
                .from('notes')
                .upsert({
                    title: n.title,
                    type: n.type,
                    subject_id: subject.id,
                    faculty_id: faculty.id,
                    unit: n.unit,
                    semester: n.sem,
                    file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                    file_name: n.title.toLowerCase().replace(/ /g, '_') + ".pdf",
                    is_verified: true,
                    downloads: Math.floor(Math.random() * 100)
                }, { onConflict: 'title' });
        }
        console.log('✅ Seeded detailed sample verified notes.');

        console.log('\n✨ COMPREHENSIVE Seeding Complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seed();
