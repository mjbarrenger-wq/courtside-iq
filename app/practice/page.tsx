import type { Metadata } from 'next'
import { getSeasonAggregates } from '@/lib/getSeasonAggregates'
import { computeDriverTree } from '@/lib/driverTree'
import { fetchRows } from '@/lib/supabaseRest'
import type { DrillRow } from '@/lib/dbTypes'
import PracticeBuilder from './PracticeBuilder'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Practice Builder — Courtside IQ' }

const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

type PracticeDrill = Pick<DrillRow,
  'id' | 'pillar' | 'name' | 'difficulty' | 'duration_mins' | 'setup' | 'execution' | 'coaching_cues'>

// Map pillar display names → drills table pillar keys
const PILLAR_KEY_MAP: Record<string, string> = {
  'Shot Efficiency':     'shot_efficiency',
  'Possession Control':  'possession_control',
  'Second Chances':      'extra_possessions',
  'Rim Pressure':        'pressure_creation',
  'Shot Suppression':    'shot_suppression',
  'Possession Ending':   'possession_ending',
  'Possession Creation': 'pressure_disruption',
  'Discipline':          'discipline',
}

export default async function PracticePage() {
  const [aggregates, drills] = await Promise.all([
    getSeasonAggregates(TEAM_ID),
    fetchRows<PracticeDrill>(
      `drills?difficulty=in.(foundation,developing)` +
      `&select=id,pillar,name,difficulty,duration_mins,setup,execution,coaching_cues` +
      `&order=pillar.asc,difficulty_order.asc`
    ),
  ])

  const tree = computeDriverTree(aggregates)

  // Build drills map: pillar_key → top 3 drills
  const drillsByKey: Record<string, PracticeDrill[]> = {}
  for (const d of drills) {
    if (!drillsByKey[d.pillar]) drillsByKey[d.pillar] = []
    if (drillsByKey[d.pillar].length < 3) drillsByKey[d.pillar].push(d)
  }

  // Re-key by display name so PracticeBuilder and actions.ts can look up by pillar name
  const drillsByPillar: Record<string, PracticeDrill[]> = {}
  for (const [displayName, key] of Object.entries(PILLAR_KEY_MAP)) {
    drillsByPillar[displayName] = drillsByKey[key] ?? []
  }

  // All 8 pillars with deltas for the checkbox list, sorted worst first
  const allPillars = [
    ...tree.pillars.offensive,
    ...tree.pillars.defensive,
  ]
    .map(p => ({ name: p.name, delta: p.delta }))
    .sort((a, b) => a.delta - b.delta)

  // Delta map for quick lookup in actions
  const pillarDeltas = Object.fromEntries(allPillars.map(p => [p.name, p.delta]))

  // Pre-select top 2 leakage areas (worst delta pillars)
  const leakagePillars = tree.leakage_areas.map(d => d.pillar)

  const teamContext = {
    record: '22-7',
    netPpp: tree.net_ppp,
    games: aggregates.games,
  }

  const BG = '#f4f5f7', CARD = '#ffffff', BORDER = '#e2e5eb'

  return (
    <main style={{
      background: BG,
      minHeight: '100vh',
      color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased',
      padding: '0 0 48px',
    }}>
      {/* Header */}
      <div className="px-4 md:px-7 py-3" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
          PRACTICE BUILDER
        </div>
        <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
          WGT 12.2 &nbsp;·&nbsp; {aggregates.games} games &nbsp;·&nbsp;
          Net PPP{' '}
          <strong style={{ color: tree.net_ppp >= 0 ? '#059669' : '#dc2626' }}>
            {tree.net_ppp >= 0 ? '+' : ''}{tree.net_ppp}
          </strong>
        </div>
      </div>

      <div className="px-4 md:px-7 py-6" style={{ maxWidth: 960, margin: '0 auto' }}>
        <PracticeBuilder
          allPillars={allPillars}
          leakagePillars={leakagePillars}
          drillsByPillar={drillsByPillar}
          teamContext={teamContext}
          pillarDeltas={pillarDeltas}
        />
      </div>
    </main>
  )
}
