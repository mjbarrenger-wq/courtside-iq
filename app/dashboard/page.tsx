import { Suspense } from 'react'
import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { computeDriverTree, computePlayerDriverTree, PillarScore, MetricScore, DriverTreeOutput, PlayerStats } from '@/lib/driverTree'
import { COACHING_WRITING_STANDARDS } from '@/lib/writingStandards'
import { FilterBar } from './FilterBar'
import type { FilterKey, GameTypeKey } from './filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from './filterConfig'
import { DateSlider } from './DateSlider'
import { PlayerSelector } from './PlayerSelector'
import { GamePicker } from './GamePicker'
import type { PickerGame } from './GamePicker'
import DashboardDrillCards, { type DashboardDrill } from './DashboardDrillCards'
export const dynamic = 'force-dynamic'

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

// Coaching translation for each pillar — used in Key Takeaways
const PILLAR_TRANSLATION: Record<string, { strength: string; weakness: string }> = {
  'Shot Efficiency': {
    strength: 'Shot quality is the edge. Keep your finishing drills constrained to high-percentage looks.',
    weakness: 'Shot selection is costing efficiency. Constrain finishing drills to layups and open catch-and-shoots only.',
  },
  'Possession Control': {
    strength: 'Ball security is holding. Keep live defenders on every ball-handling rep at training.',
    weakness: 'Turnovers are leaking possessions. Run live-ball decision drills with active defenders every session.',
  },
  'Second Chances': {
    strength: 'Offensive rebounding is generating second chances. Maintain the crash-the-glass habit after every drive.',
    weakness: 'Second chances are being left on the board. Add offensive glass pursuit to every half-court drill.',
  },
  'Rim Pressure': {
    strength: 'Getting to the line and converting. Rim pressure is working. Keep attacking the paint.',
    weakness: 'Not enough foul line opportunities. Encourage players to drive and finish through contact rather than pull up.',
  },
  'Shot Suppression': {
    strength: 'Defence is contesting well and limiting quality looks. Closeout technique is working.',
    weakness: 'Opponents are finding open looks. Add closeout and help-side rotation work to your shell drill.',
  },
  'Possession Ending': {
    strength: 'Defensive rebounding is ending possessions cleanly. Box-out discipline is paying off.',
    weakness: 'Opponents are getting offensive rebounds. Make two hands on your player before looking for the ball a non-negotiable rule.',
  },
  'Possession Creation': {
    strength: 'Active hands are creating turnovers and transition chances. Keep the ball pressure on.',
    weakness: 'Opponents are moving the ball too freely. Add ball pressure and gap coverage work to your half-court defence sessions.',
  },
  'Discipline': {
    strength: 'Low foul rate is keeping opponents off the line. Legal defence is working.',
    weakness: 'Fouling is putting opponents on the line. Drill legal defence: move your feet, no reaches.',
  },
}

// What each pillar's score/delta represents — for labelling in the UI
const PILLAR_DELTA_UNIT: Record<string, string> = {
  'Shot Efficiency':       'eFG% pp',
  'Possession Control':    'TO% pp',
  'Second Chances':        'OReb% pp',
  'Rim Pressure':     'FT% pp',
  'Shot Suppression':      'eFG% pp',
  'Possession Ending':     'DReb% pp',
  'Possession Creation':   'STL/G',
  'Discipline':            'fouls/g',
}

// Maps pillar display names to DB keys
const PILLAR_KEY: Record<string, string> = {
  'Shot Efficiency':      'shot_efficiency',
  'Possession Control':   'possession_control',
  'Second Chances':       'extra_possessions',
  'Rim Pressure':    'pressure_creation',
  'Shot Suppression':     'shot_suppression',
  'Possession Ending':    'possession_ending',
  'Possession Creation':  'pressure_disruption',
  'Discipline':           'discipline',
}

// Returns drills matched to the current view's weakest pillars
function getRelevantDashboardDrills(
  leakageAreas: { pillar: string; delta: number }[],
  allDrills: DashboardDrill[],
  limit = 4,
): DashboardDrill[] {
  const weakPillars = leakageAreas
    .sort((a, b) => a.delta - b.delta) // most negative first
    .map(d => PILLAR_KEY[d.pillar])
    .filter(Boolean)

  if (weakPillars.length === 0) {
    return allDrills.filter(d => d.difficulty === 'foundation').slice(0, limit)
  }

  const result: DashboardDrill[] = []
  for (const pillar of weakPillars) {
    const matches = allDrills
      .filter(d => d.pillar === pillar)
      .sort((a, b) => (a as any).difficulty_order - (b as any).difficulty_order)
      .slice(0, 2)
    result.push(...matches)
    if (result.length >= limit) break
  }
  return result.slice(0, limit)
}

async function getInsightsFromDB(
  drivers: { pillar: string; delta: number }[],
  sbUrl: string,
  sbKey: string,
): Promise<string[]> {
  // Take top 3 pillars by absolute delta (mix of strengths and weaknesses)
  const top3 = [...drivers]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)

  const insights: string[] = []

  for (const d of top3) {
    const pillarKey = PILLAR_KEY[d.pillar]
    if (!pillarKey) continue
    const direction = d.delta >= 0 ? 'strength' : 'weakness'

    try {
      const res = await fetch(
        `${sbUrl}/rest/v1/coaching_insights?pillar=eq.${pillarKey}&direction=eq.${direction}&context=eq.team&select=text`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: 'no-store' }
      )
      const rows: { text: string }[] = await res.json()
      if (Array.isArray(rows) && rows.length > 0) {
        const pick = rows[Math.floor(Math.random() * rows.length)]
        insights.push(pick.text)
      }
    } catch {
      // skip this pillar on error
    }
  }

  // Fallback if DB is empty (before generate_insights.js has been run)
  if (insights.length === 0) {
    return [
      'At training, structure your finishing drills so the only valid shots are layups, open catch-and-shoots, and kick-outs after the drive collapses the paint. Pull-up jumpers come off the board. Players build shot selection through constraints, not reminders.',
      'Run every ball-handling station with a live defender in tight spaces. Two-on-one, three-on-two, full court. The reads that cut turnovers happen under pressure — drills without defenders do not build those habits.',
      'Add a box-out rule to every half-court defensive possession drill: two hands on your player before you look for the ball. Make it a reset — stop the drill if someone turns for the rebound without making contact first.',
    ]
  }

  return insights
}

async function getPlayerInsights(
  playerName: string,
  jersey: number,
  tree: DriverTreeOutput,
): Promise<string[]> {
  const tops     = tree.top_drivers.map(d => `${d.pillar}: ${d.delta >= 0 ? '+' : ''}${d.delta} vs team avg`).join(', ')
  const leakages = tree.leakage_areas.map(d => `${d.pillar}: ${d.delta} vs team avg`).join(', ')
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 900,
        messages: [{ role: 'user', content: `You are a youth basketball development coach. Based on this player's stats vs team average, write 3 individual training priorities. Each must connect a specific stat to a concrete practice habit or drill. Reference actual numbers from the data.

Player: #${jersey} ${playerName} (U12 basketball, Melbourne)

STRENGTHS (above team average): ${tops || 'none identified'}
DEVELOPMENT AREAS (below team average): ${leakages || 'none identified'}
Net PPP on-court: ${tree.net_ppp >= 0 ? '+' : ''}${tree.net_ppp}

${COACHING_WRITING_STANDARDS}

Return as a JSON array of 3 strings: ["note 1", "note 2", "note 3"]` }],
      }),
    })
    const d = await res.json()
    return JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim())
  } catch {
    return [
      `${playerName.split(' ')[0]}, get a live defender on you in every ball-handling rep at training. Tight spaces, game-speed reads, no clean looks. Your decision-making under pressure is what gets trained there — not in open gym.`,
      'Book 10 minutes before or after each session for catch-and-shoot reps. Set your feet on the catch before you think about the release. Consistent footwork is what makes the shot repeatable under pressure.',
      'In every defensive possession drill, call out your player\'s position before the ball moves. Talking means tracking. Get that habit automatic before you add the footwork.',
    ]
  }
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values, color = '#fbbf24', w = 90, h = 26 }: {
  values: number[]; color?: string; w?: number; h?: number
}) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rng = max - min || 0.01
  const pad = 3
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - pad * 2) + pad
    const y = h - pad - ((v - min) / rng) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = pts[pts.length - 1].split(',')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  )
}

// ── Metric progress bar row ──────────────────────────────────────────────────
function MetricBar({ m, side }: { m: MetricScore; side: 'off' | 'def' }) {
  const pos = m.delta >= 0
  const dColor = pos ? '#059669' : '#dc2626'
  const hasOpp = m.opp_value != null
  let barPct = 50
  if (hasOpp && m.opp_value !== 0) {
    const total = (m.value || 0) + (m.opp_value || 0)
    barPct = total > 0 ? Math.round((m.value / total) * 100) : 50
  }
  const fmtVal = (v: number | null) =>
    v == null ? '–' : m.format === 'pct' ? `${Number(v).toFixed(2)}%` : Number(v).toFixed(2)

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{m.name}</span>
        <span style={{ fontSize: 11, color: dColor, fontWeight: 700 }}>
          {pos ? '+' : ''}{typeof m.delta === 'number' ? m.delta : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 40, color: 'var(--text-primary)' }}>
          {fmtVal(m.value)}
        </span>
        {hasOpp && (
          <>
            <div style={{ flex: 1, height: 4, background: '#e2e5eb', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 2, background: pos ? '#059669' : '#dc2626' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>
              {fmtVal(m.opp_value)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Pillar card ──────────────────────────────────────────────────────────────
const PILLAR_ICONS: Record<string, string> = {
  'Shot Efficiency':      '🎯',
  'Possession Control':   '🔄',
  'Second Chances':       '⊕',
  'Rim Pressure':    '🔥',
  'Shot Suppression':     '🛡',
  'Possession Ending':    '📌',
  'Possession Creation':  '⚡',
  'Discipline':           '⚖️',
}

const PILLAR_TOOLTIPS: Record<string, string> = {
  'Shot Efficiency':       'Primary: TS% — True Shooting % accounts for 2-pointers, 3-pointers and free throws on equal footing. The most complete measure of scoring efficiency. Higher is better.',
  'Possession Control':    'Primary: TO% — Turnovers per estimated possession (TOs ÷ (FGA + 0.44×FTA + TOs)). Captures ball security relative to usage, not just raw count. Lower is better.',
  'Second Chances':        'Primary: OReb/G — Offensive rebounds per game. Each offensive board extends a possession, giving the team another scoring opportunity. Higher is better.',
  'Rim Pressure':     'Primary: FTF/G × (0.5 + 0.5 × FT%) — Rewards getting to the line with a conversion modifier. Full credit for makes, half credit for misses — drawing the foul still has value. Higher is better.',
  'Shot Suppression':      'Team: Opp eFG% — opponent shooting efficiency allowed. Player: BLK/G — best available proxy for shot contest activity. Note: individual shot suppression data (contested shots, opponent FG% when guarded) is not tracked in this dataset.',
  'Possession Ending':     'Primary: DReb/G — Defensive rebounds per game. Finishing defensive possessions denies second-chance points. Higher is better.',
  'Possession Creation':   'Primary: STL/G (player) / Def TO% (team) — Steals and forced turnovers that directly generate new possessions. Higher is better.',
  'Discipline':            'Primary: Def Fouls/G — Defensive fouls per game. Unnecessary fouling extends opponent possessions and surrenders free throw attempts. Lower is better.',
}

function PillarCard({ pillar, side, sparkValues, vsLabel = 'Opp', estimated = false, rank, totalRanked }: {
  pillar: PillarScore; side: 'off' | 'def'; sparkValues?: number[]; vsLabel?: string; estimated?: boolean
  rank?: number; totalRanked?: number
}) {
  const pos = pillar.delta >= 0
  const borderColor = pos ? '#059669' : '#dc2626'
  const accentColor = side === 'off' ? '#307b92' : '#1e6a82'
  const sparkColor  = pos ? '#059669' : '#dc2626'

  return (
    <div style={{
      background: '#ffffff',
      border: `2px solid ${borderColor}`,
      borderRadius: 12,
      padding: '14px 12px',
      minWidth: 0,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 20, marginBottom: 2 }}>{PILLAR_ICONS[pillar.name] ?? '📊'}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.3 }}>
            {pillar.name}
          </div>
          {PILLAR_TOOLTIPS[pillar.name] && (
            <div className="pillar-info">
              <span className="pillar-info-icon">i</span>
              <div className="pillar-info-tooltip">{PILLAR_TOOLTIPS[pillar.name]}</div>
            </div>
          )}
        </div>
        {estimated && (
          <div style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 6px', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Estimated
          </div>
        )}
        <div style={{ fontSize: 24, fontWeight: 800, color: accentColor, margin: '5px 0 2px' }}>
          {pillar.score}
        </div>
        {sparkValues && sparkValues.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '3px 0' }}>
            <Sparkline values={sparkValues} color={sparkColor} w={72} h={22} />
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>vs {vsLabel}: {pillar.opp_score}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: pos ? '#059669' : '#dc2626', marginTop: 2 }}>
          {pos ? '+' : ''}{pillar.delta}
        </div>
      </div>

      {/* Metrics — flex:1 ensures equal height */}
      <div style={{ flex: 1, borderTop: '1px solid #e2e5eb', paddingTop: 10 }}>
        {pillar.metrics.map((m, i) => (
          <MetricBar key={i} m={m} side={side} />
        ))}
      </div>

      {/* Player rank badge */}
      {rank != null && totalRanked != null && (
        <div style={{ borderTop: '1px solid #e2e5eb', marginTop: 8, paddingTop: 6, textAlign: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            color: rank === 1 ? '#d97706' : rank <= Math.ceil(totalRanked / 3) ? '#059669' : rank > Math.floor(totalRanked * 2 / 3) ? '#dc2626' : '#6b7280',
          }}>
            #{rank} of {totalRanked}
          </span>
          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>team rank</div>
        </div>
      )}
    </div>
  )
}

// ── KPI stat box ─────────────────────────────────────────────────────────────
function KPIStat({ label, value, opp, sparkValues, color = '#fbbf24', prefix = '' }: {
  label: string; value: string | number; opp?: string; sparkValues?: number[]; color?: string; prefix?: string
}) {
  return (
    <div style={{ textAlign: 'center', minWidth: 110 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
        {prefix}{value}
      </div>
      {sparkValues && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '5px 0 3px' }}>
          <Sparkline values={sparkValues} color={color} />
        </div>
      )}
      {opp && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>vs Opp: {opp}</div>}
    </div>
  )
}

// ── Tree connector ────────────────────────────────────────────────────────────
const LINE = '#e2e5eb'

function BranchConnector() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={{ width: 2, height: 16, background: LINE }} />
      <div style={{ width: '92%', height: 2, background: LINE }} />
      <div style={{ display: 'flex', width: '92%', justifyContent: 'space-around' }}>
        {[0,1,2,3].map(i => <div key={i} style={{ width: 2, height: 14, background: LINE }} />)}
      </div>
    </div>
  )
}

// ── Filter helpers ────────────────────────────────────────────────────────────
function applyFilter(allGames: any[], filter: FilterKey): any[] {
  const sorted = [...allGames].sort(
    (a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
  )
  switch (filter) {
    case 'last5':       return sorted.slice(0, 5)
    case 'last10':      return sorted.slice(0, 10)
    case 'wins':        return sorted.filter(g => g.result === 'W')
    case 'losses':      return sorted.filter(g => g.result === 'L')
    case 'close_games': return sorted.filter(g =>
      g.team_score != null && g.opponent_score != null &&
      Math.abs(g.team_score - g.opponent_score) < 6
    )
    default:            return sorted
  }
}

function contextLabel(games: any[], filter: FilterKey, isCustom: boolean): string {
  if (!games.length) return 'No games'
  const sorted = [...games].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime()
  )
  const wins   = games.filter(g => g.result === 'W').length
  const losses = games.filter(g => g.result === 'L').length
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const span = `${fmt(sorted[0].game_date)} – ${fmt(sorted[sorted.length - 1].game_date)}`
  const label = isCustom ? 'Custom Range' : (FILTER_CONFIG.find(f => f.key === filter)?.label ?? 'All Games')
  return `${label} · ${games.length} games (${wins}W ${losses}L) · ${span}`
}

// ── Per-game sparkline computation ───────────────────────────────────────────
function computePillarSparklines(
  sortedGameIds: string[],
  playerByGame: Record<string, any>,
  oppByGame: Record<string, any>,
) {
  const sparks = {
    shotEfficiency:      [] as number[],
    possessionControl:   [] as number[],
    extraPossessions:    [] as number[],
    pressureCreation:    [] as number[],
    shotSuppression:     [] as number[],
    possessionEnding:    [] as number[],
    pressureDisruption:  [] as number[],
    discipline:          [] as number[],
  }

  for (const id of sortedGameIds) {
    const us  = playerByGame[id]
    const opp = oppByGame[id]
    if (!us || !opp) continue

    const fga  = (us.twopt_att || 0) + (us.threept_att || 0)
    const poss = fga + 0.44 * (us.ft_att || 0) - (us.oreb || 0) + (us.turnovers || 0)

    const r1 = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0

    sparks.shotEfficiency.push(r1((us.twopt_made || 0) + 1.5 * (us.threept_made || 0), fga))
    sparks.possessionControl.push(r1(us.turnovers || 0, poss))
    sparks.extraPossessions.push(r1(us.oreb || 0, (us.oreb || 0) + (opp.opp_dreb || 0)))
    sparks.pressureCreation.push(r1(us.ft_made || 0, us.ft_att || 0))

    const oFga = (opp.opp_twopt_att || 0) + (opp.opp_threept_att || 0)
    sparks.shotSuppression.push(r1((opp.opp_twopt_made || 0) + 1.5 * (opp.opp_threept_made || 0), oFga))
    sparks.possessionEnding.push(r1(us.dreb || 0, (us.dreb || 0) + (opp.opp_oreb || 0)))
    sparks.pressureDisruption.push(r1(opp.opp_turnovers || 0, opp.opp_possessions || 1))
    sparks.discipline.push(us.def_fouls || 0)
  }

  return sparks
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string; games?: string; player?: string }>
}) {
  const { filter: rawFilter = 'all', type: rawType = 'all_types', games: gamesParam, player: playerId } = await searchParams
  const isCustom = !!gamesParam
  const filter     = (FILTER_CONFIG.some(f => f.key === rawFilter) ? rawFilter : 'all') as FilterKey
  const gameType   = (GAME_TYPE_CONFIG.some(t => t.key === rawType) ? rawType : 'all_types') as GameTypeKey

  // All games (for slider + filtering)
  const allGamesRaw = await fetchJson(
    `games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,game_type,opponents(full_name)&order=game_date.asc`
  )
  const allGames = Array.isArray(allGamesRaw) ? allGamesRaw : []

  // Apply filter or custom game IDs
  let filteredGames: any[]
  if (isCustom) {
    const specificIds = gamesParam!.split(',').filter(Boolean)
    filteredGames = allGames.filter(g => specificIds.includes(g.id))
  } else {
    filteredGames = applyFilter(allGames, filter)
    // Apply game type filter on top
    if (gameType !== 'all_types') {
      filteredGames = filteredGames.filter(g => g.game_type === gameType)
    }
  }
  const gameIds = filteredGames.map((g: any) => g.id)
  const idList  = `(${gameIds.join(',')})`

  // Fetch players list (always needed for selector)
  const playersRaw = await fetchJson(`players?team_id=eq.${TEAM_ID}&select=id,first_name,last_name,jersey_number&order=jersey_number.asc`)
  const allPlayers = Array.isArray(playersRaw)
    ? playersRaw.map((p: any) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, jersey: p.jersey_number }))
    : []

  // Fetch aggregates + per-game data + drills in parallel
  const [aggregates, perGameOpp, perGamePlayers, drillsRaw] = await Promise.all([
    getSeasonAggregates(TEAM_ID, filter === 'all' && !isCustom ? undefined : gameIds),
    fetchJson(
      `opponent_game_stats?select=game_id,opp_off_ppp,opp_def_ppp,opp_twopt_made,opp_twopt_att,opp_threept_made,opp_threept_att,opp_turnovers,opp_oreb,opp_dreb,opp_possessions&game_id=in.${idList}&order=game_id.asc`
    ),
    fetchJson(
      `player_game_stats?select=player_id,game_id,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,turnovers,ast,oreb,dreb,stl,blk,def_fouls,def_ppp,plus_minus&game_id=in.${idList}`
    ),
    fetchJson(`drills?select=*`),
  ])

  // Does this team have real opponent data?
  const hasOppData = Array.isArray(perGameOpp) && perGameOpp.length > 0

  // Build per-game lookup maps
  const oppByGame: Record<string, any>    = {}
  if (Array.isArray(perGameOpp)) {
    for (const r of perGameOpp) oppByGame[r.game_id] = r
  }

  const playerByGame: Record<string, any> = {}
  const perPlayerAgg: Record<string, {
    games: number; twopt_made: number; twopt_att: number; threept_made: number; threept_att: number
    ft_made: number; ft_att: number; turnovers: number; ast: number; oreb: number; dreb: number
    stl: number; blk: number; def_fouls: number; def_ppp_sum: number; plus_minus: number
  }> = {}

  if (Array.isArray(perGamePlayers)) {
    for (const r of perGamePlayers) {
      // per-game team aggregates
      if (!playerByGame[r.game_id]) {
        playerByGame[r.game_id] = { twopt_made:0, twopt_att:0, threept_made:0, threept_att:0,
          ft_made:0, ft_att:0, turnovers:0, oreb:0, dreb:0, def_fouls:0 }
      }
      const g = playerByGame[r.game_id]
      g.twopt_made   += r.twopt_made   || 0
      g.twopt_att    += r.twopt_att    || 0
      g.threept_made += r.threept_made || 0
      g.threept_att  += r.threept_att  || 0
      g.ft_made      += r.ft_made      || 0
      g.ft_att       += r.ft_att       || 0
      g.turnovers    += r.turnovers    || 0
      g.oreb         += r.oreb         || 0
      g.dreb         += r.dreb         || 0
      g.def_fouls    += r.def_fouls    || 0

      // per-player aggregates for ranking
      if (r.player_id) {
        if (!perPlayerAgg[r.player_id]) {
          perPlayerAgg[r.player_id] = { games:0, twopt_made:0, twopt_att:0, threept_made:0, threept_att:0,
            ft_made:0, ft_att:0, turnovers:0, ast:0, oreb:0, dreb:0, stl:0, blk:0, def_fouls:0, def_ppp_sum:0, plus_minus:0 }
        }
        const p = perPlayerAgg[r.player_id]
        p.games++
        p.twopt_made   += r.twopt_made   || 0
        p.twopt_att    += r.twopt_att    || 0
        p.threept_made += r.threept_made || 0
        p.threept_att  += r.threept_att  || 0
        p.ft_made      += r.ft_made      || 0
        p.ft_att       += r.ft_att       || 0
        p.turnovers    += r.turnovers    || 0
        p.ast          += r.ast          || 0
        p.oreb         += r.oreb         || 0
        p.dreb         += r.dreb         || 0
        p.stl          += r.stl          || 0
        p.blk          += r.blk          || 0
        p.def_fouls    += r.def_fouls    || 0
        p.def_ppp_sum  += r.def_ppp      || 0
        p.plus_minus   += r.plus_minus   || 0
      }
    }
  }

  // Helper: rank a player among all who played >= minGames
  function pillarRank(
    pid: string,
    getValue: (p: typeof perPlayerAgg[string]) => number,
    higherIsBetter: boolean,
    minGames = 3,
  ): { rank: number; total: number } {
    const entries = Object.entries(perPlayerAgg)
      .filter(([, p]) => p.games >= minGames)
      .map(([id, p]) => ({ id, value: getValue(p) }))
      .sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value)
    const idx = entries.findIndex(e => e.id === pid)
    return { rank: idx >= 0 ? idx + 1 : entries.length, total: entries.length }
  }

  // ── Player mode ──────────────────────────────────────────────────────────
  let playerTree: DriverTreeOutput | null = null
  let selectedPlayer: { id: string; name: string; jersey: number } | null = null
  let pillarRanks: { rank: number; total: number }[] | null = null
  const numGames = Math.max(Object.keys(playerByGame).length, 1)
  const numActivePlayers = Array.isArray(perGamePlayers) && perGamePlayers.length > 0
    ? perGamePlayers.length / numGames
    : 10

  if (playerId) {
    selectedPlayer = allPlayers.find((p: any) => p.id === playerId) ?? null

    // Fetch full player_game_stats for selected player (with all fields needed)
    const playerFullRaw = await fetchJson(
      `player_game_stats?player_id=eq.${playerId}&game_id=in.${idList}&select=points,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,turnovers,ast,oreb,dreb,stl,blk,def_fouls,off_fouls,plus_minus,vps,off_ppp,def_ppp,net_ppp`
    )

    if (Array.isArray(playerFullRaw) && playerFullRaw.length > 0) {
      const sum = (key: string) => playerFullRaw.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0)
      const avg = (key: string) => playerFullRaw.length > 0 ? sum(key) / playerFullRaw.length : 0

      const ps: PlayerStats = {
        games:        playerFullRaw.length,
        pts:          sum('points'),
        twopt_made:   sum('twopt_made'),    twopt_att:    sum('twopt_att'),
        threept_made: sum('threept_made'),  threept_att:  sum('threept_att'),
        ft_made:      sum('ft_made'),        ft_att:       sum('ft_att'),
        turnovers:    sum('turnovers'),      ast:          sum('ast'),
        oreb:         sum('oreb'),           dreb:         sum('dreb'),
        stl:          sum('stl'),            blk:          sum('blk'),
        def_fouls:    sum('def_fouls'),      off_fouls:    sum('off_fouls'),
        plus_minus:   sum('plus_minus'),     vps:          sum('vps'),
        off_ppp:      avg('off_ppp'),        def_ppp:      avg('def_ppp'),
        net_ppp:      avg('net_ppp'),
      }

      playerTree = computePlayerDriverTree(ps, aggregates, numActivePlayers)

      // Compute per-pillar ranks (all per-game rates to equalise unequal game counts)
      pillarRanks = [
        // Offensive
        pillarRank(playerId, p => {                                                        // Shot Efficiency — TS% higher better
          const fga = p.twopt_att + p.threept_att
          const pts = 2 * p.twopt_made + 3 * p.threept_made + p.ft_made
          const denom = 2 * (fga + 0.44 * p.ft_att)
          return denom > 0 ? pts / denom : 0
        }, true),
        pillarRank(playerId, p => {                                                        // Possession Control — TO% lower better
          const poss = p.twopt_att + p.threept_att + 0.44 * p.ft_att + p.turnovers
          return poss > 0 ? p.turnovers / poss : 999
        }, false),
        pillarRank(playerId, p => p.games > 0 ? p.oreb / p.games : 0, true),           // Second Chances — OReb/G higher better
        pillarRank(playerId, p => p.games > 0 && p.ft_att > 0                              // Rim Pressure — FTF/G × (0.5 + 0.5 × FT%) combined metric
          ? (p.ft_att / p.games) * (0.5 + 0.5 * (p.ft_made / p.ft_att)) : 0, true),
        // Defensive
        pillarRank(playerId, p => p.games > 0 ? p.blk / p.games : 0, true),            // Shot Suppression — BLK/G higher better (matches pillar score)
        pillarRank(playerId, p => p.games > 0 ? p.dreb / p.games : 0, true),           // Possession Ending — DReb/G higher better
        pillarRank(playerId, p => p.games > 0 ? p.stl / p.games : 0, true),            // Possession Creation — STL/G higher better (matches pillar score)
        pillarRank(playerId, p => p.games > 0 ? p.def_fouls / p.games : 999, false),   // Discipline — Def Fouls/G lower better
      ]
    }
  }

  const tree         = playerTree ?? computeDriverTree(aggregates)
  const isPlayerMode = !!playerTree

  // Build full pillar list for insight selection (all 8, sorted by |delta|)
  const allPillarDrivers = [
    ...tree.pillars.offensive,
    ...tree.pillars.defensive,
  ].map(p => ({ pillar: p.name, delta: p.delta }))

  const insights = isPlayerMode && selectedPlayer
    ? await getPlayerInsights(selectedPlayer.name, selectedPlayer.jersey, tree)
    : await getInsightsFromDB(allPillarDrivers, SB_URL, SB_KEY)

  // Drills matched to current leakage areas (team or player)
  const allDrills: DashboardDrill[] = Array.isArray(drillsRaw) ? drillsRaw : []
  const relevantDrills = getRelevantDashboardDrills(tree.leakage_areas, allDrills)

  // Sorted game IDs for sparklines (chronological)
  const sortedGameIds = [...filteredGames]
    .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())
    .map(g => g.id)

  const pillarSparks = computePillarSparklines(sortedGameIds, playerByGame, oppByGame)

  // KPI sparklines
  const offTrend = sortedGameIds.map(id => oppByGame[id]?.opp_def_ppp).filter(Boolean).map(Number)
  const defTrend = sortedGameIds.map(id => oppByGame[id]?.opp_off_ppp).filter(Boolean).map(Number)
  const netTrend = offTrend.map((o, i) => o - defTrend[i])

  const netPos = tree.net_ppp > 0
  const pace   = aggregates.possessions / aggregates.games

  // Slider + picker game lists (always full season, sorted oldest→newest)
  const sliderGames = allGames.map((g: any) => ({
    id:    g.id,
    label: new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
  }))

  const pickerGames: PickerGame[] = allGames.map((g: any) => ({
    id:       g.id,
    label:    new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    opponent: g.opponents?.full_name ?? 'Unknown',
    result:   g.result as 'W' | 'L',
    score:    `${g.team_score}-${g.opponent_score}`,
  }))

  const BG     = '#f4f5f7'
  const CARD   = '#ffffff'
  const BORDER = '#e2e5eb'

  return (
    <main style={{ background: BG, minHeight: '100vh', color: 'var(--text-primary)', fontFamily: "'Inter', system-ui, sans-serif", WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', padding: '0 0 40px' }}>
      <style>{`
        .pillar-info { position: relative; display: inline-flex; align-items: center; cursor: help; }
        .pillar-info-icon {
          width: 13px; height: 13px; border-radius: 50%;
          background: #eef1f6; border: 1px solid #c5d5e8;
          color: #374151; font-size: 8px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center;
          font-style: italic; line-height: 1; flex-shrink: 0;
        }
        .pillar-info-tooltip {
          visibility: hidden; opacity: 0;
          position: absolute; bottom: calc(100% + 6px); left: 50%;
          transform: translateX(-50%);
          background: #ffffff; border: 1px solid #e2e5eb;
          border-radius: 8px; padding: 9px 11px;
          font-size: 11px; color: #374151; line-height: 1.55;
          width: 210px; text-align: left; z-index: 200;
          transition: opacity 0.15s ease;
          pointer-events: none;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
          font-weight: 400; text-transform: none; letter-spacing: 0;
        }
        .pillar-info:hover .pillar-info-tooltip { visibility: visible; opacity: 1; }
      `}</style>

      {/* ── Header row 1 ── */}
      <div style={{ background: '#ffffff', borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
              COACHING INTELLIGENCE DASHBOARD
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
              WGT 12.2 — {contextLabel(filteredGames, filter, isCustom)} &nbsp;·&nbsp;
              <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Suspense fallback={<div style={{ width: 200, height: 28 }} />}>
              <FilterBar current={isCustom ? 'all' : filter} currentType={isCustom ? 'all_types' : gameType} />
            </Suspense>
            <Suspense fallback={<div style={{ width: 100, height: 28 }} />}>
              <GamePicker games={pickerGames} />
            </Suspense>
            <Suspense fallback={<div style={{ width: 160, height: 28 }} />}>
              <PlayerSelector players={allPlayers} currentPlayerId={playerId} />
            </Suspense>
          </div>
        </div>

        {/* ── Date slider row ── */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Suspense fallback={<div style={{ width: 280, height: 60 }} />}>
            <DateSlider games={sliderGames} />
          </Suspense>
          {isCustom && (
            <div style={{ fontSize: 11, color: '#307b92', fontStyle: 'italic' }}>
              Custom range active — use quick filters or Reset to clear
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '0 28px' }}>

        {/* ── KPI Bar ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1.6fr 1fr 1fr',
          gap: 2,
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '22px 28px',
          marginTop: 20,
          alignItems: 'center',
        }}>
          <KPIStat
            label={isPlayerMode ? 'Off PPP (On-Court)' : 'Offensive PPP'}
            value={tree.off_ppp}
            opp={isPlayerMode ? undefined : String(tree.opp_off_ppp)}
            sparkValues={offTrend} color="#97cfdc"
          />
          <KPIStat
            label={isPlayerMode ? 'Def PPP (On-Court)' : 'Defensive PPP'}
            value={tree.def_ppp}
            opp={isPlayerMode ? undefined : String(tree.opp_def_ppp)}
            sparkValues={defTrend} color="#7a9eb5"
          />

          {/* Net PPP / Player Net hero */}
          <div style={{
            textAlign: 'center', background: netPos ? '#ecfdf5' : '#fef2f2',
            border: `2px solid ${netPos ? '#059669' : '#dc2626'}`,
            borderRadius: 12, padding: '14px 20px',
          }}>
            <div style={{ fontSize: 11, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
              {isPlayerMode ? `#${selectedPlayer?.jersey} ${selectedPlayer?.name}` : 'NET PPP'}
            </div>
            <div style={{ fontSize: 46, fontWeight: 900, color: netPos ? '#059669' : '#dc2626', lineHeight: 1 }}>
              {netPos ? '+' : ''}{tree.net_ppp}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 4px' }}>
              <Sparkline values={netTrend} color={netPos ? '#059669' : '#dc2626'} w={120} h={30} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, margin: '0 auto', lineHeight: 1.5 }}>
              {isPlayerMode
                ? `Net PPP ${netPos ? '+' : ''}${tree.net_ppp} on-court this period.`
                : `We score ${netPos ? '+' : ''}${tree.net_ppp} more points per possession than opponents.`}
            </div>
            {isPlayerMode && selectedPlayer && (
              <a
                href={`/players/${selectedPlayer.id}`}
                style={{ display: 'inline-block', marginTop: 10, fontSize: 10, fontWeight: 700, color: '#307b92', textDecoration: 'none', background: '#eef1f6', border: '1px solid #c5d5e8', borderRadius: 20, padding: '4px 12px', letterSpacing: '0.06em' }}
              >
                VIEW FULL PROFILE →
              </a>
            )}
          </div>

          <KPIStat
            label={isPlayerMode ? 'Games Played' : 'Pace (Poss/G)'}
            value={isPlayerMode ? tree.pace : pace.toFixed(1)}
            opp={isPlayerMode ? undefined : (aggregates.opp_possessions / aggregates.games).toFixed(1)}
            color="#fbbf24"
          />
          <KPIStat
            label={isPlayerMode ? 'vs Team Avg' : 'Possessions'}
            value={isPlayerMode ? `${aggregates.games} gms` : Math.round(aggregates.possessions).toLocaleString()}
            opp={isPlayerMode ? undefined : Math.round(aggregates.opp_possessions).toLocaleString()}
            color="#fbbf24"
          />
        </div>

        {/* ── Tree ── */}
        <div style={{ marginTop: 24 }}>

          {/* Top stem */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 2, height: 16, background: LINE }} />
          </div>

          {/* OFFENCE / DEFENCE branch nodes */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: '50%', borderTop: `2px solid ${LINE}`, borderLeft: `2px solid ${LINE}`, height: 16 }} />
              </div>
              <div style={{ background: CARD, border: `2px solid #307b92`, borderRadius: 10, padding: '10px 16px', textAlign: 'center', width: 160, margin: '0 auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#307b92', letterSpacing: '0.1em' }}>{isPlayerMode ? 'OFFENSIVE' : 'OFFENCE PPP'}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#307b92' }}>{tree.off_ppp}</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ width: '50%', borderTop: `2px solid ${LINE}`, borderRight: `2px solid ${LINE}`, height: 16 }} />
              </div>
              <div style={{ background: CARD, border: `2px solid #1e6a82`, borderRadius: 10, padding: '10px 16px', textAlign: 'center', width: 160, margin: '0 auto' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e6a82', letterSpacing: '0.1em' }}>{isPlayerMode ? 'DEFENSIVE' : 'DEFENCE PPP'}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#1e6a82' }}>{tree.def_ppp}</div>
              </div>
            </div>
          </div>

          {/* Single full-width connector bar → 8 drops */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ width: 2, height: 16, background: LINE }} />
            <div style={{ width: '99%', height: 2, background: LINE }} />
            <div style={{ display: 'flex', width: '99%', justifyContent: 'space-around' }}>
              {[0,1,2,3,4,5,6,7].map(i => (
                <div key={i} style={{ width: 2, height: 14, background: LINE }} />
              ))}
            </div>
          </div>

          {/* Data quality warning — shown when no opponent stats available */}
          {!isPlayerMode && !hasOppData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '7px 14px', margin: '0 0 10px', fontSize: 11, color: '#92400e' }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span><strong>Defensive analysis is estimated.</strong> No opponent box score was found for this team. Upload opponent stats to unlock accurate defensive metrics.</span>
            </div>
          )}

          {/* All 8 pillar cards in ONE grid row → all same height automatically */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 8,
            alignItems: 'stretch',
          }}>
            {tree.pillars.offensive.map((p, i) => (
              <PillarCard key={`off-${i}`} pillar={p} side="off"
                vsLabel={isPlayerMode ? 'Team Avg' : 'Opp'}
                sparkValues={[pillarSparks.shotEfficiency, pillarSparks.possessionControl, pillarSparks.extraPossessions, pillarSparks.pressureCreation][i]}
                rank={pillarRanks?.[i]?.rank} totalRanked={pillarRanks?.[i]?.total} />
            ))}
            {tree.pillars.defensive.map((p, i) => (
              <PillarCard key={`def-${i}`} pillar={p} side="def"
                vsLabel={isPlayerMode ? 'Team Avg' : 'Opp'}
                estimated={!isPlayerMode && !hasOppData}
                sparkValues={[pillarSparks.shotSuppression, pillarSparks.possessionEnding, pillarSparks.pressureDisruption, pillarSparks.discipline][i]}
                rank={pillarRanks?.[4 + i]?.rank} totalRanked={pillarRanks?.[4 + i]?.total} />
            ))}
          </div>
        </div>

        {/* ── Bottom Summary ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.3fr', gap: 16, marginTop: 28 }}>

          {/* Top Drivers */}
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, background: '#059669', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📈</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{isPlayerMode ? 'TOP CONTRIBUTIONS' : 'TOP POSITIVE DRIVERS'}</span>
            </div>
            {tree.top_drivers.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < tree.top_drivers.length - 1 ? `1px solid #a7f3d0` : 'none' }}>
                <span style={{ fontSize: 12, color: '#374151' }}>• {d.pillar}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                  +{d.delta}
                  {!isPlayerMode && PILLAR_DELTA_UNIT[d.pillar] && (
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#6b7280', marginLeft: 3 }}>
                      {PILLAR_DELTA_UNIT[d.pillar]}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Leakage */}
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, background: '#dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📉</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{isPlayerMode ? 'DEVELOPMENT AREAS' : 'BIGGEST LEAKAGE AREAS'}</span>
            </div>
            {tree.leakage_areas.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < tree.leakage_areas.length - 1 ? `1px solid #fca5a5` : 'none' }}>
                <span style={{ fontSize: 12, color: '#374151' }}>• {d.pillar}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                  {d.delta}
                  {!isPlayerMode && PILLAR_DELTA_UNIT[d.pillar] && (
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#6b7280', marginLeft: 3 }}>
                      {PILLAR_DELTA_UNIT[d.pillar]}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Key Takeaways */}
          {(() => {
            const takeaways: string[] = isPlayerMode && selectedPlayer
              ? [
                  `Net PPP on-court is ${netPos ? '+' : ''}${tree.net_ppp} across the selected games. ${netPos ? 'A positive contribution across most possessions played.' : 'Opponents hold the efficiency edge when this player is on court.'}`,
                  tree.top_drivers[0]
                    ? `${tree.top_drivers[0].pillar} is the biggest strength. ${PILLAR_TRANSLATION[tree.top_drivers[0].pillar]?.strength ?? 'Keep building on this at training.'}`
                    : 'No clear positive driver identified in this sample. Broaden the date range for fuller context.',
                  tree.leakage_areas[0]
                    ? `${tree.leakage_areas[0].pillar} is the main development area. ${PILLAR_TRANSLATION[tree.leakage_areas[0].pillar]?.weakness ?? 'Target this at training.'}`
                    : 'No significant leakage identified. Check the pillar cards for individual metric detail.',
                ]
              : tree.top_drivers.length > 0
                ? [
                    `Net PPP of ${netPos ? '+' : ''}${tree.net_ppp} across ${filteredGames.length} game${filteredGames.length !== 1 ? 's' : ''}. ${netPos ? 'The team is scoring more points per possession than opponents.' : 'Opponents hold the efficiency advantage in this sample.'}`,
                    `${tree.top_drivers[0].pillar} is the strongest driver. ${PILLAR_TRANSLATION[tree.top_drivers[0].pillar]?.strength ?? 'Keep building on this at training.'}`,
                    tree.leakage_areas[0]
                      ? `${tree.leakage_areas[0].pillar} is the biggest gap. ${PILLAR_TRANSLATION[tree.leakage_areas[0].pillar]?.weakness ?? 'Target this at the next training session.'}`
                      : 'No significant leakage areas in this sample. Check the pillar cards for individual metric detail.',
                  ]
                : tree.leakage_areas.length > 0
                  ? [
                      `Net PPP of ${netPos ? '+' : ''}${tree.net_ppp} across ${filteredGames.length} game${filteredGames.length !== 1 ? 's' : ''}. Opponents hold the efficiency advantage across most pillars in this sample.`,
                      `${tree.leakage_areas[0].pillar} is the largest gap. ${PILLAR_TRANSLATION[tree.leakage_areas[0].pillar]?.weakness ?? 'Start here at training.'}`,
                      tree.leakage_areas[1]
                        ? `${tree.leakage_areas[1].pillar} is the second area to address. ${PILLAR_TRANSLATION[tree.leakage_areas[1].pillar]?.weakness ?? 'Work this into the next session after the primary gap is covered.'}`
                        : 'Broaden the date range for fuller driver analysis.',
                    ]
                  : [
                      `Net PPP: ${netPos ? '+' : ''}${tree.net_ppp}.`,
                      'Select a broader date range for full driver analysis.',
                      'Individual pillar cards show the underlying metric detail.',
                    ]

            return (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, background: '#eef1f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>💡</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92' }}>KEY TAKEAWAYS</span>
                </div>
                {takeaways.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < takeaways.length - 1 ? 10 : 0, alignItems: 'flex-start' }}>
                    <div style={{ width: 20, height: 20, background: '#eef1f6', border: '1px solid #c5d5e8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#307b92', flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{t}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* AI Coaching Priorities */}
          <div style={{ background: '#eef1f6', border: `1px solid #c5d5e8`, borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, background: '#307b92', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92' }}>
                {isPlayerMode ? `${selectedPlayer?.name?.split(' ')[0].toUpperCase()} — DEVELOPMENT PLAN` : 'COACHING PRIORITIES'}
              </span>
              <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>Powered by Claude</span>
            </div>
            {insights.map((insight, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, background: '#307b92', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{insight}</p>
              </div>
            ))}
          </div>

          {/* Recommended Drills */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, background: '#059669', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏀</div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>RECOMMENDED DRILLS</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>
                  {relevantDrills.length > 0
                    ? `matched to ${isPlayerMode ? 'development' : 'leakage'} pillars · click to expand`
                    : 'no leakage pillars identified'}
                </span>
              </div>
              <a href="/drills" style={{
                fontSize: 10, fontWeight: 600, color: '#059669',
                textDecoration: 'none', letterSpacing: '0.05em',
              }}>FULL LIBRARY →</a>
            </div>
            <DashboardDrillCards drills={relevantDrills} />
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {isPlayerMode
                ? `Player metrics vs team average per player (÷ ${allPlayers.length} roster). Data via Hoopsalytics.`
                : 'All metrics calculated from season totals. Comparison vs season average opponent. Data via Hoopsalytics.'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 1, height: 20, background: '#e2e5eb' }} />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>Powered by</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#307b92', letterSpacing: '0.04em' }}>
                CMD Sports Analytics
              </span>
            </div>
          </div>
          <div style={{
            borderTop: `1px solid ${BORDER}`, paddingTop: 12,
            textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7,
          }}>
            © {new Date().getFullYear()} CMD Sports Pty Ltd. All rights reserved. Courtside IQ and the Coaching Intelligence Dashboard are proprietary products of CMD Sports Pty Ltd.
            Unauthorised reproduction, distribution, or use of this software, its analytics frameworks, or output data is strictly prohibited.
            All intellectual property, including the Net PPP Value Driver Tree methodology, coaching intelligence algorithms, and data visualisations, remain the exclusive property of CMD Sports Pty Ltd.
          </div>
        </div>

      </div>
    </main>
  )
}
