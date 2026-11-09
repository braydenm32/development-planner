// The example project: the made-up survey in samples/ with a finished made-up house on it. It
// has to open like any project file, sit inside its block, and give sensible numbers everywhere
// the app looks: earthworks, the checks and the costs.

import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { measure } from '../../checks/measure'
import { countChecks, runChecks } from '../../checks/rules'
import { estimate } from '../../costs/estimate'
import { pointInPolygon, type Vec2 } from '../../lib/geom'
import { balancedFloorRL, movesFloor, tallestRoof } from '../../plan/keyNumbers'
import { floorRL, normalizePlan, sortedLevels, toSite } from '../../plan/model'
import { designQuantities } from '../../plan/quantities'
import { retainingProfiles } from '../../plan/retaining'
import { streetSideOf } from '../../plan/streetSide'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { ensureProjects, projectActions, projectsNow } from '../../projects/session'
import { readSite } from '../../safety/files'
import { undoToast, useSafety } from '../../safety/store'
import { parseProjectFile } from '../../share/project'
import { EXAMPLE_NAME } from '../examplePlan'
import { exampleProjectText } from '../exampleProject'
import { openExample } from '../open'
import { sampleSurveyDxf } from '../sampleSurvey'

const opened = parseProjectFile(exampleProjectText())
const plan = opened.plan
const site = readSite(opened.survey)
const earth = earthFrom(site.terrain.grid, site.survey.boundary, earthInputs(plan, site.survey))

describe('the example project', () => {
  it('is the sample survey from samples/, made by the same maths', () => {
    expect(sampleSurveyDxf() + '\n').toBe(readFileSync('samples/sample-block.dxf', 'utf8'))
    expect(opened.survey.fileName).toBe('sample-block.dxf')
  })

  it('opens as a project file, already in its saved form', () => {
    expect(plan.name).toBe(EXAMPLE_NAME)
    expect(normalizePlan(plan)).toEqual(plan)
    expect(opened.site?.data.features.map(f => f.type)).toEqual(['tree'])
    expect(opened.costs).not.toBeNull()
  })

  it('is a whole house: two levels, rooms, doors and windows, roofs, a stair, outside areas, furniture and a retaining wall', () => {
    expect(sortedLevels(plan).map(l => l.name)).toEqual(['Living level', 'Bedroom level'])
    expect(plan.rooms.length).toBeGreaterThanOrEqual(10)
    expect(plan.openings.filter(o => o.kind === 'door').length).toBeGreaterThanOrEqual(5)
    expect(plan.openings.filter(o => o.kind === 'window').length).toBeGreaterThanOrEqual(6)
    expect(plan.openings.some(o => o.kind === 'garage')).toBe(true)
    expect(plan.roofs).toHaveLength(2)
    expect(plan.stairs).toHaveLength(1)
    expect(plan.areas.map(a => a.kind).sort()).toEqual(['deck', 'driveway', 'garden'])
    expect(plan.furniture.length).toBeGreaterThanOrEqual(10)
    expect(plan.walls.filter(w => w.kind === 'retaining')).toHaveLength(1)
  })

  it('stays inside the block: every wall, roof, area and piece of furniture', () => {
    const inside = (p: Vec2) => pointInPolygon(...toSite(p, plan.placement, site.survey.origin), site.survey.boundary)
    const pts: Vec2[] = [...plan.walls.flatMap(w => [w.a, w.b]), ...plan.roofs.flatMap(r => r.pts), ...plan.areas.flatMap(a => a.pts), ...plan.furniture.map(f => f.at), ...plan.rooms.map(r => r.at)]
    expect(pts.filter(p => !inside(p))).toEqual([])
  })

  it('has its cut and fill worked out, and about in balance', () => {
    expect(earth.result.cut).toBeGreaterThan(10)
    expect(earth.result.fill).toBeGreaterThan(10)
    expect(movesFloor(balancedFloorRL(plan, earth.prep), floorRL(plan))).toBe(false)
    // The step's retaining wall holds the bedroom level's pad, under 1 m so no engineer is needed.
    const [wall] = retainingProfiles(plan, site.survey.origin, earth.result.grid)
    expect(wall.maxHeight).toBeGreaterThan(0.5)
    expect(wall.maxHeight).toBeLessThan(1)
  })

  it('faces the street on the south side, for the checks and Street view alike', () => {
    const ms = measure({ plan, survey: site.survey, terrain: site.terrain, earth })
    expect(ms.edges.find(e => e.role === 'front')?.label).toBe('South side')
    expect(streetSideOf(plan, site.survey.boundary)).toBe('S')
  })

  it('passes the CDC checks, with one thing to check (the retaining wall)', () => {
    const ms = measure({ plan, survey: site.survey, terrain: site.terrain, earth })
    const rs = runChecks(ms, 'cdc')
    expect(rs.filter(r => r.status === 'fail').map(r => r.title)).toEqual([])
    expect(rs.filter(r => r.status === 'unknown').map(r => r.title)).toEqual([])
    expect(rs.filter(r => r.status === 'warn').map(r => r.title)).toEqual(['Retaining walls'])
    expect(countChecks(rs).pass).toBeGreaterThanOrEqual(10)
    // A split level beside the living level is one storey, so the height is from the roof.
    expect(tallestRoof(plan, site.survey, site.terrain)!.height).toBeLessThan(8.5)
  })

  it('has a cost for every line, in a sensible range per square metre', () => {
    const walls = retainingProfiles(plan, site.survey.origin, earth.result.grid)
    const e = estimate(designQuantities(plan, earth.result, walls), opened.costs!)
    expect(e.lines.filter(l => l.missing).map(l => l.label)).toEqual([])
    expect(e.total).toBeGreaterThan(300_000)
    expect(e.perM2!).toBeGreaterThan(1500)
    expect(e.perM2!).toBeLessThan(4000)
  })
})

describe('Open an example', () => {
  beforeAll(() => ensureProjects())
  beforeEach(() => {
    useSafety.setState({ review: null, toast: null, busy: false })
    vi.stubGlobal('location', { hash: '' })
    vi.stubGlobal('history', { state: null, pushState: () => {}, replaceState: () => {} })
  })

  it('makes a new project each time, beside the others, and Undo tucks it away again', async () => {
    const mine = await projectActions.create({ survey: opened.survey, plan: { ...plan, name: 'My house', walls: [] } })
    const before = await projectActions.read(mine.id)
    const current = () => projectsNow().list.find(m => m.id === projectsNow().currentId)!
    await openExample()
    const first = current()
    expect(first.id).not.toBe(mine.id)
    expect(first.name).toBe(EXAMPLE_NAME)
    await openExample()
    const second = current()
    expect(second.id).not.toBe(first.id)
    expect(second.name).not.toBe(EXAMPLE_NAME)
    // Nothing that was there is touched.
    await projectActions.flush()
    expect(await projectActions.read(mine.id)).toEqual(before)
    expect(projectsNow().list.filter(m => !m.archived)).toHaveLength(3)

    // Undo puts the second example away and goes back to the first.
    const t = useSafety.getState().toast!
    expect(t.text).toMatch(/made-up house on a made-up block/)
    await undoToast(t.id)
    await projectActions.flush()
    expect(projectsNow().list.find(m => m.id === second.id)?.archived).toBe(true)
    expect(projectsNow().currentId).toBe(first.id)
  })
})
