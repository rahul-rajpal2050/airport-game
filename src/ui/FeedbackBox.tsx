import { useState } from 'react'
import { getSettings, updateSettings } from '../game/meta/campaign'
import { submitFeedback } from '../game/meta/leaderboard'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'

const fieldStyle = {
  fontFamily: 'monospace',
  fontSize: 14,
  background: '#1f2937',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 6,
  padding: 10,
  width: 'min(90%, 400px)',
} as const

export function FeedbackBox(props: { onClose: () => void }) {
  const [name, setName] = useState(getSettings().playerName)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'editing' | 'sending' | 'sent' | 'failed'>('editing')

  const send = async () => {
    setState('sending')
    updateSettings({ playerName: name })
    const ok = await submitFeedback(name || 'anonymous', message)
    setState(ok ? 'sent' : 'failed')
  }

  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 20, margin: 0, color: '#e2e8f0' }}>SUGGESTION BOX</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
        Goes straight to the developer. Be honest.
      </p>
      {state === 'sent' ? (
        <div style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: 16 }}>
          Received — thank you for testing!
        </div>
      ) : (
        <>
          <input
            style={fieldStyle}
            placeholder="your name (optional)"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            style={{ ...fieldStyle, height: 120, resize: 'none' }}
            placeholder="what's broken, what's boring, what's missing…"
            value={message}
            maxLength={2000}
            onChange={(e) => setMessage(e.target.value)}
          />
          {state === 'failed' && (
            <div style={{ color: '#ef4444', fontSize: 13 }}>could not send — try again</div>
          )}
          <button
            style={{ ...buttonStyle, opacity: message.trim() && state !== 'sending' ? 1 : 0.4 }}
            disabled={!message.trim() || state === 'sending'}
            onClick={send}
          >
            {state === 'sending' ? 'SENDING…' : 'SEND'}
          </button>
        </>
      )}
      <button style={secondaryButtonStyle} onClick={props.onClose}>
        CLOSE
      </button>
    </div>
  )
}
