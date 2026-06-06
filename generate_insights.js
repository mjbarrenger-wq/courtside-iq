/**
 * generate_insights.js
 *
 * Generates 20 principle-based coaching insights per pillar + direction
 * combination using the Claude API, then inserts them into Supabase.
 *
 * Run once from terminal:
 *   cd ~/Desktop/courtside-iq && node generate_insights.js
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY in .env.local
 *   - coaching_insights table already created in Supabase
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

// ── Config ─────────────────────────────────────────────────────────────────────

// Load .env.local
const envPath = path.join(__dirname, '.env.local')
const envVars = {}
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) envVars[k.trim()] = v.join('=').trim()
  })
}

const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'] || process.env.ANTHROPIC_API_KEY
const SUPABASE_URL  = envVars['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!ANTHROPIC_KEY) { console.error('❌ ANTHROPIC_API_KEY not found in .env.local'); process.exit(1) }
if (!SUPABASE_URL)  { console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found');         process.exit(1) }

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function request(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname, path, method,
      headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }
    const req = https.request(opts, res => {
      let out = ''
      res.on('data', d => out += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }) }
        catch { resolve({ status: res.statusCode, body: out }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function callClaude(prompt) {
  return request(
    'api.anthropic.com',
    '/v1/messages',
    'POST',
    {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    {
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }],
    }
  )
}

function insertToSupabase(records) {
  const sbHost = SUPABASE_URL.replace('https://', '')
  return request(
    sbHost,
    '/rest/v1/coaching_insights',
    'POST',
    {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'return=minimal',
    },
    records
  )
}

// ── Pillar definitions ─────────────────────────────────────────────────────────

const PILLARS = [
  {
    key:   'shot_efficiency',
    label: 'Shot Efficiency',
    strengthContext: 'The team is shooting the ball efficiently — converting their attempts at a high rate and selecting good shots.',
    weaknessContext: 'The team is struggling with shot selection and conversion — too many difficult attempts and not enough high-percentage looks.',
  },
  {
    key:   'possession_control',
    label: 'Possession Control',
    strengthContext: 'The team is taking care of the ball well — limiting turnovers and making smart decisions with every possession.',
    weaknessContext: 'The team is turning the ball over too frequently — poor decision-making and ball security are costing possessions.',
  },
  {
    key:   'extra_possessions',
    label: 'Extra Possessions',
    strengthContext: 'The team is winning the offensive rebounding battle — regularly generating second-chance opportunities.',
    weaknessContext: 'The team is missing out on second-chance opportunities — opponents are outrebounding them on the offensive glass.',
  },
  {
    key:   'pressure_creation',
    label: 'Pressure Creation',
    strengthContext: 'The team is getting to the free-throw line and converting well — creating pressure through aggressive, physical play.',
    weaknessContext: 'The team is not generating enough foul line opportunities or converting them when they do — leaving easy points on the table.',
  },
  {
    key:   'shot_suppression',
    label: 'Shot Suppression',
    strengthContext: 'The team\'s defence is holding opponents to low shooting percentages — contesting well and limiting quality looks.',
    weaknessContext: 'Opponents are finding too many open or easy looks — the defence is not contesting effectively or protecting key areas.',
  },
  {
    key:   'possession_ending',
    label: 'Possession Ending',
    strengthContext: 'The team is finishing defensive possessions strongly with the defensive rebound — limiting opponent second chances.',
    weaknessContext: 'The team is giving up too many offensive rebounds — opponents are generating second-chance opportunities too easily.',
  },
  {
    key:   'pressure_disruption',
    label: 'Pressure & Disruption',
    strengthContext: 'The defence is active and disruptive — forcing turnovers and creating transition opportunities through pressure.',
    weaknessContext: 'The defence is not creating enough turnovers — opponents are moving the ball too freely without being challenged.',
  },
  {
    key:   'discipline',
    label: 'Discipline',
    strengthContext: 'The team is playing disciplined defence — not fouling unnecessarily and forcing opponents to earn their points through the run of play.',
    weaknessContext: 'The team is fouling too much — giving opponents easy points at the free-throw line and putting them in the bonus early.',
  },
]

// ── Writing standards ──────────────────────────────────────────────────────────
// Keep in sync with lib/writingStandards.ts — that file is the canonical source.

const COACHING_WRITING_STANDARDS = `
WRITING STANDARDS (apply to all output — no exceptions):
// Keep in sync with lib/writingStandards.ts — that file is the canonical source.

Basketball coach voice:
- Lead with the action. Tell the coach what to run. The data observation follows briefly, if at all.
- Use imperative sentences. "Run this drill." "Make this a rule." "Add a defender on every rep." Coaches instruct, they do not describe.
- Be drill and constraint specific. Name the scenario or constraint. "3v2 full court with live defence" not "practice under pressure."
- Coaching cues are short. Most instructions land in eight words or fewer.
- Address the head coach as a peer. Speak from performance data directly to the person making decisions.
- Use basketball vocabulary: half-court, shell drill, closeout, gap coverage, kick-out, ball reversal, transition, live-ball, corner, elbow, paint, help side, contest, drive-and-kick, paint collapse. Use these terms — do not substitute generic athletic language.
- Connect every stat to a behaviour or habit. Numbers alone are not the output.
- Age-appropriate for U12. Practically coachable. No elite-level assumptions.

Hard rules:
- No em dashes or hyphens as sentence breaks. Use a period or restructure the sentence.
- No banned vocabulary: unlock, elevate, leverage, enhance, foster, holistic, transformative, seamless, robust, cutting-edge, game-changer, pivotal, crucial, showcase, highlight, underscore, streamline, empower, innovative, dynamic, paradigm, synergy, impactful, groundbreaking, unparalleled, vibrant, meticulously
- No dead phrases: "it's important to note", "moving forward", "that said", "furthermore", "with that in mind", "at the end of the day", "in order to"
- No negative parallelisms. Patterns like "not X, but Y" or "it's not about X, it's about Y" are banned. Keep only the positive claim.
- No significance inflation: avoid "pivotal", "marking a shift", "setting the stage for", "crucial moment", "represents a significant"
- No meta commentary. Say the thing — do not announce that you are about to say it.

Style:
- Short sentences carry authority. Vary length but default short for instructions.
- State the fact. Let the coach judge its significance.
- Use the team name or "your team", not "the squad" or "the athletes".
`.trim()

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildPrompt(pillar, direction) {
  const ctx = direction === 'strength' ? pillar.strengthContext : pillar.weaknessContext
  const angle = direction === 'strength'
    ? 'how to build on, maintain, and deepen this advantage'
    : 'practical, developmentally appropriate ways to address and improve this area'

  return `You are a head basketball coach for a U12 team in Australia, writing pre-training notes to share with your assistant coaches.

Current situation for the "${pillar.label}" pillar: ${ctx}

Write exactly 20 coaching insights about ${angle}. Each insight must give a coach a specific action to take at training — a drill to run, a constraint to set, a habit to build. Lead with what to do. The data context follows if it adds anything.

Requirements:
- Each insight is 1-3 sentences
- Lead with an imperative: "Run...", "Set up...", "Add...", "Make this a rule...", "At training this week..."
- Name the drill type, constraint, or specific scenario — not just the general concept
- Never reference specific statistics or percentages (this is qualitative coaching guidance)
- Age-appropriate and practically coachable for 11-12 year olds
- Vary the focus: some about team habits, some about individual positioning, some about drill design
- Each insight approaches the problem from a different angle — no repeated advice

${COACHING_WRITING_STANDARDS}

Return ONLY a valid JSON array of exactly 20 strings. No preamble, no explanation:
["Insight 1", "Insight 2", ..., "Insight 20"]`
}

// ── Sleep helper ───────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏀 Courtside IQ — Coaching Insights Generator')
  console.log(`   Generating insights for ${PILLARS.length} pillars × 2 directions = ${PILLARS.length * 2} combinations\n`)

  let totalInserted = 0
  let errors = 0

  for (const pillar of PILLARS) {
    for (const direction of ['strength', 'weakness']) {
      console.log(`⏳ Generating: ${pillar.label} — ${direction}...`)

      let insights = []
      let attempts = 0

      while (insights.length === 0 && attempts < 3) {
        attempts++
        try {
          const res = await callClaude(buildPrompt(pillar, direction))

          if (res.status !== 200) {
            console.warn(`   ⚠️  Claude API error (${res.status}):`, JSON.stringify(res.body).slice(0, 200))
            await sleep(2000)
            continue
          }

          const raw = res.body?.content?.[0]?.text ?? ''
          const cleaned = raw.replace(/```json|```/g, '').trim()
          const parsed = JSON.parse(cleaned)

          if (!Array.isArray(parsed) || parsed.length === 0) {
            console.warn('   ⚠️  Unexpected response format, retrying...')
            await sleep(1000)
            continue
          }

          insights = parsed.slice(0, 20)
        } catch (err) {
          console.warn(`   ⚠️  Error on attempt ${attempts}:`, err.message)
          await sleep(2000)
        }
      }

      if (insights.length === 0) {
        console.error(`   ❌ Failed to generate insights for ${pillar.key}/${direction} after 3 attempts`)
        errors++
        continue
      }

      // Insert into Supabase
      const records = insights.map(text => ({
        pillar:    pillar.key,
        direction: direction,
        context:   'team',
        text:      text,
      }))

      const insertRes = await insertToSupabase(records)

      if (insertRes.status === 200 || insertRes.status === 201) {
        console.log(`   ✅ Inserted ${records.length} insights`)
        totalInserted += records.length
      } else {
        console.error(`   ❌ Insert failed (${insertRes.status}):`, JSON.stringify(insertRes.body).slice(0, 200))
        errors++
      }

      // Respectful rate limiting
      await sleep(800)
    }
  }

  console.log(`\n🏁 Done!`)
  console.log(`   Inserted: ${totalInserted} insights`)
  if (errors > 0) console.log(`   Errors:   ${errors} combinations failed`)
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
