import { getState, startShift } from '../game/loop'
import { randomSessionSeed } from '../utils/rng'
import { buttonStyle, overlayStyle } from './overlay'

export function ScoreScreen() {
  const { stats, seed } = getState()
  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 22, margin: 0, color: '#94a3b8' }}>SHIFT COMPLETE</h2>
      <div style={{ fontSize: 48, fontWeight: 'bold' }}>{stats.score}</div>
      <div style={{ lineHeight: 2, fontSize: 15 }}>
        <div>{stats.landed} landed</div>
        {stats.diverted > 0 && (
          <div style={{ color: '#ef4444' }}>{stats.diverted} diverted — out of fuel</div>
        )}
        {stats.leftInAir > 0 && (
          <div style={{ color: '#94a3b8' }}>{stats.leftInAir} still inbound at end of shift</div>
        )}
        {stats.longestHoldSeconds > 0 && (
          <div style={{ color: '#facc15' }}>
            {stats.longestHoldCallsign} circled for {Math.round(stats.longestHoldSeconds)}s
          </div>
        )}
      </div>
      <button style={buttonStyle} onClick={() => startShift(randomSessionSeed())}>
        PLAY AGAIN
      </button>
      <div style={{ color: '#475569', fontSize: 11 }}>seed {String(seed)}</div>
    </div>
  )
}
