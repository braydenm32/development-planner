/**
 * Earthworks › Retaining walls. A retaining wall that is selected, or just drawn with the
 * Retaining wall tool, shows its own panel here (RetainingWallPanel, the one the plan's
 * inspector shows). With none selected, the walls are listed tallest first, named by where they
 * are, to pick from (a row lights its wall on the plan; on a phone a tap zooms to it), with their
 * totals, the walls the cut and fill imply, and a button to draw one; while the tool is drawing,
 * its options take the button's place.
 */

import { useMemo } from 'react'
import { DemFlag } from '../../map/DemNotes'
import { ImpliedWalls, SuggestionsNote } from '../../grading/GradingPanel'
import { impliedTotals, impliedWalls } from '../../grading/implied'
import { RetainingTotals, RetainingToolOptions } from '../../components/PlanSections'
import { retainedText, useRetainingWalls } from '../../components/planNumbers'
import { RetainingWallPanel } from '../../components/RetainingWallPanel'
import { ENGINEER_TEXT, needsEngineer } from '../../checks/engineer'
import { usePhone } from '../../phone/device'
import { isRetaining, levelById } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { hoverWall, zoomToWall } from '../../plan/wallFocus'
import { retainingNames } from '../../plan/wallNames'
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
  const names = useMemo(() => retainingNames(d.plan, d.survey), [d.plan, d.survey])
  const phone = usePhone()
  const implied = impliedTotals(impliedWalls(d.survey, d.earth))
  if (!walls.length)
    return (
      <>
        <p className="muted">No retaining walls yet. Draw one where the batters run too far: it asks once which side it holds back and how high, and carries on round corners.</p>
        <ImpliedWalls survey={d.survey} earth={d.earth} />
        <SuggestionsNote plan={d.plan} survey={d.survey} earth={d.earth} />
        <Draw />
      </>
    )
  const tall = walls.filter(w => needsEngineer(w.maxHeight)).length + (implied?.engineer ?? 0)
  const split = d.plan.levels.length > 1
  const sorted = [...walls].sort((a, b) => b.maxHeight - a.maxHeight)
  return (
    <>
      <RetainingTotals walls={walls} />
      <DemFlag what="these heights" />
      <SuggestionsNote plan={d.plan} survey={d.survey} earth={d.earth} />
      {tall > 0 && (
        <p className="notice small">
          {tall === 1 ? 'One wall holds' : `${tall} walls hold`} back over {ENGINEER_TEXT}
          {implied?.engineer ? `, ${implied.engineer === tall ? (tall === 1 ? 'an implied one' : 'all implied') : `${implied.engineer} of them implied`}` : ''}:{' '}
          {tall === 1 ? 'it needs' : 'they need'} a professional engineer’s certificate.
        </p>
      )}
      <ul className="pick-list rw-list" onPointerLeave={() => hoverWall(null)}>
        {sorted.map(r => {
          const eng = needsEngineer(r.maxHeight)
          const level = split ? levelById(d.plan, r.wall.level)?.name : undefined
          return (
            <li key={r.wall.id}>
              <button
                onPointerEnter={() => hoverWall(r.wall.id)}
                onFocus={() => hoverWall(r.wall.id)}
                onBlur={() => hoverWall(null)}
                onClick={() => {
                  hoverWall(null)
                  selectOnPlan(r.wall.level, { type: 'wall', id: r.wall.id })
                  if (phone) zoomToWall(r.wall)
                }}
              >
                <span className="rw-row-name">
                  {names.get(r.wall.id) ?? 'Retaining wall'}
                  <span className="muted">
                    {level ? ` · ${level} level` : ''} · {r.length.toFixed(1)} m
                  </span>
                </span>
                <span className={eng ? 'warn-text' : 'muted'} title={`Holds back up to ${retainedText(r.maxHeight)}${eng ? `: an engineer is needed over ${ENGINEER_TEXT}` : ''}`}>
                  {r.maxHeight.toFixed(2)} m{eng ? ' ⚠' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="muted small">Tallest first. Pick a wall to set which side it holds back and how high{phone ? '; the plan zooms to it' : ''}.</p>
      <ImpliedWalls survey={d.survey} earth={d.earth} />
      <Draw />
    </>
  )
}
