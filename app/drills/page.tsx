import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { computeDriverTree } from '@/lib/driverTree'
import DrillsView from './DrillsView'

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
  const [agg, drills] = await Promise.all([
    getSeasonAggregates(TEAM_ID),
    fetchDrills(),
  ])

  const tree = computeDriverTree(agg)

  // Map each db pillar key → delta score from the driver tree
  const pillarDeltaMap: Record<string, number> = {
    shot_efficiency:   tree.pillars.offensive[0].delta,
    possession_control: tree.pillars.offensive[1].delta,
    extra_possessions: tree.pillars.offensive[2].delta,
    pressure_creation: tree.pillars.offensive[3].delta,
    shot_suppression:  tree.pillars.defensive[0].delta,
    possession_ending: tree.pillars.defensive[1].delta,
    pressure_disruption: tree.pillars.defensive[2].delta,
    discipline:        tree.pillars.defensive[3].delta,
  }

  return <DrillsView drills={drills} pillarDeltaMap={pillarDeltaMap} />
}
