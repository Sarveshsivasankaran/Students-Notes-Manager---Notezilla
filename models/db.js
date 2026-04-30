/**
 * Supabase Database Configuration for Notezilla
 * PostgreSQL backend with authentication
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file.');
    console.error('Copy .env.example to .env and set SUPABASE_URL and SUPABASE_ANON_KEY.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Database initialization check
const initializeDatabase = async () => {
    try {
        // Simple test: try selecting one user row to confirm connectivity and table presence
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .limit(1);

        if (error) {
            // If tables are not created, Postgres/Supabase will return an error mentioning the relation
            const message = error.message || JSON.stringify(error);
            if (message && (message.includes('relation') || message.includes('does not exist') || message.includes('PGRST116'))) {
                console.log('Tables not found. Please run the SQL schema in Supabase SQL Editor.');
                console.log('See SUPABASE_SETUP.md for table creation steps.');
            } else {
                console.error('Database initialization error:', message);
            }
        } else {
            console.log('Supabase connected successfully.');
        }
    } catch (err) {
        // Ensure we always print a useful message (some errors may not have a .message)
        const out = err && err.message ? err.message : JSON.stringify(err);
        console.error('Database initialization warning:', out);
    }
};

module.exports = {
    supabase,
    initializeDatabase
};
