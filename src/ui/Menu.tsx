import type { CSSProperties } from 'react'
import { CONFIG } from '../config'
import { initAudio } from '../game/juice/audio'
import {
  continueRun,
  getRecords,
  getRun,
  getSettings,
  hasSavedRun,
  startFreeShift,
  startRun,
  updateSettings,
} from '../game/meta/campaign'
import type { Difficulty } from '../game/meta/storage'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'

const toggleStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  padding: '6px 14px',
  background: 'transparent',
  color: '#64748b',
  border: '1px solid #334155',
  borderRadius: 4,
  cursor: 'pointer',
}

const toggleActiveStyle: CSSProperties = {
  ...toggleStyle,
  color: '#e2e8f0',
  borderColor: '#4ade80',
}

export function Menu() {
  const records = getRecords()
  const saved = hasSavedRun()
  const run = getRun()
  const settings = getSettings()

  return (
    <div style={overlayStyle}>
      <h1 style={{ fontSize: 36, margin: 0 }}>AIRPORT ATC</h1>
      <p style={{ color: '#94a3b8', maxWidth: 380, lineHeight: 1.5 }}>
        Click a plane, then a runway to land it. Landed planes need a gate; boarded planes
        need a runway to leave. Keep everyone alive and on time.
      </p>
      {saved && run && (
        <button
          style={buttonStyle}
          onClick={() => {
            initAudio()
            continueRun()
          }}
        >
          CONTINUE RUN — SHIFT {run.shiftIndex + 1}/5, REP {run.reputation}
        </button>
      )}
      <button
        style={saved ? secondaryButtonStyle : buttonStyle}
        onClick={() => {
          initAudio()
          startRun()
        }}
      >
        NEW RUN
      </button>
      <button
        style={secondaryButtonStyle}
        onClick={() => {
          initAudio()
          startFreeShift()
        }}
      >
        FREE SHIFT
      </button>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        {(Object.keys(CONFIG.difficulty) as Difficulty[]).map((level) => (
          <button
            key={level}
            style={settings.difficulty === level ? toggleActiveStyle : toggleStyle}
            onClick={() => updateSettings({ difficulty: level })}
          >
            {CONFIG.difficulty[level].label}
          </button>
        ))}
        <span style={{ color: '#334155' }}>|</span>
        <button
          style={settings.nearMisses ? toggleActiveStyle : toggleStyle}
          onClick={() => updateSettings({ nearMisses: !settings.nearMisses })}
        >
          NEAR-MISS SLOW-MO: {settings.nearMisses ? 'ON' : 'OFF'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>GATES</span>
        {[6, 8, 10, 12].map((n) => (
          <button
            key={n}
            style={settings.gateCount === n ? toggleActiveStyle : toggleStyle}
            onClick={() => updateSettings({ gateCount: n })}
          >
            {n}
          </button>
        ))}
        <span style={{ color: '#334155' }}>|</span>
        <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>RUNWAYS</span>
        {[2, 3, 5].map((n) => (
          <button
            key={n}
            style={settings.runwayCount === n ? toggleActiveStyle : toggleStyle}
            onClick={() => updateSettings({ runwayCount: n })}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={{ color: '#475569', fontSize: 11, maxWidth: 460 }}>
        difficulty sets traffic volume — the center runway is the large one
      </div>
      {records.bestRunScore > 0 && (
        <div style={{ color: '#475569', fontSize: 12 }}>
          best run {records.bestRunScore} — best shift {records.bestShiftScore} — runs completed{' '}
          {records.runsCompleted}
        </div>
      )}
    </div>
  )
}
