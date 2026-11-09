import { useMemo } from 'react'
import { wallLength, type Plan, type Wall } from '../plan/model'
import { usePlan } from '../plan/store'
import { WALL_KIND_WORDS, wallsSharing } from '../plan/wallStack'
import './walls-here.css'

const upper = (s: string) => s[0].toUpperCase() + s.slice(1)

/**
 * The walls over or under a selected one (a retaining wall under an external wall, say), each a
 * button that selects it, so a wall that's hidden under another can still be reached.
 */
export function WallsHere({ wall, plan }: { wall: Wall; plan: Plan }) {
  const others = useMemo(() => wallsSharing(plan.walls, wall), [plan.walls, wall])
  if (!others.length) return null
  return (
    <div className="walls-here" role="group" aria-label="Walls over or under this one">
      <span>Also here:</span>
      {others.map(o => (
        <button key={o.id} type="button" className="secondary" onClick={() => usePlan.getState().select({ type: 'wall', id: o.id })}>
          {upper(WALL_KIND_WORDS[o.kind])}, {wallLength(o).toFixed(2)} m
        </button>
      ))}
    </div>
  )
}
