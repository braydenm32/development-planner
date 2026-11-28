// What a sketch block shows until the survey comes: a quiet chip on the canvas, and in the
// Site panel a line on what the sketch is, with Add the survey and Change size. Both go
// through Replace survey's review, so the plan is kept and nothing changes unconfirmed.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from '../nav/router'
import { useProjects } from '../projects/session'
import { replaceSurvey } from '../safety/flows'
import { pickFile, showToast } from '../safety/store'
import { FallPicker } from './FallPicker'
import { chipFit, describeSketch, fallChoiceOf, fallNumbers, FLAT, readSketchSize, SIDE_NAME, sketchSurvey, type FallChoice, type SketchBlock, type StreetSide } from './sketch'
import './start.css'

/** On the canvas: this block is a sketch, and the survey can come in any time. */
export function SketchChip() {
  const sketch = useProjects().opened?.survey?.sketch
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<ReturnType<typeof chipFit> | null>(null)
  const on = !!sketch
  useLayoutEffect(() => {
    const el = ref.current
    const main = el?.closest<HTMLElement>('.shell-main')
    if (!on || !el || !main) return
    const measure = () => {
      const level = main.querySelector('.level-chip')?.getBoundingClientRect()
      const compass = main.querySelector('.plan-compass')?.getBoundingClientRect()
      // Only a computer's plan has the row (a phone, 3D and Costs place it in CSS).
      if (!main.matches('.canvas-plan:not(.report)') || main.closest('.phone') || !level || !compass) return setFit(null)
      const part = (q: string) => el.querySelector<HTMLElement>(q)
      const edges = 30
      const short = (part('b')?.offsetWidth ?? 0) + (part('button')?.offsetWidth ?? 0) + edges
      const full = short + (part('.sk-what')?.scrollWidth ?? 0)
      setFit(chipFit(compass.left - level.right - 16, full, short, main.classList.contains('has-inspector')))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(main)
    const level = main.querySelector('.level-chip')
    if (level) ro?.observe(level)
    // The selection's card opening moves the compass without resizing anything.
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure)
    mo?.observe(main, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => {
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [on])
  if (!sketch) return null
  return (
    <div ref={ref} className={`sketch-chip${fit ? ` fit-${fit}` : ''}`} role="status" aria-hidden={fit === 'off' || undefined}>
      <span>
        <b>Sketch block</b> <span className="sk-what">· {describeSketch(sketch)}</span>
      </span>
      <button onClick={() => pickFile('survey')} tabIndex={fit === 'off' ? -1 : undefined}>
        Add the survey
      </button>
    </div>
  )
}

/** A link's way to Site › Block's Change size (Site › Map's "Sketch the block instead"). */
export const SKETCH_SIZE_ID = 'sketch-size'

/** In Site › Block (and the old Site panel): what the sketch is, Add the survey, and Change size. */
export function SketchNotice() {
  const sketch = useProjects().opened?.survey?.sketch
  // Sent here to set the size by hand (the panel opens afresh for it): the fields start open.
  const [sent] = useState(() => !!sketch && useRouter.getState().focus === SKETCH_SIZE_ID)
  const [editing, setEditing] = useState(sent)
  const [width, setWidth] = useState(sent && sketch && !sketch.rough ? String(sketch.width) : '')
  const [depth, setDepth] = useState(sent && sketch && !sketch.rough ? String(sketch.depth) : '')
  const [fall, setFall] = useState<FallChoice>(sent && sketch ? fallChoiceOf(sketch) : FLAT)
  const [street, setStreet] = useState<StreetSide>(sent && sketch ? sketch.street : 'S')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (sent) useRouter.setState({ focus: null })
  }, [sent])
  if (!sketch) return null

  const edit = () => {
    setWidth(sketch.rough ? '' : String(sketch.width))
    setDepth(sketch.rough ? '' : String(sketch.depth))
    setFall(fallChoiceOf(sketch))
    setStreet(sketch.street)
    setError(null)
    setEditing(true)
  }
  const apply = () => {
    let block: SketchBlock
    try {
      const { fall: f, cross } = fallNumbers(fall)
      block = readSketchSize(width, depth, f, street, cross)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    setEditing(false)
    replaceSurvey(sketchSurvey(block)).catch((e: unknown) => showToast({ text: (e as Error)?.message || 'The sketch block couldn’t be changed.' }))
  }

  return (
    <div className="sketch-notice">
      <p>
        <b>No survey yet.</b> This is a sketch block: {describeSketch(sketch)}, at an assumed RL 100.00 by the street. Your plan is kept when the survey comes in.
      </p>
      {editing ? (
        <form
          className="sketch-size"
          onSubmit={e => {
            e.preventDefault()
            apply()
          }}
        >
          <label>
            Width <input inputMode="decimal" value={width} placeholder="m" onChange={e => setWidth(e.target.value)} />
          </label>
          <label>
            Depth <input inputMode="decimal" value={depth} placeholder="m" onChange={e => setDepth(e.target.value)} />
          </label>
          <label>
            Street
            <select value={street} onChange={e => setStreet(e.target.value as StreetSide)}>
              {(['N', 'E', 'S', 'W'] as const).map(s => (
                <option key={s} value={s}>
                  {SIDE_NAME[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="sketch-fall">
            <FallPicker id="sketch-fall" look="compact" value={fall} onChange={setFall} />
          </div>
          {error && <p className="sketch-error">{error}</p>}
          <div className="row">
            <button type="submit" className="secondary">
              Review the change
            </button>
            <button type="button" className="link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button className="secondary" onClick={() => pickFile('survey')}>
            Add the survey…
          </button>
          <button className="secondary" onClick={edit}>
            Change size…
          </button>
        </div>
      )}
    </div>
  )
}
