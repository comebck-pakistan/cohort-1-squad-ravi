-- AI Matching Bot deployment schema / migration.
-- Safe to run more than once in Supabase SQL Editor.

create table if not exists conversations (
  id bigint generated always as identity primary key,
  phone text not null,
  step text,
  role text,
  temp_data jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (phone)
);

create table if not exists freelancers (
  id bigint generated always as identity primary key,
  phone text not null,
  name text,
  profile_link text,
  linkedin_url text,
  github_url text,
  cv_url text,
  support_docs text,
  portfolio text,
  skills text,
  tools text,
  rate text,
  availability text,
  preferences text,
  working_currently boolean,
  contact_sharing_allowed boolean,
  brief_description text,
  trust_score int,
  trust_tier text,
  trust_breakdown jsonb,
  vetted_at timestamptz,
  created_at timestamp default now(),
  updated_at timestamptz default now(),
  unique (phone)
);

create table if not exists job_requests (
  id bigint generated always as identity primary key,
  phone text not null,
  name text,
  project_description text,
  hire_type text,
  budget_project text,
  budget_hourly text,
  project_count text,
  deadline text,
  deadline_normalized text,
  is_recurring boolean,
  hiring_currently boolean,
  contact_sharing_allowed boolean,
  brief_description text,
  created_at timestamp default now(),
  unique (phone)
);

create table if not exists matches (
  id bigint generated always as identity primary key,
  freelancer_phone text not null references freelancers(phone) on delete cascade,
  client_phone text not null references job_requests(phone) on delete cascade,
  compatibility_score int,
  trust_score int,
  total_score int,
  skills_overlap text[] default '{}',
  budget_fit boolean,
  availability_fit boolean,
  ai_explanation text,
  potential_risks text,
  recommended_action text,
  created_at timestamptz default now(),
  unique (freelancer_phone, client_phone)
);

create table if not exists notifications (
  id bigint generated always as identity primary key,
  phone text not null,
  type text,
  title text,
  body text,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists insights (
  id bigint generated always as identity primary key,
  phone text not null,
  insight_type text,
  content text,
  metric_value numeric,
  metric_label text,
  icon text,
  color text,
  generated_at timestamptz default now()
);

create table if not exists vetting_checks (
  id bigint generated always as identity primary key,
  phone text not null,
  artifact text not null,
  check_type text not null,
  status text not null,
  evidence jsonb,
  checked_at timestamptz default now()
);

create table if not exists contact_requests (
  id bigint generated always as identity primary key,
  match_id bigint not null references matches(id) on delete cascade,
  requester_phone text not null,
  requester_role text not null,
  target_phone text not null,
  target_role text not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  responded_at timestamptz
);

alter table freelancers add column if not exists profile_link text;
alter table freelancers add column if not exists linkedin_url text;
alter table freelancers add column if not exists github_url text;
alter table freelancers add column if not exists cv_url text;
alter table freelancers add column if not exists support_docs text;
alter table freelancers add column if not exists portfolio text;
alter table freelancers add column if not exists skills text;
alter table freelancers add column if not exists tools text;
alter table freelancers add column if not exists rate text;
alter table freelancers add column if not exists availability text;
alter table freelancers add column if not exists preferences text;
alter table freelancers add column if not exists working_currently boolean;
alter table freelancers add column if not exists contact_sharing_allowed boolean;
alter table freelancers add column if not exists brief_description text;
alter table freelancers add column if not exists trust_score int;
alter table freelancers add column if not exists trust_tier text;
alter table freelancers add column if not exists trust_breakdown jsonb;
alter table freelancers add column if not exists vetted_at timestamptz;
alter table freelancers add column if not exists updated_at timestamptz default now();

alter table job_requests add column if not exists phone text;
alter table job_requests add column if not exists name text;
alter table job_requests add column if not exists project_description text;
alter table job_requests add column if not exists hire_type text;
alter table job_requests add column if not exists budget_project text;
alter table job_requests add column if not exists budget_hourly text;
alter table job_requests add column if not exists project_count text;
alter table job_requests add column if not exists deadline text;
alter table job_requests add column if not exists deadline_normalized text;
alter table job_requests add column if not exists is_recurring boolean;
alter table job_requests add column if not exists hiring_currently boolean;
alter table job_requests add column if not exists contact_sharing_allowed boolean;
alter table job_requests add column if not exists brief_description text;

alter table matches add column if not exists trust_score int;
alter table matches add column if not exists total_score int;
