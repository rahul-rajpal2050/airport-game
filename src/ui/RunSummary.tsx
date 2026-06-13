import { useState } from 'react'
import { CONFIG } from '../config'
import { closeRun, getRun, getSettings, getUi, runAvgSatisfaction, submitRun } from '../game/meta/campaign'
import { backendConfigured } from '../game/meta/leaderboard'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'

export function RunSummary() {
  const run = getRun()
  const ui = getUi()
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  if (!run || !ui) return null
  const fired = ui.outcome === 'fired'
  const perkNames = run.perkIds
    .map((id) => CONFIG.perks.defs.find((p) => p.id === id)?.name)
    .filter(Boolean)
  const playerName = getSettings().playerName || 'Pilot'

  const submit = async () => {
    setSubmitState('sending')
    setSubmitState((await submitRun()) ? 'done' : 'failed')
  }

  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 26, margin: 0, color: fired ? '#ef4444' : '#4ade80' }}>
        {fired ? 'FIRED' : 'RUN COMPLETE'}
      </h2>
      <div style={{ fontSize: 44, fontWeight: 'bold' }}>{run.runScore}</div>
      <div style={{ lineHeight: 2, fontSize: 15, color: '#94a3b8' }}>
        <div>
          {run.shiftIndex} shift{run.shiftIndex === 1 ? '' : 's'} {fired ? 'survived' : 'completed'}
        </div>
        <div>avg satisfaction {runAvgSatisfaction(run)}%</div>
        <div>final reputation {run.reputation}</div>
        {perkNames.length > 0 && <div>perks: {perkNames.join(', ')}</div>}
        {fired && <div style={{ color: '#ef4444' }}>the airlines pulled their contracts</div>}
      </div>
      {backendConfigured() &&
        (submitState === 'done' ? (
          <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 14 }}>
            on the board as {playerName} ✓
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          </div>
        ))}
      <button style={buttonStyle} onClick={closeRun}>
        {fired ? 'TRY AGAIN' : 'BACK TO MENU'}
      </button>
    </div>
  )
}
