// Earthworks › Place: the floor's level and the ground under every level, then where the house
// sits (move it, turn it, centre it, square it to the block) and its distance to each boundary.

import { useMemo } from 'react'
import { cancelContourPick, startContourPick, useFlow } from '../flow/store'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import type { PlacementInfo } from '../plan/keyNumbers'
import { levelGrounds } from '../plan/levelGround'
import { fflForGroundRL, floorRL, sortedLevels, type Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { pickTool } from '../shell/useSite'
import { Num } from './fields'
import { centreOnBlock, clockwiseOf, rotationFromClockwise, squareToBoundary, turnHouse } from './placeActions'

const setFfl = (plan: Plan, rl: number) => usePlan.getState().commit(p => ({ ...p, placement: { ...p.placement, ffl: fflForGroundRL(plan, rl) } }))

/** The lowest floor's RL, with the two quick ways to set it under the box. */
export function FloorLevel({ plan, info }: { plan: Plan; info: PlacementInfo | null }) {
  const lowest = sortedLevels(plan)[0]
  const picking = useFlow(s => s.picking)
  const split = plan.levels.length > 1
  return (
    <div className="place-floor">
      <Num label={split ? `${lowest?.name ?? 'Lowest'} floor level (FFL)` : 'Ground floor level (FFL)'} unit="RL" value={floorRL(plan)} onCommit={rl => setFfl(plan, rl)} />
      <div className="row">
        {picking ? (
          <button className="secondary on" aria-pressed onClick={cancelContourPick}>
            Picking a contour… (Esc stops)
          </button>
        ) : (
          <button className="secondary" onClick={() => startContourPick(lowest?.id)} title="Click a contour on the plan to put this floor at its level">
            Pick a contour
          </button>
        )}
        {info && (
          <button className="secondary" onClick={() => setFfl(plan, Math.round(info.centreRL * 20) / 20)} title={`The ground in the middle of the house, RL ${info.centreRL.toFixed(2)}`}>
            Floor at ground level
          </button>
        )}
      </div>
      {split && <p className="muted small">Every level moves with it, keeping its height above this one.</p>}
    </div>
  )
}

/** Each level's floor RL and the natural ground under it. */
export function LevelsOnGround({ plan, survey, terrain }: { plan: Plan; survey: Survey; terrain: Terrain }) {
  const rows = useMemo(() => levelGrounds(plan, survey.origin, terrain.grid), [plan, survey, terrain])
  return (
    <table className="place-levels">
      <caption>{rows.length > 1 ? 'Each level on the ground' : 'The floor on the ground'}</caption>
      <thead>
        <tr>
          <th scope="col">Level</th>
          <th scope="col">Floor</th>
          <th scope="col">Ground under it</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map(r => (
          <tr key={r.id}>
            <th scope="row">{r.name}</th>
            <td>RL {r.floor.toFixed(2)}</td>
            <td>{r.ground ? `RL ${r.ground.min.toFixed(2)}–${r.ground.max.toFixed(2)}` : <span className="muted">no walls yet</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Move it (the Move tool), turn it, centre it, square it to the block. */
export function PlaceHouse({ plan, survey, info }: { plan: Plan; survey: Survey; info: PlacementInfo | null }) {
  const moving = usePlan(s => s.tool) === 'move'
  return (
    <section className="place-house" aria-label="Where the house sits">
      <h3>Where it sits</h3>
      <div className="row">
        <button className={`secondary${moving ? ' on' : ''}`} aria-pressed={moving} onClick={() => pickTool(moving ? 'select' : 'move')}>
          {moving ? 'Done moving' : 'Move the house'} <kbd>M</kbd>
        </button>
        <button className="secondary" onClick={() => centreOnBlock(plan, survey)}>
          Centre on block
        </button>
        <button className="secondary" onClick={() => squareToBoundary(plan, info)} disabled={!info}>
          Square to boundary
        </button>
      </div>
      {moving && <p className="muted small">Drag the house on the plan. Its distance to each side shows as it moves.</p>}
      <Num label="Turned clockwise" unit="°" value={clockwiseOf(plan.placement.rotation)} onCommit={cw => turnHouse(plan, rotationFromClockwise(cw))} />
    </section>
  )
}
