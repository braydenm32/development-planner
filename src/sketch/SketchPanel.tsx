// The sketch layer's cards: the Sketch tool's options beside the rail, the card of a selected sketch
// line or kept measurement (with "Turn into" for a line), and the Key's switch for the layer.

import { Fragment, useState } from 'react'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { Select } from '../components/fields'
import { AREA_KINDS, SKETCH_COLOURS, SKETCH_NAME_MAX, WALL_PRESETS, levelById, type Plan, type SketchColour, type SketchItem } from '../plan/model'
import { copySelected, deleteSelected } from '../plan/editActions'
import { usePlan } from '../plan/store'
import { clearSketchWithReview, colourSketch, makeArea, makeRetainingWall, makeWalls } from './actions'
import { sketchCentre, sketchClosed, sketchLength, sketchToOutline, sketchToSegments } from './geometry'
import { colourOf, sketchLegend, SKETCH_PAINT } from './colours'
import { setSketchName, sketchOf } from './ops'
import { useSketch, type SketchMode } from './store'
import { paintStyle, SKETCH_NAMES } from './useSketchLayer'
import '../components/finishing.css'
import './sketch.css'

const MODES: { id: SketchMode; label: string; help: string }[] = [
  { id: 'line', label: 'Line', help: 'Click each corner; type a length in mm (or 3000<45 for a length and angle) and press Enter. Double-click or Enter to finish.' },
  { id: 'arc', label: 'Arc', help: 'Click the start, the end, then a point for how far it bulges.' },
  { id: 'circle', label: 'Circle', help: 'Click the centre, then a point on the circle, or type the radius in mm.' },
  { id: 'curve', label: 'Curve', help: 'Click points for a smooth curve to pass through. Double-click or Enter to finish.' },
]

const mm = (m: number) => `${Math.round(m * 1000)} mm`

/** A colour's name for its swatch: "Red", or "Red: Old fence" once named. */
const colourTitle = (plan: Plan | null, c: SketchColour) => {
  const n = plan?.sketchNames?.[c]
  return n ? `${SKETCH_PAINT[c].label}: ${n}` : SKETCH_PAINT[c].label
}

/** A row of colour swatches; `value` null when the lines chosen are in different colours. */
export function SketchColours({ value, onChange, label }: { value: SketchColour | null; onChange: (c: SketchColour) => void; label: string }) {
  const plan = usePlan(s => s.plan)
  return (
    <div className="sketch-colours" role="radiogroup" aria-label={label}>
      {SKETCH_COLOURS.map(c => (
        <button key={c} type="button" role="radio" aria-checked={value === c} className="sketch-colour" style={paintStyle(c)} title={colourTitle(plan, c)} aria-label={colourTitle(plan, c)} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

/** One colour's name, saved when the field is left or Enter is pressed (one undo step, not one per letter). */
function NameField({ colour, saved }: { colour: SketchColour; saved: string }) {
  const [text, setText] = useState<string | null>(null)
  const save = () => {
    if (text !== null) usePlan.getState().commit(p => setSketchName(p, colour, text))
    setText(null)
  }
  return (
    <label className="sketch-name" style={paintStyle(colour)}>
      <i aria-hidden="true" />
      <input
        type="text"
        value={text ?? saved}
        maxLength={SKETCH_NAME_MAX}
        placeholder={`${SKETCH_PAINT[colour].label}: what it marks`}
        aria-label={`What ${SKETCH_PAINT[colour].label.toLowerCase()} lines mark`}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setText(null)
        }}
      />
    </label>
  )
}

/** Naming what each colour stands for, shown in the Key and on the PDF plans. */
function ColourNames() {
  const names = usePlan(s => s.plan?.sketchNames)
  const named = SKETCH_COLOURS.some(c => names?.[c])
  return (
    <details className="sketch-names-box" open={named || undefined}>
      <summary className="small">Name the colours</summary>
      <p className="muted small">Say what each colour marks, such as an old fence or a tree's reach. The names show in the Key and on the PDF plans.</p>
      <div className="sketch-names">
        {SKETCH_COLOURS.map(c => (
          <NameField key={c} colour={c} saved={names?.[c] ?? ''} />
        ))}
      </div>
    </details>
  )
}

/** The Sketch tool's card: what a click draws, and the layer as a whole. */
export function SketchOptions() {
  const mode = useSketch(s => s.mode)
  const colour = useSketch(s => s.colour)
  const count = usePlan(s => (s.plan ? sketchOf(s.plan).length : 0))
  return (
    <div className="tool-options sketch-options">
      <div className="tool-modes">
        <div className="segmented mode-switch" role="radiogroup" aria-label="What the Sketch tool draws">
          {MODES.map(m => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => useSketch.getState().setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="muted small">{MODES.find(m => m.id === mode)?.help}</p>
      </div>
      <div className="sketch-colour-pick">
        <span className="small">Colour</span>
        <SketchColours value={colour} onChange={c => useSketch.getState().setColour(c)} label="Colour of new sketch lines" />
      </div>
      <ColourNames />
      <p className="muted small">Sketch lines change nothing: no rooms, costs or checks. Walls, areas and every other tool snap to their ends, middles, crossings and centres. Select one to turn it into walls, a retaining wall or an area.</p>
      <div className="row">
        <button className="secondary small" disabled={!count} onClick={() => void clearSketchWithReview()}>
          Clear sketch layer…
        </button>
      </div>
    </div>
  )
}

/** The Key's switch for the sketch layer: off hides the sketch lines and kept measurements, and nothing snaps to them. */
export function SketchKey({ on, onChange, plan }: { on: boolean; onChange: (on: boolean) => void; plan: Plan }) {
  const legend = sketchLegend(plan)
  return (
    <>
      <label className="check sketch-key">
        <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
        <svg className="sketch-key-swatch" width="20" height="8" aria-hidden="true">
          <path className="sketch-line" d="M1 4H19" />
        </svg>
        Sketch &amp; measurements
      </label>
      {on && legend.length > 0 && (
        <ul className="sketch-legend" aria-label="What the sketch colours mark">
          {legend.map(l => (
            <li key={l.colour} style={paintStyle(l.colour)} title={l.text}>
              <svg width="20" height="8" aria-hidden="true">
                <path className="sketch-line" d="M1 4H19" />
              </svg>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Its numbers, in words. */
function facts(item: SketchItem): [string, string][] {
  const rows: [string, string][] = []
  const c = sketchCentre(item)
  if (item.kind === 'circle' && c) rows.push(['Radius', mm(c.r)], ['Diameter', mm(2 * c.r)], ['Around', mm(sketchLength(item))])
  else if (item.kind === 'arc') {
    if (c) rows.push(['Radius', mm(c.r)])
    rows.push(['Along the arc', mm(sketchLength(item))])
  } else if (item.kind === 'measure') {
    const pieces = item.pts.slice(1).map((p, i) => Math.hypot(p[0] - item.pts[i][0], p[1] - item.pts[i][1]))
    if (pieces.length > 1) pieces.forEach((d, i) => rows.push([`Piece ${i + 1}`, mm(d)]))
    rows.push([pieces.length > 1 ? 'Total' : 'Length', mm(pieces.reduce((n, d) => n + d, 0))])
  } else {
    rows.push([sketchClosed(item) ? 'Around' : 'Length', mm(sketchLength(item))])
    if (item.kind === 'line' && item.pts.length > 2) rows.push(['Sides', String(item.pts.length - 1)])
  }
  return rows
}

/** The card of a selected sketch line or kept measurement. */
export function SketchSelection({ item, plan, survey, terrain }: { item: SketchItem; plan: Plan; survey: Survey; terrain: Terrain }) {
  const wallStyle = usePlan(s => s.wallStyle)
  const areaDefault = usePlan(s => s.areaDefault)
  const level = usePlan(s => s.activeLevel)
  const st = usePlan.getState()
  const drawnOn = levelById(plan, item.level)?.name
  const here = levelById(plan, level)?.name ?? 'this level'
  const pieces = item.kind === 'measure' ? 0 : sketchToSegments(item).length
  const outline = item.kind === 'measure' ? null : sketchToOutline(item)
  const housePresets = WALL_PRESETS.map((p, i) => ({ ...p, i })).filter(p => p.kind !== 'retaining')
  const preset = housePresets.find(p => p.kind === wallStyle.kind && p.thickness === wallStyle.thickness)
  return (
    <section className="selection sketch-selection">
      <h2>{SKETCH_NAMES[item.kind]}</h2>
      <dl className="stats">
        {facts(item).map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
        {drawnOn && (
          <>
            <dt>Drawn on</dt>
            <dd>{drawnOn} (shows on every level)</dd>
          </>
        )}
      </dl>
      {item.kind !== 'measure' && (
        <div className="sketch-colour-pick">
          <span className="small">Colour</span>
          <SketchColours value={colourOf(item)} onChange={c => colourSketch([item.id], c)} label="Colour of this sketch line" />
        </div>
      )}
      <p className="muted small">{item.kind === 'measure' ? 'A measurement kept on the plan. It changes nothing; drag its ends to measure again.' : 'A sketch line changes nothing. Drag its points to reshape it; everything snaps to it.'}</p>
      {item.kind !== 'measure' && (
        <div className="sketch-turn">
          <h3>Turn into</h3>
          <p className="muted small">
            On {here}
            {item.kind !== 'line' ? `, in ${pieces} straight ${pieces === 1 ? 'piece' : 'pieces'}` : ''}. The sketch line stays; hide the layer in the Key, or clear it.
          </p>
          <label className="num">
            <span>Wall type</span>
            <select
              value={preset?.i ?? -1}
              onChange={e => {
                const p = WALL_PRESETS[Number(e.target.value)]
                if (p) st.setWallStyle({ kind: p.kind, thickness: p.thickness })
              }}
            >
              {housePresets.map(p => (
                <option key={p.label} value={p.i}>
                  {p.label}
                </option>
              ))}
              {!preset && <option value={-1}>{`${wallStyle.kind === 'internal' ? 'Internal' : 'External'}, ${Math.round(wallStyle.thickness * 1000)} mm`}</option>}
            </select>
          </label>
          <div className="row">
            <button className="secondary" disabled={!pieces} onClick={() => makeWalls(item, survey, terrain.grid)}>
              Make walls
            </button>
            <button className="secondary" disabled={!pieces} onClick={() => makeRetainingWall(item, survey, terrain.grid)}>
              Make a retaining wall
            </button>
          </div>
          <Select label="Area type" value={areaDefault} options={AREA_KINDS} onChange={k => st.setAreaDefault(k)} />
          <div className="row">
            <button className="secondary" disabled={!outline} onClick={() => makeArea(item, areaDefault)} title={outline ? undefined : 'Needs a closed shape, or a line with three or more corners'}>
              Make an area outline
            </button>
          </div>
        </div>
      )}
      <div className="row">
        <button className="secondary" onClick={() => copySelected()}>
          Copy
        </button>
        <button className="secondary danger" onClick={() => deleteSelected()}>
          Delete
        </button>
      </div>
      <div className="row">
        <button className="link" onClick={() => void clearSketchWithReview()}>
          Clear sketch layer…
        </button>
      </div>
    </section>
  )
}
