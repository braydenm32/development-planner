import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { useRouter } from '../nav/router'
import type { Route } from '../nav/route'
import { showToast } from '../safety/store'
import { isRetaining, newId, type Plan, type Wall } from './model'
import { deleteSelection, updateWall } from './ops'
import { levelsForHeight, retainDefaults, retainingProfile, type Side } from './retaining'
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

/** A wall drawn with the tool that hasn't been kept or answered yet. */
export const isDraftRetaining = (w: Pick<Wall, 'retain'>) => !!w.retain?.draft

/** While the session itself changes the plan, its own listener stays out of the way. */
let busy = false
function quietly(fn: () => void) {
  const was = busy
  busy = true
  try {
    fn()
  } finally {
    busy = was
  }
}

/**
 * Add a retaining wall as one undoable step, select it, and open its panel as a new wall. A wall just
 * drawn (`pickSide`) then asks for its earth side with a click on the plan; a suggested one knows it.
 * A drawn wall is a draft until it's kept or its height is answered: left that way, it goes again.
 */
export function placeRetainingWall(w: Wall, { pickSide = false }: { pickSide?: boolean } = {}) {
  const st = usePlan.getState()
  const wall: Wall = pickSide && w.retain ? { ...w, retain: { ...w.retain, draft: true } } : w
  quietly(() => {
    st.commit(p => ({ ...p, walls: [...p.walls, wall] }))
    st.select({ type: 'wall', id: w.id })
    useRetaining.setState({ newWall: w.id, sidePick: pickSide ? w.id : null })
  })
}

/** Choose a wall's earth side with the next click on the plan (Esc or another selection stops it). */
export const startSidePick = (id: string) => useRetaining.setState({ sidePick: id })
export const stopSidePick = () => useRetaining.setState({ sidePick: null })
/** The Retaining wall tool waits while a wall just drawn asks for its earth side: a click answers that, and starts no other wall. */
export const waitingForSide = () => !!useRetaining.getState().sidePick

/**
 * A click this close to a wall's line (m) is on the wall, not on either side of it: the second click
 * of a double-click that finished the wall lands here, and is no answer to "which side?".
 */
export const SIDE_PICK_CLEAR = 0.3

/**
 * Which side of a wall a point is on, looking from its start to its end: the earth side when
 * picking. Null within `clear` of its line (or of the line run on past its ends).
 */
export function sideOfWall(w: Pick<Wall, 'a' | 'b'>, p: Vec2, clear = 0): Side | null {
  const c = (w.b[0] - w.a[0]) * (p[1] - w.a[1]) - (w.b[1] - w.a[1]) * (p[0] - w.a[0])
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
  const off = len > 1e-9 ? Math.abs(c) / len : Math.abs(c)
  return off < 1e-9 || off < clear ? null : c > 0 ? 'left' : 'right'
}

/**
 * Hold back the earth on `side` of a retaining wall (one undoable step): its levels start again from
 * the ground and the house on that side, keeping a top it was given. When that side is lower than the
 * other, it's filled: it becomes level ground `height` above the open side (the height asked for, or
 * `height`, the one the wall showed), so the earth side does end up higher.
 */
export function setEarthSide(id: string, side: Side, origin: Vec2, natural: Heightfield, height?: number) {
  const st = usePlan.getState()
  const w = st.plan?.walls.find(x => x.id === id)
  if (!w || !isRetaining(w)) return
  if (w.retain?.high === side) return
  st.commit(p => {
    const fresh = { ...retainDefaults(w, p, origin, natural, side), top: w.retain?.top, draft: w.retain?.draft }
    const nat = retainingProfile({ ...w, retain: undefined }, p, origin, natural)
    // The earth side ends up lower unless something raises it: the natural ground leans the other way
    // and no level was set. The open side is natural ground (or its own level) here.
    const lower = nat.high !== side && fresh.highLevel === undefined && fresh.lowLevel === undefined
    const h = w.retain?.askedHeight ?? (lower ? height : undefined)
    const next = h !== undefined && h > 0.05 ? levelsForHeight(fresh, p, { ...nat, wall: w }, h) : fresh
    // A height that wasn't typed stays unasked, so the panel goes on showing what the ground gives.
    return updateWall(p, id, { retain: tidyRetain({ ...next, askedHeight: w.retain?.askedHeight }) })
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
  const id = useRetaining.getState().newWall
  quietly(() => {
    useRetaining.setState({ newWall: null, sidePick: null })
    const st = usePlan.getState()
    const w = id ? st.plan?.walls.find(x => x.id === id) : undefined
    if (w?.retain?.draft) st.commit(p => updateWall(p, w.id, { retain: tidyRetain({ ...w.retain!, draft: undefined }) }))
    st.select(null)
  })
}

/** Take back the wall just drawn (Undo brings it back). */
export function cancelNewRetaining() {
  const id = useRetaining.getState().newWall
  if (!id) return
  quietly(() => {
    useRetaining.setState({ newWall: null, sidePick: null })
    const st = usePlan.getState()
    st.commit(p => deleteSelection(p, { type: 'wall', id }))
    st.select(null)
  })
}

/**
 * The wall just drawn was left without being kept or answered (another selection, tool or tab): it
 * goes, with an Undo that brings it back and asks about it again. A wall that was answered stays.
 */
export function leaveNewRetaining() {
  const id = useRetaining.getState().newWall
  if (!id) return
  quietly(() => {
    useRetaining.setState({ newWall: null, sidePick: null })
    const st = usePlan.getState()
    if (!st.plan?.walls.some(w => w.id === id && isDraftRetaining(w))) return
    st.commit(p => deleteSelection(p, { type: 'wall', id }))
    const sel = usePlan.getState().selection
    if (sel?.type === 'wall' && sel.id === id) st.select(null)
    const after = usePlan.getState().plan
    showToast({
      text: 'The retaining wall you drew was taken off: it was never kept. Undo brings it back.',
      // Only while that is still the last change, so Undo never takes back something else.
      undo: () => {
        if (usePlan.getState().plan === after) usePlan.getState().undo()
      },
    })
  })
}

/** A draft wall that comes back (Undo, Redo): select it and ask about it again. */
function askAgain(id: string) {
  quietly(() => {
    useRetaining.setState({ newWall: id, sidePick: null })
    usePlan.getState().select({ type: 'wall', id })
  })
}

usePlan.subscribe((s, prev) => {
  if (busy) return
  if (s.plan !== prev.plan && s.plan) {
    // A project opened with a wall left as a draft (saved, then reloaded): it goes, quietly. Only a
    // load leaves the history empty.
    if (!s.past.length && !s.future.length && s.plan.walls.some(isDraftRetaining)) {
      const plan = { ...s.plan, walls: s.plan.walls.filter(w => !isDraftRetaining(w)) }
      quietly(() => usePlan.setState({ plan }))
      useRetaining.setState({ newWall: null, sidePick: null })
      return
    }
    const { newWall } = useRetaining.getState()
    const back = s.plan.walls.find(w => isDraftRetaining(w) && w.id !== newWall && !prev.plan?.walls.some(x => x.id === w.id))
    if (back) {
      askAgain(back.id)
      return
    }
  }
  const { newWall, sidePick } = useRetaining.getState()
  const sel = s.selection
  const kept = (id: string | null) => !!id && sel?.type === 'wall' && sel.id === id && !!s.plan?.walls.some(w => w.id === id)
  // Another selection, or another tool, leaves the new wall; undoing it drops the question.
  if (newWall && (!kept(newWall) || s.tool !== prev.tool)) leaveNewRetaining()
  else if (sidePick && !kept(sidePick)) useRetaining.setState({ sidePick: null })
})

/** Where a route is in the app: its area and tab. */
const tabOf = (r: Route) => (r.kind === 'app' ? `${r.area}/${r.tab}` : r.kind)

// Going to another tab (or out of the project) leaves the new wall too. Arriving at the Retaining walls
// tab, which opens for a wall just drawn in Earthworks, doesn't.
useRouter.subscribe((s, prev) => {
  const to = tabOf(s.route)
  if (to === tabOf(prev.route) || to === 'earthworks/retaining-walls') return
  if (useRetaining.getState().newWall) leaveNewRetaining()
})
