import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { isRetaining, newId, type Plan, type Wall } from './model'
import { deleteSelection, updateWall } from './ops'
import { retainDefaults, type Side } from './retaining'
import { usePlan } from './store'

interface RetainingSession {
  /** The wall just drawn with the Retaining wall tool, while its panel asks what it holds. */
  newWall: string | null
  /** Thickness of the next wall the tool draws (m). */
  thickness: number
  /** The wall whose earth side the next click on the plan chooses. */
  sidePick: string | null
}

export const useRetaining = create<RetainingSession>(() => ({ newWall: null, thickness: 0.2, sidePick: null }))

/** A retaining wall from a to b, set up from the ground and the house around it. */
export function newRetainingWall(plan: Plan, level: string, a: Vec2, b: Vec2, thickness: number, origin: Vec2, natural: Heightfield): Wall {
  const w: Wall = { id: newId('wall'), level, a: [a[0], a[1]], b: [b[0], b[1]], thickness, kind: 'retaining' }
  return { ...w, retain: retainDefaults(w, plan, origin, natural) }
}

/**
 * Add a retaining wall as one undoable step, select it, and open its panel as a new wall. A wall just
 * drawn (`pickSide`) then asks for its earth side with a click on the plan; a suggested one knows it.
 */
export function placeRetainingWall(w: Wall, { pickSide = false }: { pickSide?: boolean } = {}) {
  const st = usePlan.getState()
  st.commit(p => ({ ...p, walls: [...p.walls, w] }))
  st.select({ type: 'wall', id: w.id })
  useRetaining.setState({ newWall: w.id, sidePick: pickSide ? w.id : null })
}

/** Choose a wall's earth side with the next click on the plan (Esc or another selection stops it). */
export const startSidePick = (id: string) => useRetaining.setState({ sidePick: id })
export const stopSidePick = () => useRetaining.setState({ sidePick: null })

/**
 * Which side of a wall a point is on, looking from its start to its end: the earth side when
 * picking. Null right on the line.
 */
export function sideOfWall(w: Pick<Wall, 'a' | 'b'>, p: Vec2): Side | null {
  const c = (w.b[0] - w.a[0]) * (p[1] - w.a[1]) - (w.b[1] - w.a[1]) * (p[0] - w.a[0])
  return Math.abs(c) < 1e-9 ? null : c > 0 ? 'left' : 'right'
}

/**
 * Hold back the earth on `side` of a retaining wall (one undoable step): its levels start again from
 * the ground and the house on that side, keeping a top it was given.
 */
export function setEarthSide(id: string, side: Side, origin: Vec2, natural: Heightfield) {
  const st = usePlan.getState()
  const w = st.plan?.walls.find(x => x.id === id)
  if (!w || !isRetaining(w)) return
  if (w.retain?.high === side) return
  st.commit(p => {
    const fresh = retainDefaults(w, p, origin, natural, side)
    return updateWall(p, id, { retain: tidyRetain({ ...fresh, top: w.retain?.top }) })
  })
}

/** Drop unset levels, so a saved wall only holds what was asked. */
export function tidyRetain<R extends object>(r: R): R {
  const out = { ...r }
  for (const k of Object.keys(out) as (keyof R)[]) if (out[k] === undefined) delete out[k]
  return out
}

/** Keep the wall just drawn; its panel stops asking. */
export function keepNewRetaining() {
  useRetaining.setState({ newWall: null, sidePick: null })
  usePlan.getState().select(null)
}

/** Take back the wall just drawn (Undo brings it back). */
export function cancelNewRetaining() {
  const id = useRetaining.getState().newWall
  if (!id) return
  useRetaining.setState({ newWall: null, sidePick: null })
  const st = usePlan.getState()
  st.commit(p => deleteSelection(p, { type: 'wall', id }))
  st.select(null)
}

// Selecting something else keeps the new wall as it is; undoing it drops the question.
usePlan.subscribe(s => {
  const { newWall, sidePick } = useRetaining.getState()
  const sel = s.selection
  const kept = (id: string | null) => !!id && sel?.type === 'wall' && sel.id === id && !!s.plan?.walls.some(w => w.id === id)
  if (newWall && !kept(newWall)) useRetaining.setState({ newWall: null })
  if (sidePick && !kept(sidePick)) useRetaining.setState({ sidePick: null })
})
