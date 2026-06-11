import { CONFIG } from '../config'
import { closeRun, getRun, getUi } from '../game/meta/campaign'
import { buttonStyle, overlayStyle } from './overlay'

export function RunSummary() {
  const run = getRun()
  const ui = getUi()
  if (!run || !ui) return null
  const fired = ui.outcome === 'fired'
  const perkNames = run.perkIds
    .map((id) => CONFIG.perks.defs.find((p) => p.id === id)?.name)
    .filter(Boolean)

  return (
    <div style={overlayStyle}>
      <h2 style={{ fontSize: 26, margin: 0, color: fired ? '#ef4444' : '#4ade80' }}>
        {fired ? 'FIRED' : 'RUN COMPLETE'}
      </h2>
      <div style={{ fontSize: 44, fontWeight: 'bold' }}>{run.runScore}</div>
      <div style={{ lineHeight: 2, fontSize: 15, color: '#94a3b8' }}>
        <div>
          {run.shiftIndex} shift{run.shiftIndex === 1 ? '' : 's'} {fired ? 'survived' : 'completed'}
        </div>
        <div>final reputation {run.reputation}</div>
        {perkNames.length > 0 && <div>perks: {perkNames.join(', ')}</div>}
        {fired && (
          <div style={{ color: '#ef4444' }}>the airlines pulled their contracts</div>
        )}
      </div>
      <button style={buttonStyle} onClick={closeRun}>
        {fired ? 'TRY AGAIN' : 'BACK TO MENU'}
      </button>
    </div>
  )
}
