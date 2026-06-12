import { afterEach, describe, expect, it } from 'bun:test'
import { CONFIG } from '../../config'
import { backendConfigured, fetchTop, setFetchImpl, submitFeedback, submitScore, type FetchLike } from './leaderboard'

const backend = CONFIG.backend as { supabaseUrl: string; supabaseAnonKey: string }

function configure(): void {
  backend.supabaseUrl = 'https://test.supabase.co'
  backend.supabaseAnonKey = 'test-key'
}

afterEach(() => {
  backend.supabaseUrl = ''
  backend.supabaseAnonKey = ''
  setFetchImpl((input, init) => fetch(input, init))
})

describe('leaderboard client', () => {
  it('does nothing when the backend is not configured', async () => {
    let called = false
    setFetchImpl((() => {
      called = true
      return Promise.resolve(new Response('[]'))
    }) as FetchLike)
    expect(backendConfigured()).toBe(false)
    expect(await submitScore({ name: 'a', satisfaction: 50, opsScore: 1, seed: 's' })).toBe(false)
    expect(await fetchTop()).toBeNull()
    expect(await submitFeedback('a', 'b')).toBe(false)
    expect(called).toBe(false)
  })

  it('submits scores with clamped name and rounded ops score', async () => {
    configure()
    let captured: { url: string; body: Record<string, unknown> } | null = null
    setFetchImpl(((url: string, init: RequestInit) => {
      captured = { url, body: JSON.parse(init.body as string) }
      return Promise.resolve(new Response(null, { status: 201 }))
    }) as FetchLike)

    const ok = await submitScore({
      name: 'a-very-long-name-that-overflows',
      satisfaction: 92,
      opsScore: 1234.56,
      seed: '2026-06-12',
    })
    expect(ok).toBe(true)
    expect(captured!.url).toBe('https://test.supabase.co/rest/v1/leaderboard')
    expect(captured!.body.name).toBe('a-very-long-name-tha')
    expect(captured!.body.ops_score).toBe(1235)
    expect(captured!.body.satisfaction).toBe(92)
  })

  it('fetches the daily board filtered by seed, ordered by satisfaction', async () => {
    configure()
    let captured = ''
    setFetchImpl(((url: string) => {
      captured = url
      return Promise.resolve(
        new Response(JSON.stringify([{ name: 'x', satisfaction: 90, ops_score: 1, seed: 's', created_at: 't' }]))
      )
    }) as FetchLike)

    const rows = await fetchTop({ seed: '2026-06-12' })
    expect(rows).toHaveLength(1)
    expect(captured).toContain('seed=eq.2026-06-12')
    expect(captured).toContain('order=satisfaction.desc%2Cops_score.desc')
  })

  it('fails soft on network errors', async () => {
    configure()
    setFetchImpl((() => Promise.reject(new Error('offline'))) as FetchLike)
    expect(await submitScore({ name: 'a', satisfaction: 1, opsScore: 1, seed: 's' })).toBe(false)
    expect(await fetchTop()).toBeNull()
    expect(await submitFeedback('a', 'b')).toBe(false)
  })
})
