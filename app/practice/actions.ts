'use server'

import { COACHING_WRITING_STANDARDS } from '@/lib/writingStandards'

export interface PracticeDrill {
  name: string
  duration: number   // minutes
  instruction: string
  coachingCue: string
}

export interface PlanBlock {
  phase: 'warmup' | 'skill' | 'competitive' | 'cooldown'
  title: string
  duration: number
  pillar?: string | null
  drills: PracticeDrill[]
  keyInstruction: string
}

export interface GeneratedPlan {
  theme: string
  coachingNote: string
  blocks: PlanBlock[]
}

export interface PillarDrillData {
  name: string
  difficulty: string
  duration_mins: number
  setup: string
  execution: string
  coaching_cues: string[]
}

// Map pillar display name → drills table key
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

const COACHING_CONCEPT: Record<string, string> = {
  'Shot Efficiency':     'shot quality and finishing',
  'Possession Control':  'ball security and decision making',
  'Second Chances':      'offensive rebounding and put-backs',
  'Rim Pressure':        'drawing contact and free throw conversion',
  'Shot Suppression':    'contesting shots and paint protection',
  'Possession Ending':   'defensive rebounding',
  'Possession Creation': 'active hands, steals, and forcing turnovers',
  'Discipline':          'defensive fouls and foul discipline',
}

export async function generatePracticePlan(
  selectedPillarNames: string[],
  drillsByPillar: Record<string, PillarDrillData[]>,
  duration: 60 | 90,
  teamContext: { record: string; netPpp: number; games: number },
  pillarDeltas: Record<string, number>,
): Promise<GeneratedPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      theme: 'Session Builder Unavailable',
      coachingNote: 'Add ANTHROPIC_API_KEY to Vercel environment variables to generate AI practice plans.',
      blocks: [],
    }
  }

  // Build block template based on duration and number of pillars
  const numSkillBlocks = Math.min(selectedPillarNames.length, duration === 60 ? 2 : 3)
  const activePillars = selectedPillarNames.slice(0, numSkillBlocks)

  let blocks: { phase: string; label: string; duration: number; pillarIdx?: number }[]

  if (duration === 60) {
    blocks = [
      { phase: 'warmup',      label: 'Warm-Up & Activation',    duration: 8 },
      { phase: 'skill',       label: activePillars[0] ?? '',     duration: 22, pillarIdx: 0 },
      { phase: 'skill',       label: activePillars[1] ?? '',     duration: 17, pillarIdx: 1 },
      { phase: 'competitive', label: 'Competitive Application',  duration: 10 },
      { phase: 'cooldown',    label: 'Free Throws & Review',     duration: 3  },
    ].filter(b => b.phase !== 'skill' || (b.pillarIdx !== undefined && activePillars[b.pillarIdx]))
  } else {
    // 90 min — 2 or 3 skill blocks
    if (activePillars.length >= 3) {
      blocks = [
        { phase: 'warmup',      label: 'Warm-Up & Activation',   duration: 10 },
        { phase: 'skill',       label: activePillars[0] ?? '',    duration: 20, pillarIdx: 0 },
        { phase: 'skill',       label: activePillars[1] ?? '',    duration: 18, pillarIdx: 1 },
        { phase: 'skill',       label: activePillars[2] ?? '',    duration: 15, pillarIdx: 2 },
        { phase: 'competitive', label: 'Competitive Application', duration: 20 },
        { phase: 'cooldown',    label: 'Free Throws & Review',    duration: 7  },
      ]
    } else {
      blocks = [
        { phase: 'warmup',      label: 'Warm-Up & Activation',   duration: 10 },
        { phase: 'skill',       label: activePillars[0] ?? '',    duration: 25, pillarIdx: 0 },
        { phase: 'skill',       label: activePillars[1] ?? '',    duration: 22, pillarIdx: 1 },
        { phase: 'competitive', label: 'Competitive Application', duration: 25 },
        { phase: 'cooldown',    label: 'Free Throws & Review',    duration: 8  },
      ].filter(b => b.phase !== 'skill' || (b.pillarIdx !== undefined && activePillars[b.pillarIdx]))
    }
  }

  // Build the drills section of the prompt
  const drillsText = activePillars.map((pillarName, i) => {
    const drills = drillsByPillar[pillarName] ?? []
    const concept = COACHING_CONCEPT[pillarName] ?? pillarName
    const delta = pillarDeltas[pillarName] ?? 0
    const drillList = drills.map(d => {
      const topCue = d.coaching_cues?.[0] ?? ''
      return `    • "${d.name}" (${d.difficulty}, ${d.duration_mins} min): ${d.setup} | Execution: ${d.execution}${topCue ? ` | Cue: ${topCue}` : ''}`
    }).join('\n')
    return `${i + 1}. ${pillarName} — delta ${delta > 0 ? '+' : ''}${delta} (${concept})\n${drillList || '    [No drills available — improvise appropriate drill]'}`
  }).join('\n\n')

  const blocksTemplate = blocks.map(b => {
    const pillarInfo = b.pillarIdx !== undefined && activePillars[b.pillarIdx]
      ? ` — focus: ${activePillars[b.pillarIdx]}`
      : ''
    return `  - ${b.label} (${b.duration} min)${pillarInfo}`
  }).join('\n')

  const prompt = `You are designing a practice session for WGT 12.2, a U12 competitive basketball team in Melbourne. Season record: ${teamContext.record}, Net PPP ${teamContext.netPpp >= 0 ? '+' : ''}${teamContext.netPpp} over ${teamContext.games} games.

PRIORITY AREAS FOR THIS SESSION:
${drillsText}

SESSION STRUCTURE (${duration} minutes total):
${blocksTemplate}

Instructions:
- Warm-up: a brief physical activation that directly primes the skills being trained. Not generic stretching — something specific to the session theme.
- Each skill block: assign 1–2 drills from the list above for that pillar. Specify exact minutes per drill. Give one sharp coaching cue for each.
- Competitive application: a live competitive situation (3v3, 4v4, or 5v5 with constraints) that forces players to apply both themes under pressure. Make it specific — name the constraint or rule.
- Cool-down: free throw reps with a clear routine cue, then 1 sentence of debrief focus.
- Use only drills from the list provided. Do not invent drills that are not in the list.
- This is U12. Keep instructions direct and achievable.

${COACHING_WRITING_STANDARDS}

Return ONLY valid JSON — no markdown, no explanation, just the JSON object:
{
  "theme": "2–5 word session title (e.g. 'Ball Security Under Pressure')",
  "coachingNote": "2–3 sentences. What the data says, what this session fixes, what a good session looks like.",
  "blocks": [
    {
      "phase": "warmup",
      "title": "block title",
      "duration": 8,
      "pillar": null,
      "drills": [
        {
          "name": "drill name",
          "duration": 8,
          "instruction": "1–2 sentences — how to set it up and run it",
          "coachingCue": "the one thing players must do in this drill"
        }
      ],
      "keyInstruction": "one sentence — the most important thing for the coach to enforce this block"
    }
  ]
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? ''

    // Strip any markdown code fences if present
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
    return JSON.parse(cleaned) as GeneratedPlan
  } catch (err) {
    console.error('Practice plan generation error:', err)
    return {
      theme: 'Plan Generation Failed',
      coachingNote: 'There was an error generating the plan. Check the API key and try again.',
      blocks: [],
    }
  }
}
