-- Tier 2 benchmark rows.
-- 'FT Rate' becomes the headline metric of the Free Throws pillar (composite retired),
-- so it needs a field baseline for the Tier 1 level reading. The remaining three are
-- PP100-form references used only to split each factor's points-per-100 margin between
-- offence and defence (the margins themselves are baseline-free). All provisional /
-- editable; set source='measured' once real league data is available.

insert into public.benchmarks (age_group, gender, division, league, metric, mean, stdev, source, notes) values
  ('U12','male','12.2','Basketball Victoria','FT Rate', 0.30, 0.07, 'reference_estimate', 'Free-throw rate FTA/FGA — recognized fourth factor (headline for the FT pillar)'),
  ('U12','male','12.2','Basketball Victoria','eFG%',    42.0, 6.0,  'reference_estimate', 'Effective FG% league reference (PP100 shooting split)'),
  ('U12','male','12.2','Basketball Victoria','OReb/100',11.0, 3.0,  'reference_estimate', 'Offensive rebounds per 100 possessions (PP100 rebounding split)'),
  ('U12','male','12.2','Basketball Victoria','FTM/100', 13.0, 3.0,  'reference_estimate', 'Free-throw points per 100 possessions (PP100 free-throw split)')
on conflict (age_group, gender, division, metric) do nothing;
