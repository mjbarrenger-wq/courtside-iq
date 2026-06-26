import { NextRequest, NextResponse } from 'next/server'
import { generateAndStoreDebrief } from '@/lib/generateDebrief'

export const dynamic = 'force-dynamic'

// Admin-only endpoint used by the backfill script to pre-generate + store game
// debriefs in bulk. Disabled unless DEBRIEF_ADMIN_TOKEN is set in the env, and
// the caller must send a matching x-admin-token header. The in-app Regenerate
// button does NOT use this route — it calls the server action directly.
export async function POST(req: NextRequest) {
  const token = process.env.DEBRIEF_ADMIN_TOKEN
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Backfill route disabled. Set DEBRIEF_ADMIN_TOKEN in .env.local to enable it.' },
      { status: 403 },
    )
  }
  if (req.headers.get('x-admin-token') !== token) {
    return NextResponse.json({ ok: false, error: 'Unauthorised.' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const gameId = body?.gameId
  if (!gameId || typeof gameId !== 'string') {
    return NextResponse.json({ ok: false, error: 'gameId (string) required.' }, { status: 400 })
  }

  const result = await generateAndStoreDebrief(gameId)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
