// What the LandXML and CSV readers hand over, and how it becomes a survey record.
//
// A survey is stored as DXF text with a role for each layer (src/lib/storage), and everything
// downstream (the ground, contours, checks, 3D, earthworks, saved projects, shared files) reads
// that. So points and a boundary from another format are written as a small ASCII DXF: one layer
// of spot levels and one of lot boundary. The app then treats them exactly like a surveyor's DXF,
// the layer review included.

import type { SavedProject } from './storage'
import type { LayerRole } from './survey'

export interface SurveyPoints {
  /** Easting, northing, RL in metres. */
  points: [number, number, number][]
  /** Lot outlines, each a ring of easting, northing in metres (any may repeat its first point). */
  boundaries: [number, number][][]
  /** Plain notes for the person: what was skipped, what is missing. */
  notes: string[]
}

export const POINTS_LAYER = 'SURVEY_POINTS'
export const BOUNDARY_LAYER = 'LOT_BOUNDARY'

const r3 = (v: number) => String(Math.round(v * 1000) / 1000)
const pairs = (...items: (string | number)[]) => items.map(String).join('\n')

/** Needs at least this many points to make a ground. */
export const MIN_POINTS = 3

/** A survey record from points and boundaries. Throws a plain message when there is too little to make ground. */
export function surveyFromPoints(fileName: string, data: SurveyPoints): SavedProject {
  if (data.points.length < MIN_POINTS) {
    throw new Error(
      data.points.length === 0
        ? `${fileName} has no points with a level (RL), so there is no ground to build.`
        : `${fileName} has only ${data.points.length} point${data.points.length === 1 ? '' : 's'} with a level. At least ${MIN_POINTS} are needed to build the ground.`,
    )
  }
  const ents: string[] = []
  for (const [x, y, z] of data.points) ents.push(pairs(0, 'POINT', 8, POINTS_LAYER, 10, r3(x), 20, r3(y), 30, r3(z)))
  const rings = data.boundaries.filter(r => r.length >= 3)
  for (const ring of rings) {
    ents.push(pairs(0, 'LWPOLYLINE', 8, BOUNDARY_LAYER, 90, ring.length, 70, 1, 38, 0, ...ring.flatMap(([x, y]) => [10, r3(x), 20, r3(y)])))
  }
  const dxfText =
    [pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'), pairs(0, 'SECTION', 2, 'ENTITIES'), ...ents, pairs(0, 'ENDSEC', 0, 'EOF')].join('\n') + '\n'
  const roles: Record<string, LayerRole> = { [POINTS_LAYER]: 'levels' }
  if (rings.length) roles[BOUNDARY_LAYER] = 'boundary'
  return { fileName, dxfText, roles }
}
