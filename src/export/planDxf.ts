// The plan as a DXF for a surveyor or engineer, in the survey's own eastings and northings so it
// lays over the surveyor's file. Each kind of thing is on its own plainly named layer:
//   BOUNDARY, CONTOURS-EXISTING, CONTOURS-FINISHED, RETAINING (with top RLs), DRIVEWAY, AREAS,
//   ROOF, SECTIONS, LEVELS (floor and pad levels as text) and NOTES,
// and each level's walls, doors and windows, and stairs on layers named after the level:
//   WALLS-GROUND-FLOOR, OPENINGS-GROUND-FLOOR, STAIRS-GROUND-FLOOR, WALLS-FIRST-FLOOR, …

import { centroidOf, type Vec2 } from '../lib/geom'
import type { Platform } from '../lib/earthworks'
import type { Survey } from '../lib/survey'
import type { Heightfield } from '../lib/terrain'
import type { ContourRun } from '../plan/finishedContours'
import { wallPolygons } from '../plan/geometry'
import { OPENING_NAMES, floorRL, houseWalls, isRetaining, pointOnWall, sortedLevels, toSite, areaKind, wallDir, type Plan } from '../plan/model'
import { notesOf } from '../plan/notes'
import { retainingProfiles } from '../plan/retaining'
import { levelOutlines, roofGeometry } from '../plan/roof'
import { roofEavesRL } from '../plan/roofline'
import { stairLayout } from '../plan/stairs'
import { sectionsOf } from '../sections/lines'
import { DxfWriter, layerName } from './dxfWriter'
import { EXPORT_CAVEAT } from './exportCaveat'

export const LAYERS = {
  boundary: 'BOUNDARY',
  existing: 'CONTOURS-EXISTING',
  finished: 'CONTOURS-FINISHED',
  retaining: 'RETAINING',
  driveway: 'DRIVEWAY',
  areas: 'AREAS',
  roof: 'ROOF',
  sections: 'SECTIONS',
  levels: 'LEVELS',
  notes: 'NOTES',
} as const

/**
 * Each level's name as it appears in its layers, "Split level" as SPLIT-LEVEL: the name the plan
 * gives it, so a file read beside the drawings matches them. Two levels with one name get -2, -3.
 */
export function levelLayerNames(plan: Plan): Map<string, string> {
  const names = new Map<string, string>()
  const used = new Set<string>()
  sortedLevels(plan).forEach((level, i) => {
    const base = level.name.trim() ? layerName(level.name) : `LEVEL-${i + 1}`
    let name = base
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`
    used.add(name)
    names.set(level.id, name)
  })
  return names
}

const onLevel = (kind: string) => (plan: Plan, levelId: string): string => `${kind}-${levelLayerNames(plan).get(levelId) ?? 'LEVEL'}`

/** The layer a level's walls go on: WALLS-GROUND-FLOOR, WALLS-SPLIT-LEVEL, … */
export const wallLayer = onLevel('WALLS')
/** Its doors, windows, openings and garage doors, each an outline across the wall with its size. */
export const openingLayer = onLevel('OPENINGS')
export const stairLayer = onLevel('STAIRS')

const mm = (m: number) => Math.round(m * 1000)

export interface PlanDxfInput {
  plan: Plan
  survey: Survey
  /** The finished ground's contours (local frame), once the ground is cut or filled. */
  finished?: readonly ContourRun[] | null
  /** The finished ground (or the natural ground, uncut), for the top RL of each retaining wall. */
  ground?: Heightfield
  /** The levelled ground under the house and beside retaining walls, for the pad levels. */
  pads?: readonly Platform[]
  title: string
  /** Printed on the drawing, e.g. "9 November 2026". */
  date?: string
}

export function planDxf({ plan, survey, finished, ground, pads, title, date }: PlanDxfInput): string {
  const dxf = new DxfWriter()
  const [oe, on] = survey.origin
  // The survey is held relative to its origin; the DXF goes back to the surveyor's coordinates.
  const world = (p: Vec2): Vec2 => [p[0] + oe, p[1] + on]
  // House frame to eastings and northings (the placement is already in those).
  const fromHouse = (p: Vec2): Vec2 => toSite(p, plan.placement, [0, 0])

  dxf.addLayer(LAYERS.boundary, 1)
  dxf.addLayer(LAYERS.existing, 8)
  dxf.addLayer(LAYERS.finished, 3)
  const levels = sortedLevels(plan)
  const names = levelLayerNames(plan)
  const layerOf = (kind: string, levelId: string) => `${kind}-${names.get(levelId) ?? 'LEVEL'}`
  for (const l of levels) {
    dxf.addLayer(layerOf('WALLS', l.id), 5)
    dxf.addLayer(layerOf('OPENINGS', l.id), 4)
    dxf.addLayer(layerOf('STAIRS', l.id), 8)
  }
  dxf.addLayer(LAYERS.roof, 1)
  dxf.addLayer(LAYERS.retaining, 6)
  dxf.addLayer(LAYERS.driveway, 2)
  dxf.addLayer(LAYERS.areas, 4)
  dxf.addLayer(LAYERS.sections, 6)
  dxf.addLayer(LAYERS.levels, 3)
  dxf.addLayer(LAYERS.notes, 7)

  dxf.polyline(LAYERS.boundary, survey.boundary.map(world), { closed: true })
  for (const c of survey.contours) dxf.polyline(LAYERS.existing, c.pts.map(p => world([p[0], p[1]])), { z: c.z })
  for (const c of finished ?? []) dxf.polyline(LAYERS.finished, c.pts.map(world), { z: c.z })

  const wallById = new Map(plan.walls.map(w => [w.id, w]))
  levels.forEach((level, i) => {
    const walls = houseWalls(plan.walls.filter(w => w.level === level.id))
    for (const poly of wallPolygons(walls).values()) dxf.polyline(layerOf('WALLS', level.id), poly.map(fromHouse), { closed: true })
    // The floor level, written inside the level's own outline (or among its walls, while they
    // don't yet close); a step down the page per level so two floors over one another don't
    // print on the same spot.
    const outline = [...levelOutlines(walls)].sort((a, b) => b.length - a.length)[0]
    const ends = walls.flatMap(w => [w.a, w.b])
    const inside = outline ? centroidOf(outline) : ends.length ? ([ends.reduce((t, p) => t + p[0], 0) / ends.length, ends.reduce((t, p) => t + p[1], 0) / ends.length] as Vec2) : null
    if (inside) {
      const c = fromHouse(inside)
      dxf.text(LAYERS.levels, [c[0], c[1] - i * 0.6], `${level.name}: FFL RL ${floorRL(plan, level.id).toFixed(2)}`, 0.35)
    }
    for (const s of plan.stairs.filter(x => x.level === level.id)) {
      const lay = stairLayout(s)
      dxf.polyline(layerOf('STAIRS', level.id), lay.outline.map(fromHouse), { closed: true })
      for (const [a, b] of lay.treadLines) dxf.polyline(layerOf('STAIRS', level.id), [fromHouse(a), fromHouse(b)])
      dxf.polyline(layerOf('STAIRS', level.id), lay.walk.map(fromHouse))
    }
  })
  // Doors and windows: the gap in the wall as an outline across its thickness, with what it is and its size.
  for (const o of plan.openings) {
    const w = wallById.get(o.wall)
    if (!w || isRetaining(w)) continue
    const c = pointOnWall(w, o.offset)
    const d = wallDir(w)
    const corner = (along: number, across: number): Vec2 => fromHouse([c[0] + d[0] * along - d[1] * across, c[1] + d[1] * along + d[0] * across])
    const [hw, ht] = [o.width / 2, w.thickness / 2]
    dxf.polyline(layerOf('OPENINGS', w.level), [corner(-hw, -ht), corner(hw, -ht), corner(hw, ht), corner(-hw, ht)], { closed: true })
    const size = `${OPENING_NAMES[o.kind]} ${mm(o.width)} x ${mm(o.height)}${o.kind === 'window' ? `, sill ${mm(o.sill)}` : ''}`
    dxf.text(layerOf('OPENINGS', w.level), corner(-hw, ht + 0.1), size, 0.15)
  }
  for (const roof of plan.roofs) {
    const g = roofGeometry(roof)
    if (g.error || g.outline.length < 3) continue
    // The edge of the roof with its overhang, then the ridges, hips and valleys.
    dxf.polyline(LAYERS.roof, g.outline.map(fromHouse), { closed: true })
    for (const [a, b] of g.lines) dxf.polyline(LAYERS.roof, [fromHouse(a), fromHouse(b)])
    dxf.text(LAYERS.roof, fromHouse(centroidOf(g.outline)), `${roof.type} roof, ${roof.pitch} deg, eaves RL ${roofEavesRL(plan, roof).toFixed(2)}`, 0.3)
  }
  // Retaining walls are site works, so one layer whatever floor they were drawn on.
  const retaining = plan.walls.filter(isRetaining)
  for (const poly of wallPolygons(retaining).values()) dxf.polyline(LAYERS.retaining, poly.map(fromHouse), { closed: true })
  if (ground)
    for (const p of retainingProfiles(plan, survey.origin, ground)) {
      const [lo, hi] = p.top
      const mid = fromHouse(pointOnWall(p.wall, p.length / 2))
      dxf.text(LAYERS.retaining, mid, hi - lo < 0.005 ? `RW top RL ${hi.toFixed(2)}` : `RW top RL ${lo.toFixed(2)} to ${hi.toFixed(2)}`, 0.3)
    }
  // Pad levels: the level ground the earthworks make (ramps and painted grading have no one level).
  for (const pad of pads ?? []) {
    if (pad.ramp || pad.cells || !pad.include[0] || pad.include[0].length < 3) continue
    dxf.text(LAYERS.levels, world(centroidOf(pad.include[0])), `Pad RL ${pad.level.toFixed(2)}`, 0.3)
  }
  for (const s of sectionsOf(plan)) {
    dxf.polyline(LAYERS.sections, [fromHouse(s.a), fromHouse(s.b)])
    dxf.text(LAYERS.sections, fromHouse(s.a), s.label, 0.5)
    dxf.text(LAYERS.sections, fromHouse(s.b), s.label, 0.5)
  }
  for (const a of plan.areas) dxf.polyline(areaKind(a) === 'driveway' ? LAYERS.driveway : LAYERS.areas, a.pts.map(fromHouse), { closed: true })

  for (const n of notesOf(plan)) dxf.text(LAYERS.notes, fromHouse(n.at), n.text, 0.4)
  // A title block under the boundary: what this is, and the caveat.
  const minE = Math.min(...survey.boundary.map(p => p[0])) + oe
  const minN = Math.min(...survey.boundary.map(p => p[1])) + on
  dxf.text(LAYERS.notes, [minE, minN - 3], `${title}${date ? `, ${date}` : ''}`, 0.8)
  dxf.text(LAYERS.notes, [minE, minN - 4.5], EXPORT_CAVEAT, 0.5)
  return dxf.toString()
}
