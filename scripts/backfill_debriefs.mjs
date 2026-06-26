#!/usr/bin/env node
/*
 * Backfill: pre-generate + store an AI coaching debrief for every game so the
 * Game Debrief renders instantly from the database with no live AI call.
 *
 * Prerequisites:
 *   1. The dev (or prod) server is running.
 *   2. ANTHROPIC_API_KEY is set AND the account has credits (each game = 1 call).
 *   3. DEBRIEF_ADMIN_TOKEN is set in .env.local (enables the admin route) and
 *      passed to this script so it can authenticate.
 *
 * Usage (from the project root, dev server running):
 *   DEBRIEF_ADMIN_TOKEN=your-token node scripts/backfill_debriefs.mjs
 *
 * Options (env vars):
 *   BASE_URL   default http://localhost:3000
 *   ONLY       comma-separated game IDs to limit to (otherwise all games)
 *   FORCE      "1" to regenerate even games that already have a stored debrief
 */

const SB_URL = process.env.SUPABASE_URL || 'https://pxefkxtshmuhsuixzgrz.supabase.co'
const SB_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4ZWZreHRzaG11aHN1aXh6Z3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDg4NTUsImV4cCI6MjA5NTkyNDg1NX0.M4uTveo8RAf-KIRyfVOvhEN4hb65WuHqoeOCR8jn3lU'
const TEAM_ID = 'b1000000-0000-0000-0000-000000000001'
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TOKEN = process.env.DEBRIEF_ADMIN_TOKEN
const FORCE = process.env.FORCE === '1'
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean)

if (!TOKEN) {
  console.error('✗ DEBRIEF_ADMIN_TOKEN is required. Set it in .env.local and pass it to this script.')
  process.exit(1)
}

const sb = (path) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  }).then(r => r.json())

async function main() {
  // Which games already have a stored debrief?
  const existing = await sb(
    `ai_content?entity_type=eq.game_debrief&view_key=eq.default&select=entity_id`,
  )
  const haveDebrief = new Set((Array.isArray(existing) ? existing : []).map(r => r.entity_id))

  let games = await sb(
    `games?team_id=eq.${TEAM_ID}&select=id,game_date,result,opponents(full_name)&order=game_date.asc`,
  )
  games = Array.isArray(games) ? games : []
  if (ONLY.length) games = games.filter(g => ONLY.includes(g.id))

  const todo = games.filter(g => FORCE || !haveDebrief.has(g.id))
  console.log(`${games.length} games · ${haveDebrief.size} already have a debrief · ${todo.length} to generate${FORCE ? ' (FORCE)' : ''}`)

  let ok = 0, fail = 0
  for (const g of todo) {
    const label = `${g.game_date} ${g.result} vs ${g.opponents?.full_name ?? '?'}`
    process.stdout.write(`→ ${label} ... `)
    try {
      const res = await fetch(`${BASE_URL}/api/debrief/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
        body: JSON.stringify({ gameId: g.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) { ok++; console.log('done') }
      else { fail++; console.log(`FAILED — ${data.error || res.status}`) }
    } catch (e) {
      fail++; console.log(`ERROR — ${e.message}`)
    }
    // Gentle pacing to avoid hammering the API.
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone. ${ok} generated, ${fail} failed.`)
  if (fail > 0) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
