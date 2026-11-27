// Move by a typed distance, turn, flip (mirror) and line up what is selected, on its card; and
// Flip the plan, for the whole house, in Design › More. The changes themselves are in
// src/plan/transform.ts; each button is one undo step, with Undo on its toast.

import { useContext, useState } from 'react'
import { planTurn } from '../lib/orientation'
import type { Vec2 } from '../lib/geom'
import { undoToastFor } from '../plan/editActions'
import { selectedList, selectionName, translateSelection } from '../plan/editing'
import type { Plan } from '../plan/model'
import { usePlan, type Selection } from '../plan/store'
import { alignSelection, canTransform, flipPlan, flipSelection, rotateSelection, screenAxes, type AlignTo, type FlipAxis } from '../plan/transform'
import { showToast } from '../safety/store'
import { ShellContext } from '../shell/context'
import { Num } from './fields'
import './copy-kinds.css'

/** The furthest one typed move goes (m): a slip of a nought is said, not made. */
const MAX_MOVE = 100

/** Which way "right" and "up" on the screen point in the plan's own frame (the page can be turned to north or another bearing). */
function useScreenAxes(plan: Plan): { right: Vec2; up: Vec2 } {
  const up = useContext(ShellContext)?.view.up ?? 'house'
  return screenAxes(planTurn(up, plan.placement.rotation))
}

/** Make one change to the plan and say so, with Undo; when it changes nothing, say `nothing` instead. */
function change(fn: (p: Plan) => Plan, did: string, nothing: string) {
  const st = usePlan.getState()
  const before = st.plan
  st.commit(fn)
  if (usePlan.getState().plan === before) showToast({ text: nothing })
  else undoToastFor(did)
}

const flipAxisOf = (right: Vec2, way: 'left-right' | 'top-bottom'): FlipAxis => ((right[0] !== 0) === (way === 'left-right') ? 'x' : 'y')

const ALIGN: { label: string; title: string; along: 'right' | 'up'; to: AlignTo }[] = [
  { label: 'Left', title: 'Line up their left edges', along: 'right', to: 'min' },
  { label: 'Centre', title: 'Line up their middles, left to right', along: 'right', to: 'mid' },
  { label: 'Right', title: 'Line up their right edges', along: 'right', to: 'max' },
  { label: 'Top', title: 'Line up their top edges', along: 'up', to: 'max' },
  { label: 'Middle', title: 'Line up their middles, top to bottom', along: 'up', to: 'mid' },
  { label: 'Bottom', title: 'Line up their bottom edges', along: 'up', to: 'min' },
]

/**
 * Under a selection's card: move it by a typed distance, turn it, flip it, and (with several
 * things picked) line them up. Folded away until wanted for one item; open for a group.
 */
export function TransformTools({ plan }: { plan: Plan }) {
  const selection = usePlan(s => s.selection)
  const extra = usePlan(s => s.extra)
  const axes = useScreenAxes(plan)
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const [deg, setDeg] = useState(90)
  const sels: Selection[] = selectedList({ selection, extra })
  // A door or window on its own is placed from its own card (its distance along the wall).
  if (!sels.length || !canTransform(sels)) return null
  const many = sels.length > 1
  const name = selectionName(plan, sels)
  const it = many ? 'them' : 'it'
  const movable = sels.filter(s => s.type !== 'opening').length
  const move = () => {
    const by: Vec2 = [axes.right[0] * dx + axes.up[0] * dy, axes.right[1] * dx + axes.up[1] * dy]
    const words = [dx ? `${Math.abs(Math.round(dx * 1000))} mm ${dx > 0 ? 'right' : 'left'}` : '', dy ? `${Math.abs(Math.round(dy * 1000))} mm ${dy > 0 ? 'up' : 'down'}` : ''].filter(Boolean).join(' and ')
    change(p => translateSelection(p, sels, by), `${name} moved ${words}`, 'Nothing moved.')
  }
  return (
    <details className="transform-tools selection" open={many || undefined}>
      <summary>Move, turn or flip {it}</summary>
      <h3>Move by a distance</h3>
      <Num label="Right" unit="mm" value={dx} min={-MAX_MOVE} max={MAX_MOVE} onCommit={setDx} />
      <Num label="Up" unit="mm" value={dy} min={-MAX_MOVE} max={MAX_MOVE} onCommit={setDy} />
      <div className="row">
        <button className="secondary" disabled={!dx && !dy} onClick={move}>
          Move {it}
        </button>
      </div>
      <p className="muted small">A minus number goes left or down. Walls joined to a wall that moves stretch to follow, as when it’s dragged.</p>
      <h3>Turn</h3>
      <Num label="Turn clockwise" unit="°" value={deg} min={-360} max={360} onCommit={setDeg} />
      <div className="row">
        <button
          className="secondary"
          disabled={!deg || Math.abs(deg) === 360}
          onClick={() => change(p => rotateSelection(p, sels, deg), `${name} turned ${Math.abs(deg)}° ${deg > 0 ? 'clockwise' : 'anticlockwise'}`, 'Nothing turned.')}
        >
          Turn {it}
        </button>
      </div>
      <h3>Flip (mirror)</h3>
      <div className="row">
        <button className="secondary" onClick={() => change(p => flipSelection(p, sels, flipAxisOf(axes.right, 'left-right')), `${name} flipped left to right`, 'Nothing flipped.')}>
          Flip left–right
        </button>
        <button className="secondary" onClick={() => change(p => flipSelection(p, sels, flipAxisOf(axes.right, 'top-bottom')), `${name} flipped top to bottom`, 'Nothing flipped.')}>
          Flip top–bottom
        </button>
      </div>
      <p className="muted small">
        {many ? 'They turn and flip together, about the middle of the group.' : 'It turns and flips about its own middle.'} Walls keep their doors and windows; walls that aren’t picked stay where they are.
      </p>
      {movable > 1 && (
        <>
          <h3>Line up</h3>
          <div className="row align-row">
            {ALIGN.map(a => (
              <button key={a.label} className="secondary" title={a.title} onClick={() => change(p => alignSelection(p, sels, axes[a.along], a.to), `${name} lined up: ${a.label.toLowerCase()}`, 'They’re already lined up that way.')}>
                {a.label}
              </button>
            ))}
          </div>
          <p className="muted small">Each moves to the edge, or the middle, of the group. Walls joined to one another move as one.</p>
        </>
      )}
    </details>
  )
}

/** Design › More › Flip the plan: the whole house mirrored about its middle, on every level. */
export function FlipPlanSection() {
  const plan = usePlan(s => s.plan)
  const axes = screenAxes(planTurn(useContext(ShellContext)?.view.up ?? 'house', plan?.placement.rotation ?? 0))
  if (!plan) return null
  const drawn = plan.walls.length + plan.areas.length + plan.roofs.length + plan.stairs.length + plan.furniture.length > 0
  const flip = (way: 'left-right' | 'top-bottom') =>
    change(p => flipPlan(p, flipAxisOf(axes.right, way)), `The plan is flipped ${way === 'left-right' ? 'left to right' : 'top to bottom'}, on every level`, 'There’s nothing drawn to flip yet.')
  return (
    <>
      <p className="muted small">
        Mirror the whole house to suit the block, say to put the garage on the other side. Every level flips together about the middle of the house, which stays where it is on the block. One Undo puts it
        back.
      </p>
      <div className="row">
        <button className="secondary" disabled={!drawn} onClick={() => flip('left-right')}>
          Flip left–right
        </button>
        <button className="secondary" disabled={!drawn} onClick={() => flip('top-bottom')}>
          Flip top–bottom
        </button>
      </div>
      <p className="muted small">
        Retaining walls, driveways and gardens flip with the house, so check them against the block afterwards. Sketch lines stay put. To flip or turn only part of the plan, pick it and use Move, turn or flip on
        its card.
      </p>
    </>
  )
}
