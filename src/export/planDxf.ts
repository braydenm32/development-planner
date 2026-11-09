// The plan as a DXF for a surveyor or engineer, in the survey's own eastings and northings so it
// lays over the surveyor's file. Each kind of thing is on its own plainly named layer:
//   BOUNDARY, CONTOURS-EXISTING, CONTOURS-FINISHED, WALLS-GROUND (and WALLS-FIRST, …), RETAINING,
//   DRIVEWAY, AREAS and NOTES.

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { ContourRun } from '../plan/finishedContours'
import { wallPolygons } from '../plan/geometry'
import { houseWalls, isRetaining, sortedLevels, toSite, areaKind, type Plan } from '../plan/model'
import { notesOf } from '../plan/notes'
import { DxfWriter } from './dxfWriter'
import { EXPORT_CAVEAT } from './exportCaveat'

export const LAYERS = {
  boundary: 'BOUNDARY',
  existing: 'CONTOURS-EXISTING',
  finished: 'CONTOURS-FINISHED',
  retaining: 'RETAINING',
  driveway: 'DRIVEWAY',
  areas: 'AREAS',
  notes: 'NOTES',
} as const

const FLOOR_NAMES = ['GROUND', 'FIRST', 'SECOND', 'THIRD', 'FOURTH']

/** The layer a floor's walls go on, lowest first: WALLS-GROUND, WALLS-FIRST, … */
export const wallLayer = (index: number): string => `WALLS-${FLOOR_NAMES[index] ?? `LEVEL-${index}`}`

export interface PlanDxfInput {
  plan: Plan
  survey: Survey
  /** The finished ground's contours (local frame), once the ground is cut or filled. */
  finished?: readonly ContourRun[] | null
  title: string
  /** Printed on the drawing, e.g. "9 November 2026". */
  date?: string
}

export function planDxf({ plan, survey, finished, title, date }: PlanDxfInput): string {
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
  levels.forEach((_, i) => dxf.addLayer(wallLayer(i), 5))
  dxf.addLayer(LAYERS.retaining, 6)
  dxf.addLayer(LAYERS.driveway, 2)
  dxf.addLayer(LAYERS.areas, 4)
  dxf.addLayer(LAYERS.notes, 7)

  dxf.polyline(LAYERS.boundary, survey.boundary.map(world), { closed: true })
  for (const c of survey.contours) dxf.polyline(LAYERS.existing, c.pts.map(p => world([p[0], p[1]])), { z: c.z })
  for (const c of finished ?? []) dxf.polyline(LAYERS.finished, c.pts.map(world), { z: c.z })

  levels.forEach((level, i) => {
    const onLevel = plan.walls.filter(w => w.level === level.id)
    for (const poly of wallPolygons(houseWalls(onLevel)).values()) dxf.polyline(wallLayer(i), poly.map(fromHouse), { closed: true })
  })
  // Retaining walls are site works, so one layer whatever floor they were drawn on.
  for (const poly of wallPolygons(plan.walls.filter(isRetaining)).values()) dxf.polyline(LAYERS.retaining, poly.map(fromHouse), { closed: true })
  for (const a of plan.areas) dxf.polyline(areaKind(a) === 'driveway' ? LAYERS.driveway : LAYERS.areas, a.pts.map(fromHouse), { closed: true })

  for (const n of notesOf(plan)) dxf.text(LAYERS.notes, fromHouse(n.at), n.text, 0.4)
  // A title block under the boundary: what this is, and the caveat.
  const minE = Math.min(...survey.boundary.map(p => p[0])) + oe
  const minN = Math.min(...survey.boundary.map(p => p[1])) + on
  dxf.text(LAYERS.notes, [minE, minN - 3], `${title}${date ? `, ${date}` : ''}`, 0.8)
  dxf.text(LAYERS.notes, [minE, minN - 4.5], EXPORT_CAVEAT, 0.5)
  return dxf.toString()
}
