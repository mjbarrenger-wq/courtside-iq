import { type DriverTreeOutput } from '@/lib/driverTree'
import { COACHING_WRITING_STANDARDS } from '@/lib/writingStandards'

interface GameDebriefProps {
  opponentName: string
  isWin: boolean
  teamScore: number
  oppScore: number
  gameDate: string
  gameTree: DriverTreeOutput
  seasonTree: DriverTreeOutput
}

export function DebriefSkeleton() {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e5eb',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{
        padding: '13px 20px',
        borderBottom: '1px solid #e2e5eb',
        fontSize: 13,
        fontWeight: 700,
        color: '#307b92',
      }}>
        AI COACHING DEBRIEF
      </div>
      <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
        `}</style>
        {[80, 95, 70, 88, 60].map((w, i) => (
          <div key={i} style={{
            height: 14,
            width: `${w}%`,
            background: '#e2e5eb',
            borderRadius: 4,
            animation: 'pulse 1.8s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
        <div style={{ height: 12 }} />
        {[92, 78, 85, 55].map((w, i) => (
          <div key={i} style={{
            height: 14,
            width: `${w}%`,
            background: '#e2e5eb',
            borderRadius: 4,
            animation: 'pulse 1.8s ease-in-out infinite',
            animationDelay: `${i * 0.1 + 0.5}s`,
          }} />
        ))}
        <div style={{ height: 12 }} />
        {[75, 88].map((w, i) => (
          <div key={i} style={{
            height: 14,
            width: `${w}%`,
            background: '#e2e5eb',
            borderRadius: 4,
            animation: 'pulse 1.8s ease-in-out infinite',
            animationDelay: `${i * 0.1 + 1}s`,
          }} />
        ))}
      </div>
    </div>
  )
}

export default async function GameDebrief({
  opponentName,
  isWin,
  teamScore,
  oppScore,
  gameDate,
  gameTree,
  seasonTree,
}: GameDebriefProps) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const allGamePillars = [...gameTree.pillars.offensive, ...gameTree.pillars.defensive]
  const allSeasonPillars = [...seasonTree.pillars.offensive, ...seasonTree.pillars.defensive]

  // Build vs-season comparison for each pillar
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
  const weakPillars   = pillarComparisons.filter(p => p.vsAvg < 0).slice(-2).reverse()

  const netPppDiff = +(gameTree.net_ppp - seasonTree.net_ppp).toFixed(2)

  const prompt = `You are a basketball coaching intelligence system writing a post-game debrief for a U12 team coach.

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

TASK: Write a coaching debrief in 2-3 short paragraphs (150-250 words total). Structure:
1. The performance story — what drove the ${isWin ? 'win' : 'loss'} in performance terms (not the final score)
2. What stood out vs their usual level — where did they over- or under-perform relative to the season?
3. One specific coaching focus for the next training session based on this game

Do not recap the score. Do not list every stat. Write like a basketball professional briefing a coaching peer. Be specific about the basketball behaviours behind the numbers.

${COACHING_WRITING_STANDARDS}`

  let debrief = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    debrief = data.content?.[0]?.text ?? ''
  } catch {
    debrief = 'Debrief unavailable — check API key configuration.'
  }

  const paragraphs = debrief.split('\n\n').filter(p => p.trim().length > 0)

  // Determine the leakage pillars for this game (for Practice link)
  const gameleakage = [...gameTree.leakage_areas].slice(0, 2).map(d => d.pillar)
  const practiceHref = `/practice`

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e5eb',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{
        padding: '13px 20px',
        borderBottom: '1px solid #e2e5eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#307b92' }}>AI COACHING DEBRIEF</span>
        <a
          href={practiceHref}
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#ffffff',
            background: '#307b92',
            border: 'none',
            borderRadius: 6,
            padding: '5px 14px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Build Practice Plan →
        </a>
      </div>
      <div style={{ padding: '18px 20px' }}>
        {paragraphs.map((para, i) => (
          <p key={i} style={{
            fontSize: 13,
            color: '#374151',
            lineHeight: 1.75,
            margin: i === 0 ? '0 0 14px' : '0 0 14px',
          }}>
            {para.trim()}
          </p>
        ))}
      </div>
    </div>
  )
}
