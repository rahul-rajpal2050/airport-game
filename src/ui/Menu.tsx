import { initAudio } from '../game/juice/audio'
import { startShift } from '../game/loop'
import { continueRun, getRecords, getRun, hasSavedRun, startRun } from '../game/meta/campaign'
import { randomSessionSeed } from '../utils/rng'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'

export function Menu() {
  const records = getRecords()
  const saved = hasSavedRun()
  const run = getRun()

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
          startShift(randomSessionSeed())
        }}
      >
        FREE SHIFT
      </button>
      {records.bestRunScore > 0 && (
        <div style={{ color: '#475569', fontSize: 12 }}>
          best run {records.bestRunScore} — best shift {records.bestShiftScore} — runs completed{' '}
          {records.runsCompleted}
        </div>
      )}
    </div>
  )
}
