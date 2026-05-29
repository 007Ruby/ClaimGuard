-- ========== EXTENSIONS ==========
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ========== ENUMS ==========
create type org_member_role     as enum ('owner','admin','member');
create type event_type          as enum ('late_drawings','variation','site_access_restriction','delayed_instruction','other');
create type event_status        as enum ('identified','in_review','notice_due','notice_issued','claimed','closed','dismissed');
create type evidence_type       as enum ('email','photo','pdf','drawing','site_report','other');
create type evidence_status     as enum ('inbox','linked','ignored');
create type deadline_type       as enum ('notice','claim_submission','follow_up');
create type deadline_status     as enum ('upcoming','met','missed','dismissed');
create type claim_status        as enum ('draft','ready','submitted','resolved','rejected');
create type ai_suggestion_type  as enum ('classify_document','suggest_event','link_event','missing_evidence','generate_notice','generate_claim');
create type ai_suggestion_status as enum ('pending','accepted','dismissed');

-- ========== IDENTITY / TENANCY ==========
-- Mirrors auth.users; populated by a trigger on signup.
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        org_member_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on organization_members (user_id);

-- ========== PROJECT (one per org for MVP) ==========
create table projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  description text,
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on projects (org_id);

-- ========== CONTRACTS ==========
create table contracts (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references organizations(id) on delete cascade,
  project_id                uuid not null references projects(id) on delete cascade,
  name                      text not null,
  counterparty              text,
  contract_type             text,            -- e.g. 'JCT', 'NEC4', 'bespoke'
  start_date                date,
  end_date                  date,
  default_notice_period_days int,            -- drives suggested notice deadlines
  terms                     jsonb,           -- flexible clause store for later
  file_path                 text,            -- uploaded contract in Supabase Storage
  created_by                uuid not null references users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index on contracts (project_id);

-- ========== EVENTS (core entity) ==========
create table events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  type        event_type not null default 'other',
  status      event_status not null default 'identified',
  description text,
  occurred_on date,
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on events (project_id, status);

-- ========== EVIDENCE (also powers the Inbox) ==========
create table evidence (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  project_id         uuid not null references projects(id) on delete cascade,
  event_id           uuid references events(id) on delete set null,  -- null while in inbox
  type               evidence_type not null default 'other',
  status             evidence_status not null default 'inbox',
  file_path          text not null,
  original_filename  text,
  mime_type          text,
  ai_classification  jsonb,         -- raw structured AI output
  relevance          text,          -- AI summary
  strength           text,          -- 'weak' | 'moderate' | 'strong'
  uploaded_by        uuid not null references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on evidence (project_id, status);
create index on evidence (event_id);

-- ========== DEADLINES ==========
create table deadlines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  event_id    uuid references events(id) on delete cascade,
  claim_id    uuid,  -- FK added after claims table below
  contract_id uuid references contracts(id) on delete set null,
  type        deadline_type not null,
  title       text not null,
  due_at      timestamptz not null,
  status      deadline_status not null default 'upcoming',
  source      text not null default 'manual',  -- 'manual' | 'contract'
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on deadlines (project_id, status, due_at);

-- ========== CLAIMS ==========
create table claims (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  title         text not null,
  status        claim_status not null default 'draft',
  body          text,             -- drafted claim narrative
  ai_generated  boolean not null default false,
  amount        numeric(14,2),
  currency      text default 'AUD',
  submitted_at  timestamptz,
  resolved_at   timestamptz,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on claims (project_id, status);

alter table deadlines
  add constraint deadlines_claim_id_fkey
  foreign key (claim_id) references claims(id) on delete cascade;

create table claim_events (
  id        uuid primary key default gen_random_uuid(),
  claim_id  uuid not null references claims(id) on delete cascade,
  event_id  uuid not null references events(id) on delete cascade,
  unique (claim_id, event_id)
);

-- ========== AI SUGGESTIONS (never auto-applied) ==========
create table ai_suggestions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  type         ai_suggestion_type not null,
  status       ai_suggestion_status not null default 'pending',
  payload      jsonb not null,          -- the structured JSON from OpenAI
  confidence   text,                    -- 'low' | 'medium' | 'high'
  evidence_id  uuid references evidence(id) on delete cascade,
  event_id     uuid references events(id) on delete cascade,
  claim_id     uuid references claims(id) on delete cascade,
  resolved_by  uuid references users(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on ai_suggestions (project_id, status);
create index on ai_suggestions (evidence_id);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
-- e.g. create trigger trg_events_updated before update on events
--      for each row execute function set_updated_at();  (repeated per table)

create or replace function is_org_member(target uuid) returns boolean as $$
  select exists (
    select 1 from organization_members m
    where m.org_id = target and m.user_id = auth.uid()
  );
$$ language sql security definer stable;

-- applied to projects, contracts, events, evidence, deadlines, claims, ai_suggestions:
alter table events enable row level security;
create policy "org members read"   on events for select using (is_org_member(org_id));
create policy "org members write"  on events for all    using (is_org_member(org_id)) with check (is_org_member(org_id));
-- claim_events is gated via its parent claim's org_id in policy subqueries.