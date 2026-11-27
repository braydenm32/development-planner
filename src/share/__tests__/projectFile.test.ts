// The project file as a backup: it carries the DA pack's site details and gives them back when
// opened; a file from a newer version or with a part missing says so; and entries that can't be
// drawn are left out and counted, never silently. Made-up details on the test garage.

import { describe, expect, it } from 'vitest'
import { projectFile } from '../../components/printFiles'
import { DA_DETAILS_KIND, setDaDetail, useDaDetails } from '../../da/details'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { createMemoryProjectStore } from '../../projects/memoryStore'
import { createFromProjectFile, describeContents } from '../../projects/ops'
import { projectReview } from '../../safety/review'
import { parseProjectFile, projectFileText } from '../project'
import { droppedWords } from '../readable'

const saved = () => {
  const dxfText = planeSurvey()
  return { fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}
const plan = () => ({ ...garageFloor(), name: 'Test house' })
const DETAILS = { address: '1 Example Street Sampleton 2000', lot: 'Lot 1 DP 123456', preparedBy: 'A. Designer' }
/** A project file the app wrote, as an object to break. */
const fileObject = () => JSON.parse(projectFileText(saved(), plan())) as Record<string, unknown> & { plan: Record<string, unknown[]> }

describe('the DA pack’s site details in the project file', () => {
  it('go into the file and come back when it is opened', () => {
    const text = projectFileText(saved(), plan(), undefined, undefined, undefined, undefined, DETAILS)
    expect(JSON.parse(text).da).toEqual(DETAILS)
    expect(parseProjectFile(text).da).toEqual(DETAILS)
  })

  it('are left out when nothing was typed, and an older file without them opens with none', () => {
    const blank = projectFileText(saved(), plan(), undefined, undefined, undefined, undefined, { address: ' ', lot: '', preparedBy: '' })
    expect(JSON.parse(blank)).not.toHaveProperty('da')
    expect(parseProjectFile(blank).da).toBeNull()
    expect(parseProjectFile(projectFileText(saved(), plan())).da).toBeNull()
    // Odd values in a file are tidied like typed ones.
    const odd = { ...fileObject(), da: { address: '  1   Example Street ', lot: 7, preparedBy: null } }
    expect(parseProjectFile(JSON.stringify(odd)).da).toEqual({ address: '1 Example Street', lot: '', preparedBy: '' })
  })

  it('the Download project file button puts in what was typed in Approvals › DA pack', async () => {
    for (const k of ['address', 'lot', 'preparedBy'] as const) setDaDetail(k, DETAILS[k])
    try {
      const f = await projectFile(saved(), plan())
      expect(f.name).toBe('test-house.project.json')
      expect(parseProjectFile(f.data as string).da).toEqual(DETAILS)
    } finally {
      for (const k of ['address', 'lot', 'preparedBy'] as const) setDaDetail(k, '')
    }
    expect(useDaDetails.getState().details.address).toBe('')
  })

  it('opening the file as a new project restores them as that project’s own record', async () => {
    const store = createMemoryProjectStore()
    const meta = await createFromProjectFile(store, projectFileText(saved(), plan(), undefined, undefined, undefined, undefined, DETAILS))
    const records = await store.read(meta.id)
    expect(records?.[DA_DETAILS_KIND]).toEqual(DETAILS)
    // The review before it opens says they come with it, and deleting the project lists them in plain words.
    const review = projectReview({ file: 'test-house.project.json', name: 'Test house', survey: saved(), plan: plan(), siteFeatures: 0, current: null, daDetails: true })
    expect(review.facts).toContainEqual({ label: 'DA pack', value: 'site address, Lot and DP, prepared by' })
    expect(describeContents(meta, records)).toContain('Its DA pack details (site address, Lot and DP, prepared by)')
    // A file without them makes no record.
    const none = await createFromProjectFile(store, projectFileText(saved(), plan()))
    expect(await store.read(none.id)).not.toHaveProperty(DA_DETAILS_KIND)
  })
})

describe('a project file that can’t be opened says why', () => {
  it('saved by a newer version: reload to update, not "not a Contour & Gable project"', () => {
    const newer = { ...fileObject(), version: 99 }
    expect(() => parseProjectFile(JSON.stringify(newer))).toThrow(/saved by a newer version of Contour & Gable.*Reload the page/)
    const newerPlan = fileObject()
    ;(newerPlan.plan as Record<string, unknown>).version = 2
    expect(() => parseProjectFile(JSON.stringify(newerPlan))).toThrow(/newer version/)
  })

  it('missing its plan or its survey: damaged, and which part', () => {
    const noPlan = fileObject() as Record<string, unknown>
    delete noPlan.plan
    expect(() => parseProjectFile(JSON.stringify(noPlan))).toThrow('This Contour & Gable project file is damaged: its plan is missing. If you have an earlier copy, open that one.')
    const noSurvey = fileObject() as Record<string, unknown>
    delete noSurvey.survey
    expect(() => parseProjectFile(JSON.stringify(noSurvey))).toThrow(/damaged: its survey is missing/)
    const noVersion = fileObject() as Record<string, unknown>
    delete noVersion.version
    expect(() => parseProjectFile(JSON.stringify(noVersion))).toThrow(/damaged: it doesn’t say which version/)
    const noLevels = fileObject()
    noLevels.plan.levels = [{ name: 'Ground floor' }]
    expect(() => parseProjectFile(JSON.stringify(noLevels))).toThrow(/damaged: its plan’s levels can’t be read/)
  })

  it('another app’s file, or not JSON, is still simply not ours', () => {
    expect(() => parseProjectFile(JSON.stringify({ app: 'another-planner', version: 1 }))).toThrow('This file is not a Contour & Gable project.')
    expect(() => parseProjectFile('null')).toThrow('This file is not a Contour & Gable project.')
    expect(() => parseProjectFile('{')).toThrow('This file is not a Contour & Gable project.')
  })
})

describe('a project file with broken entries', () => {
  const broken = () => {
    const f = fileObject()
    const good = f.plan.walls.length
    f.plan.walls.push({ id: 'bad_wall', level: 'level_nowhere', a: [null, 2], b: [3, 2], thickness: -1, kind: 'external' })
    f.plan.rooms.push({ id: 'bad_room', level: 'level_ground', name: 123 })
    f.plan.openings.push({ id: 'bad_door', wall: 'wall_nowhere', kind: 'door', offset: 1, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false })
    return { text: JSON.stringify(f), good }
  }

  it('opens without them, and counts what was left out', () => {
    const { text, good } = broken()
    const back = parseProjectFile(text)
    expect(back.plan.walls).toHaveLength(good)
    expect(back.plan.walls.some(w => w.id === 'bad_wall')).toBe(false)
    expect(back.plan.rooms.some(r => r.id === 'bad_room')).toBe(false)
    expect(back.plan.openings.some(o => o.id === 'bad_door')).toBe(false)
    expect(back.dropped).toEqual([
      { thing: 'wall', count: 1 },
      { thing: 'door', count: 1 },
      { thing: 'room', count: 1 },
    ])
    expect(droppedWords(back.dropped)).toBe('1 wall, 1 door and 1 room')
  })

  it('says so in the review before it opens', () => {
    const back = parseProjectFile(broken().text)
    const review = projectReview({ file: 'broken.project.json', name: 'Test house', survey: back.survey, plan: back.plan, siteFeatures: 0, current: null, dropped: droppedWords(back.dropped) })
    expect(review.warning).toBe('Part of this file couldn’t be read: 1 wall, 1 door and 1 room will be left out. The rest opens as it was saved.')
  })

  it('leaves a file the app wrote exactly as it was, with nothing dropped', () => {
    const back = parseProjectFile(projectFileText(saved(), plan()))
    expect(back.dropped).toEqual([])
    expect(back.plan.walls).toEqual(plan().walls)
    expect(back.plan.openings).toEqual(plan().openings)
    expect(back.plan.rooms).toEqual(plan().rooms)
    expect(back.plan.areas).toEqual(plan().areas)
    expect(projectReview({ file: 'x.project.json', name: 'Test house', survey: back.survey, plan: back.plan, siteFeatures: 0, current: null }).warning).toBeNull()
    expect(droppedWords([{ thing: 'piece of furniture', count: 2 }])).toBe('2 pieces of furniture')
  })
})
