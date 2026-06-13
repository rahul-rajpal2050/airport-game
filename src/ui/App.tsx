import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import { getState, returnToMenu, startLoop, stopLoop, togglePause } from '../game/loop'
import { getUi, isCampaignActive } from '../game/meta/campaign'
import { gameStore } from '../game/state'
import { EventDialog } from './EventDialog'
import { Menu } from './Menu'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'
import { PerkDraft } from './PerkDraft'
import { RunSummary } from './RunSummary'
import { ScoreScreen } from './ScoreScreen'

function PausedOverlay() {
  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 28, margin: 0, color: '#e2e8f0' }}>PAUSED</h2>
      <button style={buttonStyle} onClick={togglePause}>
        RESUME
      </button>
      <button style={secondaryButtonStyle} onClick={returnToMenu}>
        QUIT TO MENU
      </button>
      <div style={{ color: '#475569', fontSize: 12 }}>space / P / esc to resume</div>
    </div>
  )
}

function PostShift() {
  const ui = isCampaignActive() ? getUi() : null
  if (ui?.screen === 'draft') return <PerkDraft />
  if (ui?.screen === 'summary') return <RunSummary />
  return <ScoreScreen />
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot)
  const { phase, pendingEvent, paused } = getState()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    startLoop(canvas)
    return () => stopLoop()
  }, [])

  const showPauseButton = phase === 'active' && !paused && !pendingEvent
  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ touchAction: 'none' }} />
      {showPauseButton && (
        <button style={pauseButtonStyle} onClick={togglePause}>
          ⏸
        </button>
      )}
      {phase === 'pre_shift' && <Menu />}
      {phase === 'post_shift' && <PostShift />}
      {phase === 'active' && pendingEvent && <EventDialog />}
      {phase === 'active' && paused && <PausedOverlay />}
    </div>
  )
}

const pauseButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  fontFamily: 'monospace',
  fontSize: 18,
  width: 36,
  height: 36,
  background: 'rgba(17,24,39,0.7)',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 6,
  cursor: 'pointer',
  lineHeight: 1,
}
