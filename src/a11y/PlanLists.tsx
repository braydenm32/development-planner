// Design › Walls & doors, and the list under Design › Furniture: the plan's walls, doors and
// windows, stairs and furniture as lists whose rows pick the item (as Rooms & areas' rows do), with
// ways to add a wall, a door or window and a piece of furniture by typing instead of clicking on the
// plan. With these, everything drawn can be reached, picked, changed and deleted from the keyboard
// (WCAG 2.1.1): a row picks, the Selection panel beside the plan changes and deletes.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Num, Select } from '../components/fields'
import { catalogItem } from '../plan/furniture'
import { OPENING_NAMES, sortedLevels, wallLength, type OpeningKind, type Plan } from '../plan/model'
import { addFurnitureIn, addOpeningAt, addWallFrom, furnitureRows, headingAngle, openingRows, openingRun, stairRows, wallEndOf, wallRows, type Added, type Heading, type PlanRow } from '../plan/planLists'
import { focusPlan } from '../plan/planFocus'
import { OPENING_TOOLS, usePlan, type Selection } from '../plan/store'
import { focusSoon } from '../nav/useModal'
import { selectOnPlan } from '../shell/useSite'
import { announce } from './announce'
import { focusLost, rowFocusAfter } from './rowFocus'
import './a11y.css'

/** The first thing to change in the Selection panel, for the row's "Change it" button. */
const toSelectionPanel = () => focusSoon('.inspector input:not([type="hidden"])', '.inspector select', '.inspector button:not(.inspector-close)')

/** A list of things on the plan: each row picks its item and frames it, as Rooms & areas' rows do. */
export function PickRows({ rows, level, label, empty }: { rows: PlanRow[]; level: string; label: string; empty: string }) {
  const selection = usePlan(s => s.selection)
  const anchor = useRowFocus(rows, selection)
  if (!rows.length)
    return (
      <p className="muted small" ref={anchor}>
        {empty}
      </p>
    )
  return (
    <ul className="pick-list plan-rows" aria-label={label} ref={anchor}>
      {rows.map(r => {
        const on = selection?.type === r.sel.type && selection.id === r.id
        return (
          <li key={r.id}>
            <button
              className={on ? 'on' : ''}
              aria-pressed={on}
              data-row={r.id}
              onClick={() => {
                selectOnPlan(level, r.sel)
                focusPlan(r.pts)
              }}
            >
              <span>
                {r.name}
                {r.where && <span className="muted small"> · {r.where}</span>}
              </span>{' '}
              <span className="muted">{r.detail}</span>
            </button>
            {/* The picked row's fields sit beside the plan, many Tab stops on: this goes straight to them. */}
            {on && (
              <button type="button" className="link small row-change" onClick={toSelectionPanel}>
                Change or delete this {r.kind}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Keeps keyboard focus in the list when what it was on goes away: a deleted row's place goes to
 * the next row, a put-down selection's to its row, an add's to the new row, and an emptied list's
 * to its add button or heading (./rowFocus.ts). Only once focus has fallen to the page, so a
 * Delete pressed on the plan leaves focus on the plan.
 */
function useRowFocus(rows: PlanRow[], selection: Selection | null) {
  const anchor = useRef<HTMLElement | null>(null)
  const ids = rows.map(r => r.id)
  const key = ids.join(',')
  const sel = selection?.id ?? null
  const was = useRef({ ids, sel })
  useLayoutEffect(() => {
    const before = was.current
    was.current = { ids, sel }
    const to = rowFocusAfter(before.ids, before.sel, ids, sel)
    if (!to) return
    // The selection panel and the row's own link go in the same moment, or the next: look once they have.
    // Not cancelled by the next change: a delete and the selection put down can come one render apart.
    requestAnimationFrame(() => {
      if (!focusLost()) return
      const list = anchor.current
      if (!list?.isConnected) return
      if ('row' in to) {
        list.querySelector<HTMLElement>(`[data-row="${CSS.escape(to.row)}"]`)?.focus()
        return
      }
      const add = list.nextElementSibling?.querySelector<HTMLElement>('button')
      const heading = list.previousElementSibling as HTMLElement | null
      if (add) add.focus()
      else if (heading) {
        heading.tabIndex = -1
        heading.focus()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sel])
  return (el: HTMLElement | null) => {
    anchor.current = el
  }
}

/**
 * An "add by typing" form: as it opens, its first field takes focus (or the form itself, when it
 * only says what to do first), and Esc in one of its fields comes back to it (fields.tsx).
 */
function useFormFocus(open: boolean) {
  const form = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = form.current
    if (!open || !el) return
    ;(el.querySelector<HTMLElement>('input, select') ?? el).focus()
  }, [open])
  return form
}

/** Carry out an add as one undo step, pick what was made, and say what happened. */
function commitAdded(add: (p: Plan) => Added, type: Selection['type'], said: (plan: Plan) => string): string | null {
  const st = usePlan.getState()
  let made: string | null = null
  let why: string | null = null
  st.commit(p => {
    const r = add(p)
    made = r.id
    if (r.id === null) why = r.why
    return r.plan
  })
  if (!made) return why ?? 'Nothing was added.'
  st.select({ type, id: made } as Selection)
  const plan = usePlan.getState().plan
  if (plan) announce(said(plan))
  return null
}

const HEADINGS: { id: string; label: string; needsWall?: boolean }[] = [
  { id: 'left', label: 'Turn left', needsWall: true },
  { id: 'right', label: 'Turn right', needsWall: true },
  { id: 'straight', label: 'Straight on', needsWall: true },
  { id: '0', label: 'To the right (0°)' },
  { id: '90', label: 'Up the plan (90°)' },
  { id: '180', label: 'To the left (180°)' },
  { id: '270', label: 'Down the plan (270°)' },
  { id: 'angle', label: 'At an angle…' },
]

/** Add a wall by typing: where it starts, how long it is and which way it runs. */
function AddWall({ plan, level, rows }: { plan: Plan; level: string; rows: PlanRow[] }) {
  const selection = usePlan(s => s.selection)
  const wallStyle = usePlan(s => s.wallStyle)
  const picked = selection?.type === 'wall' ? plan.walls.find(w => w.id === selection.id && w.level === level && rows.some(r => r.id === w.id)) : undefined
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState<'end' | 'start' | 'point'>('end')
  const [at, setAt] = useState<[number, number]>([0, 0])
  const [length, setLength] = useState(3)
  const [heading, setHeading] = useState('left')
  const [angle, setAngle] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const form = useFormFocus(open)
  // With no wall picked the only start is a typed point, and the only directions are the plan's own.
  const start = picked ? from : 'point'
  const dir = !picked || start === 'point' ? (HEADINGS.find(h => h.id === heading)?.needsWall ? '0' : heading) : heading
  const add = () => {
    const end = picked && start !== 'point' ? wallEndOf(picked, start === 'end' ? 'b' : 'a') : null
    const h: Heading = dir === 'angle' ? angle : dir === 'left' || dir === 'right' || dir === 'straight' ? dir : Number(dir)
    const deg = headingAngle(h, end?.running ?? null)
    setProblem(commitAdded(p => addWallFrom(p, level, end?.at ?? at, length, deg, wallStyle), 'wall', p => `Wall added, ${Math.round(length * 1000)} mm long. ${wallRows(p, level).length} walls on this level. It is picked, so the next can carry on from its end.`))
    // The next wall carries on from the end of this one.
    setFrom('end')
  }
  return (
    <>
      <div className="row">
        <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          Add a wall by typing…
        </button>
      </div>
      {open && (
        <div className="tool-options add-by-typing" role="group" aria-label="Add a wall by typing" ref={form} tabIndex={-1} data-esc-owner>
          {picked ? (
            <Select
              label="Start from"
              value={start}
              options={[
                { id: 'end', label: 'The end of the picked wall' },
                { id: 'start', label: 'The start of the picked wall' },
                { id: 'point', label: 'A point I type' },
              ]}
              onChange={setFrom}
            />
          ) : (
            <p className="muted small">It starts from a point you type. Pick a wall in the list to carry on from one of its ends instead.</p>
          )}
          {start === 'point' && (
            <>
              <Num label="Start, across from the plan’s origin" unit="mm" value={at[0]} onCommit={x => setAt([x, at[1]])} />
              <Num label="Start, up from the plan’s origin" unit="mm" value={at[1]} onCommit={y => setAt([at[0], y])} />
            </>
          )}
          <Num label="Length" unit="mm" value={length} min={0.05} max={100} onCommit={setLength} />
          <Select label="Direction" value={dir} options={HEADINGS.filter(h => !h.needsWall || (picked && start !== 'point'))} onChange={setHeading} />
          {dir === 'angle' && <Num label="Angle, anticlockwise from the plan’s x axis" unit="°" value={angle} onCommit={a => setAngle(((a % 360) + 360) % 360)} />}
          <div className="row">
            <button type="button" className="primary" onClick={add}>
              Add wall
            </button>
          </div>
          {problem && (
            <p className="notice small" role="alert">
              {problem}
            </p>
          )}
          <p className="muted small">It is the kind and thickness the Wall tool is set to. Each wall added is picked, so the next carries on from its end: type the sides one after another to go round a room.</p>
        </div>
      )}
    </>
  )
}

const KINDS = OPENING_TOOLS.map(k => ({ id: k as OpeningKind, label: OPENING_NAMES[k] }))

/** Add a door, window, opening or garage door to the picked wall, at a typed distance along it. */
function AddOpening({ plan, level, walls }: { plan: Plan; level: string; walls: PlanRow[] }) {
  const selection = usePlan(s => s.selection)
  const defaults = usePlan(s => s.openingDefaults)
  const wall = selection?.type === 'wall' ? plan.walls.find(w => w.id === selection.id && w.level === level && walls.some(r => r.id === w.id)) : undefined
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<OpeningKind>('door')
  // The distance typed, for the wall it was typed for; another wall starts at its own middle.
  const [typed, setTyped] = useState<{ wall: string; offset: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const form = useFormFocus(open)
  const run = wall ? openingRun(plan, wall) : null
  const offset = wall && typed?.wall === wall.id ? typed.offset : wall ? wallLength(wall) / 2 : 0
  const name = OPENING_NAMES[kind].toLowerCase()
  return (
    <>
      <div className="row">
        <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          Add a door or window by typing…
        </button>
      </div>
      {open && (
        <div className="tool-options add-by-typing" role="group" aria-label="Add a door or window by typing" ref={form} tabIndex={-1} data-esc-owner>
          {wall && run ? (
            <>
              <p className="small">
                Into the picked wall: {walls.find(r => r.id === wall.id)?.name.toLowerCase()}, {Math.round(wallLength(wall) * 1000)} mm long.
              </p>
              <Select label="What to add" value={kind} options={KINDS} onChange={setKind} />
              <Num label="Its middle, from the wall’s start" unit="mm" value={offset} min={0} max={wallLength(wall)} onCommit={v => setTyped({ wall: wall.id, offset: v })} />
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  onClick={() => setProblem(commitAdded(p => addOpeningAt(p, wall.id, kind, offset, defaults[kind]), 'opening', () => `${OPENING_NAMES[kind]} added, ${Math.round(defaults[kind].width * 1000)} mm wide. It is picked: its size and place are in the Selection panel.`))}
                >
                  Add {name}
                </button>
              </div>
              {problem && (
                <p className="notice small" role="alert">
                  {problem}
                </p>
              )}
              <p className="muted small">It is the size the {OPENING_NAMES[kind]} tool is set to, and is kept clear of the wall’s ends.</p>
            </>
          ) : (
            <p className="muted small">Pick a wall in the Walls list first: the door or window goes into it.</p>
          )}
        </div>
      )}
    </>
  )
}

/** Design › Walls & doors. */
export function WallsDoorsBody({ plan }: { plan: Plan }) {
  const level = usePlan(s => s.activeLevel)
  const levels = sortedLevels(plan)
  const walls = wallRows(plan, level)
  const openings = openingRows(plan, level)
  const stairs = stairRows(plan, level)
  return (
    <>
      {levels.length > 1 && <Select label="Level" value={level} options={[...levels].reverse().map(l => ({ id: l.id, label: l.name }))} onChange={id => usePlan.getState().setActiveLevel(id)} />}
      <h3>Walls ({walls.length})</h3>
      <PickRows rows={walls} level={level} label="Walls" empty="No walls on this level yet. Draw them with the Wall tool (W), or add one by typing below." />
      <AddWall plan={plan} level={level} rows={walls} />
      <h3>Doors and windows ({openings.length})</h3>
      <PickRows rows={openings} level={level} label="Doors and windows" empty="No doors or windows on this level yet." />
      <AddOpening plan={plan} level={level} walls={walls} />
      <h3>Stairs ({stairs.length})</h3>
      <PickRows rows={stairs} level={level} label="Stairs" empty="No stairs on this level. The Stair tool (S) draws one." />
      <p className="muted small">Picking a row shows it on the plan and opens its details beside the plan, where it is changed or deleted. With the plan in focus, the arrow keys move what is picked 10 mm (Shift: 100 mm).</p>
    </>
  )
}

/** Under Design › Furniture's catalogue: put the piece in a room without clicking, and the furniture already on this level. */
export function FurnitureOnPlan({ plan }: { plan: Plan }) {
  const level = usePlan(s => s.activeLevel)
  const kind = usePlan(s => s.furnitureDefaults.kind)
  const rotation = usePlan(s => s.furnitureDefaults.rotation)
  const rows = useMemo(() => furnitureRows(plan, level), [plan, level])
  const rooms = plan.rooms.filter(r => r.level === level)
  const [room, setRoom] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const into = rooms.find(r => r.id === room) ?? rooms[0]
  const piece = catalogItem(kind)?.name ?? 'Furniture'
  return (
    <>
      <h3>Put it in a room</h3>
      {into ? (
        <div className="tool-options add-by-typing">
          <Select label="Room" value={into.id} options={rooms.map(r => ({ id: r.id, label: r.name }))} onChange={setRoom} />
          <div className="row">
            <button
              type="button"
              className="secondary"
              onClick={() => setProblem(commitAdded(p => addFurnitureIn(p, into.id, kind, rotation), 'furniture', () => `${piece} added in the middle of ${into.name}. It is picked: its size and turn are in the Selection panel, and the arrow keys move it when the plan is in focus.`))}
            >
              Add {piece.toLowerCase()} to {into.name}
            </button>
          </div>
          {problem && (
            <p className="notice small" role="alert">
              {problem}
            </p>
          )}
          <p className="muted small">It goes in the middle of the room, with no need to click on the plan.</p>
        </div>
      ) : (
        <p className="muted small">Name a room on this level first (the Room tool, R), then a piece can go into it without clicking on the plan.</p>
      )}
      <h3>Furniture on this level ({rows.length})</h3>
      <PickRows rows={rows} level={level} label="Furniture on this level" empty="No furniture on this level yet." />
    </>
  )
}
