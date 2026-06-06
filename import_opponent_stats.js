/**
 * import_opponent_stats.js
 *
 * Parses opponent_stats.tsv (Hoopsalytics opponent export) and upserts
 * per-game opponent stats into the `opponent_game_stats` table.
 *
 * Run from terminal:
 *   cd ~/Desktop/courtside-iq && node import_opponent_stats.js
 *
 * Prerequisites:
 *   1. Run the SQL in supabase_opponent_schema.sql in the Supabase SQL editor first.
 *   2. Make sure opponent_stats.tsv is in the same folder as this script.
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = 'https://pxefkxtshmuhsuixzgrz.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZWZreHRzaG11aHN1aXh6Z3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDg4NTUsImV4cCI6MjA5NTkyNDg1NX0.M4uTveo8RAf-KIRyfVOvhEN4hb65WuHqoeOCR8jn3lU'
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'pxefkxtshmuhsuixzgrz.supabase.co',
      path,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }
    const req = https.request(options, res => {
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

const get = (path) => request('GET', path, null)
const post = (path, body) => request('POST', path, body)

// ── Date parsing ───────────────────────────────────────────────────────────────

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
}

function parseDate(str) {
  // "May 29, 2026" → "2026-05-29"
  const m = str.trim().match(/(\w+)\s+(\d+),\s+(\d{4})/)
  if (!m) return null
  const month = MONTHS[m[1]]
  if (!month) return null
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`
}

// ── Row label parsing ──────────────────────────────────────────────────────────
// Format: "@ Opponent Name (37‑34) May 29, 2026"
// Scores separated by various dash chars (U+2011, U+2012, U+002D, U+2010)

function parseLabel(label) {
  // Normalise all dash variants to regular hyphen
  const normalized = label.replace(/[‐‑‒–—]/g, '-')
  const m = normalized.match(/\((\d+)-(\d+)\)\s+(.+)$/)
  if (!m) return null
  return {
    team_score: parseInt(m[1], 10),
    opp_score: parseInt(m[2], 10),
    game_date: parseDate(m[3])
  }
}

// ── TSV parsing ────────────────────────────────────────────────────────────────

function parseTSV(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8')
  const lines = raw.split('\n').filter(l => l.trim())

  // Build column index map from header
  const headers = lines[0].split('\t')
  const col = {}
  headers.forEach((h, i) => { col[h.trim()] = i })

  const needed = ['Pts.', '2Pt', '2Pt A', '3Pt', '3Pt A', 'FT', 'FT A',
                  'TO', 'OReb', 'DReb', 'Off. Poss.', 'Off Foul', 'Def Foul',
                  'Ast', 'Stl', 'Blk', 'Off. PPP', 'Def. PPP']
  const missing = needed.filter(n => col[n] === undefined)
  if (missing.length) {
    console.warn('⚠️  Missing columns:', missing.join(', '))
  }

  function n(row, key) {
    const v = row[col[key]]
    if (!v || v === '-') return null
    // Strip % signs, trailing spaces
    return parseFloat(v.replace('%', '').trim()) || 0
  }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split('\t')
    const label = row[0]

    // Skip "All Games" summary row
    if (label.trim().toLowerCase().startsWith('all games')) continue

    const parsed = parseLabel(label)
    if (!parsed) {
      console.warn(`⚠️  Could not parse label: "${label}"`)
      continue
    }

    rows.push({
      ...parsed,
      opp_pts:         n(row, 'Pts.'),
      opp_twopt_made:  n(row, '2Pt'),
      opp_twopt_att:   n(row, '2Pt A'),
      opp_threept_made: n(row, '3Pt'),
      opp_threept_att:  n(row, '3Pt A'),
      opp_ft_made:     n(row, 'FT'),
      opp_ft_att:      n(row, 'FT A'),
      opp_turnovers:   n(row, 'TO'),
      opp_oreb:        n(row, 'OReb'),
      opp_dreb:        n(row, 'DReb'),
      opp_possessions: n(row, 'Off. Poss.'),
      opp_off_fouls:   n(row, 'Off Foul'),
      opp_def_fouls:   n(row, 'Def Foul'),
      opp_ast:         n(row, 'Ast'),
      opp_stl:         n(row, 'Stl'),
      opp_blk:         n(row, 'Blk'),
      opp_off_ppp:     n(row, 'Off. PPP'),
      opp_def_ppp:     n(row, 'Def. PPP'),
    })
  }
  return rows
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📂 Reading TSV...')
  const tsvPath = path.join(__dirname, 'opponent_stats.tsv')
  const rows = parseTSV(tsvPath)
  console.log(`   Parsed ${rows.length} game rows`)

  console.log('\n🗄️  Fetching games from Supabase...')
  const gamesResp = await get('/rest/v1/games?select=id,game_date,team_score,opponent_score')
  if (gamesResp.status !== 200) {
    console.error('❌ Failed to fetch games:', gamesResp.body)
    process.exit(1)
  }
  const games = gamesResp.body
  console.log(`   Found ${games.length} games`)

  // Build lookup: "YYYY-MM-DD|team_score|opp_score" → game_id
  const gameMap = {}
  games.forEach(g => {
    const key = `${g.game_date}|${g.team_score}|${g.opponent_score}`
    gameMap[key] = g.id
  })

  // Match TSV rows to game_ids
  const records = []
  const unmatched = []

  for (const row of rows) {
    const key = `${row.game_date}|${row.team_score}|${row.opp_score}`
    const gameId = gameMap[key]
    if (!gameId) {
      unmatched.push(`${row.game_date} ${row.team_score}-${row.opp_score}`)
      continue
    }
    records.push({
      game_id: gameId,
      team_id: TEAM_ID,
      opp_pts:          row.opp_pts,
      opp_twopt_made:   row.opp_twopt_made,
      opp_twopt_att:    row.opp_twopt_att,
      opp_threept_made: row.opp_threept_made,
      opp_threept_att:  row.opp_threept_att,
      opp_ft_made:      row.opp_ft_made,
      opp_ft_att:       row.opp_ft_att,
      opp_turnovers:    row.opp_turnovers,
      opp_oreb:         row.opp_oreb,
      opp_dreb:         row.opp_dreb,
      opp_possessions:  row.opp_possessions,
      opp_off_fouls:    row.opp_off_fouls,
      opp_def_fouls:    row.opp_def_fouls,
      opp_ast:          row.opp_ast,
      opp_stl:          row.opp_stl,
      opp_blk:          row.opp_blk,
      opp_off_ppp:      row.opp_off_ppp,
      opp_def_ppp:      row.opp_def_ppp,
    })
  }

  if (unmatched.length) {
    console.warn(`\n⚠️  ${unmatched.length} rows couldn't be matched to a game:`)
    unmatched.forEach(u => console.warn(`   - ${u}`))
  }

  console.log(`\n✅ Matched ${records.length} of ${rows.length} rows to games`)

  if (records.length === 0) {
    console.error('❌ No records to insert. Check date/score matching.')
    process.exit(1)
  }

  console.log('\n📤 Upserting opponent stats...')
  const resp = await post(
    '/rest/v1/opponent_game_stats',
    records
  )

  if (resp.status === 200 || resp.status === 201) {
    console.log(`✅ Upserted ${records.length} opponent game stat rows`)
  } else {
    console.error(`❌ Insert failed (${resp.status}):`, JSON.stringify(resp.body, null, 2))
    process.exit(1)
  }

  console.log('\n🏀 Done! Opponent stats imported successfully.')
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
