-- ============================================================================
-- ClaimGuard — initial schema (0001_init.sql)
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Executes top to bottom: extensions -> enums -> tables -> triggers -> RLS.
-- ============================================================================

-- ========== EXTENSIONS ==========
create extension if not exists "pgcrypto";   -- provides gen_random_uuid()

-- ========== ENUMS ==========
create type org_member_role      as enum ('owner','admin','member');
create type event_type           as enum ('late_drawings','variation','site_access_restriction','delayed_instruction','other');
create type event_status         as enum ('identified','in_review','notice_due','notice_issued','claimed','closed','dismissed');
create type evidence_type        as enum ('email','photo','pdf','drawing','site_report','other');
create type evidence_status      as enum ('inbox','linked','ignored');
create type deadline_type        as enum ('notice','claim_submission','follow_up');
create type deadline_status      as enum ('upcoming','met','missed','dismissed');
create type claim_status         as enum ('draft','ready','submitted','resolved','rejected');
create type ai_suggestion_type   as enum ('classify_document','suggest_event','link_event','missing_evidence','generate_notice','generate_claim');
create type ai_suggestion_status as enum ('pending','accepted','dismissed');

-- ========== IDENTITY / TENANCY ==========
-- Mirrors auth.users; a trigger (below) inserts a row here on signup.
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
create index idx_org_members_user on organization_members (user_id);
create index idx_org_members_org  on organization_members (org_id);

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
create index idx_projects_org on projects (org_id);

-- ========== CONTRACTS ==========
create table contracts (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references organizations(id) on delete cascade,
  project_id                 uuid not null references projects(id) on delete cascade,
  name                       text not null,
  counterparty               text,
  contract_type              text,            -- e.g. 'JCT', 'NEC4', 'bespoke'
  start_date                 date,
  end_date                   date,
  default_notice_period_days int,             -- drives suggested notice deadlines
  terms                      jsonb,           -- flexible clause store for later
  file_path                  text,            -- uploaded contract in Supabase Storage
  created_by                 uuid not null references users(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index idx_contracts_project on contracts (project_id);

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
create index idx_events_project_status on events (project_id, status);

-- ========== EVIDENCE (also powers the Inbox via status='inbox') ==========
create table evidence (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  project_id        uuid not null references projects(id) on delete cascade,
  event_id          uuid references events(id) on delete set null,  -- null while in inbox
  type              evidence_type not null default 'other',
  status            evidence_status not null default 'inbox',
  file_path         text not null,
  original_filename text,
  mime_type         text,
  ai_classification jsonb,          -- raw structured AI output
  relevance         text,           -- AI summary of relevance
  strength          text,           -- 'weak' | 'moderate' | 'strong'
  uploaded_by       uuid not null references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_evidence_project_status on evidence (project_id, status);
create index idx_evidence_event          on evidence (event_id);

-- ========== CLAIMS ==========
-- Defined before deadlines so deadlines.claim_id can reference it directly.
create table claims (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  title         text not null,
  status        claim_status not null default 'draft',
  body          text,                       -- drafted claim narrative
  ai_generated  boolean not null default false,
  amount        numeric(14,2),
  currency      text default 'AUD',
  submitted_at  timestamptz,
  resolved_at   timestamptz,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_claims_project_status on claims (project_id, status);

create table claim_events (
  id        uuid primary key default gen_random_uuid(),
  claim_id  uuid not null references claims(id) on delete cascade,
  event_id  uuid not null references events(id) on delete cascade,
  unique (claim_id, event_id)
);
create index idx_claim_events_claim on claim_events (claim_id);
create index idx_claim_events_event on claim_events (event_id);

-- ========== DEADLINES ==========
create table deadlines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  event_id    uuid references events(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
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
create index idx_deadlines_project_status_due on deadlines (project_id, status, due_at);

-- ========== AI SUGGESTIONS (persisted; never auto-applied) ==========
create table ai_suggestions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  type        ai_suggestion_type not null,
  status      ai_suggestion_status not null default 'pending',
  payload     jsonb not null,             -- the structured JSON from OpenAI
  confidence  text,                       -- 'low' | 'medium' | 'high'
  evidence_id uuid references evidence(id) on delete cascade,
  event_id    uuid references events(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_ai_suggestions_project_status on ai_suggestions (project_id, status);
create index idx_ai_suggestions_evidence        on ai_suggestions (evidence_id);

-- ============================================================================
-- updated_at TRIGGER
-- Bumps updated_at to now() on every UPDATE. One function, applied per table.
-- ============================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated         before update on users         for each row execute function set_updated_at();
create trigger trg_organizations_updated before update on organizations for each row execute function set_updated_at();
create trigger trg_projects_updated      before update on projects      for each row execute function set_updated_at();
create trigger trg_contracts_updated     before update on contracts     for each row execute function set_updated_at();
create trigger trg_events_updated        before update on events        for each row execute function set_updated_at();
create trigger trg_evidence_updated      before update on evidence      for each row execute function set_updated_at();
create trigger trg_claims_updated        before update on claims        for each row execute function set_updated_at();
create trigger trg_deadlines_updated     before update on deadlines     for each row execute function set_updated_at();
create trigger trg_ai_suggestions_updated before update on ai_suggestions for each row execute function set_updated_at();

-- ============================================================================
-- AUTO-CREATE users ROW ON SIGNUP
-- When Supabase Auth creates an auth.users row, mirror it into public.users.
-- ============================================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- is_org_member() checks the caller (auth.uid()) belongs to a given org.
-- Every org-scoped table: read + write gated by membership in that row's org.
-- ============================================================================
create or replace function is_org_member(target uuid)
returns boolean as $$
  select exists (
    select 1
    from organization_members m
    where m.org_id = target
      and m.user_id = auth.uid()
  );
$$ language sql security definer stable;

-- users: a person can see/update only their own row.
alter table users enable row level security;
create policy "own row read"   on users for select using (id = auth.uid());
create policy "own row update" on users for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members can read; the policy for creating the first org is
-- handled in app code via the service role on signup.
alter table organizations enable row level security;
create policy "org read"  on organizations for select using (is_org_member(id));
create policy "org write" on organizations for all    using (is_org_member(id)) with check (is_org_member(id));

-- organization_members: members of an org can see the membership list.
alter table organization_members enable row level security;
create policy "members read"  on organization_members for select using (is_org_member(org_id));
create policy "members write" on organization_members for all    using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Standard org-scoped tables: same membership check on the row's org_id.
alter table projects       enable row level security;
create policy "org members all" on projects for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table contracts      enable row level security;
create policy "org members all" on contracts for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table events         enable row level security;
create policy "org members all" on events for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table evidence       enable row level security;
create policy "org members all" on evidence for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table deadlines      enable row level security;
create policy "org members all" on deadlines for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table claims         enable row level security;
create policy "org members all" on claims for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table ai_suggestions enable row level security;
create policy "org members all" on ai_suggestions for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- claim_events has no org_id of its own; gate it through the parent claim's org.
alter table claim_events enable row level security;
create policy "via parent claim" on claim_events for all
  using (exists (select 1 from claims c where c.id = claim_id and is_org_member(c.org_id)))
  with check (exists (select 1 from claims c where c.id = claim_id and is_org_member(c.org_id)));