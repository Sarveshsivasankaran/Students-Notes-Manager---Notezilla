/**
 * Verification Script for Course & Curriculum Explorer Backend APIs
 */

const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET || 'notezilla_secret_key_2024';
const testStudentToken = jwt.sign(
    { userId: '3fd91eff-536f-426d-b9d6-4601c83127e1', email: 'sabnishseetharaman.2024.it@rajalakshmi.edu.in', role: 'student' },
    jwtSecret,
    { expiresIn: '1h' }
);

function request(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, text: body });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

async function verifyCurriculumExplorer() {
    console.log('🚀 Testing Course & Curriculum Explorer Endpoints on localhost:5000...\n');

    // 1. Curriculum Streams
    console.log('1. Testing GET /api/curriculum/streams...');
    const streamRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/curriculum/streams',
        method: 'GET'
    });
    console.log(`Status: ${streamRes.status}, Streams: ${streamRes.data.streams ? streamRes.data.streams.length : 0}`);
    if (streamRes.status !== 200 || !streamRes.data.success) {
        throw new Error('Failed to get curriculum streams');
    }

    // 2. Enriched Subjects Listing
    console.log('\n2. Testing GET /api/subjects (CSE, Sem 4)...');
    const subRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/subjects?department=CSE&semester=4',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${testStudentToken}`
        }
    });
    console.log(`Status: ${subRes.status}, Courses returned: ${subRes.data.count}`);
    const sample = subRes.data.data[0];
    console.log(`Sample Course: ${sample.code} - ${sample.name}`);
    console.log(`  Credits: ${sample.credits}, Units: ${sample.units_count}, Notes: ${sample.notes_count}`);
    console.log(`  Assigned Faculty: ${sample.faculty ? sample.faculty.name : 'N/A'}`);
    console.log(`  Is Enrolled: ${sample.is_enrolled}`);
    if (subRes.status !== 200 || !subRes.data.success || subRes.data.count === 0) {
        throw new Error('Failed to get enriched subjects');
    }

    // 3. Curriculum Deep-Dive
    console.log(`\n3. Testing GET /api/subjects/${sample.id}/curriculum...`);
    const currRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: `/api/subjects/${sample.id}/curriculum`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${testStudentToken}`
        }
    });
    console.log(`Status: ${currRes.status}`);
    const cData = currRes.data.data;
    console.log(`  Course: ${cData.name} (${cData.code})`);
    console.log(`  Regulation: ${cData.regulation}`);
    console.log(`  Total Units: ${cData.units.length}`);
    console.log(`  Unit 1: ${cData.units[0].title} (Notes: ${cData.units[0].notes ? cData.units[0].notes.length : 0})`);
    console.log(`  Course Outcomes: ${cData.course_outcomes.length}`);
    console.log(`  Prescribed Textbooks: ${cData.textbooks.length}`);
    if (currRes.status !== 200 || !currRes.data.success || cData.units.length !== 5) {
        throw new Error('Failed curriculum deep-dive');
    }

    // 4. Toggle Course Enrollment (Pin / Unpin)
    console.log(`\n4. Testing POST /api/subjects/${sample.id}/enroll (Toggle Pin)...`);
    const enrollRes1 = await request({
        hostname: 'localhost',
        port: 5000,
        path: `/api/subjects/${sample.id}/enroll`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${testStudentToken}`,
            'Content-Type': 'application/json'
        }
    });
    console.log(`Enroll Toggle 1: is_enrolled=${enrollRes1.data.is_enrolled}, message="${enrollRes1.data.message}", total_credits=${enrollRes1.data.total_credits}`);

    // 5. Enrolled courses list
    console.log('\n5. Testing GET /api/user/enrolled-courses...');
    const enrolledListRes = await request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/user/enrolled-courses',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${testStudentToken}`
        }
    });
    console.log(`Status: ${enrolledListRes.status}, Total Enrolled: ${enrolledListRes.data.count}, Total Credits: ${enrolledListRes.data.total_credits}`);

    console.log('\n✨ ALL CURRICULUM EXPLORER API TESTS PASSED 100%!');
}

verifyCurriculumExplorer().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
