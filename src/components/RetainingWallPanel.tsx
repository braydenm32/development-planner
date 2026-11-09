import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Survey } from '../lib/survey'
import { bearingName, type Terrain } from '../lib/terrain'
import { DEFAULT_BENCH, earthworksOf, levelById, sortedLevels, wallLength, WALL_KINDS, type Plan, type Retain, type SideLevel, type Wall } from '../plan/model'
import { deleteSelection, moveWall, setWallLength, updateWall } from '../plan/ops'
import { housePadRL, MIN_BENCH, sideRL } from '../plan/platforms'
import { gapShift, HOUSE_WALL_NOTE } from '../plan/retainOffer'
import { ENGINEER_TEXT, needsEngineer } from '../checks/engineer'
import {
  engineerNote,
  exposedHeight,
  heightNote,
  highestOn,
  houseGap,
  insideHouse,
  INSIDE_HOUSE_NOTE,
  levelsForHeight,
  lowestOn,
  otherSide,
  retainingProfile,
  retainingSection,
  RETAINING_FREEBOARD,
  sideBearing,
  sideChange,
  type RetainingSection,
  type Side,
} from '../plan/retaining'
import { answerRunHeight, cancelNewRetaining, keepNewRetaining, setEarthSide, startSidePick, stopSidePick, tidyRetain, useRetaining } from '../plan/retainingSession'
import { wallChange, wallChangeText } from '../plan/wallChange'
import { showChanged } from '../plan/wallFocus'
import { useCosts } from '../costs/store'
import { money } from '../costs/format'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { Num, Select } from './fields'
import { holdsBackSentence, SIDE_WORDS, sideLabel as sideWords } from './retainingWords'
import { WallsHere } from './WallsHere'
import './retaining.css'

interface Props {
  wall: Wall
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

const rl = (v: number) => `RL ${v.toFixed(2)}`
const m2 = (v: number) => `${v.toFixed(2)} m`

/**
 * A retaining wall's panel. The simple flow first: the earth side (a click on the plan, or the
 * uphill and downhill buttons), how high the earth behind it is, a live section, then Keep wall.
 * Exact levels either side, the levelled benches and the wall's size and kind wait under one
 * disclosure. Asks about a wall just drawn, and edits one selected.
 */
export function RetainingWallPanel({ wall: w, plan, survey, terrain, earth }: Props) {
  const isNew = useRetaining(s => s.newWall === w.id)
  const pieces = useRetaining(s => (s.newWall === w.id ? s.run.length : 1))
  const picking = useRetaining(s => s.sidePick === w.id)
  const costs = useCosts(s => s.data)
  const [details, setDetails] = useState(false)
  const st = usePlan.getState()
  const finished = earth?.result.grid ?? terrain.grid
  const prof = useMemo(() => retainingProfile(w, plan, survey.origin, finished), [w, plan, survey, finished])
  const nat = useMemo(() => retainingProfile({ ...w, retain: undefined }, plan, survey.origin, terrain.grid), [w, plan, survey, terrain])
  const section = useMemo(() => retainingSection(w, plan, survey.origin, terrain.grid, finished), [w, plan, survey, terrain, finished])
  const gaps = useMemo(() => ({ left: houseGap(w, plan, 'left'), right: houseGap(w, plan, 'right') }), [w, plan])
  const inside = useMemo(() => insideHouse(w, plan), [w, plan])
  // What the wall changes, against the plan without it: the line under the height box.
  // The lit ground goes with the panel.
  useEffect(() => () => showChanged(null), [])
  const change = useMemo(() => (earth && !insideHouse(w, plan) ? wallChange(plan, w, survey, terrain.grid, earth, costs) : null), [plan, w, survey, terrain, earth, costs])

  // Walls from older plans have no levels: show the side the ground says, and write nothing until asked.
  const r: Retain = w.retain ?? { high: prof.high ?? 'left' }
  const low = otherSide(r.high)
  // The pad of the wall's own level: beside an upper split level, that level's.
  const pad = housePadRL(plan, w.level)
  const split = plan.levels.length > 1 && sortedLevels(plan)[0]?.id !== w.level
  const padName = split ? `${levelById(plan, w.level)?.name ?? 'this level'} pad` : 'house pad'
  const levelRL = (lv: SideLevel) => sideRL(plan, lv, w.level)
  const ew = earthworksOf(plan)
  // Any answer in the panel makes a wall just drawn a real one: it stays if it's left.
  const set = (next: Retain) => st.commit(p => updateWall(p, w.id, { retain: tidyRetain({ ...next, draft: undefined }) }))
  // Setting a level or the top by hand overrides the height question's answer.
  const setExact = (next: Retain) => set({ ...next, askedHeight: undefined })

  // Uphill and downhill by the natural ground, named by compass.
  const uphill: Side | null = nat.high
  const sides: Side[] = uphill ? [uphill, otherSide(uphill)] : ['left', 'right']
  const compass = (s: Side) => bearingName(sideBearing(w, s, plan))
  const sideName = (s: Side) => (uphill ? `${s === uphill ? 'Uphill' : 'Downhill'} (${compass(s)})` : `${cap(compass(s))} side`)
  const slopeWord = (s: Side) => (uphill ? (s === uphill ? 'Uphill' : 'Downhill') : `${cap(compass(s))} side`)

  const chooseSide = (s: Side) => {
    stopSidePick()
    // Picking the lower side fills it: by the height asked, or the one showing now.
    setEarthSide(w.id, s, survey.origin, terrain.grid, prof.maxHeight)
  }

  const levelOf = (s: Side): SideLevel | undefined => (s === r.high ? r.highLevel : r.lowLevel)
  const benchOf = (s: Side): number | undefined => (s === r.high ? r.highBench : r.lowBench)
  const setLevel = (s: Side, v: SideLevel | undefined) => setExact(s === r.high ? { ...r, highLevel: v } : { ...r, lowLevel: v })
  const setBench = (s: Side, v: number) => set(s === r.high ? { ...r, highBench: v } : { ...r, lowBench: v })
  /** How a side's ground is finished at the wall, against the natural ground there. */
  const depth = (s: Side): string => {
    const lv = levelOf(s)
    if (lv === undefined) {
      // Batters round the wall's ends, or the house's, can still reach it.
      const down = Math.max(...prof.samples.map((x, i) => nat.samples[i][s] - x[s]))
      const up = Math.max(...prof.samples.map((x, i) => x[s] - nat.samples[i][s]))
      if (down > 0.03 || up > 0.03) return "Natural, with batters round the wall's ends"
      return 'Natural ground'
    }
    const level = levelRL(lv)
    const cut = highestOn(nat, s) - level
    const fill = level - lowestOn(nat, s)
    if (cut > 0.005 && fill > 0.005) return `Cut up to ${m2(cut)}, filled up to ${m2(fill)}`
    if (cut > 0.005) return `${lv === 'pad' ? 'Cut to pad, up' : 'Cut up'} to ${m2(cut)} deep`
    if (fill > 0.005) return `${lv === 'pad' ? 'Filled to pad, up' : 'Filled up'} to ${m2(fill)} deep`
    return 'Level with the ground'
  }
  const faces = (s: Side) => gaps[s] !== null

  const height = prof.maxHeight
  const exposed = exposedHeight(prof)
  const tall = needsEngineer(height)
  const highGround = highestOn(prof, r.high)
  const len = wallLength(w)

  // The house pad on one side, with the house beside it: the gap between them is the levelled bench.
  const houseSide: Side | null = r.lowLevel === 'pad' && gaps[low] !== null ? low : r.highLevel === 'pad' && gaps[r.high] !== null ? r.high : null
  const gapNow = houseSide ? gaps[houseSide] : null
  const setGap = (g: number) => {
    if (!houseSide || gapNow === null) return
    const by = gapShift(w, houseSide, g, gapNow)
    const bench = Math.max(MIN_BENCH, Math.round(g * 1000) / 1000)
    st.commit(p => {
      const moved = moveWall(p, w.id, by, p)
      const next: Retain = houseSide === r.high ? { ...r, highBench: bench } : { ...r, lowBench: bench }
      return updateWall(moved, w.id, { retain: tidyRetain(next) })
    })
  }

  /** A side's label under the section: read from the finished ground against the natural, so it says what was really done there. */
  const sideLabel = (s: Side) => {
    const lv = levelOf(s)
    const ch = sideChange(prof, nat, s)
    // With no level of its own, what changed it: the house pad when the ground there is at the pad.
    let most = 0
    prof.samples.forEach((x, i) => {
      if (Math.abs(x[s] - nat.samples[i][s]) > Math.abs(prof.samples[most][s] - nat.samples[most][s])) most = i
    })
    const byPad = Math.abs(prof.samples[most][s] - pad) < 0.02
    return sideWords({
      slope: slopeWord(s),
      level: lv === undefined ? null : lv === 'pad' ? `${padName}, ${rl(pad)}` : rl(lv),
      ...ch,
      by: byPad ? padName : null,
    })
  }

  const levelsSummary = [
    r.lowLevel === undefined ? 'Open side kept natural' : r.lowLevel === 'pad' ? `Open side cut to the ${padName}, ${rl(pad)}` : `Open side finished at ${rl(r.lowLevel)}`,
    r.highLevel === undefined ? 'earth side kept natural' : `earth side finished at ${rl(levelRL(r.highLevel))}`,
  ].join(', ')
  // What the height box shows: the answer as typed, and why the ground gives another height when it does.
  const asked = r.askedHeight
  const note = heightNote(w.retain, prof, plan, nat)
  // The earth side still ends up lower than the open side: nothing has raised it yet.
  const lean = prof.samples.reduce((t, x) => t + x[r.high] - x[low], 0) / prof.samples.length
  const wrongWay = lean < -0.02
  const filledTo = uphill && r.high !== uphill && !wrongWay && r.highLevel !== undefined ? levelRL(r.highLevel) : null

  const benchField = (s: Side) => {
    const lv = levelOf(s)
    if (lv === undefined) return null
    const cuts = levelRL(lv) < highestOn(nat, s)
    return (
      <span className="rw-bench">
        Level for
        <NumberBox
          label={`Width of level ground beside the wall, ${s === r.high ? 'earth side' : 'open side'}`}
          value={Math.max(benchOf(s) ?? DEFAULT_BENCH, MIN_BENCH)}
          decimals={1}
          suffix="m"
          min={MIN_BENCH}
          max={30}
          onCommit={v => v !== undefined && setBench(s, v)}
        />
        then {batterText(cuts ? ew.cutBatter : ew.fillBatter)}
      </span>
    )
  }

  return (
    <section className="rw-panel" aria-label={isNew ? 'New retaining wall' : 'Retaining wall'}>
      <header className="rw-head">
        <h2>{isNew ? (pieces > 1 ? `New retaining wall · ${pieces} pieces` : 'New retaining wall') : 'Retaining wall'}</h2>
        <p>
          {picking
            ? 'Click the plan on the side the earth is on.'
            : isNew
              ? `${pieces > 1 ? 'Drawn end to end: the answers here go to every piece. ' : ''}Say how high the earth behind it is, then keep it.`
              : `${len.toFixed(1)} m long${split ? ` · ${levelById(plan, w.level)?.name ?? ''} level` : ''}.`}
        </p>
      </header>
      {!isNew && <WallsHere wall={w} plan={plan} />}

      {inside && <p className="rw-note rw-warn-text rw-inside">{INSIDE_HOUSE_NOTE}</p>}

      <div className="rw-group rw-side">
        <div className="rw-side-head">
          <h3>Earth side</h3>
          {picking ? (
            <button type="button" className="rw-link" onClick={stopSidePick}>
              Stop picking
            </button>
          ) : (
            <button type="button" className="rw-link" onClick={() => startSidePick(w.id)}>
              Pick on the plan
            </button>
          )}
        </div>
        <div className="rw-seg rw-seg-full" role="radiogroup" aria-label="Which side is the earth on?">
          {sides.map(s => (
            <button key={s} type="button" role="radio" aria-checked={r.high === s} className={r.high === s ? 'on' : ''} onClick={() => chooseSide(s)}>
              {s === uphill && (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6.5 14.5 5.5-5.5 5.5 5.5" />
                </svg>
              )}
              {sideName(s)}
            </button>
          ))}
        </div>
        {wrongWay && <p className="rw-note rw-warn-text">The earth side is still lower than the open side. Say how high the earth behind it is, and that side is filled up.</p>}
        {filledTo !== null && <p className="rw-note">The downhill side is filled up to {rl(filledTo)} behind the wall.</p>}
      </div>

      {!inside && (
        <div className="rw-group">
          <Row label={SIDE_WORDS.question} hint={note ?? undefined} warn={!!note}>
            <NumberBox
              label={SIDE_WORDS.question}
              value={asked ?? height}
              decimals={2}
              suffix="m"
              min={0.05}
              max={10}
              onCommit={h => {
                if (h === undefined) return
                // A new run's answer goes to every piece of it.
                if (isNew && pieces > 1) answerRunHeight(w.id, h, survey.origin, finished)
                else set(levelsForHeight(r, plan, prof, h))
              }}
              // While the box has focus, the ground the wall changes is lit on the plan.
              onFocus={() => change && showChanged({ cells: change.cells, cell: change.cell })}
              onBlur={() => showChanged(null)}
            />
          </Row>
          {change && <p className="rw-note rw-change">{wallChangeText(change, n => money(Math.round(n / 100) * 100))}</p>}
          {houseSide && gapNow !== null && (
            <Row label="Gap to the house" hint={gapNow < 0.05 ? HOUSE_WALL_NOTE : 'Levelled to the house pad, as a bench between them.'}>
            <NumberBox label="Gap between the wall and the house" value={gapNow} decimals={2} suffix="m" min={0} max={8} onCommit={g => g !== undefined && setGap(g)} />
            </Row>
          )}
        </div>
      )}

      <SectionDrawing section={section} highLabel={sideLabel(r.high)} lowLabel={sideLabel(low)} tags={details} />

      <div className="rw-sum">
        <p className="rw-sentence">{holdsBackSentence(height, exposed)}</p>
        {tall && (
          <span className="rw-warnchip" title={engineerNote(height)} tabIndex={0}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4.2 21 19.5H3z" />
              <path d="M12 10v4.2M12 16.8v.3" />
            </svg>
            Engineer needed over {ENGINEER_TEXT}
          </span>
        )}
      </div>

      <details className="rw-more" open={details} onToggle={e => setDetails((e.target as HTMLDetailsElement).open)}>
        <summary>{SIDE_WORDS.details}</summary>
        <p className="rw-note">The numbers match the tags on the section. Leave a box empty to keep the natural ground.</p>
        <Row
          n={1}
          label={SIDE_WORDS.top}
          hint={
            r.top === undefined
              ? `Now ${prof.top[1] - prof.top[0] < 0.01 ? rl(prof.top[1]) : `RL ${prof.top[0].toFixed(2)}–${prof.top[1].toFixed(2)}`}, ${Math.round(RETAINING_FREEBOARD * 1000)} mm above the earth`
              : r.top < highGround - 0.005
                ? `Below the earth by up to ${m2(highGround - r.top)}`
                : undefined
          }
          warn={r.top !== undefined && r.top < highGround - 0.005}
        >
          <LevelBox label="Top of wall RL" value={r.top} placeholder="follows ground" onCommit={v => setExact({ ...r, top: v })} />
        </Row>
        <Row
          n={2}
          label={SIDE_WORDS.earth}
          hint={
            <>
              {depth(r.high)}
              {faces(r.high) && r.highLevel !== 'pad' && (
                <>
                  {' · '}
                  <button type="button" className="rw-link" onClick={() => setLevel(r.high, 'pad')}>
                    to the {padName}
                  </button>
                </>
              )}
              {benchField(r.high)}
            </>
          }
        >
          <LevelBox
            label="Ground behind the wall, finished RL"
            value={r.highLevel === undefined ? undefined : levelRL(r.highLevel)}
            placeholder="keep natural"
            onCommit={v => setLevel(r.high, v)}
          />
        </Row>
        <Row
          n={3}
          label={SIDE_WORDS.open}
          hint={
            <>
              {depth(low)}
              {r.lowLevel !== 'pad' && (
                <>
                  {' · '}
                  <button type="button" className="rw-link" onClick={() => setLevel(low, 'pad')}>
                    cut to the {padName} ({rl(pad)})
                  </button>
                </>
              )}
              {benchField(low)}
            </>
          }
        >
          <LevelBox
            label="Ground in front of the wall, finished RL"
            value={r.lowLevel === undefined ? undefined : levelRL(r.lowLevel)}
            placeholder="keep natural"
            onCommit={v => setLevel(low, v)}
          />
        </Row>
        <p className="rw-note">
          {levelsSummary}. {r.top === undefined ? `Its top stands ${Math.round(RETAINING_FREEBOARD * 1000)} mm above the earth.` : `Its top is at ${rl(r.top)}.`}
        </p>
        <dl className="rw-kv">
          <div>
            <dt>Length · face</dt>
            <dd>
              {len.toFixed(1)} m · {prof.faceArea.toFixed(1)} m²
            </dd>
          </div>
        </dl>
        <div className="rw-size">
          <Num label="Length (centreline)" unit="mm" value={len} min={0.05} onCommit={l => st.commit(p => setWallLength(p, w.id, l))} />
          <Num label="Thickness" unit="mm" value={w.thickness} min={0.05} onCommit={thickness => st.commit(p => updateWall(p, w.id, { thickness }))} />
          <Select label="Kind" value={w.kind} options={WALL_KINDS} onChange={kind => st.commit(p => updateWall(p, w.id, { kind }))} />
        </div>
      </details>

      <footer className="rw-foot">
        {isNew ? (
          <>
            <button type="button" className="rw-btn rw-pri" onClick={keepNewRetaining}>
              Keep wall
            </button>
            <button type="button" className="rw-btn" onClick={cancelNewRetaining}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="rw-btn rw-pri" onClick={() => st.select(null)}>
              Done
            </button>
            <button
              type="button"
              className="rw-btn rw-danger"
              onClick={() => {
                st.commit(p => deleteSelection(p, { type: 'wall', id: w.id }))
                st.select(null)
              }}
            >
              Delete
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** A side's two-line label under the section. */
type SideText = { head: string; change: string }
const batterText = (b: number) => (b > 0 ? `a 1 in ${b} batter` : 'a vertical edge')

function Row({ n, label, hint, warn, children }: { n?: number; label: string; hint?: ReactNode; warn?: boolean; children: ReactNode }) {
  return (
    <div className={`rw-row${n ? '' : ' rw-row-plain'}`}>
      {n && <span className="rw-tag">{n}</span>}
      <span className="rw-row-label">{label}</span>
      {children}
      {hint && <span className={`rw-hint${warn ? ' rw-warn-text' : ''}`}>{hint}</span>}
    </div>
  )
}

/** An RL box that can be left empty (natural ground, or a top that follows the ground). */
function LevelBox({ label, value, placeholder, onCommit }: { label: string; value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void }) {
  return (
    <span className="rw-field">
      <em>RL</em>
      <NumberBox label={label} value={value} decimals={2} placeholder={placeholder} allowEmpty onCommit={onCommit} bare />
    </span>
  )
}

interface NumberBoxProps {
  label: string
  value: number | undefined
  decimals: number
  onCommit: (v: number | undefined) => void
  placeholder?: string
  suffix?: string
  min?: number
  max?: number
  /** Clearing the box commits undefined. */
  allowEmpty?: boolean
  /** No border of its own (inside an rw-field). */
  bare?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

/** A number box that commits on Enter or when it loses focus; Esc puts it back. */
function NumberBox({ label, value, decimals, onCommit, placeholder, suffix, min, max, allowEmpty, bare, onFocus, onBlur }: NumberBoxProps) {
  const shown = value === undefined ? '' : value.toFixed(decimals)
  const [editing, setEditing] = useState<string | null>(null)
  const cancelled = useRef(false)
  const commit = () => {
    const text = editing
    setEditing(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (text === null || text.trim() === shown) return
    if (!text.trim()) {
      if (allowEmpty && value !== undefined) onCommit(undefined)
      return
    }
    const v = parseFloat(text)
    if (!Number.isFinite(v)) return
    if ((min !== undefined && v < min) || (max !== undefined && v > max)) return
    onCommit(v)
  }
  const input = (
    <input
      aria-label={label}
      inputMode="decimal"
      placeholder={placeholder}
      value={editing ?? shown}
      onFocus={e => {
        setEditing(shown)
        e.target.select()
        onFocus?.()
      }}
      onChange={e => setEditing(e.target.value)}
      onBlur={() => {
        onBlur?.()
        commit()
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
  if (bare) return input
  return (
    <span className="rw-field rw-field-num">
      {input}
      {suffix && <em>{suffix}</em>}
    </span>
  )
}

/**
 * The ground across the wall at its tallest point: natural (dashed where it changes), finished,
 * the cut and fill between them, the wall, and the house slab where the section passes under it.
 * The earth side is on the left, the open side on the right. With `tags`, numbers 1 to 3 match the
 * exact level fields.
 */
function SectionDrawing({ section: c, highLabel, lowLabel, tags }: { section: RetainingSection; highLabel: SideText; lowLabel: SideText; tags: boolean }) {
  const W = 400
  const H = 188
  const base = H - 34
  const top = 26
  const reach = c.xs[c.xs.length - 1]
  const sx = (W / 2 - 2) / reach
  const shown = (i: number) => c.xs[i] >= -reach && c.xs[i] <= reach
  const zs = [...c.natural, ...c.finished, c.top, ...(c.house.length ? [c.pad, c.floor] : [])]
  const zMin = Math.min(...zs) - 0.35
  const zMax = Math.max(...zs) + 0.25
  const sy = Math.min((base - top) / Math.max(zMax - zMin, 0.1), sx * 3)
  const mid = (base - top) / 2 + top
  const zc = (zMin + zMax) / 2
  const X = (x: number) => W / 2 - x * sx
  const Y = (z: number) => mid - (z - zc) * sy
  const sideIdx = (hi: boolean) => c.xs.map((_, i) => i).filter(i => shown(i) && (hi ? c.xs[i] >= c.half : c.xs[i] <= -c.half))
  const pts = (idx: number[], f: (i: number) => number) => idx.map(i => `${X(c.xs[i]).toFixed(1)} ${Y(f(i)).toFixed(1)}`)
  const band = (idx: number[], upper: (i: number) => number, lower: (i: number) => number) =>
    idx.length ? `M${[...pts(idx, upper), ...pts([...idx].reverse(), lower)].join('L')}Z` : ''
  const line = (idx: number[], f: (i: number) => number) => (idx.length ? `M${pts(idx, f).join('L')}` : '')
  const earth = (idx: number[]) =>
    idx.length ? `M${pts(idx, i => c.finished[i]).join('L')}L${X(c.xs[idx[idx.length - 1]]).toFixed(1)} ${base}L${X(c.xs[idx[0]]).toFixed(1)} ${base}Z` : ''
  const hi = sideIdx(true)
  const lo = sideIdx(false)
  const parts = [hi, lo]
  const nat = (i: number) => c.natural[i]
  const fin = (i: number) => c.finished[i]
  const wx0 = X(c.half)
  const wx1 = X(-c.half)
  const ww = Math.max(wx1 - wx0, 7)
  const wTop = Y(c.top)
  // Where the tags sit: on each side's finished ground, clear of the wall.
  const at = (x: number) => {
    let best = 0
    for (let i = 0; i < c.xs.length; i++) if (Math.abs(c.xs[i] - x) < Math.abs(c.xs[best] - x)) best = i
    return { x: X(c.xs[best]), y: Y(c.finished[best]) }
  }
  const t2 = at(Math.min(reach * 0.45, c.half + 1.6))
  const t3 = at(-Math.min(reach * 0.45, c.half + 1.6))
  const tag = (x: number, y: number, n: number) => (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className="rw-sec-tag">
      <circle r={8.5} />
      <text y={0.5} textAnchor="middle" dominantBaseline="central">
        {n}
      </text>
    </g>
  )
  // An arrow on the earth side pushing at the wall.
  const ay = Math.min(Math.max(Y(c.top) + 18, top + 8), base - 12)
  return (
    <figure className="rw-section">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Section through the wall at its tallest point. Earth side, on the left: ${highLabel.head}, ${highLabel.change}. Open side, on the right: ${lowLabel.head}, ${lowLabel.change}.`}
      >
        {parts.map((idx, k) => (
          <g key={k}>
            <path className="rw-sec-earth" d={earth(idx)} />
            <path className="rw-sec-cut" d={band(idx, i => Math.max(nat(i), fin(i)), fin)} />
            <path className="rw-sec-fill" d={band(idx, fin, i => Math.min(nat(i), fin(i)))} />
            <path className="rw-sec-natural" d={line(idx, nat)} />
            <path className="rw-sec-finished" d={line(idx, fin)} />
          </g>
        ))}
        {c.house
          .filter(([a, b]) => b > -reach && a < reach)
          .map(([a, b], i) => {
            const x0 = X(Math.min(b, reach))
            const x1 = X(Math.max(a, -reach))
            return <rect key={i} className="rw-sec-slab" x={Math.min(x0, x1)} y={Y(c.floor)} width={Math.abs(x1 - x0)} height={Math.max(Y(c.pad) - Y(c.floor), 3)} />
          })}
        <rect className="rw-sec-wall" x={(wx0 + wx1) / 2 - ww / 2} y={wTop} width={ww} height={H - wTop} />
        <path className="rw-sec-push" d={`M${(wx0 - 40).toFixed(1)} ${ay.toFixed(1)}H${(wx0 - 8).toFixed(1)}m-6 -5l6 5l-6 5`} />
        <text className="rw-sec-side" x={6} y={16}>
          Earth side
        </text>
        <text className="rw-sec-side" x={W - 6} y={16} textAnchor="end">
          Open side
        </text>
        {tags && (
          <>
            {tag((wx0 + wx1) / 2, Math.max(wTop - 10, 10), 1)}
            {tag(t2.x, t2.y - 11, 2)}
            {tag(t3.x, t3.y - 11, 3)}
          </>
        )}
        <text className="rw-sec-label" x={6} y={H - 20}>
          {highLabel.head}
        </text>
        <text className="rw-sec-label" x={6} y={H - 6}>
          {highLabel.change}
        </text>
        <text className="rw-sec-label" x={W - 6} y={H - 20} textAnchor="end">
          {lowLabel.head}
        </text>
        <text className="rw-sec-label" x={W - 6} y={H - 6} textAnchor="end">
          {lowLabel.change}
        </text>
      </svg>
    </figure>
  )
}
