import { useState, type CSSProperties, type ReactNode } from 'react'
import { buttonStyle, overlayStyle, secondaryButtonStyle } from './overlay'

const em = (color: string) => (text: string) => (
  <span style={{ color, fontWeight: 'bold' }}>{text}</span>
)
const green = em('#4ade80')
const yellow = em('#facc15')
const red = em('#ef4444')
const blue = em('#60a5fa')

interface Slide {
  title: string
  body: ReactNode
}

const SLIDES: Slide[] = [
  {
    title: 'THE JOB',
    body: (
      <>
        You run this airport for one day, {yellow('06:00 to 22:00')}. Your score is{' '}
        {green('passenger satisfaction')}: land flights on schedule ({green('A:00')}), get them
        out on time ({green('D:00')}), and keep complaints at zero.
      </>
    ),
  },
  {
    title: 'LAND',
    body: (
      <>
        Click a {blue('plane')}, then a {blue('runway')}. The bar above every plane is{' '}
        {green('fuel')} — it only drains while circling, and an empty tank is{' '}
        {red('GAME OVER')}. Big planes need the wide {yellow('L')} runway; small planes go
        anywhere.
      </>
    ),
  },
  {
    title: 'PARK',
    body: (
      <>
        After landing, click the plane, then a free {blue('gate')} (big planes need an{' '}
        {yellow('L')} gate). It turns {blue('translucent')} while refuelling and boarding — then{' '}
        {green('glows')} when it is ready to leave.
      </>
    ),
  },
  {
    title: 'DEPART',
    body: (
      <>
        Click the {green('glowing')} plane, then a runway. You have {yellow('3 minutes')} to get
        it airborne — past that it counts as delayed and your score {red('bleeds')}.
      </>
    ),
  },
  {
    title: 'SURVIVE',
    body: (
      <>
        Traffic comes in waves: rush hours at {yellow('7–9, 11–1, 3–5 and 7–9')}. Events will
        force quick choices under a countdown. Near-misses build a {green('streak bonus')} — if
        you keep everyone alive.
      </>
    ),
  },
]

const cardStyle: CSSProperties = {
  width: 'min(88%, 440px)',
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: 24,
  textAlign: 'left',
}

export function TutorialPrompt(props: { onYes: () => void; onNo: () => void }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, margin: '0 0 8px', color: '#e2e8f0' }}>FIRST SHIFT?</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
          Want a quick tutorial before the tower is yours?
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button style={buttonStyle} onClick={props.onYes}>
            YES, SHOW ME
          </button>
          <button style={secondaryButtonStyle} onClick={props.onNo}>
            NO, I'VE GOT THIS
          </button>
        </div>
      </div>
    </div>
  )
}

export function TutorialSlides(props: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const slide = SLIDES[step]
  const last = step === SLIDES.length - 1

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ color: '#64748b', fontSize: 12 }}>
          STEP {step + 1}/{SLIDES.length}
        </div>
        <h2 style={{ fontSize: 20, margin: '6px 0 10px', color: '#e2e8f0' }}>{slide.title}</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, margin: '0 0 18px' }}>
          {slide.body}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            style={buttonStyle}
            onClick={() => (last ? props.onDone() : setStep(step + 1))}
          >
            {last ? "LET'S GO" : 'NEXT'}
          </button>
          {!last && (
            <button style={secondaryButtonStyle} onClick={props.onDone}>
              SKIP
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
