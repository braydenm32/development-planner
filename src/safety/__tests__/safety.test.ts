import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import type { SavedProject } from '../../lib/storage'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { floorRL, type Plan } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { ensureProjects, projectActions, projectsNow } from '../../projects/session'
import { totalFloorArea } from '../../projects/summary'
import { projectFileText } from '../../share/project'
import { m2 } from '../../shell/format'
import { SKETCH_DATUM } from '../../start/sketch'
import { fitOnBlock, groundAtHouse, placeOnSketch } from '../align'
import { detectFile, readSite } from '../files'
import { importPlan, newPlan, openRead, replaceSurvey, startSketch } from '../flows'
import { undoToast, useSafety, type Review } from '../store'

// Synthetic blocks only: the tilted-plane test block, sketch blocks, and the test garage.

function plane(fileName = 'plane.dxf', shift: [number, number] = [0, 0]): SavedProject {
  const dxfText = shiftDxf(planeSurvey(), shift)
  return { fileName, dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}

/** Move every point of a DXF by `de`, `dn` (group codes 10 and 20). */
function shiftDxf(text: string, [de, dn]: [number, number]): string {
  if (!de && !dn) return text
  const lines = text.split('\n')
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim()
    if (code === '10') lines[i + 1] = String(Number(lines[i + 1]) + de)
    if (code === '20') lines[i + 1] = String(Number(lines[i + 1]) + dn)
  }
  return lines.join('\n')
}

const SKETCH = { width: 15, depth: 30, fall: 0, street: 'S' as const }
const plan = () => usePlan.getState().plan!
const records = (id = projectsNow().currentId!) => projectActions.flush().then(() => projectActions.read(id))

/** The review the flow is waiting on. */
async function review(): Promise<Review & { answer: (c: string | null) => void }> {
  for (let i = 0; i < 200; i++) {
    const r = useSafety.getState().review
    if (r) return r
    await new Promise(res => setTimeout(res, 1))
  }
  throw new Error('No review was asked for.')
}

/** Undo the change the toast offers, and wait for its saves. */
async function undo() {
  const t = useSafety.getState().toast
  expect(t?.undo, 'an Undo toast').toBeDefined()
  expect(t!.ms).toBeGreaterThanOrEqual(10_000)
  await undoToast(t!.id)
  await projectActions.flush()
}

/** A project on the plane block with the garage on it. */
async function garageOnPlane(): Promise<string> {
  const meta = await projectActions.create({ survey: plane(), plan: garageFloor() })
  return meta.id
}

beforeAll(() => ensureProjects())
beforeEach(() => useSafety.setState({ review: null, toast: null, busy: false }))

describe('one Open', () => {
  it('tells a survey, a project file and a plan apart from what is inside', () => {
    const survey = detectFile('site.dxf', planeSurvey())
    expect(survey.kind).toBe('survey')
    // a DXF saved without the extension still reads as one
    expect(detectFile('download', planeSurvey()).kind).toBe('survey')
    const project = detectFile('house.project.json', projectFileText(plane(), garageFloor()))
    expect(project.kind).toBe('project')
    const p = detectFile('house-plan.json', JSON.stringify(garageFloor()))
    expect(p).toMatchObject({ kind: 'plan', name: 'house-plan.json' })
    expect(() => detectFile('notes.json', '{"hello": 1}')).toThrow(/survey \(.dxf, LandXML .xml, or spot levels as .csv or .txt\), a project file, or a plan/)
    expect(() => detectFile('broken.json', '{"walls": [')).toThrow(/can’t be read/)
    expect(() => detectFile('readme.txt', 'Just some words')).toThrow(/isn’t one the planner can open/)
  })
})

describe('starting without a survey', () => {
  it('makes a project on a flat sketch block and opens the plan', async () => {
    await startSketch(SKETCH)
    const opened = projectsNow().opened!
    expect(opened.survey?.sketch).toEqual(SKETCH)
    expect(opened.survey?.fileName).toBe('Sketch block 15 × 30 m')
    expect(opened.prefs.view?.mode).toBe('plan')
    // an empty plan in the middle of the block, its floor at the ground
    expect(plan().walls).toEqual([])
    expect(floorRL(plan())).toBeCloseTo(SKETCH_DATUM, 6)
    expect(plan().placement).toMatchObject({ e: 1007.5, n: 1015, rotation: 0 })
    const r = await records()
    expect((r!.survey as SavedProject).sketch).toEqual(SKETCH)
  })

  it('puts a plan opened without a survey on a sketch block that fits it', async () => {
    // The garage, 700 m east of anywhere: it lands on a block of its own, centred, floor at ground level.
    const far: Plan = { ...garageFloor(), placement: { ...garageFloor().placement, e: 1705, ffl: 12.5 } }
    await openRead({ kind: 'plan', name: 'house-plan.json', plan: far }, { into: 'new' })
    const opened = projectsNow().opened!
    expect(opened.survey?.sketch).toBeDefined()
    const site = readSite(opened.survey!)
    expect(fitOnBlock(plan(), site.survey).fit).toBe('inside')
    expect(plan().walls).toEqual(far.walls)
    expect(floorRL(plan())).toBeCloseTo(SKETCH_DATUM, 6)
    // what's drawn spans 9.8 × 16.45 m (wall centrelines and the patio), plus 6 m each side, rounded up: 22 × 29 m
    expect(opened.survey!.sketch).toMatchObject({ width: 22, depth: 29 })
    expect(useSafety.getState().toast?.text).toMatch(/on a sketch block 22 × 29 m/)
  })
})

describe('adding the survey to a sketch later', () => {
  it('reviews first, keeps the plan, lines it up on the survey, and Undo puts it all back', async () => {
    await startSketch(SKETCH)
    const id = projectsNow().currentId!
    const sketchSite = readSite(projectsNow().opened!.survey!)
    usePlan.getState().commit(() => placeOnSketch(garageFloor(), sketchSite))
    await projectActions.flush()
    const before = { records: await records(), plan: plan() }
    const aboveGround = floorRL(before.plan) - groundAtHouse(before.plan, sketchSite)!

    const done = replaceSurvey(plane())
    const r = await review()
    expect(r.kind).toBe('replace-survey')
    expect(r.title).toBe('Use plane.dxf as your block?')
    expect(r.choices?.map(c => c.id)).toEqual(['centre'])
    expect(r.kept[0]).toMatch(/^Your plan: 10 walls, 4 rooms/)
    // nothing has changed while the review is open
    expect(await records()).toEqual(before.records)
    expect(plan()).toBe(before.plan)

    r.answer('centre')
    await done
    const after = await records()
    expect((after!.survey as SavedProject).fileName).toBe('plane.dxf')
    expect((after!.survey as SavedProject).sketch).toBeUndefined()
    // the sketch isn't kept as an earlier survey
    expect(after?.['previous-survey']).toBeUndefined()
    const to = readSite(plane())
    expect(plan().walls).toEqual(before.plan.walls)
    expect(fitOnBlock(plan(), to.survey).fit).toBe('inside')
    // the floor keeps its height above the ground at the house's middle, to the nearest 50 mm
    expect(Math.abs(floorRL(plan()) - (groundAtHouse(plan(), to)! + aboveGround))).toBeLessThanOrEqual(0.025 + 1e-9)

    await undo()
    expect(projectsNow().currentId).toBe(id)
    expect(await records()).toMatchObject({ survey: before.records!.survey, plan: before.plan })
    expect(plan()).toEqual(before.plan)
  })
})

describe('Replace survey, from a floor far off the ground', () => {
  it('puts the floor at ground level instead of carrying a height that can’t have been meant', async () => {
    await startSketch(SKETCH)
    const sketchSite = readSite(projectsNow().opened!.survey!)
    const placed = placeOnSketch(garageFloor(), sketchSite)
    // 20 m under the sketch's ground: a level from another site's datum
    usePlan.getState().commit(() => ({ ...placed, placement: { ...placed.placement, ffl: placed.placement.ffl - 20 } }))
    const done = replaceSurvey(plane())
    const r = await review()
    expect(r.choices?.[0].detail).toMatch(/at ground level, as it was far from the ground before/)
    r.answer('centre')
    await done
    const to = readSite(plane())
    expect(Math.abs(floorRL(plan()) - groundAtHouse(plan(), to)!)).toBeLessThanOrEqual(0.025 + 1e-9)
  })
})

describe('Replace survey', () => {
  it('changes nothing when cancelled', async () => {
    const id = await garageOnPlane()
    const before = { records: await records(id), plan: plan() }
    const done = replaceSurvey(plane('revised.dxf'))
    ;(await review()).answer(null)
    await done
    expect(await records(id)).toEqual(before.records)
    expect(plan()).toBe(before.plan)
    expect(useSafety.getState().toast).toBeNull()
  })

  it('keeps the house where it is when it sits on the new block, and keeps the old survey', async () => {
    const id = await garageOnPlane()
    const old = projectsNow().opened!.survey!
    const before = plan()
    const done = replaceSurvey(plane('revised.dxf'))
    const r = await review()
    expect(r.title).toBe('Replace the survey with revised.dxf?')
    expect(r.choices?.map(c => c.id)).toEqual(['keep', 'centre'])
    expect(r.warning).toBeNull()
    expect(r.changes[0]).toBe('The survey: plane.dxf becomes revised.dxf.')
    expect(r.kept).toContain('plane.dxf, with its layer settings: Undo, or Replace survey later, can put it back.')
    r.answer('keep')
    await done
    expect(plan()).toBe(before)
    const after = await records(id)
    expect((after!.survey as SavedProject).fileName).toBe('revised.dxf')
    expect(after?.['previous-survey']).toEqual(old)
    expect(projectsNow().opened?.previousSurvey).toEqual(old)

    await undo()
    const back = await records(id)
    expect(back?.survey).toEqual(old)
    expect(back?.['previous-survey']).toBeUndefined()
    expect(plan()).toBe(before)
  })

  it('suggests centring the house when the new survey is somewhere else, and says how far', async () => {
    await garageOnPlane()
    const before = plan()
    const aboveGround = floorRL(before) - groundAtHouse(before, readSite(plane()))!
    const done = replaceSurvey(plane('mga.dxf', [700, 0]))
    const r = await review()
    expect(r.choices?.map(c => c.id)).toEqual(['centre', 'keep'])
    expect(r.warning).toMatch(/outside your block, about 700 m from it/)
    for (const c of r.choices!) expect(c.thumb?.block).toMatch(/^M/)
    r.answer('centre')
    await done
    const to = readSite(plane('mga.dxf', [700, 0]))
    expect(fitOnBlock(plan(), to.survey).fit).toBe('inside')
    // centred, its floor keeps its height above the ground at its middle, to the nearest 50 mm
    expect(Math.abs(floorRL(plan()) - (groundAtHouse(plan(), to)! + aboveGround))).toBeLessThanOrEqual(0.025 + 1e-9)
    const twentieths = floorRL(plan()) * 20
    expect(Math.abs(twentieths - Math.round(twentieths))).toBeLessThan(1e-6)
  })
})

describe('Import plan', () => {
  it('asks to replace the plan, shows its floor area and floors, and warns when it lands off the block', async () => {
    const id = await garageOnPlane()
    usePlan.getState().commit(p => ({ ...p, walls: p.walls.slice(0, 4) }))
    const before = plan()
    const incoming: Plan = { ...garageFloor(), placement: { ...garageFloor().placement, e: 1705 } }
    const done = importPlan(incoming, 'house-plan.json')
    const r = await review()
    expect(r.title).toBe('Replace your plan with house-plan.json?')
    expect(r.facts).toEqual(
      expect.arrayContaining([
        { label: 'Floor area', value: m2(totalFloorArea(incoming)) },
        { label: 'Floors', value: '1 floor: Ground floor' },
      ]),
    )
    expect(r.warning).toBe('Where the file puts it, the house would land outside your block, about 700 m from it.')
    expect(r.choices?.map(c => c.id)).toEqual(['centre', 'keep'])
    expect(plan()).toBe(before)
    r.answer('centre')
    await done
    const site = readSite(plane())
    expect(plan().walls).toEqual(incoming.walls)
    expect(fitOnBlock(plan(), site.survey).fit).toBe('inside')
    expect(floorRL(plan())).toBeCloseTo(84, 6) // its floor already suits this block, so it stays
    expect(projectsNow().currentId).toBe(id)

    await undo()
    expect(plan()).toEqual(before)
    expect((await records(id))?.plan).toEqual(before)
  })

  it('suggests centring a plan whose floor belongs to another site’s levels, and says why', async () => {
    await garageOnPlane()
    const site = readSite(plane())
    const { minRL, maxRL } = site.terrain.stats
    // On the block, but its floor 20 m down: drawn on a survey with another datum.
    const incoming: Plan = { ...garageFloor(), placement: { ...garageFloor().placement, ffl: garageFloor().placement.ffl - 20 } }
    const done = importPlan(incoming, 'other-datum.json')
    const r = await review()
    expect(r.choices?.map(c => c.id)).toEqual(['centre', 'keep'])
    expect(r.warning).toMatch(new RegExp(`^Its floor, RL ${floorRL(incoming).toFixed(2)}, is about \\d+ m below the lowest ground on this block \\(RL ${minRL.toFixed(2)}\\)\\.$`))
    r.answer('centre')
    await done
    expect(floorRL(plan())).toBeGreaterThanOrEqual(minRL)
    expect(floorRL(plan())).toBeLessThanOrEqual(maxRL)
  })

  it('needs no choice for a plan that sits on the block', async () => {
    await garageOnPlane()
    const done = importPlan(garageFloor(), 'same.json')
    const r = await review()
    expect(r.warning).toBeNull()
    expect(r.choices).toEqual([])
    expect(r.thumb?.house).toMatch(/^M/)
    r.answer('ok')
    await done
    expect(plan().walls).toEqual(garageFloor().walls)
  })
})

describe('New plan', () => {
  it('reviews, clears the plan in the same spot, and Undo brings it back exactly', async () => {
    const id = await garageOnPlane()
    const before = plan()
    const done = newPlan()
    const r = await review()
    expect(r.kind).toBe('new-plan')
    expect(r.facts[0].value).toMatch(/^10 walls, 4 rooms, 1 outdoor area · /)
    r.answer('ok')
    await done
    expect(plan().walls).toEqual([])
    expect(plan().placement).toEqual(before.placement)
    await undo()
    expect(plan()).toEqual(before)
    expect((await records(id))?.plan).toEqual(before)
  })
})

describe('Open project file', () => {
  it('shows the name, survey and plan, opens it as a new project, and Undo goes back', async () => {
    const first = await garageOnPlane()
    const firstName = projectsNow().list.find(m => m.id === first)!.name
    const text = projectFileText(plane('their-survey.dxf'), { ...garageFloor(), name: 'Their house' })
    const done = openRead(detectFile('their-house.project.json', text))
    const r = await review()
    expect(r.kind).toBe('open-project')
    expect(r.replaces).toBe(false)
    expect(r.facts).toEqual(
      expect.arrayContaining([
        { label: 'Name', value: 'Their house' },
        { label: 'Survey', value: 'their-survey.dxf' },
      ]),
    )
    expect(r.facts.find(f => f.label === 'Plan')?.value).toMatch(/^10 walls, 4 rooms/)
    expect(r.kept).toEqual([`“${firstName}” stays as it is, under All projects.`])
    r.answer('ok')
    await done
    const opened = projectsNow().list.find(m => m.id === projectsNow().currentId)!
    expect(opened.name).toBe('Their house')
    expect(opened.id).not.toBe(first)

    await undo()
    expect(projectsNow().currentId).toBe(first)
    expect(projectsNow().list.find(m => m.id === opened.id)?.archived).toBe(true)
  })

  it('names it as it will be named when a project of that name is already here', async () => {
    const text = projectFileText(plane(), { ...garageFloor(), name: 'Same name' })
    await projectActions.create({ survey: plane(), plan: { ...garageFloor(), name: 'Same name' } })
    await projectActions.rename(projectsNow().currentId!, 'Same name')
    const done = openRead(detectFile('same.project.json', text))
    const r = await review()
    expect(r.title).toBe('Open “Same name 2” as a new project?')
    expect(r.kept).toEqual(['“Same name” stays as it is, under All projects.'])
    r.answer('ok')
    await done
    expect(projectsNow().list.find(m => m.id === projectsNow().currentId)?.name).toBe('Same name 2')
  })
})

describe('deleting a project for good', () => {
  it('can be undone until the toast goes, and leaves the project exactly as it was', async () => {
    const id = await garageOnPlane()
    await projectActions.archive(id)
    const meta = projectsNow().list.find(m => m.id === id)!
    const recs = await projectActions.read(id)
    const putBack = projectActions.deleteSoon(id)
    expect(projectsNow().list.some(m => m.id === id)).toBe(false)
    putBack()
    expect(projectsNow().list.find(m => m.id === id)).toEqual(meta)
    expect(await projectActions.read(id)).toEqual(recs)

    projectActions.deleteSoon(id)
    await projectActions.finishDelete(id)
    expect(await projectActions.read(id)).toBeNull()
    expect(projectsNow().list.some(m => m.id === id)).toBe(false)
  })

  it('refuses a project that isn’t archived', async () => {
    const id = await garageOnPlane()
    expect(() => projectActions.deleteSoon(id)).toThrow(/Archive a project/)
  })
})
