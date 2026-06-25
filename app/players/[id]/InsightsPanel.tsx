// InsightsPanel.tsx — async server component
// Called via <Suspense> in page.tsx.
// Handles the Claude API call so the rest of the player profile page
// renders immediately (~2s) while this section streams in.

import { COACHING_WRITING_STANDARDS } from '@/lib/writingStandards'
import PlayerDrillCards, { type PlayerDrill } from './PlayerDrillCards'
import type { DriverTreeOutput } from '@/lib/driverTree'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface WinLossSplit {
  wins:   number
  losses: number
  pts_w:   number | null; pts_l:   number | null
  ts_w:    number | null; ts_l:    number | null
  to_w:    number | null; to_l:    number | null
  reb_w:   number | null; reb_l:   number | null
  stl_w:   number | null; stl_l:   number | null
  ftf_w:   number | null; ftf_l:   number | null
}

interface DevelopmentContent {
  insights: string[]
  workOns:  string[]
}

interface PlayerAiStats {
  ppg:     number
  ts:      number
  to_pct:  number
  oreb_pg: number
  dreb_pg: number
  stl_pg:  number
  blk_pg:  number
  ftf_pg:  number
  ft_pct:  number
}

interface RankEntry {
  label: string
  rank:  number
  total: number
  tie?:  boolean
}

// Per-stat rank (no pillar label) for stats not 1:1 with a pillar.
interface StatRank {
  rank:  number
  total: number
  tie?:  boolean
}

export interface InsightsPanelProps {
  playerName:     string
  jersey:         number
  tree:           DriverTreeOutput
  aiStats:        PlayerAiStats
  teamAvgs:       PlayerAiStats
  rankSummaryArr: RankEntry[]
  ppgRank:        StatRank
  ftaRank:        StatRank
  ftPctRank:      StatRank
  winLoss:        WinLossSplit
  outlierSummary: string
  biggestWlSplit: { label: string; w: number | null; l: number | null; lowerBetter?: boolean } | null
  relevantDrills: PlayerDrill[]
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function getDevelopmentContent(
  playerName: string,
  jersey: number,
  tree: DriverTreeOutput,
  stats: PlayerAiStats,
  teamAvgs: PlayerAiStats,
  ranks: RankEntry[],
  ppgRank: StatRank,
  ftaRank: StatRank,
  ftPctRank: StatRank,
  winLoss: WinLossSplit,
  outlierSummary: string,
  biggestWlSplit: InsightsPanelProps['biggestWlSplit'],
): Promise<DevelopmentContent> {
  const first = playerName.split(' ')[0]

  const comparisonRows = [
    { stat: 'PPG',    player: stats.ppg,     team: teamAvgs.ppg,     unit: '',  lowerBetter: false, rank: ppgRank },
    { stat: 'TS%',    player: stats.ts,      team: teamAvgs.ts,      unit: '%', lowerBetter: false, rank: ranks[0] },
    { stat: 'TO%',    player: stats.to_pct,  team: teamAvgs.to_pct,  unit: '%', lowerBetter: true,  rank: ranks[1] },
    { stat: 'FTA/G',  player: stats.ftf_pg,  team: teamAvgs.ftf_pg,  unit: '',  lowerBetter: false, rank: ftaRank },
    { stat: 'FT%',    player: stats.ft_pct,  team: teamAvgs.ft_pct,  unit: '%', lowerBetter: false, rank: ftPctRank },
    { stat: 'OReb/G', player: stats.oreb_pg, team: teamAvgs.oreb_pg, unit: '',  lowerBetter: false, rank: ranks[2] },
    { stat: 'DReb/G', player: stats.dreb_pg, team: teamAvgs.dreb_pg, unit: '',  lowerBetter: false, rank: ranks[5] },
    { stat: 'STL/G',  player: stats.stl_pg,  team: teamAvgs.stl_pg,  unit: '',  lowerBetter: false, rank: ranks[6] },
    { stat: 'BLK/G',  player: stats.blk_pg,  team: teamAvgs.blk_pg,  unit: '',  lowerBetter: false, rank: ranks[4] },
  ]
  const compTable = comparisonRows.map(r => {
    const diff = Math.round((r.player - r.team) * 10) / 10
    const dir  = r.lowerBetter ? (diff <= 0 ? '✓ better' : '✗ worse') : (diff >= 0 ? '✓ above' : '✗ below')
    return `${r.stat}: ${r.player}${r.unit} (team avg ${r.team}${r.unit}, ${diff >= 0 ? '+' : ''}${diff} ${dir}, ranked ${r.rank.tie ? 'tied ' : ''}#${r.rank.rank} of ${r.rank.total})`
  }).join('\n')

  const fmt = (v: number | null) => v != null ? String(v) : 'n/a'
  const wlLines = winLoss.wins + winLoss.losses >= 3 ? [
    `Games: ${winLoss.wins}W / ${winLoss.losses}L`,
    `PTS:   ${fmt(winLoss.pts_w)} in wins vs ${fmt(winLoss.pts_l)} in losses`,
    `TS%:   ${fmt(winLoss.ts_w)}% in wins vs ${fmt(winLoss.ts_l)}% in losses`,
    `TO:    ${fmt(winLoss.to_w)} in wins vs ${fmt(winLoss.to_l)} in losses`,
    `REB:   ${fmt(winLoss.reb_w)} in wins vs ${fmt(winLoss.reb_l)} in losses`,
    `STL:   ${fmt(winLoss.stl_w)} in wins vs ${fmt(winLoss.stl_l)} in losses`,
    `FTA/G: ${fmt(winLoss.ftf_w)} in wins vs ${fmt(winLoss.ftf_l)} in losses`,
    biggestWlSplit ? `→ Biggest split: ${biggestWlSplit.label} (${fmt(biggestWlSplit.w)} wins / ${fmt(biggestWlSplit.l)} losses)` : '',
  ].filter(Boolean).join('\n') : 'Insufficient win/loss split data.'

  const rankSummary   = ranks.map(r => `${r.label}: ${r.tie ? 'tied ' : ''}#${r.rank} of ${r.total}`).join(', ')
  const tops          = tree.top_drivers.map(d => d.pillar).join(', ')
  const leakages      = tree.leakage_areas.map(d => d.pillar).join(', ')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `You are a youth basketball development coach writing a player development report for a U12 team in Melbourne (WGT 12.2, 29 games, 22–7 record).

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
- FTA/G > 3.0 = consistent rim pressure; < 1.5 = not attacking the rim
- OReb/G > 2.0 = active on glass; DReb/G > 2.5 = strong possession finisher
- STL/G > 1.5 = active, disruptive; BLK/G > 0.5 = shot deterrent

${COACHING_WRITING_STANDARDS}

Return valid JSON only — no markdown, no preamble:
{"insights":["string","string","string"],"workOns":["string","string","string"]}

INSIGHT RULES:
Each player's insights must be driven by their actual outliers vs team average, not a generic template.
Write 3 insights: at least one covers a genuine strength, at least one covers a real development need.
Every insight: specific numbers, peer rank, 2–4 sentences, direct, no filler. Address ${first} by first name.
ACCURACY: Use only the peer ranks given above — never infer standing from the team-average comparison. The team average is points/players, so most contributors sit above it; being above average does NOT make a player the leader. Do not use superlatives ("top", "best", "leading", "most", "number one") for any stat unless that stat's peer rank is exactly #1 of ${ranks[0].total}. A #2 rank is "second-highest", a #3 is "third", and so on. If a rank is shown as "tied", say "tied for Nth", not a clean rank.
WORKONS: 3 concrete training priorities from the development areas. Imperative voice. Name the habit, not the category. Address ${first} by first name.`,
        }],
      }),
    })

    const d    = await res.json()
    if (d.error) throw new Error(d.error.message)
    const text = d.content?.[0]?.text?.replace(/```json|```/g, '').trim()
    if (!text) throw new Error('No content in response')
    return JSON.parse(text)
  } catch (err) {
    console.error('[InsightsPanel] Claude call failed:', err)
    return {
      insights: [
        `${first} scores ${stats.ppg} points per game at a TS% of ${stats.ts}% — ${stats.ts >= 52 ? 'above the U12 efficiency benchmark' : stats.ts >= 42 ? 'in the developing range for U12 (42–52%)' : 'below the U12 average threshold of 42%'}. True Shooting captures scoring efficiency across all shot types.`,
        `Turnover rate is ${stats.to_pct}% — ${stats.to_pct < 20 ? 'strong ball security by U12 standards' : stats.to_pct < 28 ? 'in the manageable range with room to improve' : 'above the high-risk threshold (28%+)'}. Every turnover surrenders a possession without a shot attempt.`,
        `${first} averages ${stats.dreb_pg} defensive rebounds and ${stats.stl_pg} steals per game. These two stats reflect how much this player contributes to possession control on defence.`,
      ],
      workOns: [
        `${first}, choose attempts inside your range and inside the team's offensive structure before thinking about shot making.`,
        `Ball security under pressure: absorb contact from a defender before making the pass or drive decision on every live-ball rep.`,
        `Box out on every defensive miss — two hands on your player before you turn to find the ball.`,
      ],
    }
  }
}

// ── Insights skeleton (shown while loading) ──────────────────────────────────

export function InsightsSkeleton() {
  const BORDER = '#e2e5eb'
  const pulse  = { animation: 'pulse 1.5s ease-in-out infinite', background: '#e8edf2', borderRadius: 4 }
  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }`}</style>

      {/* Insights skeleton */}
      <div style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <div style={{ ...pulse, width: 140, height: 14 }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} style={{ background: '#f0f2f7', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ ...pulse, width: 18, height: 18, marginBottom: 10 }} />
              <div style={{ ...pulse, width: '90%', height: 11, marginBottom: 6 }} />
              <div style={{ ...pulse, width: '80%', height: 11, marginBottom: 6 }} />
              <div style={{ ...pulse, width: '70%', height: 11 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Work Ons + Drills skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {[0, 1].map(col => (
          <div key={col} style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>{col === 0 ? '🎯' : '🏀'}</span>
              <div style={{ ...pulse, width: 120, height: 14 }} />
            </div>
            {[0, 1, 2].map(j => (
              <div key={j} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ ...pulse, width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...pulse, width: '85%', height: 11, marginBottom: 5 }} />
                  <div style={{ ...pulse, width: '65%', height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ── Main async component ──────────────────────────────────────────────────────

export default async function InsightsPanel({
  playerName,
  jersey,
  tree,
  aiStats,
  teamAvgs,
  rankSummaryArr,
  ppgRank,
  ftaRank,
  ftPctRank,
  winLoss,
  outlierSummary,
  biggestWlSplit,
  relevantDrills,
}: InsightsPanelProps) {
  const devContent = await getDevelopmentContent(
    playerName, jersey, tree, aiStats, teamAvgs,
    rankSummaryArr, ppgRank, ftaRank, ftPctRank, winLoss, outlierSummary, biggestWlSplit,
  )

  const CARD   = '#ffffff'
  const BORDER = '#e2e5eb'

  return (
    <>
      {/* ── Key Insights ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706', letterSpacing: '0.08em' }}>KEY INSIGHTS</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {devContent.insights.map((insight, i) => (
            <div key={i} style={{ background: '#f0f2f7', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706', opacity: 0.4, marginBottom: 6 }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{insight}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Work Ons + Drills ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

        {/* Coaching priorities */}
        <div style={{ background: CARD, border: '1px solid #e2e5eb', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706', letterSpacing: '0.08em' }}>WORK ONS</span>
            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>coaching priorities this week</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {devContent.workOns.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: '#fffbeb',
                  border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#d97706', flexShrink: 0, marginTop: 1,
                }}>{i + 1}</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{item}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Suggested drills */}
        <div style={{ background: CARD, border: '1px solid #e2e5eb', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>🏀</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92', letterSpacing: '0.08em' }}>SUGGESTED DRILLS</span>
            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>click to expand</span>
          </div>
          <PlayerDrillCards drills={relevantDrills} />
          <a href="/drills" style={{
            display: 'inline-block', marginTop: 14,
            fontSize: 10, fontWeight: 600, color: '#307b92',
            textDecoration: 'none', letterSpacing: '0.06em',
          }}>VIEW ALL DRILLS →</a>
        </div>

      </div>
    </>
  )
}
