import { CONFIG } from '../../config'

// Thin client for the Supabase REST API — plain fetch, no SDK dependency.
// All functions fail soft: false/null on any error, the game never breaks offline.

export interface LeaderboardEntry {
  name: string
  satisfaction: number
  ops_score: number
  seed: string
  created_at: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

let fetchImpl: FetchLike = (input, init) => fetch(input, init)

/** Test hook */
export function setFetchImpl(f: FetchLike): void {
  fetchImpl = f
}

export function backendConfigured(): boolean {
  return CONFIG.backend.supabaseUrl !== '' && CONFIG.backend.supabaseAnonKey !== ''
}

function headers(): Record<string, string> {
  return {
    apikey: CONFIG.backend.supabaseAnonKey,
    Authorization: `Bearer ${CONFIG.backend.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  }
}

export async function submitScore(entry: {
  name: string
  satisfaction: number
  opsScore: number
  seed: string
}): Promise<boolean> {
  if (!backendConfigured()) return false
  try {
    const res = await fetchImpl(`${CONFIG.backend.supabaseUrl}/rest/v1/leaderboard`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        name: entry.name.slice(0, 20),
        satisfaction: entry.satisfaction,
        ops_score: Math.round(entry.opsScore),
        seed: entry.seed,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Top entries, best satisfaction first then ops score; optionally one seed only (daily challenge) */
export async function fetchTop(options?: { seed?: string; limit?: number }): Promise<LeaderboardEntry[] | null> {
  if (!backendConfigured()) return null
  const params = new URLSearchParams({
    select: 'name,satisfaction,ops_score,seed,created_at',
    order: 'satisfaction.desc,ops_score.desc',
    limit: String(options?.limit ?? 50),
  })
  if (options?.seed) params.set('seed', `eq.${options.seed}`)
  try {
    const res = await fetchImpl(
      `${CONFIG.backend.supabaseUrl}/rest/v1/leaderboard?${params}`,
      { headers: headers() }
    )
    if (!res.ok) return null
    return (await res.json()) as LeaderboardEntry[]
  } catch {
    return null
  }
}

/** Suggestion box: write-only for players; Rahul reads it in the Supabase dashboard */
export async function submitFeedback(name: string, message: string): Promise<boolean> {
  if (!backendConfigured()) return false
  try {
    const res = await fetchImpl(`${CONFIG.backend.supabaseUrl}/rest/v1/feedback`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ name: name.slice(0, 20), message: message.slice(0, 2000) }),
    })
    return res.ok
  } catch {
    return false
  }
}
