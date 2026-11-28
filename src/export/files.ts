// The exports that aren't PDF or 3D print: the DXF for a surveyor, pictures of the plan and the 3D
// view, the door and window schedule, and the 3D model (.glb or OBJ). What the buttons in Share › Export and ⌘K call.

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
  return planDxf({ plan, survey, finished, ground: e?.grid ?? terrain.grid, pads: earth?.platforms, title: projectTitle(plan), date: today() })
}

/**
 * "-design" on the end: a project is often named after its survey file, and this must never be
 * mistaken for (or saved over) the surveyor's own DXF.
 */
export const dxfFileName = (plan: Plan): string => `${fileSafe(projectTitle(plan))}-design.dxf`

export function saveDxf(i: ExportInput): string {
  const name = dxfFileName(i.plan)
  saveFile(name, dxfText(i), 'application/dxf')
  return name
}

export const scheduleRows = (plan: Plan) => doorWindowSchedule(plan)

export function saveScheduleCsv(plan: Plan): void {
  saveFile(`${fileSafe(projectTitle(plan))}-doors-windows.csv`, scheduleCsv(doorWindowSchedule(plan)), 'text/csv')
}

export type ModelFormat = 'glb' | 'obj'

/** The 3D model's file name: a .glb, or a ZIP holding the .obj with its .mtl. */
export const modelFileName = (plan: Plan, format: ModelFormat): string => `${fileSafe(projectTitle(plan))}-3d-model${format === 'glb' ? '.glb' : '-obj.zip'}`

/**
 * Save the whole model for Blender, SketchUp or a renderer. Its code (and three's exporters) loads
 * only now, so the app's first download stays the size it was. Returns the file's name.
 */
export async function saveModel(i: ExportInput & { format: ModelFormat; ground?: boolean; furniture?: boolean }): Promise<string> {
  const m = await import('./model3d')
  const name = modelFileName(i.plan, i.format)
  if (i.format === 'glb') saveFile(name, await m.modelGlb(i), 'model/gltf-binary')
  else saveFile(name, await m.modelObjZip(i, `${fileSafe(projectTitle(i.plan))}-3d-model`), 'application/zip')
  return name
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
