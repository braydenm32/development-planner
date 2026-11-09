// The exports that aren't PDF or 3D print: the DXF for a surveyor, pictures of the plan and the 3D
// view, and the door and window schedule. What the buttons in Share › Export and ⌘K call.

import { saveFile } from '../lib/download'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { finishedContours } from '../plan/finishedContours'
import type { Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { fileSafe } from '../print/export'
import { projectTitle } from '../share/project'
import { planDxf } from './planDxf'
import { doorWindowSchedule, scheduleCsv } from './schedule'
import { has3dView, planPicture, view3dPicture } from './snapshot'

export interface ExportInput {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

const today = () => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

/** The DXF text, with the finished contours once the ground is cut or filled. */
export function dxfText({ plan, survey, terrain, earth }: ExportInput): string {
  const e = earth?.result
  const finished = e && e.cut + e.fill > 0.01 ? finishedContours(survey, terrain.grid, e.grid, earth?.strips).finished : null
  return planDxf({ plan, survey, finished, title: projectTitle(plan), date: today() })
}

export function saveDxf(i: ExportInput): void {
  saveFile(`${fileSafe(projectTitle(i.plan))}.dxf`, dxfText(i), 'application/dxf')
}

export const scheduleRows = (plan: Plan) => doorWindowSchedule(plan)

export function saveScheduleCsv(plan: Plan): void {
  saveFile(`${fileSafe(projectTitle(plan))}-doors-windows.csv`, scheduleCsv(doorWindowSchedule(plan)), 'text/csv')
}

/** Save a picture of the plan or the 3D view, whichever is open. Returns a sentence to show when it can't. */
export async function savePicture(plan: Plan, which: 'plan' | '3d'): Promise<string | null> {
  try {
    if (which === 'plan') {
      const svg = document.querySelector<SVGSVGElement>('svg.plan-svg')
      if (!svg) return 'The plan isn’t showing. Open the plan first.'
      saveFile(`${fileSafe(projectTitle(plan))}-plan.png`, await planPicture(svg), 'image/png')
      return null
    }
    if (!has3dView()) return 'The 3D view isn’t showing. Open it from the top bar, then save the picture.'
    const png = await view3dPicture()
    if (!png) return 'The 3D view isn’t showing. Open it from the top bar, then save the picture.'
    saveFile(`${fileSafe(projectTitle(plan))}-3d.png`, png, 'image/png')
    return null
  } catch (err) {
    return (err as Error).message || 'The picture could not be saved.'
  }
}
