-- Run once in the Supabase SQL editor before deploying the faculty profile feature.
alter table faculty add column if not exists photo_url text;
alter table faculty add column if not exists qualifications text;
alter table faculty add column if not exists free_hours jsonb not null default '[]'::jsonb;
alter table faculty add column if not exists timetable_updated_at timestamp with time zone;

comment on column faculty.free_hours is
    'Structured weekly availability extracted from the faculty timetable.';
