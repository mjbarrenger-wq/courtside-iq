// Typed PostgREST reads for server components.
//
// Every page used to carry its own untyped `fetchJson` and then guard with
// `Array.isArray(raw) ? raw : []`. This is that helper once, generic over the
// row type from lib/dbTypes.ts, with the guard built in: a PostgREST error body
// (an object, not an array) becomes an empty list, exactly as before.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Fetch `/rest/v1/<path>` and return the rows typed as T[] (empty on error). */
export async function fetchRows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: 'no-store',
  })
  const json: unknown = await res.json()
  return Array.isArray(json) ? (json as T[]) : []
}
