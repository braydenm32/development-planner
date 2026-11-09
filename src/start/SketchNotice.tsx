// What a sketch block shows until the survey comes: a quiet chip on the canvas, and in the
// Site panel a line on what the sketch is, with Add the survey and Change size. Both go
// through Replace survey's review, so the plan is kept and nothing changes unconfirmed.

import { useState } from 'react'
import { useProjects } from '../projects/session'
import { replaceSurvey } from '../safety/flows'
import { pickFile, showToast } from '../safety/store'
import { describeSketch, readSketchSize, SIDE_NAME, sketchSurvey, type SketchBlock, type StreetSide } from './sketch'
import './start.css'

/** On the canvas: this block is a sketch, and the survey can come in any time. */
export function SketchChip() {
  const sketch = useProjects().opened?.survey?.sketch
  if (!sketch) return null
  return (
    <div className="sketch-chip" role="status">
      <span>
        <b>Sketch block</b> · {describeSketch(sketch)}
      </span>
      <button onClick={() => pickFile('survey')}>Add the survey</button>
    </div>
  )
}

/** In Site › Block (and the old Site panel): what the sketch is, Add the survey, and Change size. */
export function SketchNotice() {
  const sketch = useProjects().opened?.survey?.sketch
  const [editing, setEditing] = useState(false)
  const [width, setWidth] = useState('')
  const [depth, setDepth] = useState('')
  const [fall, setFall] = useState('')
  const [street, setStreet] = useState<StreetSide>('S')
  const [error, setError] = useState<string | null>(null)
  if (!sketch) return null

  const edit = () => {
    setWidth(sketch.rough ? '' : String(sketch.width))
    setDepth(sketch.rough ? '' : String(sketch.depth))
    setFall(sketch.fall ? String(sketch.fall) : '')
    setStreet(sketch.street)
    setError(null)
    setEditing(true)
  }
  const apply = () => {
    let block: SketchBlock
    try {
      block = readSketchSize(width, depth, fall, street)
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
            Fall <input inputMode="decimal" value={fall} placeholder="flat" onChange={e => setFall(e.target.value)} />
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
