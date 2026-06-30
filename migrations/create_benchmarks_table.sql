-- Benchmarks: per-bracket league/division reference values for each driver-tree metric.
-- Lets the driver tree report a "level vs field" reading alongside the existing
-- "margin vs schedule" delta, so a soft schedule no longer reads as genuine quality.
--
-- One row per (age_group, gender, division, metric). `mean`/`stdev` are the field
-- reference; `source` records provenance. Until a row is genuinely measured from
-- league-wide data, source stays 'reference_estimate' and the UI tags the reading
-- as provisional. Coaches can overwrite mean/stdev and set source='measured'.

create table if not exists public.benchmarks (
  id          uuid primary key default gen_random_uuid(),
  age_group   text not null,
  gender      text not null,
  division    text not null,
  league      text,
  metric      text not null,
  mean        numeric not null,
  stdev       numeric,
  source      text not null default 'reference_estimate',
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (age_group, gender, division, metric)
);

alter table public.benchmarks enable row level security;

drop policy if exists "Allow anon read"   on public.benchmarks;
drop policy if exists "Allow anon upsert" on public.benchmarks;

create policy "Allow anon read"   on public.benchmarks for select using (true);
create policy "Allow anon upsert" on public.benchmarks for insert to anon, authenticated with check (true);
create policy "Allow anon update" on public.benchmarks for update to anon, authenticated using (true) with check (true);

-- Seed: U12 / male / division 12.2 (Basketball Victoria).
-- These are documented reference estimates for age-group ball, NOT measured league
-- data — hence source='reference_estimate' (UI shows them as provisional). Each metric
-- key matches the headline metric name emitted by lib/driverTree.ts.
insert into public.benchmarks (age_group, gender, division, league, metric, mean, stdev, source, notes) values
  ('U12','male','12.2','Basketball Victoria','TS%',        45.0, 6.0, 'reference_estimate', 'True shooting; youth finishing runs low'),
  ('U12','male','12.2','Basketball Victoria','TO%',        22.0, 5.0, 'reference_estimate', 'Turnover rate per possession; lower is better'),
  ('U12','male','12.2','Basketball Victoria','OReb%',      33.0, 6.0, 'reference_estimate', 'Offensive rebound rate'),
  ('U12','male','12.2','Basketball Victoria','FTA/G',      14.0, 4.0, 'reference_estimate', 'Free-throw attempts per game (pace dependent)'),
  ('U12','male','12.2','Basketball Victoria','FT%',        50.0, 8.0, 'reference_estimate', 'Free-throw conversion'),
  ('U12','male','12.2','Basketball Victoria','Opp eFG%',   42.0, 6.0, 'reference_estimate', 'Effective FG% allowed; lower is better'),
  ('U12','male','12.2','Basketball Victoria','DReb%',      65.0, 6.0, 'reference_estimate', 'Defensive rebound rate'),
  ('U12','male','12.2','Basketball Victoria','Def TO%',    22.0, 5.0, 'reference_estimate', 'Turnover rate forced on opponent'),
  ('U12','male','12.2','Basketball Victoria','Def Fouls/G',14.0, 4.0, 'reference_estimate', 'Defensive fouls per game; lower is better')
on conflict (age_group, gender, division, metric) do nothing;
