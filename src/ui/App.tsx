import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getState, startLoop, stopLoop } from '../game/loop'
import { getUi, isCampaignActive } from '../game/meta/campaign'
import { gameStore } from '../game/state'
import { EventDialog } from './EventDialog'
import { Menu } from './Menu'
import { PerkDraft } from './PerkDraft'
import { RunSummary } from './RunSummary'
import { ScoreScreen } from './ScoreScreen'

function PostShift() {
  const ui = isCampaignActive() ? getUi() : null
  if (ui?.screen === 'draft') return <PerkDraft />
  if (ui?.screen === 'summary') return <RunSummary />
  return <ScoreScreen />
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot)
  const { phase, pendingEvent } = getState()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    startLoop(canvas)
    return () => stopLoop()
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ touchAction: 'none' }} />
      {phase === 'pre_shift' && <Menu />}
      {phase === 'post_shift' && <PostShift />}
      {phase === 'active' && pendingEvent && <EventDialog />}
    </div>
  )
}
