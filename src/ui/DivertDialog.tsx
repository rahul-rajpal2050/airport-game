import type { CSSProperties } from 'react'
import { CONFIG } from '../config'
import { getState } from '../game/loop'
import { closeDivertPrompt, confirmDivert } from '../game/input'

const dialogStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '40%',
  transform: 'translate(-50%, -50%)',
  width: 'min(86%, 320px)',
  background: '#111827',
  border: '1px solid #60a5fa',
  borderRadius: 8,
  padding: 18,
  color: '#e2e8f0',
  fontFamily: 'monospace',
  textAlign: 'center',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
}

const optStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
  fontWeight: 'bold',
  padding: '10px 20px',
  borderRadius: 6,
  cursor: 'pointer',
}

export function DivertDialog() {
  const state = getState()
  const plane = state.planes.find((p) => p.id === state.divertPlaneId)
  if (!plane) return null

  return (
    <div style={dialogStyle}>
      <div style={{ fontSize: 16, fontWeight: 'bold', color: '#60a5fa' }}>
        DIVERT {plane.callsign}?
      </div>
      <div style={{ color: '#94a3b8', fontSize: 13, margin: '10px 0', lineHeight: 1.6 }}>
        Send {plane.callsign} to a nearby airport to free up the airspace.
      </div>
      <div style={{ color: '#facc15', fontSize: 12, margin: '0 0 16px' }}>
        Note: diverting costs you {CONFIG.scoring.reroutePenalty} points.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          style={{ ...optStyle, background: '#60a5fa', color: '#0a0e1a', border: 'none' }}
          onClick={confirmDivert}
        >
          DIVERT
        </button>
        <button
          style={{ ...optStyle, background: 'transparent', color: '#94a3b8', border: '1px solid #374151' }}
          onClick={closeDivertPrompt}
        >
          KEEP CIRCLING
        </button>
      </div>
    </div>
  )
}
