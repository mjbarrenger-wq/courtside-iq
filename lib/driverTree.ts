// Driver Tree Engine — Net PPP Value Driver Tree
// Computes pillar scores, top drivers, and leakage areas from season aggregates.

export interface SeasonAggregates {
  pts: number
  possessions: number
  twopt_made: number
  twopt_att: number
  threept_made: number
  threept_att: number
  ft_made: number
  ft_att: number
  turnovers: number
  off_fouls: number
  oreb: number
  dreb: number
  total_reb: number
  ast: number
  ftf: number
  stl: number
  blk: number
  def_fouls: number
  plus_minus: number
  vps: number
  games: number
  opp_pts: number
  opp_possessions: number
  opp_twopt_made: number
  opp_twopt_att: number
  opp_threept_made: number
  opp_threept_att: number
  opp_ft_made: number
  opp_ft_att: number
  opp_turnovers: number
  opp_oreb: number
  opp_dreb: number
  opp_def_fouls: number
  opp_ast: number
  opp_stl: number
  opp_blk: number
}

export interface MetricScore {
  name: string
  value: number
  opp_value: number
  delta: number            // margin vs opponents/team (sign-corrected: + = good)
  format: 'pct' | 'num'
  // Tier 1 — level vs field baseline. Null when no benchmark row exists.
  baseline?: number | null // field reference mean for this metric
  level?: number | null    // value vs baseline, sign-corrected (+ = above field average)
  provisional?: boolean     // true when the baseline is a reference estimate, not measured
}

export interface PillarScore {
  name: string
  score: number
  opp_score: number
  delta: number             // margin vs opponents (sign-corrected: + = good)
  metrics: MetricScore[]
  // Tier 1 — mirrors the headline metric (metrics[0]) for convenient card display.
  baseline?: number | null
  level?: number | null
  provisional?: boolean
  // Tier 2 — this pillar's value in points per 100 possessions vs the field baseline
  // (offensive pillars = points added; defensive pillars = points prevented).
  pp100?: number | null
}

// Field reference values, keyed by metric name (must match MetricScore.name).
export type BenchmarkMap = Record<string, { mean: number; stdev?: number | null; provisional?: boolean }>

// Possession reconciliation — our and opponent possession counts should be within
// ~1–2 per game in a clean game. A large divergence flags a data-entry error.
export interface PossessionCheck {
  our_per_game: number
  opp_per_game: number
  divergence_per_game: number
  flagged: boolean
}

export interface Driver {
  pillar: string
  description: string
  delta: number
  pp100?: number | null   // Tier 2 — points per 100 possessions (common-currency value)
}

// Tier 2 — a Four-Factor pairing expressed in points per 100 possessions.
// margin_pp100 (our side − opp side) is exact and baseline-free; the offensive/
// defensive split uses provisional field baselines, so it only apportions the margin.
export interface FactorPP100 {
  factor: string
  offensive_pillar: string
  defensive_pillar: string
  offensive_pp100: number
  defensive_pp100: number
  margin_pp100: number
}

export interface PP100Decomposition {
  factors: FactorPP100[]
  net_pp100_modeled: number   // sum of factor margins (the modelled Net rating edge)
  net_pp100_actual: number    // (off_ppp − def_ppp) × 100, the figure actually posted
  residual_pp100: number      // actual − modelled (interaction / approximation error)
  provisional_split: boolean  // off/def attribution rests on provisional baselines
}

export interface DriverTreeOutput {
  off_ppp: number
  def_ppp: number
  opp_off_ppp: number
  opp_def_ppp: number
  net_ppp: number
  pace: number
  pillars: {
    offensive: PillarScore[]
    defensive: PillarScore[]
  }
  top_drivers: Driver[]
  leakage_areas: Driver[]
  possession_check?: PossessionCheck
  pp100?: PP100Decomposition
}

function r(n: number, d = 2) {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d)
}

function pct(made: number, att: number) {
  return att > 0 ? r((made / att) * 100, 1) : 0
}

function per_game(total: number, games: number) {
  return r(total / games, 1)
}

// Canonical possession estimate — the single definition used everywhere downstream.
// Poss = FGA + 0.44·FTA − OREB + TOV. Offensive rebounds are subtracted because they
// extend the same possession rather than starting a new one.
function possessions(fga: number, fta: number, oreb: number, tov: number) {
  return fga + 0.44 * fta - oreb + tov
}

// Metrics where a lower value is better — used to sign the level-vs-baseline reading.
const LOWER_BETTER = new Set([
  'TO%', 'TO/G', 'Opp eFG%', 'Opp 2Pt%', 'Opp 3Pt%', 'Opp OReb/G',
  'Def Fouls/G', 'Fouls/G', 'Off Fouls/G', 'Opp FTA/G', 'Opp FT%',
])

// Attaches a field-baseline reading to a metric. Level is sign-corrected so that a
// positive number always means "better than the field", regardless of metric direction.
function withBaseline(m: MetricScore, benchmarks?: BenchmarkMap): MetricScore {
  const b = benchmarks?.[m.name]
  if (!b) return { ...m, baseline: null, level: null, provisional: true }
  const level = (LOWER_BETTER.has(m.name) ? r(b.mean - m.value, 1) : r(m.value - b.mean, 1)) || 0  // || 0 normalises -0
  return { ...m, baseline: b.mean, level, provisional: b.provisional ?? true }
}

// Applies baselines to every metric in a pillar and lifts the headline metric's
// reading (metrics[0]) onto the pillar for card display.
function applyBaselines(p: PillarScore, benchmarks?: BenchmarkMap): PillarScore {
  const metrics = p.metrics.map(m => withBaseline(m, benchmarks))
  const head = metrics[0]
  return {
    ...p,
    metrics,
    baseline: head?.baseline ?? null,
    level: head?.level ?? null,
    provisional: head?.provisional ?? true,
  }
}

export function computeDriverTree(a: SeasonAggregates, benchmarks?: BenchmarkMap): DriverTreeOutput {
  const g = a.games

  // --- Canonical possessions (Tier 0: one definition, computed here from raw counts) ---
  const our_fga = a.twopt_att + a.threept_att
  const opp_fga_total = a.opp_twopt_att + a.opp_threept_att
  const our_poss = possessions(our_fga, a.ft_att, a.oreb, a.turnovers)
  const opp_poss = possessions(opp_fga_total, a.opp_ft_att, a.opp_oreb, a.opp_turnovers)

  // Reconciliation — both teams should have near-equal possessions in a clean game.
  const our_poss_pg = per_game(our_poss, g)
  const opp_poss_pg = per_game(opp_poss, g)
  const possession_check: PossessionCheck = {
    our_per_game: our_poss_pg,
    opp_per_game: opp_poss_pg,
    divergence_per_game: r(Math.abs(our_poss_pg - opp_poss_pg), 1),
    flagged: Math.abs(our_poss_pg - opp_poss_pg) > 3,
  }

  // --- Core PPP (uses the canonical counts) ---
  const off_ppp = r(a.pts / our_poss, 3)
  const def_ppp = r(a.opp_pts / opp_poss, 3)
  const opp_off_ppp = def_ppp
  const opp_def_ppp = off_ppp
  const net_ppp = r(off_ppp - def_ppp, 3)
  const pace = r(our_poss / g, 1)

  // --- Offensive Pillar 1: Shot Efficiency ---
  const efg = pct(a.twopt_made + 1.5 * a.threept_made, a.twopt_att + a.threept_att)
  const ts = pct(a.pts, 2 * (a.twopt_att + a.threept_att + 0.44 * a.ft_att))
  const atr = r(a.ft_att / (a.twopt_att + a.threept_att), 2)

  const opp_efg = pct(a.opp_twopt_made + 1.5 * a.opp_threept_made, a.opp_twopt_att + a.opp_threept_att)
  const opp_ts = pct(a.opp_pts, 2 * (a.opp_twopt_att + a.opp_threept_att + 0.44 * a.opp_ft_att))
  const opp_atr = r(a.opp_ft_att / (a.opp_twopt_att + a.opp_threept_att), 2)

  const shotEff: PillarScore = {
    name: 'Shot Efficiency',
    score: ts,
    opp_score: opp_ts,
    delta: r(ts - opp_ts, 1),
    metrics: [
      { name: 'TS%',  value: ts,      opp_value: opp_ts,      delta: r(ts - opp_ts, 1),           format: 'pct' },
      { name: 'eFG%', value: efg,     opp_value: opp_efg,     delta: r(efg - opp_efg, 1),         format: 'pct' },
      { name: 'FTF',  value: atr,     opp_value: opp_atr,     delta: r(atr - opp_atr, 2),         format: 'num' },
    ]
  }

  // --- Offensive Pillar 2: Possession Control ---
  // TO% uses the canonical Basketball-Reference / Oliver turnover-rate denominator
  // (FGA + 0.44·FTA + TOV) — the recognized "turnover rate". Note this intentionally
  // does NOT subtract offensive rebounds, unlike the PPP possession count above:
  // both follow Oliver's reference definitions, which differ by design. Benchmarks
  // are seeded on this same scale.
  const fga = our_fga
  const to_pct = pct(a.turnovers, fga + 0.44 * a.ft_att + a.turnovers)
  const ato = r(a.ast / a.turnovers, 2)

  const opp_fga = opp_fga_total
  const opp_to_pct = pct(a.opp_turnovers, opp_fga + 0.44 * a.opp_ft_att + a.opp_turnovers)
  const opp_ato = a.opp_turnovers > 0 ? r(a.opp_ast / a.opp_turnovers, 2) : 0

  // Score = TO% (lower is better — delta positive if we turn it over less)
  const to_pg     = per_game(a.turnovers, g)
  const opp_to_pg = per_game(a.opp_turnovers, g)

  const possCtrl: PillarScore = {
    name: 'Possession Control',
    score: to_pct,
    opp_score: opp_to_pct,
    delta: r(opp_to_pct - to_pct, 1),  // positive = we turn it over less
    metrics: [
      { name: 'TO%',  value: to_pct, opp_value: opp_to_pct, delta: r(opp_to_pct - to_pct, 1), format: 'pct' },
      { name: 'TO/G', value: to_pg,  opp_value: opp_to_pg,  delta: r(opp_to_pg - to_pg, 1),   format: 'num' },
    ]
  }

  // --- Offensive Pillar 3: Extra Possessions (OReb) ---
  // OReb% = our oreb / (our oreb + their dreb)
  const oreb_pct = pct(a.oreb, a.oreb + a.opp_dreb)
  const oreb_pg = per_game(a.oreb, g)

  // Opp OReb% = their oreb / (their oreb + our dreb)
  const opp_oreb_pct = pct(a.opp_oreb, a.opp_oreb + a.dreb)
  const opp_oreb_pg = per_game(a.opp_oreb, g)

  const extraPoss: PillarScore = {
    name: 'Second Chances',
    score: oreb_pct,
    opp_score: opp_oreb_pct,
    delta: r(oreb_pct - opp_oreb_pct, 1),
    metrics: [
      { name: 'OReb%',  value: oreb_pct, opp_value: opp_oreb_pct, delta: r(oreb_pct - opp_oreb_pct, 1), format: 'pct' },
      { name: 'OReb/G', value: oreb_pg,  opp_value: opp_oreb_pg,  delta: r(oreb_pg - opp_oreb_pg, 1),   format: 'num' },
    ]
  }

  // --- Offensive Pillar 4: Free Throws (FTs) ---
  // Tier 2: the arbitrary FTA/G × (0.5 + 0.5·FT%) composite is retired. The headline
  // is now FT Rate (FTA/FGA) — the recognized fourth factor, pace-neutral — with FT%
  // kept as a separate conversion diagnostic. The pillar's point value lives in the
  // PP100 decomposition below (FT points per 100), not in an invented weighting.
  const ft_pct = pct(a.ft_made, a.ft_att)
  const ftf_pg = per_game(a.ft_att, g)
  const ft_made_pg = per_game(a.ft_made, g)
  const ft_rate = fga > 0 ? r(a.ft_att / fga, 3) : 0

  const opp_ft_pct = pct(a.opp_ft_made, a.opp_ft_att)
  const opp_ftf_pg = per_game(a.opp_ft_att, g)
  const opp_ft_rate = opp_fga > 0 ? r(a.opp_ft_att / opp_fga, 3) : 0

  const pressureCreation: PillarScore = {
    name: 'Rim Pressure',
    score: ft_rate,
    opp_score: opp_ft_rate,
    delta: r(ft_rate - opp_ft_rate, 3),
    metrics: [
      { name: 'FT Rate',   value: ft_rate,    opp_value: opp_ft_rate,                 delta: r(ft_rate - opp_ft_rate, 3),       format: 'num' },
      { name: 'FTA/G',     value: ftf_pg,     opp_value: opp_ftf_pg,                  delta: r(ftf_pg - opp_ftf_pg, 1),         format: 'num' },
      { name: 'FT%',       value: ft_pct,     opp_value: opp_ft_pct,                  delta: r(ft_pct - opp_ft_pct, 1),         format: 'pct' },
      { name: 'FT Made/G', value: ft_made_pg, opp_value: per_game(a.opp_ft_made, g),  delta: r(ft_made_pg - per_game(a.opp_ft_made, g), 1), format: 'num' },
    ]
  }

  // --- Defensive Pillar 1: Shot Suppression ---
  // Show actual shooting % — opponent's eFG% against us vs our eFG% against them
  // Lower score = better defence. Delta positive = we suppress better.
  const def2pt_pct = pct(a.opp_twopt_made, a.opp_twopt_att)
  const def3pt_pct = pct(a.opp_threept_made, a.opp_threept_att)
  const def_efg    = pct(a.opp_twopt_made + 1.5 * a.opp_threept_made, a.opp_twopt_att + a.opp_threept_att)
  const def_ppp_val = r(a.opp_pts / a.opp_possessions, 3)
  const blk_pg     = per_game(a.blk, g)
  const opp_blk_pg = per_game(a.opp_blk ?? 0, g)

  const us_2pt_pct = pct(a.twopt_made, a.twopt_att)
  const us_3pt_pct = pct(a.threept_made, a.threept_att)

  const shotSupp: PillarScore = {
    name: 'Shot Suppression',
    score: def_efg,        // opp eFG% against us — lower is better for us
    opp_score: efg,        // our eFG% against them — lower is better for them
    delta: r(efg - def_efg, 1),  // positive = we suppress better
    metrics: [
      { name: 'Opp eFG%',  value: def_efg,    opp_value: efg,        delta: r(efg - def_efg, 1),           format: 'pct' },
      { name: 'BLK/G',     value: blk_pg,     opp_value: opp_blk_pg, delta: r(blk_pg - opp_blk_pg, 1),     format: 'num' },
      { name: 'Opp 2Pt%',  value: def2pt_pct, opp_value: us_2pt_pct, delta: r(us_2pt_pct - def2pt_pct, 1), format: 'pct' },
      { name: 'Opp 3Pt%',  value: def3pt_pct, opp_value: us_3pt_pct, delta: r(us_3pt_pct - def3pt_pct, 1), format: 'pct' },
    ]
  }

  // --- Defensive Pillar 2: Possession Ending (DReb) ---
  // DReb% = dreb / (dreb + opp_oreb)  — our defensive rebound rate
  // Opp DReb% = opp_dreb / (opp_dreb + our_oreb) — their defensive rebound rate
  const dreb_pg     = per_game(a.dreb, g)
  const dreb_pct    = pct(a.dreb, a.dreb + a.opp_oreb)
  const opp_dreb_pg  = per_game(a.opp_dreb, g)
  const opp_dreb_pct = pct(a.opp_dreb, a.opp_dreb + a.oreb)

  const possEnding: PillarScore = {
    name: 'Possession Ending',
    score: dreb_pct,
    opp_score: opp_dreb_pct,
    delta: r(dreb_pct - opp_dreb_pct, 1),
    metrics: [
      { name: 'DReb%',     value: dreb_pct,    opp_value: opp_dreb_pct, delta: r(dreb_pct - opp_dreb_pct, 1),   format: 'pct' },
      { name: 'DReb/G',    value: dreb_pg,     opp_value: opp_dreb_pg,  delta: r(dreb_pg - opp_dreb_pg, 1),     format: 'num' },
      { name: 'Opp OReb/G', value: opp_oreb_pg, opp_value: oreb_pg,     delta: r(oreb_pg - opp_oreb_pg, 1),     format: 'num' },
    ]
  }

  // --- Defensive Pillar 3: Pressure & Disruption ---
  // Def TO% = opp turnovers / opp possessions (higher = better for us)
  // Compared to opp forcing TOs against us (our TO% from possessions perspective)
  // Forced-turnover rate, on the same canonical TOV% denominator as the offensive
  // pillar so the two readings are directly comparable and benchmark-aligned.
  const def_to_pct = opp_to_pct
  const us_to_pct  = to_pct
  const stl_pg     = per_game(a.stl, g)
  const opp_stl_pg = per_game(a.opp_stl ?? 0, g)

  const pressureDisrupt: PillarScore = {
    name: 'Possession Creation',
    score: r(def_to_pct, 1),
    opp_score: r(us_to_pct, 1),
    delta: r(def_to_pct - us_to_pct, 1),
    metrics: [
      { name: 'Def TO%', value: def_to_pct, opp_value: us_to_pct,  delta: r(def_to_pct - us_to_pct, 1), format: 'pct' },
      { name: 'STL/G',   value: stl_pg,     opp_value: opp_stl_pg, delta: r(stl_pg - opp_stl_pg, 1),    format: 'num' },
    ]
  }

  // --- Defensive Pillar 4: Discipline ---
  // Compare our def fouls/g vs opponent's def fouls/g (lower = better)
  const def_fouls_pg   = per_game(a.def_fouls, g)
  const opp_def_fouls_pg = per_game(a.opp_def_fouls, g)
  const opp_ftf_pg2    = per_game(a.opp_ft_att, g)
  const us_ftf_pg      = per_game(a.ft_att, g)

  // Score = def_fouls/g (lower = better). Delta positive = we foul less = good.
  const discipline: PillarScore = {
    name: 'Discipline',
    score: def_fouls_pg,
    opp_score: opp_def_fouls_pg,
    delta: r(opp_def_fouls_pg - def_fouls_pg, 1),
    metrics: [
      { name: 'Def Fouls/G', value: def_fouls_pg, opp_value: opp_def_fouls_pg, delta: r(opp_def_fouls_pg - def_fouls_pg, 1), format: 'num' },
      { name: 'Opp FTA/G', value: opp_ftf_pg2, opp_value: us_ftf_pg, delta: r(us_ftf_pg - opp_ftf_pg2, 1), format: 'num' },
      { name: 'Opp FT%', value: opp_ft_pct, opp_value: ft_pct, delta: r(ft_pct - opp_ft_pct, 1), format: 'pct' },
    ]
  }

  // --- Tier 2: points-per-100-possessions decomposition ---
  // Each pillar's value is expressed in points per 100 possessions vs the field
  // baseline. Offensive pillars = points our offence adds; defensive pillars = points
  // our defence prevents. Each offensive+defensive pair nets to a baseline-free margin
  // (the baseline cancels), and the eight sum (+ residual) to actual Net rating. Shooting
  // and free-throw values are direct points; turnover/rebound values price each possession
  // at its average worth. These are attribution estimates — the residual carries the
  // interaction term. The off/def split rests on provisional baselines; the margins do not.
  const per100 = (x: number, poss: number) => poss > 0 ? (x / poss) * 100 : 0
  const ppp_val = (off_ppp + def_ppp) / 2

  const b_efg     = (benchmarks?.['eFG%']?.mean ?? benchmarks?.['Opp eFG%']?.mean ?? 42) / 100
  const b_to100   = benchmarks?.['TO%']?.mean ?? 22        // turnovers per 100
  const b_oreb100 = benchmarks?.['OReb/100']?.mean ?? 11   // offensive rebounds per 100
  const b_ftm100  = benchmarks?.['FTM/100']?.mean ?? 13    // FT points per 100
  const splitProvisional =
    (benchmarks?.['eFG%']?.provisional ?? benchmarks?.['Opp eFG%']?.provisional ?? true) ||
    !benchmarks?.['OReb/100'] || !benchmarks?.['FTM/100']

  const fga_us_100   = per100(our_fga, our_poss)
  const fga_opp_100  = per100(opp_fga_total, opp_poss)
  const to_us_100    = per100(a.turnovers, our_poss)
  const to_opp_100   = per100(a.opp_turnovers, opp_poss)
  const oreb_us_100  = per100(a.oreb, our_poss)
  const oreb_opp_100 = per100(a.opp_oreb, opp_poss)
  const ftm_us_100   = per100(a.ft_made, our_poss)
  const ftm_opp_100  = per100(a.opp_ft_made, opp_poss)
  const efg_us_f     = efg / 100
  const efg_opp_f    = opp_efg / 100

  const pp_shotEff    = r(2 * (efg_us_f - b_efg) * fga_us_100, 1)
  const pp_shotSupp   = r(2 * (b_efg - efg_opp_f) * fga_opp_100, 1)
  const pp_possCtrl   = r((b_to100 - to_us_100) * ppp_val, 1)
  const pp_possCreate = r((to_opp_100 - b_to100) * ppp_val, 1)
  const pp_secondCh   = r((oreb_us_100 - b_oreb100) * ppp_val, 1)
  const pp_possEnd    = r((b_oreb100 - oreb_opp_100) * ppp_val, 1)
  const pp_ft         = r(ftm_us_100 - b_ftm100, 1)
  const pp_discipline = r(b_ftm100 - ftm_opp_100, 1)

  shotEff.pp100          = pp_shotEff
  possCtrl.pp100         = pp_possCtrl
  extraPoss.pp100        = pp_secondCh
  pressureCreation.pp100 = pp_ft
  shotSupp.pp100         = pp_shotSupp
  possEnding.pp100       = pp_possEnd
  pressureDisrupt.pp100  = pp_possCreate
  discipline.pp100       = pp_discipline

  const factors: FactorPP100[] = [
    { factor: 'Shooting',      offensive_pillar: 'Shot Efficiency',    defensive_pillar: 'Shot Suppression',    offensive_pp100: pp_shotEff,  defensive_pp100: pp_shotSupp,   margin_pp100: r(pp_shotEff + pp_shotSupp, 1) },
    { factor: 'Ball Security', offensive_pillar: 'Possession Control', defensive_pillar: 'Possession Creation', offensive_pp100: pp_possCtrl, defensive_pp100: pp_possCreate, margin_pp100: r(pp_possCtrl + pp_possCreate, 1) },
    { factor: 'Rebounding',    offensive_pillar: 'Second Chances',     defensive_pillar: 'Possession Ending',   offensive_pp100: pp_secondCh, defensive_pp100: pp_possEnd,    margin_pp100: r(pp_secondCh + pp_possEnd, 1) },
    { factor: 'Free Throws',   offensive_pillar: 'Rim Pressure',       defensive_pillar: 'Discipline',          offensive_pp100: pp_ft,       defensive_pp100: pp_discipline, margin_pp100: r(pp_ft + pp_discipline, 1) },
  ]
  const net_modeled = r(factors.reduce((s, f) => s + f.margin_pp100, 0), 1)
  const net_actual  = r((off_ppp - def_ppp) * 100, 1)
  const pp100: PP100Decomposition = {
    factors,
    net_pp100_modeled: net_modeled,
    net_pp100_actual:  net_actual,
    residual_pp100:    r(net_actual - net_modeled, 1),
    provisional_split: splitProvisional,
  }

  // --- All pillars ---
  const allPillars = [shotEff, possCtrl, extraPoss, pressureCreation, shotSupp, possEnding, pressureDisrupt, discipline]

  // --- Top Drivers & Leakage — ranked by PP100 (common currency, Tier 2) ---
  const pillarDrivers: Driver[] = allPillars.map(p => ({
    pillar: p.name,
    description: `${p.name}: ${(p.pp100 ?? 0) >= 0 ? '+' : ''}${p.pp100} pts/100 vs field`,
    delta: p.delta,
    pp100: p.pp100 ?? 0,
  }))

  const sorted = [...pillarDrivers].sort((a, b) => Math.abs(b.pp100 ?? 0) - Math.abs(a.pp100 ?? 0))
  const top_drivers   = sorted.filter(d => (d.pp100 ?? 0) > 0).slice(0, 3)
  const leakage_areas = sorted.filter(d => (d.pp100 ?? 0) < 0).slice(0, 3)

  return {
    off_ppp,
    def_ppp,
    opp_off_ppp,
    opp_def_ppp,
    net_ppp,
    pace,
    pillars: {
      offensive: [shotEff, possCtrl, extraPoss, pressureCreation].map(p => applyBaselines(p, benchmarks)),
      defensive: [shotSupp, possEnding, pressureDisrupt, discipline].map(p => applyBaselines(p, benchmarks)),
    },
    top_drivers,
    leakage_areas,
    possession_check,
    pp100,
  }
}

// ── Player Driver Tree ────────────────────────────────────────────────────────
// Computes player pillars compared to team average per player.
// "opp_score" on each pillar = team average (not opponent).

export interface PlayerStats {
  games: number
  pts: number
  twopt_made: number; twopt_att: number
  threept_made: number; threept_att: number
  ft_made: number; ft_att: number
  turnovers: number; ast: number
  oreb: number; dreb: number
  stl: number; blk: number
  def_fouls: number; off_fouls: number
  plus_minus: number; vps: number
  off_ppp: number; def_ppp: number; net_ppp: number
}

export function computePlayerDriverTree(
  player: PlayerStats,
  team: SeasonAggregates,
  numActivePlayers: number,
): DriverTreeOutput {
  const g  = Math.max(player.games, 1)
  const tg = Math.max(team.games, 1)
  const np = Math.max(numActivePlayers, 1)

  const pg   = (x: number) => r(x / g, 1)
  const tppg = (x: number) => r(x / tg / np, 1) // team per player per game

  // Percentage helpers
  const pctP = (made: number, att: number) =>
    att > 0 ? r((made / att) * 100, 1) : 0

  // Player counting per-game stats
  const player_fga     = player.twopt_att + player.threept_att
  const player_efg     = pctP(player.twopt_made + 1.5 * player.threept_made, player_fga)
  const player_ts      = pctP(player.pts, 2 * (player_fga + 0.44 * player.ft_att))
  const player_2pt_pct = pctP(player.twopt_made, player.twopt_att)
  const player_ft_pct  = pctP(player.ft_made, player.ft_att)
  const player_to_pg   = pg(player.turnovers)
  const player_ast_pg  = pg(player.ast)
  const player_ato     = player.turnovers > 0 ? r(player.ast / player.turnovers, 2) : 0
  const player_oreb_pg = pg(player.oreb)
  const player_dreb_pg = pg(player.dreb)
  const player_reb_pg  = r(player_oreb_pg + player_dreb_pg, 1)
  const player_stl_pg  = pg(player.stl)
  const player_blk_pg  = pg(player.blk)
  const player_foul_pg = pg(player.def_fouls)
  const player_ftf_pg  = pg(player.ft_att)
  const player_pm_pg   = r(player.plus_minus / g, 1)
  const player_ppg     = pg(player.pts)
  const player_vps_pg  = r(player.vps / g, 2)

  // Team averages per player per game
  const team_fga             = team.twopt_att + team.threept_att
  const team_possessions_est = team_fga + 0.44 * team.ft_att + team.turnovers
  const team_efg     = pctP(team.twopt_made + 1.5 * team.threept_made, team_fga)
  const team_ts      = pctP(team.pts, 2 * (team_fga + 0.44 * team.ft_att))
  const team_2pt_pct = pctP(team.twopt_made, team.twopt_att)
  const team_ft_pct  = pctP(team.ft_made, team.ft_att)
  const team_to_ppg  = tppg(team.turnovers)
  const team_ast_ppg = tppg(team.ast)
  const team_ato     = team.turnovers > 0 ? r(team.ast / team.turnovers, 2) : 0
  const team_oreb_ppg= tppg(team.oreb)
  const team_dreb_ppg= tppg(team.dreb)
  const team_reb_ppg = r(team_oreb_ppg + team_dreb_ppg, 1)
  const team_stl_ppg = tppg(team.stl)
  const team_blk_ppg = tppg(team.blk)
  const team_foul_ppg= tppg(team.def_fouls)
  const team_ftf_ppg = tppg(team.ft_att)
  const team_ppg_pp  = r(team.pts / tg / np, 1)

  // ── Offensive Pillars ──────────────────────────────────────────────────────

  const shotEff: PillarScore = {
    name: 'Shot Efficiency',
    score: player_ts,
    opp_score: team_ts,
    delta: r(player_ts - team_ts, 1),
    metrics: [
      { name: 'TS%',   value: player_ts,      opp_value: team_ts,      delta: r(player_ts - team_ts, 1),           format: 'pct' },
      { name: 'eFG%',  value: player_efg,     opp_value: team_efg,     delta: r(player_efg - team_efg, 1),         format: 'pct' },
      { name: '2Pt%',  value: player_2pt_pct, opp_value: team_2pt_pct, delta: r(player_2pt_pct - team_2pt_pct, 1), format: 'pct' },
    ],
  }

  // TO% = turnovers / (FGA + 0.44*FTA + TO) — possession-adjusted turnover rate
  const player_possessions = player_fga + 0.44 * player.ft_att + player.turnovers
  const player_to_pct = player_possessions > 0 ? r((player.turnovers / player_possessions) * 100, 1) : 0

  const team_to_pct  = team_possessions_est > 0 ? r((team.turnovers / team_possessions_est) * 100, 1) : 0

  const possCtrl: PillarScore = {
    name: 'Possession Control',
    score: player_to_pct,
    opp_score: team_to_pct,
    delta: r(team_to_pct - player_to_pct, 1), // positive = player turns it over less = better
    metrics: [
      { name: 'TO%',   value: player_to_pct, opp_value: team_to_pct,  delta: r(team_to_pct - player_to_pct, 1),  format: 'pct' },
      { name: 'TO/G',  value: player_to_pg,  opp_value: team_to_ppg,  delta: r(team_to_ppg - player_to_pg, 1),   format: 'num' },
    ],
  }

  const extraPoss: PillarScore = {
    name: 'Second Chances',
    score: player_oreb_pg,
    opp_score: team_oreb_ppg,
    delta: r(player_oreb_pg - team_oreb_ppg, 1),
    metrics: [
      { name: 'OReb/G',  value: player_oreb_pg, opp_value: team_oreb_ppg, delta: r(player_oreb_pg - team_oreb_ppg, 1), format: 'num' },
      { name: 'Total Reb/G', value: player_reb_pg, opp_value: team_reb_ppg, delta: r(player_reb_pg - team_reb_ppg, 1), format: 'num' },
    ],
  }

  // Tier 2: composite retired here too. Headline is FT Rate (FTA/FGA), the recognized
  // fourth factor; FT% stays a separate conversion diagnostic.
  const player_ft_rate = player_fga > 0 ? r(player.ft_att / player_fga, 3) : 0
  const team_ft_rate   = team_fga > 0 ? r(team.ft_att / team_fga, 3) : 0
  const team_ft_made_ppg = tppg(team.ft_made)

  const pressureCreation: PillarScore = {
    name: 'Rim Pressure',
    score: player_ft_rate,
    opp_score: team_ft_rate,
    delta: r(player_ft_rate - team_ft_rate, 3),
    metrics: [
      { name: 'FT Rate',   value: player_ft_rate,              opp_value: team_ft_rate,      delta: r(player_ft_rate - team_ft_rate, 3),                                format: 'num' },
      { name: 'FTA/G',     value: player_ftf_pg,               opp_value: team_ftf_ppg,     delta: r(player_ftf_pg - team_ftf_ppg, 1),                                 format: 'num' },
      { name: 'FT%',       value: player_ft_pct,               opp_value: team_ft_pct,       delta: r(player_ft_pct - team_ft_pct, 1),                                  format: 'pct' },
      { name: 'FT Made/G', value: r(player.ft_made / g, 1),    opp_value: team_ft_made_ppg,  delta: r(r(player.ft_made / g, 1) - team_ft_made_ppg, 1),                  format: 'num' },
    ],
  }

  // ── Defensive Pillars ──────────────────────────────────────────────────────

  const shotSupp: PillarScore = {
    name: 'Shot Suppression',
    score: player_blk_pg,
    opp_score: team_blk_ppg,
    delta: r(player_blk_pg - team_blk_ppg, 1),
    metrics: [
      { name: 'BLK/G', value: player_blk_pg, opp_value: team_blk_ppg, delta: r(player_blk_pg - team_blk_ppg, 1), format: 'num' },
    ],
  }

  const possEnding: PillarScore = {
    name: 'Possession Ending',
    score: player_dreb_pg,
    opp_score: team_dreb_ppg,
    delta: r(player_dreb_pg - team_dreb_ppg, 1),
    metrics: [
      { name: 'DReb/G', value: player_dreb_pg, opp_value: team_dreb_ppg, delta: r(player_dreb_pg - team_dreb_ppg, 1), format: 'num' },
    ],
  }

  const team_pm_ppg  = r(team.plus_minus / tg / np, 1)
  const team_vps_ppg = r(team.vps / tg / np, 2)

  const pressureDisrupt: PillarScore = {
    name: 'Possession Creation',
    score: player_stl_pg,
    opp_score: team_stl_ppg,
    delta: r(player_stl_pg - team_stl_ppg, 1),
    metrics: [
      { name: 'STL/G', value: player_stl_pg, opp_value: team_stl_ppg, delta: r(player_stl_pg - team_stl_ppg, 1), format: 'num' },
    ],
  }

  const discipline: PillarScore = {
    name: 'Discipline',
    score: player_foul_pg,
    opp_score: team_foul_ppg,
    delta: r(team_foul_ppg - player_foul_pg, 1), // positive = player fouls less = good
    metrics: [
      { name: 'Fouls/G',     value: player_foul_pg, opp_value: team_foul_ppg, delta: r(team_foul_ppg - player_foul_pg, 1), format: 'num' },
      { name: 'Off Fouls/G', value: pg(player.off_fouls), opp_value: tppg(team.off_fouls), delta: r(tppg(team.off_fouls) - pg(player.off_fouls), 1), format: 'num' },
    ],
  }

  const allPillars = [shotEff, possCtrl, extraPoss, pressureCreation, shotSupp, possEnding, pressureDisrupt, discipline]

  // Build proper Driver objects (UI reads .pillar and .delta)
  const pillarDrivers: Driver[] = allPillars.map(p => ({
    pillar:      p.name,
    description: `${p.name}: ${p.score} vs team avg ${p.opp_score} (${p.delta >= 0 ? '+' : ''}${p.delta})`,
    delta:       p.delta,
  }))
  const sorted = [...pillarDrivers].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    off_ppp:     r(player.off_ppp, 3),
    def_ppp:     r(player.def_ppp, 3),
    opp_off_ppp: 0,
    opp_def_ppp: 0,
    net_ppp:     r(player.net_ppp, 3),
    pace:        player.games,
    pillars: {
      offensive: [shotEff, possCtrl, extraPoss, pressureCreation],
      defensive: [shotSupp, possEnding, pressureDisrupt, discipline],
    },
    top_drivers:   sorted.filter(d => d.delta > 0).slice(0, 3),
    leakage_areas: sorted.filter(d => d.delta < 0).slice(0, 3),
  }
}
