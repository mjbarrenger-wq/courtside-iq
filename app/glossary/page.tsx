'use client'

import { useState, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Term {
  abbr: string
  full: string
  formula?: string
  definition: string
  basketball: string
  category: Category
}

type Category =
  | 'Core'
  | 'Shot Efficiency'
  | 'Possession Control'
  | 'Extra Possessions'
  | 'Rim Pressure'
  | 'Shot Suppression'
  | 'Possession Ending'
  | 'Pressure & Disruption'
  | 'Discipline'
  | 'General'

// ── Glossary data ─────────────────────────────────────────────────────────────
const TERMS: Term[] = [
  // Core
  {
    abbr: 'CIQ',
    full: 'Courtside IQ Rating',
    formula: 'blend(box value, on-court net) per 100 poss',
    definition: 'Courtside IQ\'s own player value metric, in points of value per 100 possessions. It combines an individual box-score estimate — scoring relative to the level\'s break-even rate (~0.63 points per play), plus credit for assists, offensive/defensive rebounds, steals and blocks, minus turnovers and defensive fouls — with the team\'s net points per 100 while the player is on the floor. The on-court half is shrunk toward the box estimate and earns weight as play-by-play possessions accumulate (K=150). Replaces the imported VPS metric.',
    basketball: 'One number to compare overall value across the roster. A higher CIQ means a player adds more per possession — through efficient scoring, playmaking, rebounding and winning defensive plays — than a break-even contributor; around zero is break-even (neutral value). It rewards two-way impact, not just points. It is box-dominant until more games carry full play-by-play, at which point a strong defender\'s on-court value surfaces more clearly.',
    category: 'Core',
  },
  {
    abbr: 'Break-even',
    full: 'Break-even Level',
    definition: 'The neutral anchor point (zero) of a value metric like CIQ — the output of a player who neither adds nor loses value per possession. They score at about the level\'s break-even scoring rate (~0.63 points per play) and their assists, rebounds, steals and blocks roughly cancel their turnovers and fouls, so their net value lands near zero. Borrowed from the "replacement level" idea in sports analytics (the value of a freely-available fill-in), but calibrated here to break-even rather than below-average.',
    basketball: 'A player around break-even is not bad — they did the expected things at the expected rate. Value is built by the players climbing well clear of it; players below zero are where inefficient shooting, turnovers or fouls are costing the team. Read CIQ against this zero line: how far above or below break-even is each player?',
    category: 'Core',
  },
  {
    abbr: 'Net PPP',
    full: 'Net Points Per Possession',
    formula: 'Off PPP − Def PPP',
    definition: 'The difference between a team\'s offensive and defensive points per possession. The primary summary metric for overall team performance.',
    basketball: 'A positive Net PPP means the team scores more per possession than it concedes. The further above zero, the more dominant the team is on both ends combined.',
    category: 'Core',
  },
  {
    abbr: 'Off PPP',
    full: 'Offensive Points Per Possession',
    formula: 'Points scored ÷ offensive possessions',
    definition: 'Points generated per offensive possession. Measures how effectively a team converts its possessions into points.',
    basketball: 'A higher Off PPP means the team is getting more value out of each offensive opportunity — through efficient shooting, good shot selection, or creating extra possessions.',
    category: 'Core',
  },
  {
    abbr: 'Def PPP',
    full: 'Defensive Points Per Possession',
    formula: 'Points conceded ÷ defensive possessions',
    definition: 'Points conceded per defensive possession. Lower is better. Measures how effectively a team prevents the opponent from scoring.',
    basketball: 'A low Def PPP reflects good shot defence, possession ending, and defensive discipline — the team is consistently forcing bad shots or stopping the opponent before they get one.',
    category: 'Core',
  },
  {
    abbr: 'Possession',
    full: 'Possession',
    definition: 'A single offensive sequence ending in a field goal attempt, turnover, or trip to the free throw line. The basic unit of basketball analysis.',
    basketball: 'Counting in possessions — rather than points or shots — normalises for pace and gives a true read on efficiency. Two teams can score the same points but have very different effectiveness if one plays faster.',
    category: 'Core',
  },

  // Shot Efficiency
  {
    abbr: 'TS%',
    full: 'True Shooting Percentage',
    formula: 'PTS ÷ (2 × (FGA + 0.44 × FTA))',
    definition: 'The most complete measure of shooting efficiency. Accounts for 2-pointers, 3-pointers, and free throws on equal footing. The 0.44 factor estimates the proportion of free throw trips that use two attempts.',
    basketball: 'A player who scores 10 points on 4-of-5 shooting is efficient; one who scores 10 points on 4-of-12 shooting is not. TS% captures that difference better than raw field goal percentage.',
    category: 'Shot Efficiency',
  },
  {
    abbr: 'eFG%',
    full: 'Effective Field Goal Percentage',
    formula: '(FGM + 0.5 × 3PM) ÷ FGA',
    definition: 'Adjusts field goal percentage to account for the extra value of three-point shots. A made three-pointer is worth 50% more than a made two-pointer, which is reflected by the 0.5 multiplier.',
    basketball: 'eFG% answers the question: if you account for the value of where shots are taken from, how efficiently is this player shooting? It\'s a better read on shot quality than raw FG%.',
    category: 'Shot Efficiency',
  },
  {
    abbr: '2Pt%',
    full: '2-Point Field Goal Percentage',
    formula: '2-point FGM ÷ 2-point FGA',
    definition: 'Conversion rate on shots taken inside the three-point line. The most direct measure of paint efficiency and mid-range effectiveness.',
    basketball: 'Most U12 offence occurs inside the arc. A high 2Pt% means a player is taking and making good shots close to the basket, or has strong touch in the mid-range.',
    category: 'Shot Efficiency',
  },
  {
    abbr: 'FTF',
    full: 'Free Throw Frequency',
    formula: 'FTA ÷ FGA',
    definition: 'Free throw attempts relative to field goal attempts — a rate, not a per-game count. Measures how often a player draws fouls when attacking. Matches the "FTF" figure in Hoopsalytics.',
    basketball: 'A high FTF signals a player who attacks the basket aggressively and draws contact. It\'s a proxy for offensive aggression — players who play tentatively rarely get to the line.',
    category: 'Shot Efficiency',
  },

  // Possession Control
  {
    abbr: 'TO%',
    full: 'Turnover Rate',
    formula: 'TOV ÷ (FGA + 0.44 × FTA + TOV)',
    definition: 'Turnovers as a proportion of total possessions used. More accurate than raw turnover count because it adjusts for how many possessions a player is involved in.',
    basketball: 'A player who turns it over 3 times on 20 possessions is less of a problem than one who turns it over 3 times on 8. TO% makes that distinction. Lower is better.',
    category: 'Possession Control',
  },
  {
    abbr: 'TO/G',
    full: 'Turnovers Per Game',
    definition: 'Raw turnover count per game. Context-dependent — higher-usage players naturally have more possessions and thus more opportunities to turn it over.',
    basketball: 'Useful for understanding the absolute cost to the team (each turnover surrenders a possession), but should always be read alongside TO% to understand efficiency.',
    category: 'Possession Control',
  },
  {
    abbr: 'A/TO',
    full: 'Assist-to-Turnover Ratio',
    formula: 'AST ÷ TOV',
    definition: 'Assists divided by turnovers. Measures how productively a player handles the ball — creating scoring opportunities for teammates relative to the possessions they give away.',
    basketball: 'A ratio above 1.0 means a player creates more than they cost. A ratio below 1.0 means their turnovers are outweighing their playmaking value.',
    category: 'Possession Control',
  },
  {
    abbr: 'Off Fouls/G',
    full: 'Offensive Fouls Per Game',
    definition: 'Offensive fouls committed per game. An offensive foul immediately surrenders possession and cancels the scoring play.',
    basketball: 'Offensive fouls are high-cost mistakes — they wipe out a possession before a shot is taken and hand the ball directly to the opponent. Lower is better.',
    category: 'Possession Control',
  },

  // Extra Possessions
  {
    abbr: 'OReb/G',
    full: 'Offensive Rebounds Per Game',
    definition: 'Offensive rebounds secured per game. Each offensive rebound extends a possession and creates an additional scoring opportunity from a missed shot.',
    basketball: 'Offensive rebounding is one of the highest-leverage activities on the floor — it turns a failed possession into a second chance. Active offensive rebounders directly increase a team\'s number of scoring opportunities.',
    category: 'Extra Possessions',
  },
  {
    abbr: 'OReb%',
    full: 'Offensive Rebound Percentage',
    formula: 'OReb ÷ (OReb + Opp DReb)',
    definition: 'The percentage of available offensive rebounds a player or team secures. Adjusts for the number of opportunities rather than just counting boards.',
    basketball: 'OReb% answers: when a shot goes up, how often does this team get the ball back? A high OReb% means the team is consistently converting missed shots into second possessions.',
    category: 'Extra Possessions',
  },
  {
    abbr: 'Total Reb/G',
    full: 'Total Rebounds Per Game',
    definition: 'Combined offensive and defensive rebounds per game.',
    basketball: 'A general indicator of rebounding activity and presence in the paint. Most meaningful when broken into offensive and defensive components, which reflect very different basketball outcomes.',
    category: 'Extra Possessions',
  },

  // Rim Pressure
  {
    abbr: 'FTA/G',
    full: 'Free Throw Attempts Per Game',
    formula: 'FTA ÷ Games',
    definition: 'Free throw attempts per game — a per-game count, not a rate. Measures how often a player attacks the basket and draws defensive fouls. (For the rate version comparable to Hoopsalytics, see FTF.)',
    basketball: 'Getting to the line is a skill. A high FTA/G means a player is aggressive attacking the rim and forcing defenders to foul. It creates easy scoring opportunities and puts opponents in foul trouble.',
    category: 'Rim Pressure',
  },
  {
    abbr: 'FT%',
    full: 'Free Throw Percentage',
    formula: 'FTM ÷ FTA',
    definition: 'Conversion rate at the free throw line. Free throws are uncontested attempts, so FT% reflects shooting mechanics and composure under pressure.',
    basketball: 'Getting to the line only matters if you convert. A player with high FTA/G but low FT% is attacking the basket but leaving points on the board — the aggression is there but the mechanics need work.',
    category: 'Rim Pressure',
  },
  {
    abbr: 'FT Made/G',
    full: 'Free Throws Made Per Game',
    definition: 'Free throws converted per game. The actual scoring output from the free throw line.',
    basketball: 'The end product of getting to the line. Combined with FTA/G and FT%, it shows both how often a player earns free throws and how much scoring they generate from them.',
    category: 'Rim Pressure',
  },

  // Shot Suppression
  {
    abbr: 'Def 2Pt%',
    full: 'Defensive 2-Point Percentage',
    definition: 'Opponent\'s conversion rate on 2-point attempts when defended. Lower is better. Reflects the quality of interior defence and shot contesting.',
    basketball: 'A low Def 2Pt% means the team is contesting shots at the rim, maintaining paint discipline, and forcing opponents into difficult attempts inside the arc.',
    category: 'Shot Suppression',
  },
  {
    abbr: 'Def 3Pt%',
    full: 'Defensive 3-Point Percentage',
    definition: 'Opponent\'s conversion rate on 3-point attempts when defended. Lower is better. Reflects perimeter closeout discipline and defensive positioning.',
    basketball: 'Surrendering open threes is one of the most costly defensive breakdowns — a made three generates 1.5 times the value of a made two. A low Def 3Pt% means the team is closing out on shooters and contesting perimeter shots.',
    category: 'Shot Suppression',
  },
  {
    abbr: 'Def PPP',
    full: 'Defensive Points Per Possession',
    formula: 'Opponent points ÷ opponent possessions',
    definition: 'Points conceded per defensive possession. The summary metric for overall defensive effectiveness.',
    basketball: 'Combines shot quality conceded, turnovers forced, and rebounding to give a single read on how well the defence is performing. Lower is better.',
    category: 'Shot Suppression',
  },

  // Possession Ending
  {
    abbr: 'DReb/G',
    full: 'Defensive Rebounds Per Game',
    definition: 'Defensive rebounds secured per game. Securing the defensive rebound ends the opponent\'s possession cleanly and denies any second-chance opportunity.',
    basketball: 'Every missed defensive rebound gives the opponent another shot. Strong defensive rebounding is about finishing possessions — making the opponent earn a new one rather than recycling the same one.',
    category: 'Possession Ending',
  },
  {
    abbr: 'DReb%',
    full: 'Defensive Rebound Percentage',
    formula: 'DReb ÷ (DReb + Opp OReb)',
    definition: 'The percentage of available defensive rebounds a player or team secures. Adjusts for opportunity rather than counting raw totals.',
    basketball: 'A high DReb% means the team is consistently cleaning the glass on defence — not letting opponents stay alive through second chances. One of the most reliable indicators of defensive discipline.',
    category: 'Possession Ending',
  },
  {
    abbr: 'Opp OReb/G',
    full: 'Opponent Offensive Rebounds Per Game',
    definition: 'Offensive rebounds surrendered to the opponent per game. The direct cost measure of defensive rebounding failure.',
    basketball: 'Each opponent offensive rebound is a possession the defence should have ended but didn\'t. A high Opp OReb/G inflates the opponent\'s effective possession count and creates easy scoring opportunities.',
    category: 'Possession Ending',
  },

  // Pressure & Disruption
  {
    abbr: 'STL/G',
    full: 'Steals Per Game',
    definition: 'Steals per game. A steal directly ends the opponent\'s possession and creates a new offensive possession, making it one of the highest-value individual defensive events.',
    basketball: 'A steal is worth two possessions — it takes one away from the opponent and gives one to the defence. Players with high STL/G are actively disrupting the opponent\'s attack and generating transition opportunities.',
    category: 'Pressure & Disruption',
  },
  {
    abbr: 'BLK/G',
    full: 'Blocks Per Game',
    definition: 'Blocked shots per game. Measures shot-rejecting activity at the rim and around the basket.',
    basketball: 'A block prevents a shot from going in and — if possession is retained — creates a defensive rebound opportunity. It\'s also a deterrent: shot-blockers alter attempts they don\'t block by forcing opponents to change their attack.',
    category: 'Pressure & Disruption',
  },
  {
    abbr: 'Def TO%',
    full: 'Defensive Turnover Rate',
    formula: 'Opponent TOV ÷ opponent possessions',
    definition: 'The proportion of opponent possessions that end in a turnover. Measures how effectively the defence forces mistakes.',
    basketball: 'A high Def TO% means the defence is applying pressure that breaks down the opponent\'s ball handling and decision-making — generating possessions without even needing a shot to be taken.',
    category: 'Pressure & Disruption',
  },

  // Discipline
  {
    abbr: 'Def Fouls/G',
    full: 'Defensive Fouls Per Game',
    definition: 'Defensive fouls committed per game. Defensive fouls extend the opponent\'s possession and surrender free throw attempts. Lower is better.',
    basketball: 'Fouling is costly: it gives the opponent uncontested scoring attempts, removes defensive players via foul trouble, and can generate two or three points from what might have been a missed shot.',
    category: 'Discipline',
  },
  {
    abbr: 'Opp FTA/G',
    full: 'Opponent Free Throw Attempts Per Game',
    formula: 'Opp FTA ÷ Games',
    definition: 'How many free throw attempts the opponent earns per game. A measure of defensive foul discipline and physicality.',
    basketball: 'A high Opp FTA/G means the defence is giving the opponent easy, uncontested scoring opportunities at the line. Disciplined defence contests shots without fouling.',
    category: 'Discipline',
  },
  {
    abbr: 'Opp FT%',
    full: 'Opponent Free Throw Percentage',
    definition: 'The opponent\'s free throw conversion rate. Once the opponent is at the line, this measures how much damage the fouling actually causes.',
    basketball: 'Context stat — relevant when combined with Opp FTA/G. A team might foul often but face poor free throw shooters; or rarely foul but allow a high conversion rate when they do.',
    category: 'Discipline',
  },

  // General
  {
    abbr: '+/−',
    full: 'Plus/Minus',
    definition: 'The point differential while a player is on the court. A positive number means the team outscored opponents during that player\'s minutes; negative means the team was outscored.',
    basketball: 'A blunt but useful on-court impact measure. It reflects the full picture — offence and defence — without isolating individual stats. Most meaningful over larger samples; single-game +/− can be heavily influenced by teammates and opponents.',
    category: 'General',
  },
  {
    abbr: 'MPG',
    full: 'Minutes Per Game',
    definition: 'Average minutes played per game. Reflects a player\'s role, conditioning, and coach\'s confidence in their impact.',
    basketball: 'Minutes are a proxy for trust and contribution. Players with higher MPG are relied on more heavily; comparing stats per minute (rather than per game) between players with different MPG gives a fairer read on efficiency.',
    category: 'General',
  },
]

const CATEGORIES: Category[] = [
  'Core',
  'Shot Efficiency',
  'Possession Control',
  'Extra Possessions',
  'Rim Pressure',
  'Shot Suppression',
  'Possession Ending',
  'Pressure & Disruption',
  'Discipline',
  'General',
]

const CATEGORY_SIDE = {
  'Core':                 { color: '#307b92', bg: 'rgba(48,123,146,0.10)'  },
  'Shot Efficiency':      { color: '#059669', bg: 'rgba(5,150,105,0.10)'   },
  'Possession Control':   { color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
  'Extra Possessions':    { color: '#2563eb', bg: 'rgba(37,99,235,0.10)'  },
  'Rim Pressure':         { color: '#d97706', bg: 'rgba(217,119,6,0.10)'  },
  'Shot Suppression':     { color: '#4b7a96', bg: 'rgba(75,122,150,0.10)' },
  'Possession Ending':    { color: '#0891b2', bg: 'rgba(8,145,178,0.10)'  },
  'Pressure & Disruption':{ color: '#ea580c', bg: 'rgba(234,88,12,0.10)'  },
  'Discipline':           { color: '#dc2626', bg: 'rgba(220,38,38,0.10)'  },
  'General':              { color: '#6b7280', bg: 'rgba(107,114,128,0.10)'},
} as const

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return TERMS.filter(t => {
      const matchCat  = activeCategory === 'All' || t.category === activeCategory
      const matchText = !q || [t.abbr, t.full, t.definition, t.basketball].some(s => s.toLowerCase().includes(q))
      return matchCat && matchText
    })
  }, [search, activeCategory])

  // Group filtered terms by category, preserving CATEGORIES order
  const grouped = useMemo(() => {
    const map: Partial<Record<Category, Term[]>> = {}
    for (const t of filtered) {
      if (!map[t.category]) map[t.category] = []
      map[t.category]!.push(t)
    }
    return CATEGORIES.filter(c => map[c]?.length).map(c => ({ category: c, terms: map[c]! }))
  }, [filtered])

  const BG     = '#f4f5f7'
  const CARD   = '#ffffff'
  const BORDER = '#e2e5eb'

  return (
    <main style={{
      background: BG,
      minHeight: '100vh',
      color: '#1a1f2e',
      fontFamily: "'Inter', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased',
      paddingBottom: 60,
    }}>

      {/* ── Header ── */}
      <div style={{ background: '#ffffff', borderBottom: `1px solid ${BORDER}`, padding: '12px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1f2e', letterSpacing: '0.05em' }}>
              GLOSSARY
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Definitions for every metric used in Courtside IQ &nbsp;·&nbsp;
              <span style={{ color: '#307b92', fontWeight: 700 }}>CMD Sports Analytics</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 0' }}>

        {/* ── Search ── */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search metrics, definitions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#1a1f2e',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── Category filter chips ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {(['All', ...CATEGORIES] as const).map(cat => {
            const active = activeCategory === cat
            const style  = cat !== 'All' ? CATEGORY_SIDE[cat] : null
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '5px 12px', borderRadius: 20,
                  cursor: 'pointer',
                  border: active
                    ? `1px solid ${style?.color ?? '#307b92'}`
                    : `1px solid #e2e5eb`,
                  background: active
                    ? (style?.bg ?? 'rgba(48,123,146,0.12)')
                    : '#eef1f6',
                  color: active
                    ? (style?.color ?? '#307b92')
                    : '#6b7280',
                  transition: 'all 0.15s',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>

        {/* ── Term count ── */}
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
          {filtered.length} {filtered.length === 1 ? 'metric' : 'metrics'}
          {search || activeCategory !== 'All' ? ' matching filters' : ' total'}
        </div>

        {/* ── Grouped terms ── */}
        {grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280', fontSize: 13 }}>
            No metrics match your search.
          </div>
        ) : (
          grouped.map(({ category, terms }) => {
            const { color, bg } = CATEGORY_SIDE[category]
            return (
              <div key={category} style={{ marginBottom: 36 }}>

                {/* Category heading */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: 12,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color,
                    background: bg,
                    padding: '4px 10px', borderRadius: 4,
                    border: `1px solid ${color}30`,
                  }}>
                    {category}
                  </div>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                </div>

                {/* Terms in this category */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {terms.map(term => (
                    <div
                      key={term.abbr}
                      style={{
                        background: CARD,
                        border: `1px solid ${BORDER}`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: 8,
                        padding: '16px 18px',
                      }}
                    >
                      {/* Term header */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color, fontFamily: 'monospace' }}>
                          {term.abbr}
                        </span>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
                          {term.full}
                        </span>
                        {term.formula && (
                          <span style={{
                            fontSize: 11, color: '#6b7280',
                            background: '#f0f2f7',
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            padding: '2px 7px',
                            fontFamily: 'monospace',
                            marginLeft: 'auto',
                          }}>
                            {term.formula}
                          </span>
                        )}
                      </div>

                      {/* Definition */}
                      <p style={{ fontSize: 13, color: '#374151', margin: '0 0 8px', lineHeight: 1.6 }}>
                        {term.definition}
                      </p>

                      {/* Basketball meaning */}
                      <p style={{
                        fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.6,
                        paddingTop: 8, borderTop: `1px solid ${BORDER}`,
                      }}>
                        <span style={{ color: '#6b7280', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 6 }}>
                          On the floor:
                        </span>
                        {term.basketball}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}
