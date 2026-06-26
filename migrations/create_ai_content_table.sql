-- Generic store for pre-generated AI content (DB-first, optional live regenerate).
-- First consumer: game debriefs (entity_type='game_debrief', entity_id=games.id).
-- Designed to be reused for player insights etc. later (set a different entity_type
-- and, for parameterised views, a non-default view_key).
--
-- Applied to Supabase project pxefkxtshmuhsuixzgrz on 2026-06-25.

create table if not exists public.ai_content (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,                       -- e.g. 'game_debrief'
  entity_id uuid not null,                         -- e.g. games.id
  view_key text not null default 'default',        -- for parameterised views (filters)
  content text not null,
  model text,
  prompt_version int not null default 1,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, view_key)        -- enables upsert on regenerate
);

alter table public.ai_content enable row level security;

-- Table-level GRANTs are required in addition to RLS policies — a table created
-- via raw DDL does NOT auto-grant to the PostgREST roles, so without this the
-- anon role gets "permission denied" even though the policies allow it.
grant select, insert, update, delete on public.ai_content to anon, authenticated;

-- Permissive anon policies — matches the single-user pilot posture of the other tables.
create policy "ai_content anon select" on public.ai_content
  for select to anon, authenticated using (true);
create policy "ai_content anon insert" on public.ai_content
  for insert to anon, authenticated with check (true);
create policy "ai_content anon update" on public.ai_content
  for update to anon, authenticated using (true) with check (true);
create policy "ai_content anon delete" on public.ai_content
  for delete to anon, authenticated using (true);

create index if not exists idx_ai_content_lookup
  on public.ai_content (entity_type, entity_id, view_key);
