// Individual Player Development Page
// Offensive pillars: full cards with ranks
// Defensive section: flat stat grid
// AI sections: key insights, coaching priorities, suggested drills

import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { computePlayerDriverTree, PlayerStats, PillarScore, MetricScore } from '@/lib/driverTree'
import { COACHING_WRITING_STANDARDS } from '@/lib/writingStandards'
import PlayerDrillCards, { type PlayerDrill } from './PlayerDrillCards'
import { FilterBar } from '@/app/dashboard/FilterBar'
import { GamePicker, type PickerGame } from '@/app/dashboard/GamePicker'
import type { FilterKey, GameTypeKey } from '@/app/dashboard/filterConfig'
import { FILTER_CONFIG, GAME_TYPE_CONFIG } from '@/app/dashboard/filterConfig'

// ── Tooltip content ───────────────────────────────────────────────────────────
const PILLAR_TOOLTIPS: Record<string, string> = {
  'Shot Efficiency':     'Primary: TS% — True Shooting % accounts for 2-pointers, 3-pointers and free throws on equal footing. The most complete measure of scoring efficiency. Higher is better.',
  'Possession Control':  'Primary: TO% — Turnovers per estimated possession (TOs ÷ (FGA + 0.44×FTA + TOs)). Captures ball security relative to usage, not just raw count. Lower is better.',
  'Second Chances':      'Primary: OReb/G — Offensive rebounds per game. Each offensive board extends a possession and creates another scoring opportunity. Higher is better.',
  'Rim Pressure':        'Primary: FTF/G × (0.5 + 0.5 × FT%) — Rewards getting to the line with a conversion modifier. Full credit for makes, half credit for misses. Higher is better.',
}

const DEF_STAT_TOOLTIPS: Record<string, string> = {
  'Blocks / Game':        'BLK/G — Shots blocked per game. Each block directly prevents the opponent from scoring. Best available individual proxy for shot contest activity. Higher is better.',
  'Def Rebounds / Game':  'DReb/G — Defensive rebounds per game. Securing the defensive board ends the opponent\'s possession and denies second-chance opportunities. Higher is better.',
  'Steals / Game':        'STL/G — Steals per game. A steal is a direct possession creation event — it ends the opponent\'s possession and starts a new one. Higher is better.',
  'Def Fouls / Game':     'Def Fouls/G — Defensive fouls per game. Unnecessary fouling extends opponent possessions and surrenders free throw attempts. Lower is better.',
  'Off Fouls / Game':     'Off Fouls/G — Offensive fouls per game. An offensive foul surrenders possession immediately. Lower is better.',
}

export const dynamic = 'force-dynamic'

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

async function fetchJson(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  return res.json()
}

// ── AI development content ────────────────────────────────────────────────────
interface DevelopmentContent {
  insights: string[]
  workOns: string[]
}

// ── Pillar name → DB pillar key ────────────────────────────────────────────────
const PILLAR_DB_MAP: Record<string, string> = {
  'Shot Efficiency':    'shot_efficiency',
  'Possession Control': 'possession_control',
  'Second Chances':     'extra_possessions',
  'Rim Pressure':       'pressure_creation',
}

function getRelevantDrills(
  leakageAreas: { pillar: string }[],
  allDrills: PlayerDrill[],
): PlayerDrill[] {
  const weakPillars = leakageAreas
    .map(d => PILLAR_DB_MAP[d.pillar])
    .filter(Boolean)

  if (weakPillars.length === 0) {
    // No leakage areas — pick a couple of foundation drills
    return allDrills.filter(d => d.difficulty === 'foundation').slice(0, 3)
  }

  const result: PlayerDrill[] = []
  for (const pillar of weakPillars) {
    const matches = allDrills
      .filter(d => d.pillar === pillar)
      .sort((a, b) => (a as any).difficulty_order - (b as any).difficulty_order)
      .slice(0, 2)
    result.push(...matches)
    if (result.length >= 4) break
  }
  return result.slice(0, 4)
}

interface WinLossSplit {
  wins:   number
  losses: number
  pts_w:   number | null; pts_l:   number | null
  ts_w:    number | null; ts_l:    number | null
  to_w:    number | null; to_l:    number | null
  reb_w:   number | null; reb_l:   number | null
  stl_w:   number | null; stl_l:   number | null
  ftf_w:   number | null; ftf_l:   number | null
}

async function getDevelopmentContent(
  playerName: string,
  jersey: number,
  tree: ReturnType<typeof computePlayerDriverTree>,
  stats: { ppg: number; ts: number; to_pct: number; oreb_pg: number; dreb_pg: number; stl_pg: number; blk_pg: number; ftf_pg: number; ft_pct: number },
  teamAvgs: { ts: number; to_pct: number; oreb_pg: number; dreb_pg: number; stl_pg: number; blk_pg: number; ftf_pg: number; ft_pct: number; ppg: number },
  ranks: { label: string; rank: number; total: number }[],
  winLoss: WinLossSplit,
  outlierSummary: string,
  biggestWlSplit: { label: string; w: number | null; l: number | null; lowerBetter?: boolean } | null,
): Promise<DevelopmentContent> {
  const first = playerName.split(' ')[0]

  // Full stat table with team avg and rank for every metric
  const comparisonRows = [
    { stat: 'PPG',        player: stats.ppg,     team: teamAvgs.ppg,    unit: '',  lowerBetter: false, rank: ranks[0] },
    { stat: 'TS%',        player: stats.ts,      team: teamAvgs.ts,     unit: '%', lowerBetter: false, rank: ranks[0] },
    { stat: 'TO%',        player: stats.to_pct,  team: teamAvgs.to_pct, unit: '%', lowerBetter: true,  rank: ranks[1] },
    { stat: 'FTF/G',      player: stats.ftf_pg,  team: teamAvgs.ftf_pg, unit: '',  lowerBetter: false, rank: ranks[3] },
    { stat: 'FT%',        player: stats.ft_pct,  team: teamAvgs.ft_pct, unit: '%', lowerBetter: false, rank: ranks[3] },
    { stat: 'OReb/G',     player: stats.oreb_pg, team: teamAvgs.oreb_pg,unit: '',  lowerBetter: false, rank: ranks[2] },
    { stat: 'DReb/G',     player: stats.dreb_pg, team: teamAvgs.dreb_pg,unit: '',  lowerBetter: false, rank: ranks[5] },
    { stat: 'STL/G',      player: stats.stl_pg,  team: teamAvgs.stl_pg, unit: '',  lowerBetter: false, rank: ranks[6] },
    { stat: 'BLK/G',      player: stats.blk_pg,  team: teamAvgs.blk_pg, unit: '',  lowerBetter: false, rank: ranks[4] },
  ]
  const compTable = comparisonRows.map(r => {
    const diff = Math.round((r.player - r.team) * 10) / 10
    const dir  = r.lowerBetter ? (diff <= 0 ? '✓ better' : '✗ worse') : (diff >= 0 ? '✓ above' : '✗ below')
    return `${r.stat}: ${r.player}${r.unit} (team avg ${r.team}${r.unit}, ${diff >= 0 ? '+' : ''}${diff} ${dir}, ranked #${r.rank.rank} of ${r.rank.total})`
  }).join('\n')

  // Win/loss split
  const fmt = (v: number | null) => v != null ? String(v) : 'n/a'
  const wlLines = winLoss.wins + winLoss.losses >= 3 ? [
    `Games: ${winLoss.wins}W / ${winLoss.losses}L`,
    `PTS:   ${fmt(winLoss.pts_w)} in wins vs ${fmt(winLoss.pts_l)} in losses`,
    `TS%:   ${fmt(winLoss.ts_w)}% in wins vs ${fmt(winLoss.ts_l)}% in losses`,
    `TO:    ${fmt(winLoss.to_w)} in wins vs ${fmt(winLoss.to_l)} in losses`,
    `REB:   ${fmt(winLoss.reb_w)} in wins vs ${fmt(winLoss.reb_l)} in losses`,
    `STL:   ${fmt(winLoss.stl_w)} in wins vs ${fmt(winLoss.stl_l)} in losses`,
    `FTF:   ${fmt(winLoss.ftf_w)} in wins vs ${fmt(winLoss.ftf_l)} in losses`,
    biggestWlSplit ? `→ Biggest split: ${biggestWlSplit.label} (${fmt(biggestWlSplit.w)} wins / ${fmt(biggestWlSplit.l)} losses)` : '',
  ].filter(Boolean).join('\n') : 'Insufficient win/loss split data for this sample.'

  const rankSummary = ranks.map(r => `${r.label}: #${r.rank} of ${r.total}`).join(', ')
  const tops     = tree.top_drivers.map(d => d.pillar).join(', ')
  const leakages = tree.leakage_areas.map(d => d.pillar).join(', ')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 2600,
        messages: [{ role: 'user', content: `You are a youth basketball development coach writing a player development report for a U12 team in Melbourne (WGT 12.2, 29 games, 22–7 record).

Player: #${jersey} ${playerName}
Net PPP on-court: ${tree.net_ppp >= 0 ? '+' : ''}${tree.net_ppp}
Driver tree pillars (ranked): ${rankSummary}
Top performing pillars: ${tops || 'none identified'}
Development pillars: ${leakages || 'none identified'}

FULL STAT PROFILE vs TEAM AVERAGE AND PEER RANK (${ranks[0].total} players, min 5 games):
${compTable}

${outlierSummary}

WIN / LOSS SPLIT:
${wlLines}

U12 REFERENCE BENCHMARKS (Melbourne competition level):
- TS% > 52% = efficient; 42–52% = developing; < 42% = inefficient
- TO% < 20% = strong; 20–28% = manageable; > 28% = high-risk
- FT% > 65% = reliable; 50–65% = inconsistent; < 50% = significant gap
- FTF/G > 3.0 = consistent rim pressure; < 1.5 = not attacking the rim
- OReb/G > 2.0 = active on glass; DReb/G > 2.5 = strong possession finisher
- STL/G > 1.5 = active, disruptive; BLK/G > 0.5 = shot deterrent

${COACHING_WRITING_STANDARDS}

Return valid JSON — no markdown, no preamble:
{
  "insights": ["string", "string", "string"],
  "workOns": ["string", "string", "string"]
}

INSIGHT RULES:
The STRENGTHS and DEVELOPMENT AREAS above show where this player stands out relative to their peers — use these as your starting points, not your own assumptions about what matters in basketball.

Do not default to TS%, turnovers, and rebounds for every player. Each player has different outliers. A player whose biggest positive outlier is STL/G and biggest negative outlier is FT% should get insights about those stats — not generic shooting and ball security.

Write 3 insights. Together they must give a balanced picture: at least one insight covers a genuine strength, at least one covers a real development need. If a combination of stats tells a more interesting story than any single stat (e.g. high FTF/G but low FT%, strong defensive stats but costly fouls), lead with that connection.

Every insight must:
- Be grounded in this player's actual outlier data and peer ranks
- State specific numbers with team average and/or peer rank for context ("2.8 STL/G, ranked #1 on the team" not "a strong defender")
- Reference U12 benchmarks only where they genuinely add context
- Address ${first} by first name
- Be 2–4 sentences, direct, no filler or hollow affirmations

WORKONS — 3 specific training priorities that follow directly from the development areas in the insights. Imperative voice. Each names a concrete habit or physical skill, not a general category. Address ${first} by first name.` }],
      }),
    })
    const d = await res.json()
    if (d.error) {
      console.error('[AI] Anthropic error:', JSON.stringify(d.error))
      throw new Error(d.error.message)
    }
    const text = d.content?.[0]?.text?.replace(/```json|```/g, '').trim()
    if (!text) {
      console.error('[AI] No text in response:', JSON.stringify(d))
      throw new Error('No text content in response')
    }
    return JSON.parse(text)
  } catch (err) {
    console.error('[AI] getDevelopmentContent failed:', err)
    return {
      insights: [
        `${first} scores ${stats.ppg} points per game at a TS% of ${stats.ts}% — ${stats.ts >= 52 ? 'above the U12 efficiency benchmark of 52%' : stats.ts >= 42 ? 'in the developing range for U12 (42–52%)' : 'below the U12 average threshold of 42%'}. True Shooting captures scoring efficiency across all shot types. The number tells you how many points are being generated per scoring attempt, not just how many shots go in.`,
        `Turnover rate is ${stats.to_pct}% — ${stats.to_pct < 20 ? 'strong ball security by U12 standards (benchmark: under 20%)' : stats.to_pct < 28 ? 'in the manageable range but with room to improve (benchmark: under 20% is strong)' : 'above the high-risk threshold for U12 (28%+)'}. Every turnover gives the opponent a possession without a shot being taken. At this level, ball security under pressure is one of the most direct drivers of point differential.`,
        `${first} averages ${stats.dreb_pg} defensive rebounds and ${stats.stl_pg} steals per game. Defensive rebounding ends possessions cleanly; steals create new ones. ${stats.dreb_pg >= 2.5 ? 'Both numbers suggest an engaged, active defender' : 'There is room to be more active on the defensive end'} — and together they reflect how much this player is contributing to possession control on the defensive side of the ball.`,
      ],
      workOns: [
        `${first}, work on shot selection before shot making — choose attempts that sit inside your range and inside the team's offensive structure.`,
        `Ball security under pressure: every live-ball rep at training, absorb contact from a defender before making the decision to pass or drive.`,
        `Box out on every defensive miss — two hands on your player before you turn to find the ball. Consistency here converts to possessions.`,
      ],
    }
  }
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
// Static SVG — no client component needed. Renders a mini trend line.
function Sparkline({ values, color = '#97cfdc', width = 64, height = 22 }: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  const innerH = height - pad * 2
  const innerW = width - pad * 2
  const step = innerW / (values.length - 1)

  const points = values.map((v, i) => {
    const x = pad + i * step
    const y = pad + innerH - ((v - min) / range) * innerH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Last point dot
  const last = values[values.length - 1]
  const lx = pad + (values.length - 1) * step
  const ly = pad + innerH - ((last - min) / range) * innerH

  // Trend: last vs first half avg
  const half = Math.floor(values.length / 2)
  const firstAvg = values.slice(0, half).reduce((s, v) => s + v, 0) / half
  const lastAvg  = values.slice(half).reduce((s, v) => s + v, 0) / (values.length - half)
  const trending = lastAvg > firstAvg + range * 0.05 ? 'up'
    : lastAvg < firstAvg - range * 0.05 ? 'down' : 'flat'
  const dotColor = trending === 'up' ? '#34d399' : trending === 'down' ? '#f87171' : color

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', flexShrink: 0 }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
      />
      <circle cx={lx} cy={ly} r={2.5} fill={dotColor} opacity={0.95} />
    </svg>
  )
}

// ── Pillar card (offensive) ───────────────────────────────────────────────────
function PillarCard({ pillar, rank, totalRanked, sparklines }: {
  pillar: PillarScore
  rank?: number
  totalRanked?: number
  sparklines?: Record<string, number[]>
}) {
  const pos = pillar.delta >= 0
  const borderColor = pos ? '#34d399' : '#f87171'
  const tooltip = PILLAR_TOOLTIPS[pillar.name]

  return (
    <div style={{
      background: '#1a2a40',
      border: `2px solid ${borderColor}`,
      borderRadius: 12,
      padding: '16px 14px',
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a0a8bc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {pillar.name}
          </div>
          {tooltip && (
            <div className="pillar-info">
              <span className="pillar-info-icon">i</span>
              <div className="pillar-info-tooltip">{tooltip}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#97cfdc', margin: '6px 0 2px' }}>
          {pillar.score}
        </div>
        <div style={{ fontSize: 10, color: '#6d7894' }}>team avg: {pillar.opp_score}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: pos ? '#34d399' : '#f87171', marginTop: 2 }}>
          {pos ? '+' : ''}{pillar.delta}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #1e3a5f', paddingTop: 10, flex: 1 }}>
        {pillar.metrics.map((m, i) => (
          <MetricRow key={i} m={m} sparkline={sparklines?.[m.name]} />
        ))}
      </div>

      {rank != null && totalRanked != null && (
        <div style={{ borderTop: '1px solid #1e3a5f', marginTop: 8, paddingTop: 6, textAlign: 'center' }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: rank === 1 ? '#fbbf24'
              : rank <= Math.ceil(totalRanked / 3) ? '#34d399'
              : rank > Math.floor(totalRanked * 2 / 3) ? '#f87171'
              : '#a0a8bc',
          }}>
            #{rank} of {totalRanked}
          </span>
          <div style={{ fontSize: 9, color: '#6d7894', marginTop: 1 }}>team rank</div>
        </div>
      )}
    </div>
  )
}

function MetricRow({ m, sparkline }: { m: MetricScore; sparkline?: number[] }) {
  const pos = m.delta >= 0
  const maxVal = Math.max(m.value, m.opp_value, 0.01)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: '#a0a8bc', fontWeight: 600 }}>{m.name}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#e8eaf0' }}>{m.value}{m.format === 'pct' ? '%' : ''}</span>
          <span style={{ fontSize: 9, color: '#6d7894' }}>avg {m.opp_value}{m.format === 'pct' ? '%' : ''}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: pos ? '#34d399' : '#f87171' }}>{pos ? '+' : ''}{m.delta}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ height: 3, background: '#1d3451', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((m.value / maxVal) * 100, 100)}%`, background: '#97cfdc', borderRadius: 2 }} />
          </div>
          <div style={{ height: 3, background: '#1d3451', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((m.opp_value / maxVal) * 100, 100)}%`, background: '#2e374d', borderRadius: 2 }} />
          </div>
        </div>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline values={sparkline} color="#97cfdc" width={56} height={20} />
        )}
      </div>
    </div>
  )
}

// ── Defensive stat cell ───────────────────────────────────────────────────────
function DefStat({ label, value, teamAvg, higherBetter = true, rank, totalRanked, sparkline }: {
  label: string; value: number; teamAvg: number; higherBetter?: boolean
  rank?: number; totalRanked?: number; sparkline?: number[]
}) {
  const delta = Math.round((value - teamAvg) * 10) / 10
  const positive = higherBetter ? delta >= 0 : delta <= 0
  const color = positive ? '#34d399' : '#f87171'
  const maxVal = Math.max(value, teamAvg, 0.01)
  const tooltip = DEF_STAT_TOOLTIPS[label]

  return (
    <div style={{
      background: '#1a2a40',
      border: '1px solid #2a4a6e',
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#a0a8bc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </div>
        {tooltip && (
          <div className="pillar-info">
            <span className="pillar-info-icon">i</span>
            <div className="pillar-info-tooltip">{tooltip}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: '#7a9eb5' }}>{value}</span>
        <span style={{ fontSize: 10, color: '#6d7894' }}>/ game</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, marginLeft: 'auto' }}>
          {delta >= 0 ? '+' : ''}{delta} vs avg
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#a0a8bc', width: 38, textAlign: 'right' }}>Player</span>
            <div style={{ flex: 1, height: 6, background: '#1d3451', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min((value / maxVal) * 100, 100)}%`, background: '#7a9eb5', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 9, color: '#a0a8bc', width: 22 }}>{value}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#6d7894', width: 38, textAlign: 'right' }}>Avg</span>
            <div style={{ flex: 1, height: 6, background: '#1d3451', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min((teamAvg / maxVal) * 100, 100)}%`, background: '#2e374d', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 9, color: '#6d7894', width: 22 }}>{teamAvg}</span>
          </div>
        </div>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline values={sparkline} color="#7a9eb5" width={56} height={28} />
        )}
      </div>
      {rank != null && totalRanked != null && (
        <div style={{ borderTop: '1px solid #1e3a5f', marginTop: 2, paddingTop: 5, textAlign: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: rank === 1 ? '#fbbf24'
              : rank <= Math.ceil(totalRanked / 3) ? '#34d399'
              : rank > Math.floor(totalRanked * 2 / 3) ? '#f87171'
              : '#a0a8bc',
          }}>
            #{rank} of {totalRanked}
          </span>
          <div style={{ fontSize: 9, color: '#6d7894', marginTop: 1 }}>team rank</div>
        </div>
      )}
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
  const span  = `${fmt(sorted[0].game_date)} – ${fmt(sorted[sorted.length - 1].game_date)}`
  const label = isCustom ? 'Custom Range' : (FILTER_CONFIG.find(f => f.key === filter)?.label ?? 'All Games')
  return `${label} · ${games.length} game${games.length !== 1 ? 's' : ''} (${wins}W ${losses}L) · ${span}`
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string; type?: string; games?: string }>
}) {
  const { id }                      = await params
  const { filter: rawFilter = 'all', type: rawType = 'all_types', games: gamesParam } = await searchParams
  const isCustom = !!gamesParam
  const filter   = (FILTER_CONFIG.some(f => f.key === rawFilter) ? rawFilter : 'all') as FilterKey
  const gameType = (GAME_TYPE_CONFIG.some(t => t.key === rawType) ? rawType : 'all_types') as GameTypeKey

  const BG     = '#0f1117'
  const CARD   = '#171c2a'
  const BORDER = '#2e374d'

  // ── Phase 1: fetch all games to build filter ──────────────────────────────
  const allGamesRaw = await fetchJson(
    `games?team_id=eq.${TEAM_ID}&select=id,game_date,result,team_score,opponent_score,game_type,opponents(full_name)&order=game_date.asc`
  )
  const allGames: any[] = Array.isArray(allGamesRaw) ? allGamesRaw : []

  // Apply filter to determine which games to analyse
  let filteredGames: any[]
  if (isCustom) {
    const specificIds = gamesParam!.split(',').filter(Boolean)
    filteredGames = allGames.filter(g => specificIds.includes(g.id))
  } else {
    filteredGames = applyFilter(allGames, filter)
    if (gameType !== 'all_types') {
      filteredGames = filteredGames.filter(g => g.game_type === gameType)
    }
  }
  const filteredGameIds = filteredGames.map(g => g.id)
  const filteredIdList  = `(${filteredGameIds.join(',') || 'null'})`
  const allIdList       = `(${allGames.map(g => g.id).join(',') || 'null'})`

  // ── Phase 2: parallel fetch using filtered game IDs ───────────────────────
  const [playerRaw, allPlayers, aggregates, drillsRaw, allStatsRaw] = await Promise.all([
    // Player stats for the FILTERED games only (include game_id for sparkline ordering)
    fetchJson(
      `player_game_stats?player_id=eq.${id}&game_id=in.${filteredIdList}&select=game_id,points,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,turnovers,ast,oreb,dreb,stl,blk,def_fouls,off_fouls,plus_minus,vps,off_ppp,def_ppp,net_ppp`
    ),
    fetchJson(`players?team_id=eq.${TEAM_ID}&select=id,first_name,last_name,jersey_number&order=jersey_number.asc`),
    // Aggregates scoped to filtered games
    getSeasonAggregates(TEAM_ID, filteredGameIds),
    fetchJson(`drills?select=*`),
    // All-season stats for season-wide ranking (not filtered)
    fetchJson(
      `player_game_stats?select=player_id,points,twopt_made,twopt_att,threept_made,threept_att,ft_made,ft_att,turnovers,oreb,dreb,stl,blk,def_fouls,off_fouls&game_id=in.${allIdList}`
    ),
  ])

  const players  = Array.isArray(allPlayers) ? allPlayers : []
  const player   = players.find((p: any) => p.id === id)
  const allStats = Array.isArray(allStatsRaw) ? allStatsRaw : []

  // Sort player rows chronologically using filteredGames date order
  const gameOrder = new Map(filteredGames.map((g: any, i: number) => [g.id, i]))
  const rows = (Array.isArray(playerRaw) ? playerRaw : [])
    .slice()
    .sort((a: any, b: any) => (gameOrder.get(a.game_id) ?? 0) - (gameOrder.get(b.game_id) ?? 0))

  if (!player || rows.length === 0) {
    return (
      <main style={{ background: BG, minHeight: '100vh', color: '#e8eaf0', padding: 40, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ color: '#a0a8bc' }}>Player not found.</div>
        <a href="/dashboard" style={{ color: '#97cfdc', fontSize: 13, marginTop: 16, display: 'block' }}>← Back to Dashboard</a>
      </main>
    )
  }

  const sum = (key: string) => rows.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0)
  const avg = (key: string) => rows.length > 0 ? sum(key) / rows.length : 0

  const ps: PlayerStats = {
    games:        rows.length,
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

  const numActivePlayers = players.length || 10
  const tree = computePlayerDriverTree(ps, aggregates, numActivePlayers)

  // ── Per-game sparkline series (one value per game, in chronological order) ──
  const sparklines: Record<string, number[]> = {}
  const addSeries = (key: string, fn: (r: any) => number) => {
    const vals = rows.map(fn).filter((v: number) => isFinite(v))
    if (vals.length >= 2) sparklines[key] = vals
  }
  // Offensive metrics
  addSeries('TS%',       r => { const fga = (r.twopt_att||0)+(r.threept_att||0); const d = 2*(fga+0.44*(r.ft_att||0)); return d > 0 ? Math.round((((r.points||0)/d)*100)*10)/10 : 0 })
  addSeries('eFG%',      r => { const fga = (r.twopt_att||0)+(r.threept_att||0); return fga > 0 ? Math.round((((r.twopt_made||0)+1.5*(r.threept_made||0))/fga*100)*10)/10 : 0 })
  addSeries('2Pt%',      r => { const a = r.twopt_att||0; return a > 0 ? Math.round(((r.twopt_made||0)/a*100)*10)/10 : 0 })
  addSeries('ATR',       r => { const fga = (r.twopt_att||0)+(r.threept_att||0); return fga > 0 ? Math.round(((r.ft_att||0)/fga)*100)/100 : 0 })
  addSeries('TO%',       r => { const fga = (r.twopt_att||0)+(r.threept_att||0); const d = fga+0.44*(r.ft_att||0)+(r.turnovers||0); return d > 0 ? Math.round(((r.turnovers||0)/d*100)*10)/10 : 0 })
  addSeries('TO/G',      r => r.turnovers || 0)
  addSeries('OReb%',     r => r.oreb || 0)   // OReb% needs team context; use raw OReb as proxy per game
  addSeries('OReb/G',    r => r.oreb || 0)
  addSeries('Total Reb/G', r => (r.oreb||0) + (r.dreb||0))
  addSeries('FTF/G',     r => r.ft_att || 0)
  addSeries('FT%',       r => { const a = r.ft_att||0; return a > 0 ? Math.round(((r.ft_made||0)/a*100)*10)/10 : 0 })
  addSeries('FT Made/G', r => r.ft_made || 0)
  // Defensive metrics (map to DefStat labels)
  addSeries('BLK/G',           r => r.blk || 0)
  addSeries('Blocks / Game',   r => r.blk || 0)
  addSeries('DReb/G',          r => r.dreb || 0)
  addSeries('Def Rebounds / Game', r => r.dreb || 0)
  addSeries('STL/G',           r => r.stl || 0)
  addSeries('Steals / Game',   r => r.stl || 0)
  addSeries('Def Fouls / Game', r => r.def_fouls || 0)
  addSeries('Off Fouls / Game', r => r.off_fouls || 0)

  const g      = rows.length
  const pg     = (n: number) => Math.round((n / g) * 10) / 10
  const tppg   = (n: number) => Math.round((n / aggregates.games / numActivePlayers) * 10) / 10

  // ── Per-player aggregates for ranking ──────────────────────────────────────
  const perAgg: Record<string, { games: number; twopt_made: number; twopt_att: number; threept_made: number; threept_att: number; ft_made: number; ft_att: number; turnovers: number; oreb: number; dreb: number; stl: number; blk: number; def_fouls: number; pts: number }> = {}
  for (const r of allStats) {
    const pid = r.player_id
    if (!pid) continue
    if (!perAgg[pid]) perAgg[pid] = { games: 0, twopt_made: 0, twopt_att: 0, threept_made: 0, threept_att: 0, ft_made: 0, ft_att: 0, turnovers: 0, oreb: 0, dreb: 0, stl: 0, blk: 0, def_fouls: 0, pts: 0 }
    const a = perAgg[pid]
    a.games++;         a.pts         += (Number(r.points)       || 0)
    a.twopt_made  += (Number(r.twopt_made)   || 0); a.twopt_att  += (Number(r.twopt_att)   || 0)
    a.threept_made+= (Number(r.threept_made) || 0); a.threept_att+= (Number(r.threept_att) || 0)
    a.ft_made     += (Number(r.ft_made)      || 0); a.ft_att     += (Number(r.ft_att)      || 0)
    a.turnovers   += (Number(r.turnovers)    || 0); a.oreb       += (Number(r.oreb)        || 0)
    a.dreb        += (Number(r.dreb)         || 0); a.stl        += (Number(r.stl)         || 0)
    a.blk         += (Number(r.blk)          || 0); a.def_fouls  += (Number(r.def_fouls)   || 0)
  }

  function rankStat(
    getValue: (p: typeof perAgg[string]) => number,
    higherBetter: boolean,
    minGames = 5,
  ): { rank: number; total: number } {
    const entries = Object.entries(perAgg).filter(([, p]) => p.games >= minGames)
    const values  = entries.map(([pid, p]) => ({ pid, val: getValue(p) }))
    values.sort((a, b) => higherBetter ? b.val - a.val : a.val - b.val)
    const rank  = values.findIndex(v => v.pid === id) + 1
    return { rank: rank > 0 ? rank : values.length, total: values.length }
  }

  // 8 pillar ranks (same order as pillars: 4 off, 4 def)
  const ranks = [
    rankStat(p => { const fga = p.twopt_att + p.threept_att; const pts = 2*p.twopt_made + 3*p.threept_made + p.ft_made; const d = 2*(fga + 0.44*p.ft_att); return d > 0 ? pts/d : 0 }, true),   // Shot Efficiency (TS%)
    rankStat(p => { const poss = p.twopt_att + p.threept_att + 0.44*p.ft_att + p.turnovers; return poss > 0 ? p.turnovers/poss : 999 }, false),  // Possession Control (TO% lower better)
    rankStat(p => p.games > 0 ? p.oreb / p.games : 0, true),                                                                                      // Second Chances (OReb/G)
    rankStat(p => p.games > 0 && p.ft_att > 0 ? (p.ft_att/p.games) * (0.5 + 0.5*(p.ft_made/p.ft_att)) : 0, true),                               // Rim Pressure
    rankStat(p => p.games > 0 ? p.blk  / p.games : 0, true),                                                                                      // Shot Suppression (BLK/G)
    rankStat(p => p.games > 0 ? p.dreb / p.games : 0, true),                                                                                      // Possession Ending (DReb/G)
    rankStat(p => p.games > 0 ? p.stl  / p.games : 0, true),                                                                                      // Possession Creation (STL/G)
    rankStat(p => p.games > 0 ? p.def_fouls / p.games : 999, false),                                                                              // Discipline (Fouls/G lower better)
  ]

  const fullName = `${player.first_name} ${player.last_name}`
  const netPPP   = Math.round((ps.off_ppp - ps.def_ppp) * 1000) / 1000
  const netPos   = netPPP >= 0

  // Stats for AI prompt
  const fga     = ps.twopt_att + ps.threept_att
  const ts_pct  = fga + 0.44 * ps.ft_att > 0 ? Math.round((ps.pts / (2 * (fga + 0.44 * ps.ft_att))) * 1000) / 10 : 0
  const to_poss = fga + 0.44 * ps.ft_att + ps.turnovers
  const to_pct  = to_poss > 0 ? Math.round((ps.turnovers / to_poss) * 1000) / 10 : 0

  const teamFga    = aggregates.twopt_att + aggregates.threept_att
  const teamTs_pct = teamFga + 0.44 * aggregates.ft_att > 0
    ? Math.round((aggregates.pts / (2 * (teamFga + 0.44 * aggregates.ft_att))) * 1000) / 10 : 0
  const teamToPoss = teamFga + 0.44 * aggregates.ft_att + aggregates.turnovers
  const teamTo_pct = teamToPoss > 0 ? Math.round((aggregates.turnovers / teamToPoss) * 1000) / 10 : 0

  const aiStats = {
    ppg:     pg(ps.pts),
    ts:      ts_pct,
    to_pct:  to_pct,
    oreb_pg: pg(ps.oreb),
    dreb_pg: pg(ps.dreb),
    stl_pg:  pg(ps.stl),
    blk_pg:  pg(ps.blk),
    ftf_pg:  pg(ps.ft_att),
    ft_pct:  ps.ft_att > 0 ? Math.round((ps.ft_made / ps.ft_att) * 1000) / 10 : 0,
  }

  const teamAvgs = {
    ppg:     tppg(aggregates.pts),
    ts:      teamTs_pct,
    to_pct:  teamTo_pct,
    oreb_pg: tppg(aggregates.oreb),
    dreb_pg: tppg(aggregates.dreb),
    stl_pg:  tppg(aggregates.stl),
    blk_pg:  tppg(aggregates.blk),
    ftf_pg:  tppg(aggregates.ft_att),
    ft_pct:  aggregates.ft_att > 0 ? Math.round((aggregates.ft_made / aggregates.ft_att) * 1000) / 10 : 0,
  }

  const rankLabels = [
    'Shot Efficiency', 'Possession Control', 'Second Chances', 'Rim Pressure',
    'Shot Suppression', 'Possession Ending', 'Possession Creation', 'Discipline',
  ]
  const rankSummaryArr = ranks.map((r, i) => ({ label: rankLabels[i], rank: r.rank, total: r.total }))

  // ── Win/Loss split stats ──────────────────────────────────────────────────
  const gameResultMap = new Map(filteredGames.map((g: any) => [g.id, g.result]))
  const winRows  = rows.filter((r: any) => gameResultMap.get(r.game_id) === 'W')
  const lossRows = rows.filter((r: any) => gameResultMap.get(r.game_id) === 'L')

  const wlAvg = (arr: any[], key: string): number | null => {
    if (!arr.length) return null
    return Math.round((arr.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0) / arr.length) * 10) / 10
  }
  const wlTs = (arr: any[]): number | null => {
    if (!arr.length) return null
    const pts = arr.reduce((s: number, r: any) => s + (r.points || 0), 0)
    const fga = arr.reduce((s: number, r: any) => s + (r.twopt_att || 0) + (r.threept_att || 0), 0)
    const fta = arr.reduce((s: number, r: any) => s + (r.ft_att || 0), 0)
    const d = 2 * (fga + 0.44 * fta)
    return d > 0 ? Math.round((pts / d) * 1000) / 10 : null
  }
  const winLoss: WinLossSplit = {
    wins:   winRows.length,
    losses: lossRows.length,
    pts_w:  wlAvg(winRows,  'points'),     pts_l:  wlAvg(lossRows, 'points'),
    ts_w:   wlTs(winRows),                 ts_l:   wlTs(lossRows),
    to_w:   wlAvg(winRows,  'turnovers'),  to_l:   wlAvg(lossRows, 'turnovers'),
    reb_w:  winRows.length  ? Math.round(winRows.reduce((s: number, r: any) => s + (r.oreb||0) + (r.dreb||0), 0) / winRows.length * 10) / 10  : null,
    reb_l:  lossRows.length ? Math.round(lossRows.reduce((s: number, r: any) => s + (r.oreb||0) + (r.dreb||0), 0) / lossRows.length * 10) / 10 : null,
    stl_w:  wlAvg(winRows,  'stl'),        stl_l:  wlAvg(lossRows, 'stl'),
    ftf_w:  wlAvg(winRows,  'ft_att'),     ftf_l:  wlAvg(lossRows, 'ft_att'),
  }

  // ── Outlier detection — find stats where this player most diverges from team avg ──
  // Normalised as % above/below team average. Higher = bigger positive outlier.
  // lowerBetter stats are inverted so a negative number always means "worse than team".
  const statComparisons = [
    { label: 'PPG',     player: aiStats.ppg,     team: teamAvgs.ppg,     lowerBetter: false, rank: rankSummaryArr[0] },
    { label: 'TS%',     player: aiStats.ts,      team: teamAvgs.ts,      lowerBetter: false, rank: rankSummaryArr[0] },
    { label: 'TO%',     player: aiStats.to_pct,  team: teamAvgs.to_pct,  lowerBetter: true,  rank: rankSummaryArr[1] },
    { label: 'FTF/G',   player: aiStats.ftf_pg,  team: teamAvgs.ftf_pg,  lowerBetter: false, rank: rankSummaryArr[3] },
    { label: 'FT%',     player: aiStats.ft_pct,  team: teamAvgs.ft_pct,  lowerBetter: false, rank: rankSummaryArr[3] },
    { label: 'OReb/G',  player: aiStats.oreb_pg, team: teamAvgs.oreb_pg, lowerBetter: false, rank: rankSummaryArr[2] },
    { label: 'DReb/G',  player: aiStats.dreb_pg, team: teamAvgs.dreb_pg, lowerBetter: false, rank: rankSummaryArr[5] },
    { label: 'STL/G',   player: aiStats.stl_pg,  team: teamAvgs.stl_pg,  lowerBetter: false, rank: rankSummaryArr[6] },
    { label: 'BLK/G',   player: aiStats.blk_pg,  team: teamAvgs.blk_pg,  lowerBetter: false, rank: rankSummaryArr[4] },
    { label: 'Def Fouls/G', player: pg(ps.def_fouls), team: tppg(aggregates.def_fouls), lowerBetter: true, rank: rankSummaryArr[7] },
  ]
  const scoredComparisons = statComparisons.map(s => {
    const base = s.team > 0 ? s.team : 0.1
    const rawDiff = (s.player - s.team) / base * 100
    const score = s.lowerBetter ? -rawDiff : rawDiff   // positive = better than team
    return { ...s, score, diff: Math.round(rawDiff * 10) / 10 }
  })
  const sorted = [...scoredComparisons].sort((a, b) => b.score - a.score)
  const positiveOutliers = sorted.filter(s => s.score > 10).slice(0, 3)
  const negativeOutliers = sorted.filter(s => s.score < -10).reverse().slice(0, 3)
  const outlierSummary = [
    positiveOutliers.length
      ? `STRENGTHS (biggest positive outliers vs team average): ${positiveOutliers.map(s => `${s.label}: ${s.player} vs team avg ${s.team} (${s.diff > 0 ? '+' : ''}${s.diff}%, ranked #${s.rank.rank} of ${s.rank.total})`).join('; ')}`
      : 'No clear positive outliers — broadly average across most stats.',
    negativeOutliers.length
      ? `DEVELOPMENT AREAS (biggest negative outliers vs team average): ${negativeOutliers.map(s => `${s.label}: ${s.player} vs team avg ${s.team} (${s.diff > 0 ? '+' : ''}${s.diff}%, ranked #${s.rank.rank} of ${s.rank.total})`).join('; ')}`
      : 'No clear negative outliers — broadly average across most stats.',
  ].join('\n')

  // Also identify the W/L stat with the biggest split
  const wlSplits = [
    { label: 'PTS', w: winLoss.pts_w, l: winLoss.pts_l },
    { label: 'TS%', w: winLoss.ts_w,  l: winLoss.ts_l  },
    { label: 'TO',  w: winLoss.to_w,  l: winLoss.to_l, lowerBetter: true },
    { label: 'REB', w: winLoss.reb_w, l: winLoss.reb_l },
    { label: 'STL', w: winLoss.stl_w, l: winLoss.stl_l },
    { label: 'FTF', w: winLoss.ftf_w, l: winLoss.ftf_l },
  ].filter(s => s.w != null && s.l != null && (s.w! + s.l!) > 0)
  const biggestWlSplit = wlSplits.sort((a, b) => {
    const aDiff = Math.abs((a.w! - a.l!) / ((a.w! + a.l!) / 2 || 1))
    const bDiff = Math.abs((b.w! - b.l!) / ((b.w! + b.l!) / 2 || 1))
    return bDiff - aDiff
  })[0] ?? null

  // AI content (insights + workOns only — drills come from DB)
  const devContent = await getDevelopmentContent(
    fullName, player.jersey_number, tree, aiStats, teamAvgs, rankSummaryArr, winLoss, outlierSummary, biggestWlSplit,
  )

  // Real drills from DB, matched to player's development pillars
  const allDrills: PlayerDrill[] = Array.isArray(drillsRaw) ? drillsRaw : []
  const relevantDrills = getRelevantDrills(tree.leakage_areas, allDrills)

  const playerIdx  = players.findIndex((p: any) => p.id === id)
  const prevPlayer = playerIdx > 0 ? players[playerIdx - 1] : null
  const nextPlayer = playerIdx < players.length - 1 ? players[playerIdx + 1] : null

  // Query string to preserve the current filter when navigating between players
  const filterQs = isCustom
    ? `?games=${gamesParam}`
    : filter !== 'all' ? `?filter=${filter}` : ''

  // Build picker games list for GamePicker (uses full season)
  const pickerGames: PickerGame[] = allGames.map((g: any) => ({
    id:       g.id,
    label:    new Date(g.game_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    opponent: g.opponents?.full_name ?? 'Unknown',
    result:   g.result as 'W' | 'L',
    score:    `${g.team_score}-${g.opponent_score}`,
  }))

  return (
    <main style={{
      background: BG, minHeight: '100vh', color: '#e8eaf0',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased', padding: '0 0 60px',
    }}>
      <style>{`
        .pillar-info { position: relative; display: inline-flex; align-items: center; cursor: help; }
        .pillar-info-icon {
          width: 13px; height: 13px; border-radius: 50%;
          background: #1a3a54; border: 1px solid #3a5a7a;
          color: #94a3b8; font-size: 8px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center;
          font-style: italic; line-height: 1; flex-shrink: 0;
        }
        .pillar-info-tooltip {
          visibility: hidden; opacity: 0;
          position: absolute; bottom: calc(100% + 6px); left: 50%;
          transform: translateX(-50%);
          background: #07111e; border: 1px solid #3a5a7a;
          border-radius: 8px; padding: 9px 11px;
          font-size: 11px; color: #cbd5e1; line-height: 1.55;
          width: 220px; text-align: left; z-index: 200;
          transition: opacity 0.15s ease;
          pointer-events: none;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          font-weight: 400; text-transform: none; letter-spacing: 0;
        }
        .pillar-info:hover .pillar-info-tooltip { visibility: visible; opacity: 1; }
      `}</style>

      {/* ── Player selector bar ── */}
      <div style={{ background: '#050e1a', borderBottom: `1px solid ${BORDER}`, padding: '10px 28px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 'max-content' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6d7894', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>Players:</span>
          {players.map((p: any) => (
            <a
              key={p.id}
              href={`/players/${p.id}${filterQs}`}
              style={{
                fontSize: 11, fontWeight: p.id === id ? 700 : 400,
                color: p.id === id ? '#0f1117' : '#a0a8bc',
                textDecoration: 'none',
                background: p.id === id ? '#97cfdc' : 'transparent',
                border: `1px solid ${p.id === id ? '#97cfdc' : BORDER}`,
                borderRadius: 20, padding: '4px 11px',
                whiteSpace: 'nowrap',
              }}
            >
              #{p.jersey_number} {p.first_name}
            </a>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingLeft: 16 }}>
            <a href="/dashboard" style={{ color: '#a0a8bc', fontSize: 11, textDecoration: 'none', background: '#1e2f45', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '4px 11px', whiteSpace: 'nowrap' }}>← Team Dashboard</a>
            <a href={`/dashboard?player=${id}`} style={{ color: '#a0a8bc', fontSize: 11, textDecoration: 'none', background: '#1e2f45', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '4px 11px', whiteSpace: 'nowrap' }}>Driver Tree View</a>
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ background: '#0f1117', borderBottom: `1px solid ${BORDER}`, padding: '8px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterBar current={filter} currentType={isCustom ? 'all_types' : gameType} />
          <GamePicker games={pickerGames} />
          {(filter !== 'all' || isCustom) && (
            <span style={{ fontSize: 10, color: '#6d7894', marginLeft: 4 }}>
              {contextLabel(filteredGames, filter, isCustom)}
              &nbsp;·&nbsp;
              <a href={`/players/${id}`} style={{ color: '#97cfdc', textDecoration: 'none' }}>Clear</a>
            </span>
          )}
        </div>
      </div>

      {/* ── Header ── */}
      <div style={{ background: '#1f2537', borderBottom: `1px solid ${BORDER}`, padding: '16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 58, height: 58, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a3a54, #0f2d44)',
            border: `2px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#97cfdc', flexShrink: 0,
          }}>
            #{player.jersey_number}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.03em' }}>
              {fullName.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: '#a0a8bc', marginTop: 3 }}>
              WGT 12.2 &nbsp;·&nbsp; {g} game{g !== 1 ? 's' : ''} &nbsp;·&nbsp;
              <span style={{ color: '#97cfdc', fontWeight: 700 }}>
                {filter !== 'all' || isCustom
                  ? FILTER_CONFIG.find(f => f.key === filter)?.label ?? 'Custom Range'
                  : 'Player Development Profile'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {prevPlayer && (
              <a href={`/players/${prevPlayer.id}${filterQs}`} style={{ color: '#a0a8bc', fontSize: 11, textDecoration: 'none', background: '#1e2f45', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '6px 12px' }}>
                ← #{prevPlayer.jersey_number} {prevPlayer.first_name}
              </a>
            )}
            {nextPlayer && (
              <a href={`/players/${nextPlayer.id}${filterQs}`} style={{ color: '#a0a8bc', fontSize: 11, textDecoration: 'none', background: '#1e2f45', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '6px 12px' }}>
                #{nextPlayer.jersey_number} {nextPlayer.first_name} →
              </a>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── KPI strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { label: 'PPG',         value: pg(ps.pts),                        color: '#fbbf24' },
            { label: 'TS%',         value: `${ts_pct}%`,                      color: '#97cfdc' },
            { label: 'Off PPP',     value: ps.off_ppp.toFixed(3),             color: '#97cfdc' },
            { label: 'Def PPP',     value: ps.def_ppp.toFixed(3),             color: '#7a9eb5' },
            { label: 'Net PPP',     value: `${netPos ? '+' : ''}${netPPP.toFixed(3)}`, color: netPos ? '#34d399' : '#f87171' },
            { label: 'Games',       value: g,                                 color: '#a0a8bc' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6d7894', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Key Insights ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.08em' }}>KEY INSIGHTS</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {devContent.insights.map((insight, i) => (
              <div key={i} style={{ background: '#1f2537', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24', opacity: 0.4, marginBottom: 6 }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: '#e8eaf0', lineHeight: 1.6 }}>{insight}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Offensive Pillars ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 3, height: 18, background: '#97cfdc', borderRadius: 2 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc', letterSpacing: '0.08em' }}>OFFENSIVE CONTRIBUTIONS</span>
            <span style={{ fontSize: 11, color: '#6d7894', marginLeft: 4 }}>vs team average · ranked among squad</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {tree.pillars.offensive.map((p, i) => (
              <PillarCard key={i} pillar={p} rank={ranks[i]?.rank} totalRanked={ranks[i]?.total} sparklines={sparklines} />
            ))}
          </div>
        </div>

        {/* ── Defensive Contributions ── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 3, height: 18, background: '#7a9eb5', borderRadius: 2 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#7a9eb5', letterSpacing: '0.08em' }}>DEFENSIVE CONTRIBUTIONS</span>
            <span style={{ fontSize: 11, color: '#6d7894', marginLeft: 4 }}>vs team average · ranked among squad</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            <DefStat label="Blocks / Game"        value={pg(ps.blk)}       teamAvg={tppg(aggregates.blk)}       higherBetter={true}  rank={ranks[4]?.rank} totalRanked={ranks[4]?.total} sparkline={sparklines['Blocks / Game']} />
            <DefStat label="Def Rebounds / Game"  value={pg(ps.dreb)}      teamAvg={tppg(aggregates.dreb)}      higherBetter={true}  rank={ranks[5]?.rank} totalRanked={ranks[5]?.total} sparkline={sparklines['Def Rebounds / Game']} />
            <DefStat label="Steals / Game"        value={pg(ps.stl)}       teamAvg={tppg(aggregates.stl)}       higherBetter={true}  rank={ranks[6]?.rank} totalRanked={ranks[6]?.total} sparkline={sparklines['Steals / Game']} />
            <DefStat label="Def Fouls / Game"     value={pg(ps.def_fouls)} teamAvg={tppg(aggregates.def_fouls)} higherBetter={false} rank={ranks[7]?.rank} totalRanked={ranks[7]?.total} sparkline={sparklines['Def Fouls / Game']} />
            <DefStat label="Off Fouls / Game"     value={pg(ps.off_fouls)} teamAvg={tppg(aggregates.off_fouls)} higherBetter={false} sparkline={sparklines['Off Fouls / Game']} />
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#1f2537', borderRadius: 6, fontSize: 11, color: '#6d7894', fontStyle: 'italic' }}>
            Individual tracking only. Contested shots, opponent FG% when guarded, and screen quality are not captured in this dataset.
          </div>
        </div>

        {/* ── Work Ons + Drills ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Coaching priorities */}
          <div style={{ background: CARD, border: '1px solid #3a2a1a', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>🎯</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.08em' }}>WORK ONS</span>
              <span style={{ fontSize: 11, color: '#6d7894', marginLeft: 4 }}>coaching priorities this week</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {devContent.workOns.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: '#2a1a0a',
                    border: '1px solid #fb923c', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fbbf24', flexShrink: 0, marginTop: 1,
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 13, color: '#f1f5f9', lineHeight: 1.6 }}>{item}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Suggested drills */}
          <div style={{ background: CARD, border: '1px solid #1a2a3a', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>🏀</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc', letterSpacing: '0.08em' }}>SUGGESTED DRILLS</span>
              <span style={{ fontSize: 11, color: '#6d7894', marginLeft: 4 }}>click to expand</span>
            </div>
            <PlayerDrillCards drills={relevantDrills} />
            <a href="/drills" style={{
              display: 'inline-block', marginTop: 14,
              fontSize: 10, fontWeight: 600, color: '#97cfdc',
              textDecoration: 'none', letterSpacing: '0.06em',
            }}>VIEW ALL DRILLS →</a>
          </div>

        </div>

        {/* ── Top contributions & development areas ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: CARD, border: '1px solid #1a4a2e', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14 }}>📈</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>TOP CONTRIBUTIONS</span>
            </div>
            {tree.top_drivers.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < tree.top_drivers.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ fontSize: 12, color: '#c5cde0' }}>• {d.pillar}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>+{d.delta}</span>
              </div>
            ))}
            {tree.top_drivers.length === 0 && (
              <div style={{ fontSize: 12, color: '#6d7894' }}>No contributions above team average.</div>
            )}
          </div>

          <div style={{ background: CARD, border: '1px solid #4a1a1a', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14 }}>📉</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>DEVELOPMENT AREAS</span>
            </div>
            {tree.leakage_areas.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < tree.leakage_areas.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ fontSize: 12, color: '#c5cde0' }}>• {d.pillar}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>{d.delta}</span>
              </div>
            ))}
            {tree.leakage_areas.length === 0 && (
              <div style={{ fontSize: 12, color: '#6d7894' }}>No areas below team average.</div>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
