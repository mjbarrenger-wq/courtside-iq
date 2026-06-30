import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { computeDriverTree, type DriverTreeOutput } from '@/lib/driverTree'
import { COACHING_WRITING_STANDARDS } from '@/lib/writingStandards'
import { supabase } from '@/lib/supabase'

// Shared, server-only logic for the game debrief.
// Used by the Regenerate server action AND the backfill API route, so the prompt
// and storage live in exactly one place. NEVER import this from a client component.

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const MODEL = 'claude-sonnet-4-6'
// v2: optionally folds in play-by-play (quarter/half flow + lineup +/-) when a
// game has lineup_stints imported. Games without play-by-play are unaffected.
export const DEBRIEF_PROMPT_VERSION = 2
const ENTITY_TYPE = 'game_debrief'
const VIEW_KEY = 'default'

export type DebriefResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

export interface StoredDebrief {
  text: string
  generatedAt: string
}

// Builds the optional play-by-play section. Returns null when the game has no
// imported lineup_stints, so the debrief falls back to box-score-only behaviour.
async function buildPbpBlock(gameId: string): Promise<string | null> {
  const { data: stints } = await supabase
    .from('lineup_stints')
    .select('period, seconds, player_ids, pf, pa, off_poss, def_poss')
    .eq('game_id', gameId)
  if (!stints || stints.length === 0) return null

  const { data: players } = await supabase.from('players').select('id, first_name, jersey_number')
  const info: Record<string, { first: string; jersey: number }> = {}
  for (const p of players ?? []) info[p.id] = { first: p.first_name, jersey: p.jersey_number ?? 999 }

  // Scoring by period (from per-stint points for/against)
  const byQ: Record<number, { pf: number; pa: number }> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of stints as any[]) { const q = s.period; (byQ[q] ||= { pf: 0, pa: 0 }); byQ[q].pf += s.pf || 0; byQ[q].pa += s.pa || 0 }
  const periods = Object.keys(byQ).map(Number).sort((a, b) => a - b)
  const qLines = periods.map(q => `Q${q} ${byQ[q].pf}-${byQ[q].pa}`).join(', ')
  let halfLine = ''
  if (periods.length === 4) {
    const h1f = byQ[1].pf + byQ[2].pf, h1a = byQ[1].pa + byQ[2].pa
    const h2f = byQ[3].pf + byQ[4].pf, h2a = byQ[3].pa + byQ[4].pa
    halfLine = `First half ${h1f}-${h1a} (net ${h1f - h1a >= 0 ? '+' : ''}${h1f - h1a}), second half ${h2f}-${h2a} (net ${h2f - h2a >= 0 ? '+' : ''}${h2f - h2a})`
  }

  // Aggregate lineups within this game
  const agg: Record<string, { ids: string[]; secs: number; pf: number; pa: number; op: number; dp: number }> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of stints as any[]) {
    const ids: string[] = Array.isArray(s.player_ids) ? s.player_ids : []
    const key = [...ids].sort().join('|'); if (!key) continue
    const a = (agg[key] ||= { ids, secs: 0, pf: 0, pa: 0, op: 0, dp: 0 })
    a.secs += Number(s.seconds) || 0; a.pf += s.pf || 0; a.pa += s.pa || 0
    a.op += Number(s.off_poss) || 0; a.dp += Number(s.def_poss) || 0
  }
  const rows = Object.values(agg).map(a => {
    const off = a.op > 0 ? a.pf / a.op : 0, def = a.dp > 0 ? a.pa / a.dp : 0
    const names = a.ids.map(id => info[id] ?? { first: '?', jersey: 999 }).sort((x, y) => x.jersey - y.jersey).map(p => p.first)
    return { names, min: a.secs / 60, pm: a.pf - a.pa, net: +(off - def).toFixed(2) }
  }).filter(r => r.min >= 1.5).sort((a, b) => b.net - a.net)
  const fmt = (r: { names: string[]; min: number; pm: number; net: number }) =>
    `${r.names.join('/')} (${r.min.toFixed(1)}m, +/- ${r.pm >= 0 ? '+' : ''}${r.pm}, net PPP ${r.net >= 0 ? '+' : ''}${r.net})`
  const best = rows.slice(0, 2).map(fmt)
  const worst = rows.length > 2 ? rows.slice(-1).map(fmt) : []

  return `PLAY-BY-PLAY DETAIL (this game has lineup-level data — use it to explain HOW the game unfolded):
- Scoring by quarter (us-them): ${qLines}
${halfLine ? `- ${halfLine}` : ''}
- Most productive lineups on court: ${best.join('; ') || 'n/a'}
${worst.length ? `- Least productive lineup: ${worst.join('; ')}` : ''}
RELIABILITY: lineup minutes are small in a single game, so per-lineup PPP is directional only. The trustworthy signals are the quarter/half scoring pattern and plus/minus — build the narrative on those, and mention specific lineups only as supporting colour, not as verdicts.`
}

function buildPrompt(args: {
  opponentName: string
  isWin: boolean
  teamScore: number
  oppScore: number
  gameDate: string
  gameTree: DriverTreeOutput
  seasonTree: DriverTreeOutput
  pbpBlock: string | null
}): string {
  const { opponentName, isWin, teamScore, oppScore, gameDate, gameTree, seasonTree, pbpBlock } = args

  const allGamePillars = [...gameTree.pillars.offensive, ...gameTree.pillars.defensive]
  const allSeasonPillars = [...seasonTree.pillars.offensive, ...seasonTree.pillars.defensive]

  const pillarComparisons = allGamePillars.map(gp => {
    const sp = allSeasonPillars.find(p => p.name === gp.name)
    const seasonDelta = sp?.delta ?? 0
    return {
      name: gp.name,
      gameDelta: gp.delta,
      seasonDelta,
      vsAvg: +(gp.delta - seasonDelta).toFixed(2),
    }
  }).sort((a, b) => b.vsAvg - a.vsAvg)

  const strongPillars = pillarComparisons.filter(p => p.vsAvg > 0).slice(0, 2)
  const weakPillars = pillarComparisons.filter(p => p.vsAvg < 0).slice(-2).reverse()
  const netPppDiff = +(gameTree.net_ppp - seasonTree.net_ppp).toFixed(2)

  return `You are a basketball coaching intelligence system writing a post-game debrief for a U12 team coach.

GAME RESULT:
- ${isWin ? 'WIN' : 'LOSS'}: WGT 12.2 ${teamScore} – ${oppScore} ${opponentName}
- Date: ${gameDate}
- Net PPP this game: ${gameTree.net_ppp >= 0 ? '+' : ''}${gameTree.net_ppp} (season avg: ${seasonTree.net_ppp >= 0 ? '+' : ''}${seasonTree.net_ppp}, difference: ${netPppDiff >= 0 ? '+' : ''}${netPppDiff})

PERFORMANCE VS SEASON AVERAGE:
Pillars performing ABOVE season average this game:
${strongPillars.length > 0 ? strongPillars.map(p => `- ${p.name}: ${p.gameDelta >= 0 ? '+' : ''}${p.gameDelta} (season avg: ${p.seasonDelta >= 0 ? '+' : ''}${p.seasonDelta}, vs avg: ${p.vsAvg >= 0 ? '+' : ''}${p.vsAvg})`).join('\n') : '- None significantly above average'}

Pillars performing BELOW season average this game:
${weakPillars.length > 0 ? weakPillars.map(p => `- ${p.name}: ${p.gameDelta >= 0 ? '+' : ''}${p.gameDelta} (season avg: ${p.seasonDelta >= 0 ? '+' : ''}${p.seasonDelta}, vs avg: ${p.vsAvg >= 0 ? '+' : ''}${p.vsAvg})`).join('\n') : '- None significantly below average'}

OFFENCE / DEFENCE SPLIT:
- Off PPP this game: ${gameTree.off_ppp} (season: ${seasonTree.off_ppp})
- Def PPP this game: ${gameTree.def_ppp} (season: ${seasonTree.def_ppp})
${pbpBlock ? `\n${pbpBlock}\n` : ''}
TASK: Write a coaching debrief in 2-3 short paragraphs (150-250 words total). Structure:
1. The performance story — what drove the ${isWin ? 'win' : 'loss'} in performance terms (not the final score)${pbpBlock ? '; if play-by-play detail is provided, use the quarter/half pattern to explain how the game actually flowed — building or surrendering a lead, fading or finishing strong' : ''}
2. What stood out vs their usual level — where did they over- or under-perform relative to the season?
3. One specific coaching focus for the next training session based on this game

Do not recap the score. Do not list every stat. Write like a basketball professional briefing a coaching peer. Be specific about the basketball behaviours behind the numbers.${pbpBlock ? ' When you reference play-by-play, lean on the quarter/half flow and plus/minus; do not over-interpret small-sample per-lineup PPP.' : ''}

${COACHING_WRITING_STANDARDS}`
}

// Reads the stored debrief for a game, or null if none has been generated yet.
// Uses raw REST with cache:'no-store' (matching the rest of the codebase) so the
// read is never served from Next's fetch Data Cache — a freshly regenerated
// debrief must show immediately.
export async function getStoredDebrief(gameId: string): Promise<StoredDebrief | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  try {
    const res = await fetch(
      `${url}/rest/v1/ai_content?entity_type=eq.${ENTITY_TYPE}&entity_id=eq.${gameId}` +
      `&view_key=eq.${VIEW_KEY}&select=content,generated_at&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) return null
    return { text: rows[0].content as string, generatedAt: rows[0].generated_at as string }
  } catch {
    return null
  }
}

// Generates a fresh debrief via the AI, writes it to the database (upsert — a
// regenerate overwrites the stored copy), and returns the text.
export async function generateAndStoreDebrief(gameId: string): Promise<DebriefResult> {
  // 1. Game row
  const { data: game, error: gErr } = await supabase
    .from('games')
    .select('team_score, opponent_score, result, game_date, opponents(full_name)')
    .eq('id', gameId)
    .single()
  if (gErr || !game) return { ok: false, error: 'Game not found.' }

  // 2. Driver trees (this game vs season) + optional play-by-play detail
  const [gameAggs, seasonAggs, pbpBlock] = await Promise.all([
    getSeasonAggregates(TEAM_ID, [gameId]),
    getSeasonAggregates(TEAM_ID),
    buildPbpBlock(gameId),
  ])
  const gameTree = computeDriverTree(gameAggs)
  const seasonTree = computeDriverTree(seasonAggs)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opponentName = (game as any).opponents?.full_name ?? 'Unknown'
  const isWin = game.result === 'W'
  const gameDate = new Date(game.game_date).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const prompt = buildPrompt({
    opponentName, isWin,
    teamScore: game.team_score, oppScore: game.opponent_score,
    gameDate, gameTree, seasonTree, pbpBlock,
  })

  // 3. Call the AI
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY is not set in this environment.' }

  let text = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const t = data?.content?.[0]?.text
    if (!t) {
      const reason = data?.error?.message || data?.error?.type || `HTTP ${res.status}`
      return { ok: false, error: reason }
    }
    text = t
  } catch {
    return { ok: false, error: 'The AI debrief service couldn’t be reached.' }
  }

  // 4. Store (upsert — overwrites on regenerate)
  const now = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('ai_content')
    .upsert(
      {
        entity_type: ENTITY_TYPE,
        entity_id: gameId,
        view_key: VIEW_KEY,
        content: text,
        model: MODEL,
        prompt_version: DEBRIEF_PROMPT_VERSION,
        generated_at: now,
        updated_at: now,
      },
      { onConflict: 'entity_type,entity_id,view_key' },
    )
  if (upErr) return { ok: false, error: `Generated but failed to save: ${upErr.message}` }

  return { ok: true, text }
}
