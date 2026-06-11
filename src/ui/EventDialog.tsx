import type { CSSProperties } from 'react'
import { CONFIG } from '../config'
import { getState } from '../game/loop'
import { resolveEvent } from '../game/systems/events'

const dialogStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '30%',
  transform: 'translate(-50%, -50%)',
  width: 'min(86%, 340px)',
  background: '#111827',
  border: '1px solid #ef4444',
  borderRadius: 8,
  padding: 16,
  color: '#e2e8f0',
  fontFamily: 'monospace',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
}

const optionStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'monospace',
  fontSize: 13,
  padding: '10px 12px',
  marginTop: 8,
  background: '#1f2937',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 6,
  cursor: 'pointer',
}

export function EventDialog() {
  const pending = getState().pendingEvent
  if (!pending) return null
  const { def } = pending

  return (
    <div style={dialogStyle}>
      <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 15 }}>{def.name}</div>
      <div style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0', lineHeight: 1.5 }}>
        {def.description}
      </div>
      {def.options.map((opt, i) => (
        <button
          key={opt.label}
          style={optionStyle}
          onClick={() => resolveEvent(getState(), i as 0 | 1)}
        >
          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{opt.label}</span>
          <br />
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{opt.description}</span>
        </button>
      ))}
      {/* auto-resolve countdown: picks the first option when it empties */}
      <div style={{ marginTop: 12, height: 3, background: '#374151', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            background: '#ef4444',
            animation: `event-countdown ${CONFIG.events.autoResolveSeconds}s linear forwards`,
          }}
        />
      </div>
      <style>{`@keyframes event-countdown { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  )
}
