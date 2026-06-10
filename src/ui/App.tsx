import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getState, startLoop, stopLoop } from '../game/loop'
import { gameStore } from '../game/state'
import { Menu } from './Menu'
import { ScoreScreen } from './ScoreScreen'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot)
  const { phase } = getState()

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
      {phase === 'post_shift' && <ScoreScreen />}
    </div>
  )
}
