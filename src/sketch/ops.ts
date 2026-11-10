// Changes to the sketch layer, as pure functions of the plan that the store commits (each one undo
// step), and turning a sketch item into walls or an area outline. The sketch item stays: it's the
// guide the walls were built on, and the layer can be hidden or cleared.

import type { Vec2 } from '../lib/geom'
import { addArea, addWall } from '../plan/ops'
import { newId, sketchNamesOf, SKETCH_NAME_MAX, type AreaKind, type Plan, type SketchColour, type SketchItem, type SketchKind, type WallKind } from '../plan/model'
import { sketchToOutline, sketchToSegments } from './geometry'

export const sketchOf = (plan: Plan): SketchItem[] => plan.sketch ?? []

/** The sketch lines (not the kept measurements). */
export const sketchLines = (plan: Plan): SketchItem[] => sketchOf(plan).filter(s => s.kind !== 'measure')
/** The kept measurements. */
export const keptMeasures = (plan: Plan): SketchItem[] => sketchOf(plan).filter(s => s.kind === 'measure')

const copyPts = (pts: Vec2[]): Vec2[] => pts.map(p => [p[0], p[1]] as Vec2)

/** A new sketch item; a sketch line takes `colour` (blue is left unsaid), a measurement never does. */
export function newSketch(level: string, kind: SketchKind, pts: Vec2[], colour?: SketchColour): SketchItem {
  return { id: newId('sketch'), level, kind, pts: copyPts(pts), ...(colour && colour !== 'blue' && kind !== 'measure' ? { colour } : {}) }
}

/** Colour the sketch lines among `ids` (kept measurements stay grey). */
export function setSketchColour(plan: Plan, ids: Iterable<string>, colour: SketchColour): Plan {
  const set = new Set(ids)
  const touches = sketchOf(plan).some(s => set.has(s.id) && s.kind !== 'measure' && (s.colour ?? 'blue') !== colour)
  if (!touches) return plan
  return {
    ...plan,
    sketch: sketchOf(plan).map(s => {
      if (!set.has(s.id) || s.kind === 'measure') return s
      const { colour: _, ...rest } = s
      return colour === 'blue' ? rest : { ...rest, colour }
    }),
  }
}

/** Name what a colour stands for ("Old fence"); an empty name takes the name away. */
export function setSketchName(plan: Plan, colour: SketchColour, name: string): Plan {
  const names = sketchNamesOf({ ...plan.sketchNames, [colour]: name.slice(0, SKETCH_NAME_MAX) })
  if ((plan.sketchNames?.[colour] ?? '') === (names?.[colour] ?? '')) return plan
  return { ...plan, sketchNames: names }
}

export function addSketch(plan: Plan, item: SketchItem): Plan {
  return { ...plan, sketch: [...sketchOf(plan), item] }
}

/** Move one of an item's points (a handle dragged). */
export function moveSketchPoint(plan: Plan, id: string, index: number, to: Vec2): Plan {
  return { ...plan, sketch: sketchOf(plan).map(s => (s.id === id ? { ...s, pts: s.pts.map((p, i) => (i === index ? ([to[0], to[1]] as Vec2) : p)) } : s)) }
}

/** Move a whole item by `delta`. */
export function moveSketch(plan: Plan, id: string, delta: Vec2, from: SketchItem): Plan {
  return { ...plan, sketch: sketchOf(plan).map(s => (s.id === id ? { ...s, pts: from.pts.map(p => [p[0] + delta[0], p[1] + delta[1]] as Vec2) } : s)) }
}

export function deleteSketch(plan: Plan, id: string): Plan {
  return { ...plan, sketch: sketchOf(plan).filter(s => s.id !== id) }
}

/** Empty the layer: every sketch line and kept measurement. */
export function clearSketch(plan: Plan): Plan {
  return sketchOf(plan).length ? { ...plan, sketch: [] } : plan
}

/** What the layer holds, in words: "3 sketch lines and 2 measurements". */
export function sketchCount(plan: Plan): string {
  const lines = sketchLines(plan).length
  const ms = keptMeasures(plan).length
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '')
  return [part(lines, 'sketch line', 'sketch lines'), part(ms, 'measurement', 'measurements')].filter(Boolean).join(' and ') || 'Nothing'
}

/** Walls along a sketch item, on `level`, in the Wall tool's type. Joined end to end, as the tool draws them. */
export function sketchToWalls(plan: Plan, item: SketchItem, level: string, style: { kind: WallKind; thickness: number }): { plan: Plan; ids: string[] } {
  const before = new Set(plan.walls.map(w => w.id))
  const next = sketchToSegments(item).reduce((p, [a, b]) => addWall(p, level, a, b, style), plan)
  return { plan: next, ids: next.walls.filter(w => !before.has(w.id)).map(w => w.id) }
}

const AREA_NAMES: Record<AreaKind, string> = { slab: 'Concrete slab', driveway: 'Driveway', deck: 'Deck', garden: 'Garden' }

/** An area on `level` with the sketch item's outline (an open line is closed back to its start). Null when it has no inside. */
export function sketchToArea(plan: Plan, item: SketchItem, level: string, kind: AreaKind): { plan: Plan; id: string } | null {
  const ring = sketchToOutline(item)
  if (!ring) return null
  const next = addArea(plan, level, ring, AREA_NAMES[kind], kind)
  return { plan: next, id: next.areas[next.areas.length - 1].id }
}
