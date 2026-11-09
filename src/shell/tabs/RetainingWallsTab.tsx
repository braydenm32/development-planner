/**
 * Earthworks › Retaining walls. A retaining wall that is selected, or just drawn with the
 * Retaining wall tool, shows its own panel here (RetainingWallPanel, the one the plan's
 * inspector shows). With none selected, the walls are listed to pick from, with their totals
 * and a button to draw one; while the tool is drawing, its options take the button's place.
 */

import { DemFlag } from '../../map/DemNotes'
import { RetainingTotals, RetainingToolOptions } from '../../components/PlanSections'
import { retainedText, useRetainingWalls } from '../../components/planNumbers'
import { RetainingWallPanel } from '../../components/RetainingWallPanel'
import { ENGINEER_HEIGHT } from '../../plan/keyNumbers'
import { isRetaining } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { pickTool, selectOnPlan, useLoaded, type Loaded } from '../useSite'
import { Waiting } from './Waiting'

export function RetainingWallsTab() {
  const d = useLoaded()
  const selection = usePlan(s => s.selection)
  if (!d) return <Waiting />
  const wall = selection?.type === 'wall' ? d.plan.walls.find(w => w.id === selection.id && isRetaining(w)) : undefined
  if (wall) return <RetainingWallPanel wall={wall} plan={d.plan} survey={d.survey} terrain={d.terrain} earth={d.earth} />
  return <Walls d={d} />
}

/** The button that picks the Retaining wall tool, or the tool's options while it's drawing. */
function Draw() {
  const drawing = usePlan(s => s.tool) === 'retaining'
  if (drawing) return <RetainingToolOptions />
  return (
    <div className="row">
      <button className="secondary" onClick={() => pickTool('retaining')}>
        Draw a retaining wall <kbd>T</kbd>
      </button>
    </div>
  )
}

function Walls({ d }: { d: Loaded }) {
  const walls = useRetainingWalls(d.plan, d.survey, d.terrain, d.earth)
  if (!walls.length)
    return (
      <>
        <p className="muted">No retaining walls yet. Draw one where the batters run too far: it asks which side it holds back and how high.</p>
        <Draw />
      </>
    )
  const tall = walls.filter(w => w.maxHeight > ENGINEER_HEIGHT).length
  return (
    <>
      <RetainingTotals walls={walls} />
      <DemFlag what="these heights" />
      {tall > 0 && (
        <p className="notice small">
          {tall === 1 ? 'One wall holds' : `${tall} walls hold`} back more than {ENGINEER_HEIGHT.toFixed(1)} m: an engineer needs to design {tall === 1 ? 'it' : 'them'}.
        </p>
      )}
      <ul className="pick-list">
        {walls.map((r, i) => (
          <li key={r.wall.id}>
            <button onClick={() => selectOnPlan(r.wall.level, { type: 'wall', id: r.wall.id })}>
              <span>
                Wall {i + 1} <span className="muted">· {r.length.toFixed(1)} m</span>
              </span>
              <span className={r.maxHeight > ENGINEER_HEIGHT ? 'warn-text' : 'muted'} title={`Holds back up to ${retainedText(r.maxHeight)}`}>
                {r.maxHeight.toFixed(2)} m
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">Pick a wall to set which side it holds back and how high.</p>
      <Draw />
    </>
  )
}
