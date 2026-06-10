import { startShift } from '../game/loop'
import { randomSessionSeed } from '../utils/rng'
import { buttonStyle, overlayStyle } from './overlay'

export function Menu() {
  return (
    <div style={overlayStyle}>
      <h1 style={{ fontSize: 32, margin: 0 }}>AIRPORT ATC</h1>
      <p style={{ color: '#94a3b8', maxWidth: 280, lineHeight: 1.5 }}>
        Tap a plane, then tap a runway. Land everyone before they run out of fuel.
      </p>
      <button style={buttonStyle} onClick={() => startShift(randomSessionSeed())}>
        START SHIFT
      </button>
    </div>
  )
}
