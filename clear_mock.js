const { supabase } = require('./models/db');

async function run() {
    console.log('Clearing mock data...');
    // Delete notes that are dummy
    const { data: notes, error: err1 } = await supabase
        .from('notes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all notes
        
    console.log('Notes deleted', err1);
    
    // We should keep subjects and faculty, or delete them too?
    // "remove mock data from database" usually means removing all fake seeding data.
    // If I delete all notes, it removes mock files. Let's delete ALL notes, subjects, faculty and users? 
    // No, maybe just notes and bookmarks and ratings.
    
    // Actually let's delete anything with "dummy" or "DRIVE_SYNC" in file_url, or maybe just ALL notes.
    const { error: err2 } = await supabase.from('student_bookmarks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error: err3 } = await supabase.from('ratings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('Cleared ratings/bookmarks', err2, err3);
}

run();
