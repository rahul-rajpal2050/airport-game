import { useState } from 'react'
import { getState } from '../game/loop'
import {
  advance,
  getLastShiftRecord,
  getSettings,
  getUi,
  isCampaignActive,
  startFreeShift,
} from '../game/meta/campaign'
import { backendConfigured, submitScore } from '../game/meta/leaderboard'
import { satisfactionOf } from '../game/systems/scoring'
import { dailySeed } from '../utils/rng'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'

const GAME_URL = 'https://rahul-rajpal2050.github.io/airport-game/'

function satisfactionColor(pct: number): string {
  if (pct >= 90) return '#4ade80'
  if (pct >= 70) return '#facc15'
  return '#ef4444'
}

export function ScoreScreen() {
  const { stats, seed } = getState()
  const campaign = isCampaignActive() ? getUi() : null
  const playerName = getSettings().playerName || 'Pilot'
  const record = getLastShiftRecord()
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const [copied, setCopied] = useState(false)

  const gameOver = stats.gameOverCallsign !== ''
  const satisfaction = satisfactionOf(stats)
  const complaints = stats.raged + stats.diverted
  const isDaily = String(seed) === dailySeed()

  const submit = async () => {
    setSubmitState('sending')
    const ok = await submitScore({
      name: playerName,
      satisfaction,
      opsScore: stats.score,
      seed: String(seed),
    })
    setSubmitState(ok ? 'done' : 'failed')
  }

  const copyResult = async () => {
    const d00 =
      stats.departed > 0 ? `D:00 ${Math.round((100 * stats.departedOnTime) / stats.departed)}%` : 'D:00 —'
    const a00 =
      stats.landed > 0 ? `A:00 ${Math.round((100 * stats.arrivedOnTime) / stats.landed)}%` : 'A:00 —'
    const mode = isDaily
      ? `Daily ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : 'Free Shift'
    const lines = [
      `✈️ AIRPORT ATC — ${mode}`,
      `😊 ${satisfaction}% · ${d00} · ${a00}`,
      `🛬 ${stats.landed} landed · 😡 ${complaints} complaint${complaints === 1 ? '' : 's'}`,
    ]
    if (record?.dailyStreak) lines.push(`🔥 day ${record.dailyStreak} streak`)
    lines.push(GAME_URL)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
    } catch {
      // clipboard unavailable (permissions): leave the button as-is
    }
  }
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
        <h2 style={{ fontSize: 22, margin: 0, color: '#94a3b8' }}>SATISFACTION</h2>
      )}
      <div style={{ fontSize: 52, fontWeight: 'bold', color: satisfactionColor(satisfaction) }}>
        {satisfaction}%
      </div>
      {record?.isNewBest && !gameOver && (
        <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }}>
          ★ NEW PERSONAL BEST ★
        </div>
      )}
      {record && !record.isNewBest && record.prevBestSatisfaction > 0 && (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          {record.prevBestSatisfaction - satisfaction}% short of your best ({record.prevBestSatisfaction}%)
        </div>
      )}
      {record?.dailyStreak != null && record.dailyStreak > 0 && (
        <div style={{ color: '#facc15', fontSize: 13, fontWeight: 'bold' }}>
          daily streak: day {record.dailyStreak}
        </div>
      )}
      <div style={{ lineHeight: 2, fontSize: 15 }}>
        {stats.departed > 0 && (
          <div style={{ fontWeight: 'bold', color: '#4ade80' }}>
            D:00 {Math.round((100 * stats.departedOnTime) / stats.departed)}% —{' '}
            {stats.departedOnTime}/{stats.departed} departures on time
          </div>
        )}
        {stats.landed > 0 && (
          <div style={{ fontWeight: 'bold', color: '#4ade80' }}>
            A:00 {Math.round((100 * stats.arrivedOnTime) / stats.landed)}% —{' '}
            {stats.arrivedOnTime}/{stats.landed} arrivals on time
          </div>
        )}
        {complaints > 0 && (
          <div style={{ color: '#ef4444' }}>
            {complaints} customer complaint{complaints === 1 ? '' : 's'}
          </div>
        )}
        {stats.rerouted > 0 && (
          <div style={{ color: '#94a3b8' }}>
            {stats.rerouted} re-routed to other airports
          </div>
        )}
        <div style={{ color: '#94a3b8' }}>
          ops score {Math.round(stats.score)} — {stats.departed} departed, {stats.landed} landed
        </div>
        {stats.nearMisses > 0 && (
          <div style={{ color: '#4ade80' }}>
            {stats.nearMisses} near-misses — best streak x{stats.bestStreak}
          </div>
        )}
        {stats.bestCombo >= 2 && (
          <div style={{ color: '#fbbf24' }}>best on-time combo x{stats.bestCombo}</div>
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
      {backendConfigured() && !campaign && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {submitState === 'done' ? (
            <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 14 }}>
              on the board as {playerName} ✓
            </span>
          ) : (
            <>
              <button
                style={{ ...secondaryButtonStyle, fontSize: 13 }}
                disabled={submitState === 'sending'}
                onClick={submit}
              >
                {submitState === 'sending' ? 'SENDING…' : `ADD ${playerName} TO LEADERBOARD`}
              </button>
              {submitState === 'failed' && (
                <span style={{ color: '#ef4444', fontSize: 12 }}>failed — retry</span>
              )}
            </>
          )}
        </div>
      )}
      {!campaign && (
        <button style={{ ...secondaryButtonStyle, fontSize: 13 }} onClick={copyResult}>
          {copied ? 'COPIED — PASTE IT TO A FRIEND' : 'COPY RESULT'}
        </button>
      )}
      {campaign ? (
        <button style={buttonStyle} onClick={advance}>
          CONTINUE
        </button>
      ) : (
        <button style={buttonStyle} onClick={startFreeShift}>
          PLAY AGAIN
        </button>
      )}
      <div style={{ color: '#475569', fontSize: 11 }}>seed {String(seed)}</div>
    </div>
  )
}
