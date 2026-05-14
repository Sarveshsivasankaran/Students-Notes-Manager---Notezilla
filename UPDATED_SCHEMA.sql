-- ========================================
-- Notezilla Comprehensive Database Schema
-- Includes Base Tables + Productivity & AI Features
-- ========================================

-- 1. USERS TABLE
create table if not exists users (
   id          uuid primary key default gen_random_uuid(),
   name        text not null,
   email       text not null unique,
   password    text not null,
   role        text not null check ( role in ( 'student', 'staff', 'admin' ) ) default 'student',
   department  text,
   semester    integer,
   is_approved boolean default true,
   preferred_dsa_language text, -- New column for DSA module
   created_at  timestamp with time zone default now(),
   updated_at  timestamp with time zone default now()
);

-- 2. FACULTY TABLE
create table if not exists faculty (
   id              uuid primary key default gen_random_uuid(),
   user_id         uuid not null unique references users ( id ) on delete cascade,
   bio             text,
   office_hours    text,
   availability    text default 'available' check ( availability in ( 'available', 'on_leave', 'unavailable' ) ),
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
   department  text not null check ( department in ( 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'BioMed' ) ),
   semester    integer not null,
   credits     integer,
   syllabus    text,
   description text,
   created_at  timestamp with time zone default now(),
   updated_at  timestamp with time zone default now()
);

-- 4. FACULTY_SUBJECTS
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
   -- AI Analysis Columns
   ai_summary   text,
   key_concepts jsonb,
   context_explanation text,
   created_at   timestamp with time zone default now(),
   updated_at   timestamp with time zone default now()
);

-- 6. STARS TABLE (New feature)
create table if not exists stars (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    entity_type text not null check (entity_type in ('subject', 'faculty', 'note')),
    entity_id uuid not null,
    created_at timestamp with time zone default now(),
    unique(user_id, entity_type, entity_id)
);

-- 7. PLANNER TASKS TABLE (New feature)
create table if not exists planner_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    title text not null,
    description text,
    task_time text,
    is_completed boolean default false,
    created_at timestamp with time zone default now()
);

-- 8. TODO TASKS TABLE (New feature)
create table if not exists todo_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    text text not null,
    is_completed boolean default false,
    created_at timestamp with time zone default now()
);

-- 9. PROGRESS STATS TABLE (New feature)
create table if not exists progress_stats (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references users(id) on delete cascade,
    total_tasks_done integer default 0,
    planner_sessions integer default 0,
    productivity_score decimal(5,2) default 0,
    updated_at timestamp with time zone default now()
);

-- 10. ANNOUNCEMENTS TABLE (New feature)
create table if not exists announcements (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid references users(id) on delete set null,
    title text not null,
    content text not null,
    type text default 'manual' check (type in ('manual', 'auto')),
    target_dept text,
    target_sem integer,
    created_at timestamp with time zone default now()
);

-- 11. ACTIVITY LOGS TABLE (New feature)
create table if not exists activity_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    action_type text not null, 
    title text not null,
    description text,
    created_at timestamp with time zone default now()
);

-- 12. DSA CONTENT TABLE (New feature)
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

-- 13. DSA USER PROGRESS TABLE (Realtime learning tracking)
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

-- ========================================
-- INDEXES
-- ========================================
create index if not exists idx_users_email on users ( email );
create index if not exists idx_notes_subject_id on notes ( subject_id );
create index if not exists idx_stars_entity on stars(entity_type, entity_id);
create index if not exists idx_planner_user on planner_tasks(user_id);
create index if not exists idx_todo_user on todo_tasks(user_id);
create index if not exists idx_announcements_target on announcements(target_dept, target_sem);
create index if not exists idx_activity_user on activity_logs(user_id);
create index if not exists idx_dsa_day_lang on dsa_content(day, programming_language);
create index if not exists idx_dsa_progress_user on dsa_user_progress(user_id);

-- ========================================
-- STORED PROCEDURES (RPCs)
-- ========================================

-- Function to get top starred items
create or replace function get_top_starred()
returns table (
    id uuid,
    title text,
    star_count bigint,
    entity_type text,
    file_url text,
    subject_name text
) language plpgsql as $$
begin
    return query
    select 
        n.id,
        n.title,
        count(s.id) as star_count,
        s.entity_type,
        n.file_url,
        sub.name as subject_name
    from stars s
    join notes n on s.entity_id = n.id
    join subjects sub on n.subject_id = sub.id
    where s.entity_type = 'note'
    group by n.id, s.entity_type, sub.name
    order by star_count desc
    limit 10;
end;
$$;

-- ========================================
-- SECURITY SETTINGS
-- ========================================

-- Since the backend uses its own JWT system and the anon key, 
-- we disable RLS to allow the server to manage data.
alter table users disable row level security;
alter table faculty disable row level security;
alter table subjects disable row level security;
alter table faculty_subjects disable row level security;
alter table notes disable row level security;
alter table stars disable row level security;
alter table planner_tasks disable row level security;
alter table todo_tasks disable row level security;
alter table progress_stats disable row level security;
alter table announcements disable row level security;
alter table activity_logs disable row level security;
alter table dsa_content disable row level security;
alter table dsa_user_progress disable row level security;
