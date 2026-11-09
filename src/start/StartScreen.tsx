// The start screen: two equal ways in. Import the survey (DXF), or sketch the block without
// one and add the survey later. It shows alone until a site exists, real or sketched; a project
// file or a saved plan opens here too. Esc and the back link leave whenever there's somewhere
// to go back to, so nobody is ever stuck on it.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CloudStartLink } from '../cloud/CloudCard'
import { Icon, Logo } from '../nav/icons'
import { askSurveyor } from '../safety/files'
import { openFile, startSketch } from '../safety/flows'
import { useSafety } from '../safety/store'
import { SurveyorRequest } from '../safety/SurveyorRequest'
import { readSketchSize, ROUGH_SIZE, type StreetSide } from './sketch'
import '../shell/fonts.css'
import './start.css'

interface Props {
  /** Into the project open now (one without a survey yet), or a new project. */
  into: 'current' | 'new'
  /** Where Back and Esc go, when there's somewhere to go. */
  onCancel?: () => void
  cancelLabel?: string
}

const TOUCH = '(pointer: coarse)'
function useTouch(): boolean {
  return useSyncExternalStore(
    cb => {
      const m = matchMedia(TOUCH)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(TOUCH).matches,
    () => false,
  )
}

const SIDES: { id: StreetSide; label: string }[] = [
  { id: 'N', label: 'North' },
  { id: 'E', label: 'East' },
  { id: 'S', label: 'South' },
  { id: 'W', label: 'West' },
]

function SurveyArt() {
  return (
    <svg viewBox="0 0 330 150" width="100%" height="100%" aria-hidden="true">
      <path d="M125 21h60l20 20v88h-80z" fill="#ffffff" stroke="#16181b" strokeWidth="1.4" />
      <path d="M185 21v20h20" fill="none" stroke="#16181b" strokeWidth="1.4" />
      <path
        d="M135 65c12-7 22 5 34 0s20-6 26 0M135 83c12-7 22 5 34 0s20-6 26 0M135 101c12-7 22 5 34 0s20-6 26 0"
        fill="none"
        stroke="#8da0e6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="135" y="111" width="34" height="14" rx="2" fill="#2346d0" />
      <text x="152" y="121.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffffff">
        DXF
      </text>
    </svg>
  )
}

function SketchArt({ street }: { street: StreetSide }) {
  // The block drawn north up, with the street on the side picked and the fall towards it.
  const w = 330
  const h = 150
  const along = street === 'N' || street === 'S'
  const bw = along ? 76 : 104
  const bh = along ? 96 : 72
  const x = w / 2 - bw / 2
  const y = h / 2 - bh / 2
  const st =
    street === 'N'
      ? { d: `M${x - 16} ${y - 8}H${x + bw + 16}`, tx: w / 2, ty: y - 13, a: 'middle' as const }
      : street === 'S'
        ? { d: `M${x - 16} ${y + bh + 8}H${x + bw + 16}`, tx: w / 2, ty: y + bh + 21, a: 'middle' as const }
        : street === 'W'
          ? { d: `M${x - 8} ${y - 14}V${y + bh + 14}`, tx: x - 14, ty: h / 2 + 4, a: 'end' as const }
          : { d: `M${x + bw + 8} ${y - 14}V${y + bh + 14}`, tx: x + bw + 14, ty: h / 2 + 4, a: 'start' as const }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" aria-hidden="true">
      <rect x={x} y={y} width={bw} height={bh} fill="#ffffff" stroke="#16181b" strokeWidth="1.4" strokeDasharray="5 3" />
      <path d={st.d} stroke="#16181b" strokeWidth="6" opacity=".18" />
      <text x={st.tx} y={st.ty} textAnchor={st.a} fontSize="11" fill="#6b7077">
        street
      </text>
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize="11" fill="#6b7077">
        {along ? 'width × depth' : 'depth × width'}
      </text>
    </svg>
  )
}

export function StartScreen({ into, onCancel, cancelLabel }: Props) {
  const touch = useTouch()
  const busy = useSafety(s => s.busy)
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  /** Why the file didn't open, and whether a better file from the surveyor is the fix. */
  const [fileError, setFileError] = useState<{ text: string; ask: boolean } | null>(null)
  const [sketchError, setSketchError] = useState<string | null>(null)
  const [width, setWidth] = useState('')
  const [depth, setDepth] = useState('')
  const [fall, setFall] = useState('')
  const [street, setStreet] = useState<StreetSide>('S')

  // Esc goes back, wherever focus is, unless a review is open over this screen.
  const cancel = useRef(onCancel)
  useLayoutEffect(() => {
    cancel.current = onCancel
  })
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      const { review, layers } = useSafety.getState()
      if (e.key === 'Escape' && cancel.current && !review && !layers) cancel.current()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const open = (f: File) => {
    setFileError(null)
    openFile(f, { into }).catch((e: unknown) => setFileError({ text: (e as Error)?.message || 'That file couldn’t be opened.', ask: askSurveyor(e) }))
  }

  const sketch = () => {
    setSketchError(null)
    let block
    try {
      block = readSketchSize(width, depth, fall, street)
    } catch (e) {
      setSketchError((e as Error).message)
      return
    }
    startSketch(block, into).catch((e: unknown) => setSketchError((e as Error)?.message || 'The sketch block couldn’t be made.'))
  }

  return (
    <div className="start-screen">
      <header className="st-top">
        {onCancel ? (
          <button className="st-back" onClick={onCancel} title="Esc">
            <Icon name="chevL" size={16} />
            {cancelLabel ?? 'Back'}
          </button>
        ) : (
          <div className="st-brand">
            <Logo size={24} />
            <span>Contour &amp; Gable</span>
          </div>
        )}
        <button className="st-btn" onClick={() => input.current?.click()} title="A project file, a saved plan, or a survey">
          <Icon name="file" size={16} />
          <span className="st-long">Open a file…</span>
          <span className="st-short">Open…</span>
        </button>
      </header>

      <main className="st-main" aria-busy={busy}>
        <p className="st-step">
          <i>1</i>Choose how to start
        </p>
        <h1>Start with your block</h1>
        <p className="st-lede">Bring in the survey if you have it. If it hasn’t arrived, sketch the block now and add the survey later. Your plan is kept either way.</p>
        {/* A first visit on a new device: projects saved in the cloud are a sign-in away. */}
        {!onCancel && <CloudStartLink />}

        <div className="st-choices">
          <section className="st-card" aria-labelledby="st-import">
            <div className="st-art">
              <SurveyArt />
            </div>
            <h2 id="st-import">Import a survey (DXF)</h2>
            <p>The contour survey from your surveyor. The file stays in this browser unless you sign in to save to the cloud.</p>
            <div
              className={`st-drop${dragging ? ' dragging' : ''}`}
              onDragOver={e => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) open(f)
              }}
            >
              {!touch && (
                <span className="st-drop-hint">
                  <Icon name="download" size={20} />
                  Drop the DXF here
                </span>
              )}
              <button className="st-btn primary" onClick={() => input.current?.click()} disabled={busy}>
                {busy ? 'Reading the file…' : 'Choose a file'}
              </button>
            </div>
            {fileError && (
              <p className="st-error" role="alert">
                {fileError.text}
              </p>
            )}
            {fileError?.ask && <SurveyorRequest />}
            <p className="st-note">A project file or a saved plan opens here too. A plan on its own goes on a sketch block until the survey comes.</p>
          </section>

          <section className="st-card" aria-labelledby="st-sketch">
            <div className="st-art">
              <SketchArt street={street} />
            </div>
            <h2 id="st-sketch">Sketch without a survey</h2>
            <p>A flat or gently sloping block from a few numbers. Replace it with the survey when it comes.</p>
            <form
              className="st-form"
              onSubmit={e => {
                e.preventDefault()
                sketch()
              }}
            >
              <span className="st-label" id="st-size">
                Block width × depth <span className="st-opt">(optional)</span>
              </span>
              <div className="st-size" role="group" aria-labelledby="st-size">
                <label className="st-field">
                  <input inputMode="decimal" placeholder="Width" aria-label="Width along the street, in metres" value={width} onChange={e => setWidth(e.target.value)} />
                  <span>m</span>
                </label>
                <span className="st-x" aria-hidden="true">
                  ×
                </span>
                <label className="st-field">
                  <input inputMode="decimal" placeholder="Depth" aria-label="Depth from the street, in metres" value={depth} onChange={e => setDepth(e.target.value)} />
                  <span>m</span>
                </label>
              </div>
              <div className="st-row2">
                <div>
                  <label className="st-label" htmlFor="st-fall">
                    Rough fall <span className="st-opt">(optional)</span>
                  </label>
                  <label className="st-field">
                    <input id="st-fall" inputMode="decimal" placeholder="Flat" value={fall} onChange={e => setFall(e.target.value)} title="How much higher the back of the block is than the street (m). Negative if it falls away from the street." />
                    <span>m</span>
                  </label>
                </div>
                <div>
                  <span className="st-label" id="st-street">
                    Street side
                  </span>
                  <div className="st-seg" role="radiogroup" aria-labelledby="st-street">
                    {SIDES.map(s => (
                      <button key={s.id} type="button" role="radio" aria-checked={street === s.id} aria-label={s.label} className={street === s.id ? 'on' : ''} onClick={() => setStreet(s.id)}>
                        {s.id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="st-note">
                Not sure yet? Leave the size empty for a {ROUGH_SIZE.width} × {ROUGH_SIZE.depth} m sheet; you can change it under Site › Block.
              </p>
              {sketchError && (
                <p className="st-error" role="alert">
                  {sketchError}
                </p>
              )}
              <button className="st-btn primary" type="submit" disabled={busy}>
                Start sketching
              </button>
            </form>
          </section>
        </div>
      </main>

      <input
        ref={input}
        type="file"
        accept=".dxf,.json,application/json"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) open(f)
        }}
      />
    </div>
  )
}
