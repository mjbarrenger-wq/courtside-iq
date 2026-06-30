import { BenchmarkMap } from './driverTree'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function fetchJson(path: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  return res.json()
}

interface Bracket {
  age_group?: string | null
  gender?: string | null
  division?: string | null
}

// Fetches the field-baseline reference values for a team's bracket and returns a
// BenchmarkMap keyed by metric name. A baseline counts as provisional unless its
// source is explicitly 'measured'. Returns an empty map when nothing matches — the
// driver tree then reports every level as provisional/null rather than guessing.
export async function getBenchmarks(bracket: Bracket): Promise<BenchmarkMap> {
  const { age_group, gender, division } = bracket
  if (!age_group || !gender || !division) return {}

  const q = [
    `age_group=eq.${encodeURIComponent(age_group)}`,
    `gender=eq.${encodeURIComponent(gender)}`,
    `division=eq.${encodeURIComponent(division)}`,
    'select=metric,mean,stdev,source',
  ].join('&')

  const rows = await fetchJson(`benchmarks?${q}`)
  if (!Array.isArray(rows)) return {}

  const map: BenchmarkMap = {}
  for (const r of rows) {
    if (!r?.metric || r.mean == null) continue
    map[r.metric] = {
      mean: Number(r.mean),
      stdev: r.stdev == null ? null : Number(r.stdev),
      provisional: r.source !== 'measured',
    }
  }
  return map
}
