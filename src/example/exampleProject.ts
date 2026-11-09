// The example project as a project file: the sample survey, the split-level house on it, a
// tree in the back yard and the costs at their starting choices. Opening it goes the way any
// project file does (src/projects/ops.ts createFromProjectFile), so it is always a new project,
// named plainly as an example, and never overwrites one.

import { emptyCosts } from '../costs/model'
import type { Vec2 } from '../lib/geom'
import type { SavedProject } from '../lib/storage'
import { readSite, readSurvey } from '../safety/files'
import type { ProjectFile } from '../share/project'
import type { SiteFeature } from '../site/model'
import { emptySiteData, type ProjectSite } from '../site/store'
import { EXAMPLE_NAME, examplePlan } from './examplePlan'
import { SAMPLE_E0, SAMPLE_FILE_NAME, SAMPLE_N0, sampleSurveyDxf } from './sampleSurvey'

/** The example's survey record, its layers read as any imported DXF's are. */
export function exampleSurvey(): SavedProject {
  return readSurvey(SAMPLE_FILE_NAME, sampleSurveyDxf())
}

/** The boundary edge that faces most nearly `bearing` (degrees from north), by its outward normal. */
export function edgeFacing(boundary: Vec2[], bearing: number): number {
  let area = 0
  boundary.forEach(([x1, y1], i) => {
    const [x2, y2] = boundary[(i + 1) % boundary.length]
    area += x1 * y2 - x2 * y1
  })
  const want: Vec2 = [Math.sin((bearing * Math.PI) / 180), Math.cos((bearing * Math.PI) / 180)]
  let best = 0
  let bestDot = -Infinity
  boundary.forEach(([x1, y1], i) => {
    const [x2, y2] = boundary[(i + 1) % boundary.length]
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    // Outward: to the right of the way round for an anticlockwise boundary.
    const n: Vec2 = area > 0 ? [(y2 - y1) / len, -(x2 - x1) / len] : [-(y2 - y1) / len, (x2 - x1) / len]
    const dot = n[0] * want[0] + n[1] * want[1]
    if (dot > bestDot) {
      bestDot = dot
      best = i
    }
  })
  return best
}

/** A gum in the back yard, well clear of the house, so the checks show a tree passing. */
function backYardTree(): SiteFeature {
  return { id: 'example_tree', type: 'tree', geom: { kind: 'point', at: [SAMPLE_E0 + 6, SAMPLE_N0 + 28.5] }, label: 'T1', source: 'trace', trunk: 0.35, canopy: 7, height: 10 }
}

/** Everything the example opens with, as one project file. */
export function exampleProjectFile(): ProjectFile {
  const survey = exampleSurvey()
  // The street is the block's south side.
  const front = edgeFacing(readSite(survey).survey.boundary, 180)
  const site: ProjectSite = { data: { ...emptySiteData(), features: [backYardTree()] } }
  return { app: 'block-and-house-planner', version: 1, name: EXAMPLE_NAME, savedAt: new Date().toISOString(), survey, plan: examplePlan(front), site, costs: emptyCosts() }
}

export const exampleProjectText = () => JSON.stringify(exampleProjectFile())
