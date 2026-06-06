import type { PlayerBubble } from './BubbleChart'

// ── Types ────────────────────────────────────────────────────────────────────

type Quadrant = 'two-way' | 'offensive' | 'defensive' | 'development'

type Classified = PlayerBubble & {
  quadrant: Quadrant
  netPPP: number
}

// ── Quadrant config ───────────────────────────────────────────────────────────

const Q_CONFIG: Record<Quadrant, {
  label: string
  colour: string
  offLabel: string
  defLabel: string
  meaning: string
}> = {
  'two-way': {
    label: 'Two-Way',
    colour: '#22c55e',
    offLabel: 'Strong Offence',
    defLabel: 'Strong Defence',
    meaning: 'Above team average on both ends. Your most reliable rotation players.',
  },
  'offensive': {
    label: 'Offensive Focus',
    colour: '#97cfdc',
    offLabel: 'Strong Offence',
    defLabel: 'Weaker Defence',
    meaning: 'Efficient scorers who give up more on the other end. Pair with defenders.',
  },
  'defensive': {
    label: 'Defensive Specialist',
    colour: '#8b5cf6',
    offLabel: 'Lower Offence',
    defLabel: 'Strong Defence',
    meaning: 'Hold opponents below team average but haven\'t converted that into offensive output.',
  },
  'development': {
    label: 'Development',
    colour: '#f97316',
    offLabel: 'Lower Offence',
    defLabel: 'Weaker Defence',
    meaning: 'Below team average on both ends. Highest growth opportunity in the group.',
  },
}

// ── Classification ────────────────────────────────────────────────────────────

function classify(p: PlayerBubble, avgOff: number, avgDef: number): Quadrant {
  const offGood = p.off_ppp >= avgOff
  const defGood = p.def_ppp <= avgDef   // lower def PPP allowed = better defence
  if (offGood && defGood)  return 'two-way'
  if (offGood && !defGood) return 'offensive'
  if (!offGood && defGood) return 'defensive'
  return 'development'
}

// ── Observations (basketball language, data-grounded) ─────────────────────────

function buildObservations(classified: Classified[], avgOff: number, avgDef: number): string[] {
  const obs: string[] = []
  const byQ = (q: Quadrant) => classified.filter(p => p.quadrant === q)
  const names = (ps: Classified[]) => ps.map(p => p.firstName).join(', ')

  const twoWay     = byQ('two-way')
  const offensive  = byQ('offensive')
  const defensive  = byQ('defensive')
  const devGroup   = byQ('development')

  // Two-way observation
  if (twoWay.length >= 2) {
    obs.push(
      `${names(twoWay)} are above the team average on both ends. ` +
      `They're the group's most versatile players — lineups built around them are hardest to exploit.`
    )
  } else if (twoWay.length === 1) {
    obs.push(
      `${twoWay[0].firstName} is the only player above team average on both ends this window. ` +
      `That's a narrow two-way base — spreading the other players around him protects the net margin.`
    )
  }

  // Defensive specialists observation
  if (defensive.length > 0) {
    const best = [...defensive].sort((a, b) => a.def_ppp - b.def_ppp)[0]
    obs.push(
      `${names(defensive)} hold opponents below the team's defensive average but aren't generating ` +
      `equivalent offensive output. ${best.firstName}'s defensive PPP of ${best.def_ppp.toFixed(3)} is already an asset — ` +
      `even modest offensive improvement would move them into two-way territory.`
    )
  }

  // Offensive focus observation
  if (offensive.length > 0) {
    obs.push(
      `${names(offensive)} score above the team average but give back ground defensively. ` +
      `Their net PPP impact depends heavily on who they share the floor with.`
    )
  }

  // Development group
  if (devGroup.length > 0) {
    const mostMins = [...devGroup].sort((a, b) => b.mpg - a.mpg)[0]
    obs.push(
      `${names(devGroup)} sit below team average on both ends. ` +
      `${mostMins.firstName} carries the most minutes in this group — ` +
      `a targeted focus on one end of the floor first is the most practical development path.`
    )
  }

  return obs
}

// ── Coaching actions ──────────────────────────────────────────────────────────

function buildActions(classified: Classified[]): string[] {
  const actions: string[] = []
  const byQ = (q: Quadrant) => classified.filter(p => p.quadrant === q)
  const names = (ps: Classified[]) => ps.map(p => p.firstName).join(' and ')

  const twoWay    = byQ('two-way')
  const offensive = byQ('offensive')
  const defensive = byQ('defensive')
  const devGroup  = byQ('development')

  if (twoWay.length > 0) {
    actions.push(
      `Anchor your key lineups with ${names(twoWay)}. ` +
      `They're the players you can trust in tight games on both ends without a defensive substitution.`
    )
  }

  if (defensive.length > 0) {
    actions.push(
      `For ${names(defensive)}: prioritise catch-and-shoot repetitions and finishing at the rim. ` +
      `They're already doing the hard defensive work — converting more open looks is the highest-leverage ` +
      `development opportunity in the group.`
    )
  }

  if (offensive.length > 0 && defensive.length > 0) {
    actions.push(
      `Pair ${names(offensive)} with ${names(defensive)} in shared lineups where possible. ` +
      `Their profiles are complementary — the defensive work on one end covers the exposure on the other.`
    )
  } else if (offensive.length > 0) {
    actions.push(
      `${names(offensive)} need defensive positioning work — help-side rotations and recovering to their ` +
      `player. Their offensive production is already there; protecting possessions on the other end ` +
      `is what closes the gap.`
    )
  }

  if (devGroup.length > 0) {
    const mostMins = [...devGroup].sort((a, b) => b.mpg - a.mpg)[0]
    actions.push(
      `For the development group: pick one end first. ${mostMins.firstName} is your best candidate ` +
      `to show the fastest improvement — identify their strongest skill and build confidence around it ` +
      `before asking for two-way contributions.`
    )
  }

  return actions
}

// ── Component ─────────────────────────────────────────────────────────────────

const BG     = '#07111e'
const BORDER = '#2a4a6e'
const CARD   = '#0d1b2e'

export default function SoWhatPanel({ players }: { players: PlayerBubble[] }) {
  if (players.length < 2) return null

  const avgOff = players.reduce((s, p) => s + p.off_ppp, 0) / players.length
  const avgDef = players.reduce((s, p) => s + p.def_ppp, 0) / players.length

  const classified: Classified[] = players.map(p => ({
    ...p,
    quadrant: classify(p, avgOff, avgDef),
    netPPP: parseFloat((p.off_ppp - p.def_ppp).toFixed(3)),
  }))

  const byQ = (q: Quadrant) => classified.filter(p => p.quadrant === q)

  const observations = buildObservations(classified, avgOff, avgDef)
  const actions      = buildActions(classified)

  return (
    <div style={{
      marginTop: 20,
      background: CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#97cfdc', letterSpacing: '0.06em' }}>
          SO WHAT?
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          What this tells us — and what to do about it
        </span>
      </div>

      <div style={{ padding: '20px 20px 24px' }}>

        {/* Quadrant cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          {(['two-way', 'defensive', 'offensive', 'development'] as Quadrant[]).map(q => {
            const cfg     = Q_CONFIG[q]
            const members = byQ(q)
            return (
              <div key={q} style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderTop: `3px solid ${cfg.colour}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: cfg.colour, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: cfg.colour, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {cfg.label}
                  </span>
                </div>

                {/* Sub-labels */}
                <div style={{ fontSize: 10, color: '#475569', marginBottom: 10, lineHeight: 1.4 }}>
                  {cfg.offLabel} · {cfg.defLabel}
                </div>

                {/* Players in this quadrant */}
                {members.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    {members.map(p => (
                      <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                          {p.firstName}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: p.netPPP >= 0 ? '#22c55e' : '#ef4444',
                        }}>
                          {p.netPPP >= 0 ? '+' : ''}{p.netPPP.toFixed(3)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#334155', marginBottom: 10, fontStyle: 'italic' }}>
                    No players
                  </div>
                )}

                <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                  {cfg.meaning}
                </div>
              </div>
            )
          })}
        </div>

        {/* Observations */}
        {observations.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#97cfdc', letterSpacing: '0.08em', marginBottom: 12 }}>
              OBSERVATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {observations.map((obs, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#0a1628', border: `1px solid ${BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, color: '#64748b', flexShrink: 0, marginTop: 1,
                  }}>
                    {i + 1}
                  </span>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
                    {obs}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coaching actions */}
        {actions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', letterSpacing: '0.08em', marginBottom: 12 }}>
              COACHING ACTIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actions.map((action, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  background: BG,
                  border: `1px solid ${BORDER}`,
                  borderLeft: '3px solid #c4b5fd',
                  borderRadius: 8,
                  padding: '12px 14px',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', flexShrink: 0, marginTop: 1 }}>
                    →
                  </span>
                  <p style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.65, margin: 0 }}>
                    {action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
