import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { getBenchmarks } from '@/lib/getBenchmarks'
import { computeDriverTree } from '@/lib/driverTree'
import DrillsView from './DrillsView'

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchTeamBracket() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/teams?id=eq.${TEAM_ID}&select=age_group,gender,division`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
  )
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : undefined
}

export interface Drill {
  id: string
  pillar: string
  name: string
  difficulty: 'foundation' | 'developing' | 'competitive'
  difficulty_order: number
  players_min: number
  players_max: number
  duration_mins: number
  equipment: string | null
  setup: string
  execution: string
  coaching_cues: string[]
  progression: string | null
  tags: string[]
}

async function fetchDrills(): Promise<Drill[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/drills?select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
  )
  if (!res.ok) {
    console.error('Drills fetch failed:', res.status, await res.text())
    return []
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    console.error('Drills response not an array:', data)
    return []
  }
  // Sort pillar alphabetically, then by difficulty_order ascending
  return data.sort((a, b) =>
    a.pillar.localeCompare(b.pillar) || a.difficulty_order - b.difficulty_order
  )
}

export default async function DrillsPage() {
  const [agg, drills, bracket] = await Promise.all([
    getSeasonAggregates(TEAM_ID),
    fetchDrills(),
    fetchTeamBracket(),
  ])

  const benchmarks = bracket ? await getBenchmarks(bracket) : {}
  const tree = computeDriverTree(agg, benchmarks)

  // Map each db pillar key → its PP100 value (points per 100 possessions, Tier 2).
  // Priority is keyed off points, a common currency, not raw mixed-unit deltas.
  const off = tree.pillars.offensive
  const def = tree.pillars.defensive
  const pillarValueMap: Record<string, number> = {
    shot_efficiency:     off[0].pp100 ?? off[0].delta,
    possession_control:  off[1].pp100 ?? off[1].delta,
    extra_possessions:   off[2].pp100 ?? off[2].delta,
    pressure_creation:   off[3].pp100 ?? off[3].delta,
    shot_suppression:    def[0].pp100 ?? def[0].delta,
    possession_ending:   def[1].pp100 ?? def[1].delta,
    pressure_disruption: def[2].pp100 ?? def[2].delta,
    discipline:          def[3].pp100 ?? def[3].delta,
  }

  return <DrillsView drills={drills} pillarDeltaMap={pillarValueMap} />
}
