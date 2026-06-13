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
import { NameEntry, TutorialPrompt, TutorialSlides } from './Tutorial'

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
  // onboarding: tutorial (first time) -> name entry (until set) -> the chosen action.
  // replay = HOW TO PLAY, which just shows slides and closes without chaining.
  const [ob, setOb] = useState<
    null | { stage: 'prompt' | 'slides' | 'name'; then: () => void; replay?: boolean }
  >(null)
  const [screen, setScreen] = useState<null | 'leaderboard' | 'feedback'>(null)

  const launch = (action: () => void) => {
    initAudio()
    if (!settings.tutorialSeen) setOb({ stage: 'prompt', then: action })
    else if (!settings.playerName) setOb({ stage: 'name', then: action })
    else action()
  }
  const afterTutorial = (then: () => void, replay?: boolean) => {
    updateSettings({ tutorialSeen: true })
    if (replay) return setOb(null) // HOW TO PLAY: don't chain into name/action
    if (!getSettings().playerName) return setOb({ stage: 'name', then })
    setOb(null)
    then()
  }
  const finishName = (then: () => void, name: string) => {
    updateSettings({ playerName: name })
    setOb(null)
    then()
  }

  if (ob?.stage === 'prompt') {
    return (
      <TutorialPrompt
        onYes={() => setOb({ ...ob, stage: 'slides' })}
        onNo={() => afterTutorial(ob.then, ob.replay)}
      />
    )
  }
  if (ob?.stage === 'slides') {
    return <TutorialSlides onDone={() => afterTutorial(ob.then, ob.replay)} />
  }
  if (ob?.stage === 'name') {
    return <NameEntry initial={settings.playerName} onDone={(n) => finishName(ob.then, n)} />
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
        <button style={toggleStyle} onClick={() => setOb({ stage: 'slides', then: () => {}, replay: true })}>
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
