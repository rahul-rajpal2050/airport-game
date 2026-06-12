import { useEffect, useState } from 'react'
import { dailySeed } from '../utils/rng'
import { fetchTop, type LeaderboardEntry } from '../game/meta/leaderboard'
import { overlayStyle, secondaryButtonStyle } from './overlay'

type Tab = 'daily' | 'alltime'

export function Leaderboard(props: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('daily')
  const [rows, setRows] = useState<LeaderboardEntry[] | null | 'loading'>('loading')

  useEffect(() => {
    let alive = true
    setRows('loading')
    fetchTop(tab === 'daily' ? { seed: dailySeed() } : {}).then((r) => {
      if (alive) setRows(r)
    })
    return () => {
      alive = false
    }
  }, [tab])

  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 20, margin: 0, color: '#e2e8f0' }}>LEADERBOARD</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ ...secondaryButtonStyle, opacity: tab === 'daily' ? 1 : 0.5 }}
          onClick={() => setTab('daily')}
        >
          TODAY'S CHALLENGE
        </button>
        <button
          style={{ ...secondaryButtonStyle, opacity: tab === 'alltime' ? 1 : 0.5 }}
          onClick={() => setTab('alltime')}
        >
          ALL TIME
        </button>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 14, minHeight: 200, width: 'min(90%, 420px)' }}>
        {rows === 'loading' && <div style={{ color: '#64748b' }}>loading…</div>}
        {rows === null && <div style={{ color: '#ef4444' }}>leaderboard unreachable</div>}
        {Array.isArray(rows) && rows.length === 0 && (
          <div style={{ color: '#64748b' }}>
            {tab === 'daily' ? 'no one has flown today — be first' : 'no scores yet'}
          </div>
        )}
        {Array.isArray(rows) &&
          rows.map((r, i) => (
            <div
              key={`${r.created_at}-${i}`}
              style={{ display: 'flex', gap: 12, lineHeight: 1.9, color: i === 0 ? '#4ade80' : '#e2e8f0' }}
            >
              <span style={{ width: 28, color: '#64748b' }}>{i + 1}.</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ fontWeight: 'bold' }}>{r.satisfaction}%</span>
              <span style={{ color: '#64748b', width: 60, textAlign: 'right' }}>{r.ops_score}</span>
            </div>
          ))}
      </div>
      <button style={secondaryButtonStyle} onClick={props.onClose}>
        CLOSE
      </button>
    </div>
  )
}
