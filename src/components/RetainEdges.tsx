import { addEdgeWalls, edgeState, houseEdgeWalls, removeEdgeWalls, slabEdgeWalls } from '../plan/retainEdges'
import type { Plan, Wall } from '../plan/model'
import { usePlan } from '../plan/store'

/**
 * Retaining walls right round a slab or the house, so its levelled ground stops at its edge
 * with no batters. They're ordinary retaining walls once added.
 */
export function RetainEdges({ plan, what, areaId }: { plan: Plan; what: 'house' | 'slab'; areaId?: string }) {
  const walls: Pick<Wall, 'level' | 'a' | 'b' | 'thickness' | 'kind'>[] = what === 'house' ? houseEdgeWalls(plan) : slabEdgeWalls(plan, areaId ?? '')
  if (!walls.length) return null
  const { have, missing } = edgeState(plan, walls)
  const commit = (f: (p: Plan) => Plan) => usePlan.getState().commit(f)
  const its = what === 'house' ? 'the house' : 'this slab'
  return (
    <div className="retain-edges">
      {have === 0 ? (
        <p className="muted small">
          Retain the edges of {its} to stop its levelled ground dead at the edge, with no batters: a retaining wall goes along each side, as part of the
          {what === 'house' ? ' footings' : ' slab'}. They count in the checks and costs like any other retaining wall.
        </p>
      ) : (
        <p className="small">
          {missing === 0
            ? `Its edges are retained (${have} retaining wall${have === 1 ? '' : 's'}), so the ground stops at them with no batters.`
            : `${have} of its ${walls.length} sides are retained; the batters still run out past the others.`}
        </p>
      )}
      <div className="row">
        {missing > 0 && (
          <button className="secondary" onClick={() => commit(p => addEdgeWalls(p, walls))}>
            {have === 0 ? 'Retain the edges' : 'Retain the rest'}
          </button>
        )}
        {have > 0 && (
          <button className="secondary" onClick={() => commit(p => removeEdgeWalls(p, walls))}>
            Remove these walls
          </button>
        )}
      </div>
    </div>
  )
}
