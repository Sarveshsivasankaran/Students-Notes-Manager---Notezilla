-- ========================================
-- Notezilla Supabase PostgreSQL Schema
-- ========================================
-- Run this SQL in Supabase SQL Editor to create all tables

-- 1. USERS TABLE (Students, Staff, Admin)
create table if not exists users (
   id          uuid primary key default gen_random_uuid(),
   name        text not null,
   email       text not null unique,
   password    text not null,
   role        text not null check ( role in ( 'student',
                                        'staff',
                                        'admin' ) ) default 'student',
   department  text,
   semester    integer,
   is_approved boolean default true,
   preferred_dsa_language text,
   created_at  timestamp with time zone default now(),
   updated_at  timestamp with time zone default now()
);

-- 2. FACULTY TABLE
create table if not exists faculty (
   id              uuid primary key default gen_random_uuid(),
   user_id         uuid not null unique
      references users ( id )
         on delete cascade,
   bio             text,
   photo_url       text,
   qualifications  text,
   office_hours    text,
   free_hours      jsonb not null default '[]'::jsonb,
   timetable_updated_at timestamp with time zone,
   availability    text default 'available' check ( availability in ( 'available',
                                                                   'on_leave',
                                                                   'unavailable' ) ),
   average_rating  decimal(3,2) default 0,
   total_downloads integer default 0,
   created_at      timestamp with time zone default now(),
   updated_at      timestamp with time zone default now()
);

-- 3. SUBJECTS TABLE
create table if not exists subjects (
   id          uuid primary key default gen_random_uuid(),
   name        text not null,
   code        text not null unique,
   department  text not null check ( department in ( 'CSE',
                                                    'ECE',
                                                    'EEE',
                                                    'MECH',
                                                    'CIVIL',
                                                    'BioMed' ) ),
   semester    integer not null,
   credits     integer,
   syllabus    text,
   description text,
   created_at  timestamp with time zone default now(),
   updated_at  timestamp with time zone default now()
);

-- 4. FACULTY_SUBJECTS (Many-to-Many)
create table if not exists faculty_subjects (
   id         uuid primary key default gen_random_uuid(),
   faculty_id uuid not null references faculty ( id ) on delete cascade,
   subject_id uuid not null references subjects ( id ) on delete cascade,
   created_at timestamp with time zone default now(),
   unique ( faculty_id, subject_id )
);

-- 5. NOTES TABLE
create table if not exists notes (
   id           uuid primary key default gen_random_uuid(),
   faculty_id   uuid not null references faculty ( id ) on delete cascade,
   subject_id   uuid not null references subjects ( id ) on delete cascade,
   title        text not null,
   type         text not null check ( type in ( 'notes', 'question_paper', 'assignment', 'ebook' ) ),
   unit         integer default 1,
   semester     integer not null,
   file_url     text,
   file_name    text,
   is_verified  boolean default false,
   downloads    integer default 0,
   version      integer default 1,
   created_at   timestamp with time zone default now(),
   updated_at   timestamp with time zone default now()
);

-- 6. RATINGS TABLE
create table if not exists ratings (
   id         uuid primary key default gen_random_uuid(),
   note_id    uuid not null references notes ( id ) on delete cascade,
   student_id uuid not null references users ( id ) on delete cascade,
   rating     integer not null check ( rating >= 1 and rating <= 5 ),
   created_at timestamp with time zone default now(),
   unique ( note_id, student_id )
);

-- 7. STUDENT BOOKMARKS TABLE
create table if not exists student_bookmarks (
   id         uuid primary key default gen_random_uuid(),
   student_id uuid not null references users ( id ) on delete cascade,
   note_id    uuid not null references notes ( id ) on delete cascade,
   saved_at   timestamp with time zone default now(),
   unique ( student_id, note_id )
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Users
create index if not exists idx_users_email on users ( email );
create index if not exists idx_users_role on users ( role );
create index if not exists idx_users_is_approved on users ( is_approved );

-- Faculty
create index if not exists idx_faculty_user_id on faculty ( user_id );
create index if not exists idx_faculty_availability on faculty ( availability );

-- Subjects
create index if not exists idx_subjects_department on subjects ( department );
create index if not exists idx_subjects_semester on subjects ( semester );
create index if not exists idx_subjects_code on subjects ( code );

-- Faculty Subjects
create index if not exists idx_faculty_subjects_faculty_id on faculty_subjects ( faculty_id );
create index if not exists idx_faculty_subjects_subject_id on faculty_subjects ( subject_id );

-- Notes
create index if not exists idx_notes_subject_id on notes ( subject_id );
create index if not exists idx_notes_faculty_id on notes ( faculty_id );
create index if not exists idx_notes_type on notes ( type );
create index if not exists idx_notes_is_verified on notes ( is_verified );

-- Ratings
create index if not exists idx_ratings_note_id on ratings ( note_id );
create index if not exists idx_ratings_student_id on ratings ( student_id );

-- Bookmarks
create index if not exists idx_bookmarks_student_id on student_bookmarks ( student_id );
create index if not exists idx_bookmarks_note_id on student_bookmarks ( note_id );

-- ========================================
-- Enable RLS (Row Level Security) - Optional
-- ========================================

-- 8. NOTE VERSIONS TABLE
create table if not exists note_versions (
   id          uuid primary key default gen_random_uuid(),
   note_id     uuid not null references notes ( id ) on delete cascade,
   version     integer not null,
   file_url    text not null,
   file_name   text,
   file_size   integer,
   created_at  timestamp with time zone default now()
);

-- Note Versions Index
create index if not exists idx_note_versions_note_id on note_versions ( note_id );

-- 9. DSA CONTENT TABLE
create table if not exists dsa_content (
    id uuid primary key default gen_random_uuid(),
    day integer not null,
    programming_language text not null,
    concept text not null,
    explanation text,
    syntax text,
    example text,
    example_code text,
    logic_breakdown jsonb,
    practice_problem text,
    external_links jsonb,
    youtube_url text,
    created_at timestamp with time zone default now(),
    unique(day, programming_language)
);

-- 10. DSA USER PROGRESS TABLE
create table if not exists dsa_user_progress (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references users(id) on delete cascade,
    preferred_language text not null default 'python',
    start_date timestamp with time zone default now(),
    current_day integer not null default 1,
    completed_days jsonb default '[]'::jsonb,
    topic_status jsonb default '{}'::jsonb,
    code_drafts jsonb default '{}'::jsonb,
    streak integer not null default 0,
    total_minutes integer not null default 0,
    last_activity_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create index if not exists idx_dsa_day_lang on dsa_content(day, programming_language);
create index if not exists idx_dsa_progress_user on dsa_user_progress(user_id);

-- Uncomment to enable RLS for security

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE faculty ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE student_bookmarks ENABLE ROW LEVEL SECURITY;
