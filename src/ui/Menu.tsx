import { useState, type CSSProperties } from 'react'
import { CONFIG } from '../config'
import { initAudio } from '../game/juice/audio'
import {
  continueRun,
  getRecords,
  getRun,
  getSettings,
  hasSavedRun,
  startDailyChallenge,
  startFreeShift,
  startRun,
  updateSettings,
} from '../game/meta/campaign'
import { backendConfigured } from '../game/meta/leaderboard'
import type { Difficulty } from '../game/meta/storage'
import { FeedbackBox } from './FeedbackBox'
import { Leaderboard } from './Leaderboard'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'
import { TutorialPrompt, TutorialSlides } from './Tutorial'

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
  const [tutorial, setTutorial] = useState<null | { stage: 'prompt' | 'slides'; then: () => void }>(null)
  const [screen, setScreen] = useState<null | 'leaderboard' | 'feedback'>(null)

  // first start: offer the tutorial once; afterwards actions run directly
  const launch = (action: () => void) => {
    initAudio()
    if (!settings.tutorialSeen) setTutorial({ stage: 'prompt', then: action })
    else action()
  }
  const finishTutorial = (then: () => void) => {
    updateSettings({ tutorialSeen: true })
    setTutorial(null)
    then()
  }

  if (tutorial?.stage === 'prompt') {
    return (
      <TutorialPrompt
        onYes={() => setTutorial({ ...tutorial, stage: 'slides' })}
        onNo={() => finishTutorial(tutorial.then)}
      />
    )
  }
  if (tutorial?.stage === 'slides') {
    return <TutorialSlides onDone={() => finishTutorial(tutorial.then)} />
  }
  if (screen === 'leaderboard') return <Leaderboard onClose={() => setScreen(null)} />
  if (screen === 'feedback') return <FeedbackBox onClose={() => setScreen(null)} />

  return (
    <div style={overlayStyle}>
      <h1 style={{ fontSize: 36, margin: 0 }}>AIRPORT ATC</h1>
      <p style={{ color: '#94a3b8', maxWidth: 380, lineHeight: 1.5 }}>
        Click a plane, then a runway to land it. Landed planes need a gate; boarded planes
        need a runway to leave. Keep everyone alive and on time.
      </p>
      {saved && run && (
        <button style={buttonStyle} onClick={() => launch(continueRun)}>
          CONTINUE RUN — SHIFT {run.shiftIndex + 1}/5, REP {run.reputation}
        </button>
      )}
      <button style={saved ? secondaryButtonStyle : buttonStyle} onClick={() => launch(startRun)}>
        NEW RUN
      </button>
      <button style={secondaryButtonStyle} onClick={() => launch(startFreeShift)}>
        FREE SHIFT
      </button>
      <button style={secondaryButtonStyle} onClick={() => launch(startDailyChallenge)}>
        DAILY CHALLENGE
      </button>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button style={toggleStyle} onClick={() => setTutorial({ stage: 'slides', then: () => {} })}>
          HOW TO PLAY
        </button>
        {backendConfigured() && (
          <>
            <button style={toggleStyle} onClick={() => setScreen('leaderboard')}>
              LEADERBOARD
            </button>
            <button style={toggleStyle} onClick={() => setScreen('feedback')}>
              FEEDBACK
            </button>
          </>
        )}
      </div>
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
