-- ============================================================================
-- ClaimGuard — 0002_mvp.sql  (AI-free MVP)
-- Run in Supabase SQL editor AFTER 0001_init.sql.
-- Extends evidence (3 input types), replaces event_type, adds claim_type.
-- ============================================================================

begin;

-- ---------- 1. EVIDENCE → pasted email / note / file --------------------
alter table evidence alter column file_path drop not null;        -- notes have no file
alter table evidence add column if not exists title      text;
alter table evidence add column if not exists content    text;    -- pasted email / note body
alter table evidence add column if not exists event_date date;    -- when it happened (≠ created_at)

do $$ begin
  create type evidence_source as enum ('pasted_email','note','file');
exception when duplicate_object then null; end $$;

alter table evidence add column if not exists source_type evidence_source not null default 'note';

-- ---------- 2. EVENT CATEGORIES → replace event_type --------------------
-- USING clause maps any old test values forward, so this is safe with or
-- without existing rows.
alter table events alter column "type" drop default;
alter table events alter column "type" type text using "type"::text;
drop type event_type;
create type event_type as enum
  ('variation','delay','payment','instruction','site_issue','other');
alter table events alter column "type" type event_type using (
  case "type"
    when 'late_drawings'           then 'delay'
    when 'delayed_instruction'     then 'instruction'
    when 'site_access_restriction' then 'site_issue'
    else "type"
  end
)::event_type;
alter table events alter column "type" set default 'other';

-- ---------- 3. CLAIM TYPES → new enum + column --------------------------
do $$ begin
  create type claim_type as enum
    ('variation_change','delay_eot','payment_dispute','disruption','acceleration','backcharge');
exception when duplicate_object then null; end $$;

alter table claims add column if not exists "type" claim_type;

commit;

-- ---------- 4. STORAGE (for file-upload inbox items) -------------------
-- Create a PRIVATE bucket named "evidence" first:
--   Dashboard → Storage → New bucket → name = evidence, Public = OFF
-- Then these policies let signed-in org members read/write its objects.
drop policy if exists "evidence read"  on storage.objects;
drop policy if exists "evidence write" on storage.objects;
create policy "evidence read"  on storage.objects for select
  using      (bucket_id = 'evidence' and auth.role() = 'authenticated');
create policy "evidence write" on storage.objects for insert
  with check (bucket_id = 'evidence' and auth.role() = 'authenticated');