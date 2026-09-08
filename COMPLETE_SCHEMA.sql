-- ═══════════════════════════════════════════════════════════
-- Notezilla Complete Database Architecture Schema (v2.0)
-- ═══════════════════════════════════════════════════════════

-- 1. USERS TABLE (Students, Staff, Admin)
create table if not exists users (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    email       text not null unique,
    password    text not null,
    role        text not null check ( role in ( 'student', 'staff', 'admin' ) ) default 'student',
    department  text,
    semester    integer,
    avatar_url  text,
    is_approved boolean default true,
    preferred_dsa_language text default 'python',
    created_at  timestamp with time zone default now(),
    updated_at  timestamp with time zone default now()
);

-- 2. FACULTY TABLE
create table if not exists faculty (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null unique references users ( id ) on delete cascade,
    bio             text,
    photo_url       text,
    qualifications  text,
    office_hours    text,
    free_hours      jsonb not null default '[]'::jsonb,
    timetable_updated_at timestamp with time zone,
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
    department  text not null,
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

-- 5. NOTES TABLE (with AI analysis columns)
create table if not exists notes (
    id           uuid primary key default gen_random_uuid(),
    faculty_id   uuid not null references faculty ( id ) on delete cascade,
    subject_id   uuid not null references subjects ( id ) on delete cascade,
    title        text not null,
    type         text not null check ( type in ( 'notes', 'question_paper', 'assignment', 'ebook', 'syllabus', 'other' ) ),
    unit         integer default 1,
    semester     integer not null,
    file_url     text,
    file_name    text,
    file_size    bigint,
    is_verified  boolean default false,
    downloads    integer default 0,
    version      integer default 1,
    ai_summary   text,
    key_concepts jsonb,
    context_explanation text,
    created_at   timestamp with time zone default now(),
    updated_at   timestamp with time zone default now()
);

-- 6. RATINGS TABLE
create table if not exists ratings (
    id         uuid primary key default gen_random_uuid(),
    note_id    uuid not null references notes ( id ) on delete cascade,
    student_id uuid not null references users ( id ) on delete cascade,
    rating     integer not null check ( rating >= 1 and rating <= 5 ),
    review     text,
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

-- 8. NOTE VERSIONS TABLE
create table if not exists note_versions (
    id          uuid primary key default gen_random_uuid(),
    note_id     uuid not null references notes ( id ) on delete cascade,
    version     integer not null,
    file_url    text not null,
    file_name   text,
    file_size   bigint,
    created_at  timestamp with time zone default now()
);

-- 9. STARS TABLE
create table if not exists stars (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    entity_type text not null check (entity_type in ('subject', 'faculty', 'note')),
    entity_id uuid not null,
    created_at timestamp with time zone default now(),
    unique(user_id, entity_type, entity_id)
);

-- 10. PLANNER TASKS TABLE
create table if not exists planner_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    title text not null,
    description text,
    task_time text,
    is_completed boolean default false,
    created_at timestamp with time zone default now()
);

-- 11. TODO TASKS TABLE
create table if not exists todo_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    text text not null,
    is_completed boolean default false,
    created_at timestamp with time zone default now()
);

-- 12. PROGRESS STATS TABLE
create table if not exists progress_stats (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references users(id) on delete cascade,
    total_tasks_done integer default 0,
    planner_sessions integer default 0,
    productivity_score decimal(5,2) default 0,
    updated_at timestamp with time zone default now()
);

-- 13. ANNOUNCEMENTS TABLE
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

-- 14. ACTIVITY LOGS TABLE
create table if not exists activity_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    action_type text not null,
    title text not null,
    description text,
    created_at timestamp with time zone default now()
);

-- 15. DSA CONTENT TABLE
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

-- 16. DSA USER PROGRESS TABLE
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

-- ═══════════════════════════════════════════════════════════
-- NOTEZILLA 2.0 / 3.0 UPGRADED ARCHITECTURE TABLES
-- ═══════════════════════════════════════════════════════════

-- 17. AI Learning Analytics: Topic Mastery
create table if not exists student_topic_mastery (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references users(id) on delete cascade,
    subject_id uuid references subjects(id) on delete cascade,
    topic_name text not null,
    mastery_level integer not null default 0 check (mastery_level >= 0 and mastery_level <= 100),
    status text not null default 'learning' check (status in ('learning', 'review_needed', 'mastered')),
    review_count integer default 0,
    last_tested_at timestamp with time zone default now(),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (student_id, subject_id, topic_name)
);

-- 18. AI Learning Analytics: Student Learning Profiles
create table if not exists student_learning_profiles (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null unique references users(id) on delete cascade,
    target_cgpa decimal(3,2) default 8.50,
    study_pace text default 'balanced' check (study_pace in ('relaxed', 'balanced', 'intensive')),
    strengths jsonb default '[]'::jsonb,
    weak_topics jsonb default '[]'::jsonb,
    weekly_study_hours integer default 10,
    learning_style text default 'visual',
    updated_at timestamp with time zone default now()
);

-- 19. AI Adaptive Quizzes: Quizzes
create table if not exists quizzes (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid references subjects(id) on delete cascade,
    note_id uuid references notes(id) on delete set null,
    title text not null,
    description text,
    topic text,
    difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'adaptive')),
    total_questions integer default 5,
    time_limit_mins integer default 10,
    created_by uuid references users(id) on delete set null,
    created_at timestamp with time zone default now()
);

-- 20. AI Adaptive Quizzes: Questions
create table if not exists quiz_questions (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references quizzes(id) on delete cascade,
    question_text text not null,
    options jsonb not null default '[]'::jsonb,
    correct_index integer not null default 0,
    explanation text,
    difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
    created_at timestamp with time zone default now()
);

-- 21. AI Adaptive Quizzes: Attempts
create table if not exists quiz_attempts (
    id uuid primary key default gen_random_uuid(),
    quiz_id uuid not null references quizzes(id) on delete cascade,
    student_id uuid not null references users(id) on delete cascade,
    score integer not null default 0,
    total_questions integer not null default 0,
    percentage decimal(5,2) default 0,
    answers jsonb default '[]'::jsonb,
    time_taken_seconds integer default 0,
    completed_at timestamp with time zone default now()
);

-- 22. Spaced Repetition Flashcards: Decks
create table if not exists flashcard_decks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    subject_id uuid references subjects(id) on delete set null,
    note_id uuid references notes(id) on delete set null,
    title text not null,
    description text,
    is_public boolean default false,
    total_cards integer default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 23. Spaced Repetition Flashcards: Cards
create table if not exists flashcards (
    id uuid primary key default gen_random_uuid(),
    deck_id uuid not null references flashcard_decks(id) on delete cascade,
    front_text text not null,
    back_text text not null,
    hint text,
    mastery_level integer default 0 check (mastery_level >= 0 and mastery_level <= 5),
    interval_days integer default 1,
    ease_factor decimal(4,2) default 2.50,
    next_review_at timestamp with time zone default now(),
    review_count integer default 0,
    created_at timestamp with time zone default now()
);

-- 24. Faculty Office Hours & Appointment Booking
create table if not exists faculty_appointments (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references faculty(id) on delete cascade,
    student_id uuid not null references users(id) on delete cascade,
    subject_id uuid references subjects(id) on delete set null,
    appointment_date date not null,
    start_time text not null,
    end_time text not null,
    status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
    meeting_type text default 'in_person' check (meeting_type in ('in_person', 'online')),
    meeting_link text,
    student_notes text,
    faculty_notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 25. Gamification: Badges
create table if not exists badges (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    description text not null,
    icon text not null,
    category text not null default 'learning' check (category in ('learning', 'dsa', 'productivity', 'community')),
    xp_reward integer default 50,
    criteria jsonb default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- 26. Gamification: User Badges
create table if not exists user_badges (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    badge_id uuid not null references badges(id) on delete cascade,
    awarded_at timestamp with time zone default now(),
    metadata jsonb default '{}'::jsonb,
    unique (user_id, badge_id)
);

-- ═══════════════════════════════════════════════════════════
-- NON-DESTRUCTIVE COLUMN MIGRATIONS
-- ═══════════════════════════════════════════════════════════
alter table users add column if not exists avatar_url text;
alter table users add column if not exists preferred_dsa_language text default 'python';
alter table notes add column if not exists file_size bigint;
alter table notes add column if not exists ai_summary text;
alter table notes add column if not exists key_concepts jsonb;
alter table notes add column if not exists context_explanation text;
alter table ratings add column if not exists review text;
alter table subjects drop constraint if exists subjects_department_check;

-- ═══════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════
create index if not exists idx_users_email on users ( email );
create index if not exists idx_users_role on users ( role );
create index if not exists idx_users_is_approved on users ( is_approved );
create index if not exists idx_faculty_user_id on faculty ( user_id );
create index if not exists idx_faculty_availability on faculty ( availability );
create index if not exists idx_subjects_department on subjects ( department );
create index if not exists idx_subjects_semester on subjects ( semester );
create index if not exists idx_subjects_code on subjects ( code );
create index if not exists idx_faculty_subjects_faculty_id on faculty_subjects ( faculty_id );
create index if not exists idx_faculty_subjects_subject_id on faculty_subjects ( subject_id );
create index if not exists idx_notes_subject_id on notes ( subject_id );
create index if not exists idx_notes_faculty_id on notes ( faculty_id );
create index if not exists idx_notes_type on notes ( type );
create index if not exists idx_notes_is_verified on notes ( is_verified );
create index if not exists idx_ratings_note_id on ratings ( note_id );
create index if not exists idx_ratings_student_id on ratings ( student_id );
create index if not exists idx_bookmarks_student_id on student_bookmarks ( student_id );
create index if not exists idx_bookmarks_note_id on student_bookmarks ( note_id );
create index if not exists idx_note_versions_note_id on note_versions ( note_id );
create index if not exists idx_stars_entity on stars(entity_type, entity_id);
create index if not exists idx_planner_user on planner_tasks(user_id);
create index if not exists idx_todo_user on todo_tasks(user_id);
create index if not exists idx_announcements_target on announcements(target_dept, target_sem);
create index if not exists idx_activity_user on activity_logs(user_id);
create index if not exists idx_dsa_day_lang on dsa_content(day, programming_language);
create index if not exists idx_dsa_progress_user on dsa_user_progress(user_id);
create index if not exists idx_mastery_student on student_topic_mastery(student_id);
create index if not exists idx_mastery_subject on student_topic_mastery(subject_id);
create index if not exists idx_quiz_subject on quizzes(subject_id);
create index if not exists idx_quiz_questions_quiz on quiz_questions(quiz_id);
create index if not exists idx_quiz_attempts_student on quiz_attempts(student_id);
create index if not exists idx_flashcards_deck on flashcards(deck_id);
create index if not exists idx_appointments_faculty on faculty_appointments(faculty_id);
create index if not exists idx_appointments_student on faculty_appointments(student_id);

-- ═══════════════════════════════════════════════════════════
-- STORED PROCEDURES (RPCs)
-- ═══════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════
-- DISABLE ROW LEVEL SECURITY (for custom JWT application backend)
-- ═══════════════════════════════════════════════════════════
alter table if exists users disable row level security;
alter table if exists faculty disable row level security;
alter table if exists subjects disable row level security;
alter table if exists faculty_subjects disable row level security;
alter table if exists notes disable row level security;
alter table if exists ratings disable row level security;
alter table if exists student_bookmarks disable row level security;
alter table if exists note_versions disable row level security;
alter table if exists stars disable row level security;
alter table if exists planner_tasks disable row level security;
alter table if exists todo_tasks disable row level security;
alter table if exists progress_stats disable row level security;
alter table if exists announcements disable row level security;
alter table if exists activity_logs disable row level security;
alter table if exists dsa_content disable row level security;
alter table if exists dsa_user_progress disable row level security;
alter table if exists student_topic_mastery disable row level security;
alter table if exists student_learning_profiles disable row level security;
alter table if exists quizzes disable row level security;
alter table if exists quiz_questions disable row level security;
alter table if exists quiz_attempts disable row level security;
alter table if exists flashcard_decks disable row level security;
alter table if exists flashcards disable row level security;
alter table if exists faculty_appointments disable row level security;
alter table if exists badges disable row level security;
alter table if exists user_badges disable row level security;
