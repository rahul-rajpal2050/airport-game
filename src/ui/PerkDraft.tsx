import type { CSSProperties } from 'react'
import { currentArchetype, draftChoices, draftPerk, getRun } from '../game/meta/campaign'
import { overlayStyle, secondaryButtonStyle } from './overlay'

const cardStyle: CSSProperties = {
  fontFamily: 'monospace',
  width: 200,
  padding: 16,
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 8,
  color: '#e2e8f0',
  cursor: 'pointer',
  textAlign: 'left',
}

export function PerkDraft() {
  const run = getRun()
  if (!run) return null
  const choices = draftChoices()
  const next = currentArchetype(run)

  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 20, margin: 0, color: '#94a3b8' }}>
        REP {run.reputation} — DRAFT ONE PERK
      </h2>
      <div style={{ display: 'flex', gap: 12 }}>
        {choices.map((perk) => {
          const affordable = run.reputation > perk.repCost
          return (
            <button
              key={perk.id}
              style={{ ...cardStyle, opacity: affordable ? 1 : 0.4, cursor: affordable ? 'pointer' : 'not-allowed' }}
              disabled={!affordable}
              onClick={() => draftPerk(perk.id)}
            >
              <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>{perk.name}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0', lineHeight: 1.5 }}>
                {perk.description}
              </div>
              <div style={{ color: '#facc15', fontSize: 13 }}>costs {perk.repCost} rep</div>
            </button>
          )
        })}
      </div>
      <button style={secondaryButtonStyle} onClick={() => draftPerk(null)}>
        SKIP — KEEP REPUTATION
      </button>
      <div style={{ color: '#475569', fontSize: 12 }}>
        next: {next.name} — {next.description}
      </div>
    </div>
  )
}
