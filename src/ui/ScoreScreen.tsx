import { getState, startShift } from '../game/loop'
import { advance, getUi, isCampaignActive } from '../game/meta/campaign'
import { randomSessionSeed } from '../utils/rng'
import { buttonStyle, overlayStyle } from './overlay'

export function ScoreScreen() {
  const { stats, seed } = getState()
  const campaign = isCampaignActive() ? getUi() : null

  const gameOver = stats.gameOverCallsign !== ''
  return (
    <div style={overlayStyle}>
      {gameOver ? (
        <>
          <h2 style={{ fontSize: 26, margin: 0, color: '#ef4444' }}>GAME OVER</h2>
          <div style={{ color: '#ef4444', fontSize: 15 }}>
            {stats.gameOverCallsign} ran out of fuel circling
          </div>
        </>
      ) : (
        <h2 style={{ fontSize: 22, margin: 0, color: '#94a3b8' }}>SHIFT COMPLETE</h2>
      )}
      <div style={{ fontSize: 48, fontWeight: 'bold' }}>{Math.round(stats.score)}</div>
      <div style={{ lineHeight: 2, fontSize: 15 }}>
        {stats.departed > 0 && (
          <div style={{ fontWeight: 'bold', color: '#4ade80' }}>
            D:00 {Math.round((100 * stats.departedOnTime) / stats.departed)}% —{' '}
            {stats.departedOnTime}/{stats.departed} on time
          </div>
        )}
        <div>
          {stats.departed} departed{stats.departed > 0 && ` — ${stats.departedOnTime} on time`}
        </div>
        <div style={{ color: '#94a3b8' }}>{stats.landed} landed</div>
        {stats.nearMisses > 0 && (
          <div style={{ color: '#4ade80' }}>
            {stats.nearMisses} near-misses — best streak x{stats.bestStreak}
          </div>
        )}
        {stats.diverted > 0 && (
          <div style={{ color: '#ef4444' }}>{stats.diverted} diverted — out of fuel</div>
        )}
        {stats.raged > 0 && (
          <div style={{ color: '#ef4444' }}>{stats.raged} flights hit zero patience</div>
        )}
        {stats.worstDelaySeconds > 0 && (
          <div style={{ color: '#facc15' }}>
            {stats.worstDelayCallsign} departed {Math.round(stats.worstDelaySeconds)}s late
          </div>
        )}
        {stats.longestHoldSeconds > 0 && (
          <div style={{ color: '#facc15' }}>
            {stats.longestHoldCallsign} circled for {Math.round(stats.longestHoldSeconds)}s
          </div>
        )}
        {stats.leftInAir > 0 && (
          <div style={{ color: '#94a3b8' }}>{stats.leftInAir} still inbound at end of shift</div>
        )}
        {campaign && (
          <div
            style={{
              color: campaign.lastRepDelta >= 0 ? '#4ade80' : '#ef4444',
              fontWeight: 'bold',
            }}
          >
            reputation {campaign.lastRepDelta >= 0 ? '+' : ''}
            {campaign.lastRepDelta}
          </div>
        )}
      </div>
      {campaign ? (
        <button style={buttonStyle} onClick={advance}>
          CONTINUE
        </button>
      ) : (
        <button style={buttonStyle} onClick={() => startShift(randomSessionSeed())}>
          PLAY AGAIN
        </button>
      )}
      <div style={{ color: '#475569', fontSize: 11 }}>seed {String(seed)}</div>
    </div>
  )
}
