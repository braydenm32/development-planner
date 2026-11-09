// One Open for every file the planner reads: a survey (DXF), a project file, or a plan on its
// own. It works out which it is from what's inside, not only from the name.

import { parseDxf } from '../lib/dxf'
import type { SavedProject } from '../lib/storage'
import { analyzeLayers, buildSurvey, guessRoles } from '../lib/survey'
import { buildTerrain } from '../lib/terrain'
import type { Plan } from '../plan/model'
import { parsePlanFile } from '../plan/store'
import { isProjectFile } from '../share/project'
import type { Site } from './align'

export type OpenedFile =
  | { kind: 'survey'; name: string; survey: SavedProject }
  | { kind: 'project'; name: string; text: string }
  | { kind: 'plan'; name: string; plan: Plan }

const NOT_OURS =
  'That file isn’t one the planner can open. Choose a survey (.dxf), a project file, or a plan (.json). A PDF or picture of the survey can be laid over the plan afterwards, under Site features.'

/** A survey record from DXF text, with its layers guessed. Throws the reader's message if it can't make a site. */
export function readSurvey(fileName: string, dxfText: string): SavedProject {
  const doc = parseDxf(dxfText)
  const roles = guessRoles(analyzeLayers(doc))
  buildSurvey(doc, roles) // fail early with a clear message
  return { fileName, dxfText, roles }
}

/** The survey and ground a survey record makes, as the app builds them. Throws if it can't. */
export function readSite(saved: SavedProject): Site {
  const survey = buildSurvey(parseDxf(saved.dxfText), saved.roles)
  return { survey, terrain: buildTerrain(survey) }
}

/** What a file is, from its name and text. Throws a plain message for anything else. */
export function detectFile(name: string, text: string): OpenedFile {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) {
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`${name} looks like a JSON file but can’t be read. ${NOT_OURS}`)
    }
    if (isProjectFile(text)) return { kind: 'project', name, text }
    const p = json as Partial<Plan>
    if (p && p.version === 1 && Array.isArray(p.walls)) return { kind: 'plan', name, plan: parsePlanFile(text) }
    throw new Error(NOT_OURS)
  }
  // A DXF starts with group code 0 and SECTION (some exports lead with a comment, code 999).
  if (/\.dxf$/i.test(name) || /^(0|999)\s*\r?\n/.test(trimmed)) return { kind: 'survey', name, survey: readSurvey(name, text) }
  throw new Error(NOT_OURS)
}

/** Read a chosen or dropped file and work out what it is. */
export async function readFile(file: File): Promise<OpenedFile> {
  if (/\.(pdf|png|jpe?g|gif|webp|heic|dwg)$/i.test(file.name)) throw new Error(NOT_OURS)
  return detectFile(file.name, await file.text())
}
