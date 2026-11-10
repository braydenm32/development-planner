// What the sketch layer's buttons do: turn a sketch item into walls, a retaining wall or an area
// outline (the sketch stays, as the guide they were built on), and clear the whole layer after a
// review, with Undo.

import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import { floorToFirstWalls } from '../components/placeActions'
import { wallsPlaced } from '../flow/store'
import type { AreaKind, SketchColour, SketchItem } from '../plan/model'
import { undoToastFor } from '../plan/editActions'
import { extendRun, newRetainingWall, placeRetainingWall, useRetaining } from '../plan/retainingSession'
import { usePlan } from '../plan/store'
import { askReview, showToast } from '../safety/store'
import { sketchToSegments } from './geometry'
import { clearSketch, setSketchColour, sketchCount, sketchOf, sketchToArea, sketchToWalls } from './ops'
import { useSketch } from './store'

/** Walls along the sketch item on the level being shown, in the Wall tool's type; they're selected. */
export function makeWalls(item: SketchItem, survey: Pick<Survey, 'origin'>, natural: Heightfield): number {
  const st = usePlan.getState()
  const before = st.plan
  if (!before) return 0
  const level = st.activeLevel
  let ids: string[] = []
  st.commit(p => {
    const r = sketchToWalls(p, item, level, st.wallStyle)
    ids = r.ids
    return r.plan
  })
  if (!ids.length) return 0
  st.selectMany(ids.map(id => ({ type: 'wall' as const, id })))
  // As after a run with the Wall tool: a house's first walls set its floor, and closed walls ask the floor type.
  floorToFirstWalls(before, survey, natural)
  wallsPlaced(before, level)
  undoToastFor(ids.length === 1 ? 'Wall made from the sketch. The sketch line stays.' : `${ids.length} walls made from the sketch. The sketch line stays.`)
  return ids.length
}

/**
 * A retaining wall along the sketch item, as the Retaining wall tool draws one: the first piece
 * opens its panel, which asks once which side it holds back and how high, for the whole run.
 */
export function makeRetainingWall(item: SketchItem, survey: Pick<Survey, 'origin'>, natural: Heightfield): number {
  const st = usePlan.getState()
  if (!st.plan) return 0
  const level = st.activeLevel
  const thickness = useRetaining.getState().thickness
  const segs = sketchToSegments(item)
  segs.forEach(([a, b], i) => {
    const w = newRetainingWall(usePlan.getState().plan!, level, a, b, thickness, survey.origin, natural)
    if (i === 0 || !extendRun(w, survey.origin, natural)) placeRetainingWall(w, { draft: true })
  })
  return segs.length
}

/** An area with the sketch item's outline, of the Area tool's kind; it's selected. False when it has no inside. */
export function makeArea(item: SketchItem, kind: AreaKind): boolean {
  const st = usePlan.getState()
  if (!st.plan) return false
  const level = st.activeLevel
  let id: string | null = null
  st.commit(p => {
    const r = sketchToArea(p, item, level, kind)
    id = r?.id ?? null
    return r?.plan ?? p
  })
  if (!id) {
    showToast({ text: 'That sketch has no inside to make an area of. Draw a closed shape, or a line with three or more corners.' })
    return false
  }
  st.select({ type: 'area', id })
  undoToastFor('Area made from the sketch. The sketch line stays.')
  return true
}

/** Clear every sketch line and kept measurement, after the review sheet; Undo brings them back. */
export async function clearSketchWithReview(): Promise<boolean> {
  const plan = usePlan.getState().plan
  if (!plan || !sketchOf(plan).length) return false
  const what = sketchCount(plan)
  const choice = await askReview({
    kind: 'clear-sketch',
    title: 'Clear the sketch layer?',
    facts: [{ label: 'On the layer', value: what }],
    changes: ['Every sketch line and kept measurement is removed, on every level.'],
    kept: ['Walls, areas and everything else you drew, even those made from the sketch', 'Undo, straight after'],
    confirm: 'Clear sketch layer',
    replaces: true,
  })
  const st = usePlan.getState()
  if (!choice || st.plan !== plan) return false
  st.commit(clearSketch)
  if (st.selection?.type === 'sketch' || st.extra.some(s => s.type === 'sketch')) st.select(null)
  undoToastFor(`Sketch layer cleared (${what.toLowerCase()}).`)
  return true
}

/** Colour every sketch line among `ids`, as one undo step. */
export function colourSketch(ids: string[], c: SketchColour) {
  usePlan.getState().commit(p => setSketchColour(p, ids, c))
  // The next line drawn takes it too, so a run of fence lines stays one colour.
  useSketch.getState().setColour(c)
}
