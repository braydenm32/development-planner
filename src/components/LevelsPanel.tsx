// Design › Floors and Design › Rooms & areas: every level with its floor RL, how its floor is
// built and the step to the level below; adding a level above, below or beside at an RL; and the
// rooms and outdoor areas of each level, folded level by level, each a button that shows it on the plan.

import { useMemo, useState } from 'react'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { cancelContourPick, startContourPick, useFlow } from '../flow/store'
import { deleteLevelWithReview } from '../plan/editActions'
import { planarFaces, roomShape } from '../plan/geometry'
import { levelSummaries } from '../plan/keyNumbers'
import { groundedLevels, levelFloorWords } from '../plan/levelMenu'
import { floorRL, sortedLevels, type Plan } from '../plan/model'
import { addLevelAbove, addLevelAt, addLevelBelow, setLevelRL, updateLevel } from '../plan/ops'
import { focusPlan } from '../plan/planFocus'
import { usePlan, type Selection } from '../plan/store'
import { selectOnPlan } from '../shell/useSite'
import { Num, TextField } from './fields'
import { LevelFloorType } from './FloorTypeFields'
import { FragmentRow } from './PlanSections'
import './levels.css'

/** Add a level (one undoable step) and draw on it. */
function addAndPick(add: (p: Plan) => { plan: Plan; id: string }) {
  const st = usePlan.getState()
  let id = ''
  st.commit(p => {
    const r = add(p)
    id = r.id
    return r.plan
  })
  if (id) st.setActiveLevel(id)
}

export function LevelsBody({ plan, beforePick, survey, terrain }: { plan: Plan; beforePick?: () => void; survey?: Survey | null; terrain?: Terrain | null }) {
  const level = usePlan(s => s.activeLevel)
  const picking = useFlow(s => s.picking)
  const st = usePlan.getState()
  const levels = sortedLevels(plan)
  const grounded = useMemo(() => groundedLevels(plan, survey, terrain?.grid), [plan, survey, terrain])
  // "Add level beside at RL…": the RL being typed, or null while it's closed.
  const [besideAt, setBesideAt] = useState<number | null>(null)
  return (
    <>
      <ul className="levels">
        {[...levels].reverse().map(l => (
          <li key={l.id} className={l.id === level ? 'on' : ''}>
            <button className="level-btn" onClick={() => st.setActiveLevel(l.id)}>
              <span>
                {l.name} <span className="muted small">· {levelFloorWords(plan, l.id, grounded.has(l.id))}</span>
              </span>
              <span className="muted">RL {floorRL(plan, l.id).toFixed(2)}</span>
            </button>
          </li>
        ))}
      </ul>
      {levels
        .filter(l => l.id === level)
        .map(l => {
          const i = levels.indexOf(l)
          const below = levels[i - 1]
          const rl = floorRL(plan, l.id)
          return (
            <div key={l.id} className="tool-options">
              <TextField label="Name" value={l.name} onCommit={name => st.commit(p => updateLevel(p, l.id, { name }))} />
              <Num label="Floor RL" unit="RL" value={rl} onCommit={v => st.commit(p => setLevelRL(p, l.id, v))} />
              {below && (
                <Num
                  label={`Step up from ${below.name}`}
                  unit="mm"
                  value={rl - floorRL(plan, below.id)}
                  onCommit={step => st.commit(p => setLevelRL(p, l.id, floorRL(p, below.id) + step))}
                />
              )}
              <Num label="Ceiling height" unit="mm" value={l.height} min={1.8} onCommit={height => st.commit(p => updateLevel(p, l.id, { height }))} />
              <LevelFloorType key={l.id} plan={plan} level={l.id} onGround={grounded.has(l.id)} />
              <div className="row floor-from-contour">
                <button
                  className="secondary"
                  aria-pressed={picking?.level === l.id}
                  onClick={() => {
                    if (picking?.level === l.id) return cancelContourPick()
                    beforePick?.()
                    startContourPick(l.id)
                  }}
                >
                  {picking?.level === l.id ? 'Picking a contour… (Esc)' : 'Pick a contour'}
                </button>
              </div>
              <p className="muted small">Click a contour line on the plan to put {l.name}’s floor at its RL.</p>
            </div>
          )
        })}
      <div className="row add-levels">
        <button className="secondary" onClick={() => addAndPick(addLevelAbove)}>
          Add level above
        </button>
        <button className="secondary" onClick={() => addAndPick(addLevelBelow)}>
          Add level below
        </button>
        <button className="secondary" aria-expanded={besideAt !== null} onClick={() => setBesideAt(besideAt === null ? floorRL(plan, level) : null)}>
          Add level beside at RL…
        </button>
        {levels.length > 1 && (
          <button className="secondary danger" onClick={() => void deleteLevelWithReview(level)}>
            Delete level
          </button>
        )}
      </div>
      {besideAt !== null && (
        <div className="tool-options add-level-at">
          <Num label="New level’s floor" unit="RL" value={besideAt} onCommit={setBesideAt} />
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                addAndPick(p => addLevelAt(p, besideAt, levelHeight(p, level)))
                setBesideAt(null)
              }}
            >
              Add level
            </button>
            <button className="secondary" onClick={() => setBesideAt(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="muted small">
        A level above starts with a copy of the external walls below it. A level below or beside starts empty, for a split level drawn beside the others.
      </p>
    </>
  )
}

const levelHeight = (p: Plan, id: string) => p.levels.find(l => l.id === id)?.height

/** Show an item on the plan: on its own level, picked, and framed. */
function showOnPlan(level: string, sel: Selection, pts: [number, number][]) {
  selectOnPlan(level, sel)
  focusPlan(pts)
}

/** Room areas, rooms total, floor area and outdoor areas, folded level by level; each room and area shows itself on the plan. */
export function AreasBody({ plan }: { plan: Plan }) {
  const summary = useMemo(() => levelSummaries(plan), [plan])
  const active = usePlan(s => s.activeLevel)
  const selection = usePlan(s => s.selection)
  // Folded levels, by id. Every level starts open, but with three or more only the one being drawn on.
  const [folded, setFolded] = useState<Set<string>>(() => new Set(summary.length > 2 ? summary.map(s => s.level.id).filter(id => id !== active) : []))
  const toggle = (id: string) =>
    setFolded(f => {
      const next = new Set(f)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return (
    <>
      {[...summary].reverse().map(s => {
        const open = !folded.has(s.level.id)
        const faces = planarFaces(plan.walls.filter(w => w.level === s.level.id))
        const roomsTotal = s.rooms.reduce((t, r) => t + (r.area ?? 0), 0)
        const on = (type: Selection['type'], id: string) => selection?.type === type && selection.id === id
        return (
          <section key={s.level.id} className={`area-summary level-fold${open ? ' open' : ''}`}>
            <h3>
              <button type="button" className="level-fold-head" aria-expanded={open} onClick={() => toggle(s.level.id)}>
                <span className="level-fold-caret" aria-hidden="true" />
                <span>{s.level.name}</span>
                <span className="muted small">
                  RL {floorRL(plan, s.level.id).toFixed(2)} · {s.gross.area.toFixed(1)} m²
                </span>
              </button>
            </h3>
            {open && (
              <>
                {s.rooms.length + s.areas.length > 0 ? (
                  <ul className="pick-list area-picks">
                    {s.rooms.map(r => (
                      <li key={r.room.id}>
                        <button
                          className={on('room', r.room.id) ? 'on' : ''}
                          aria-pressed={on('room', r.room.id)}
                          onClick={() => showOnPlan(s.level.id, { type: 'room', id: r.room.id }, roomShape(r.room, faces)?.inner ?? [r.room.at])}
                        >
                          <span>{r.room.name}</span>
                          <span className="muted">{r.area === null ? 'not enclosed' : `${r.area.toFixed(2)} m²`}</span>
                        </button>
                      </li>
                    ))}
                    {s.areas.map(a => (
                      <li key={a.area.id}>
                        <button
                          className={on('area', a.area.id) ? 'on' : ''}
                          aria-pressed={on('area', a.area.id)}
                          onClick={() => showOnPlan(s.level.id, { type: 'area', id: a.area.id }, a.area.pts)}
                        >
                          <span>
                            {a.area.name} <span className="muted small">· outdoor</span>
                          </span>
                          <span className="muted">{a.size.toFixed(2)} m²</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">No rooms or areas on this level yet.</p>
                )}
                <dl className="stats">
                  {s.rooms.length > 0 && <FragmentRow label="Rooms total" value={`${roomsTotal.toFixed(2)} m²`} strong />}
                  <FragmentRow label="Floor area (outside of walls)" value={`${s.gross.area.toFixed(2)} m²`} strong />
                </dl>
              </>
            )}
          </section>
        )
      })}
    </>
  )
}
