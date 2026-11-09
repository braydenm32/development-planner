// Earthworks changes from the audit (batch G): retaining walls drawn as one run that asks once,
// what a wall changes, walls named by where they are, each level's ground, a new house's floor,
// Balance's preview and the slope words.

import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { emptyCosts } from '../../costs/model'
import { balancePreview, balanceRows } from '../../grading/balance'
import { batterLabel } from '../../grading/words'
import { clockwiseOf, rotationFromClockwise } from '../../components/placeActions'
import { firstFloorPlan, levelGrounds, meanGroundUnder } from '../levelGround'
import { areaKind, floorRL, fromSite, type Area, type Plan, type Wall } from '../model'
import { asDriveway, driveReason, driveSlabs } from '../driveFromSlab'
import type { Vec2 } from '../../lib/geom'
import { retainingProfile } from '../retaining'
import { answerRunHeight, cancelNewRetaining, extendRun, keepNewRetaining, newRetainingWall, placeRetainingWall, useRetaining } from '../retainingSession'
import { usePlan } from '../store'
import { earthFrom, earthInputs } from '../useEarthworks'
import { wallChange, wallChangeText } from '../wallChange'
import { retainingNames } from '../wallNames'
import { garageFloor } from './fixtures'

function setup() {
  const doc = parseDxf(planeSurvey())
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  const terrain = buildTerrain(survey)
  const plan: Plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
  return { plan, survey, terrain }
}

const walls = () => usePlan.getState().plan!.walls.filter(w => w.kind === 'retaining')

describe('the Retaining wall tool draws a run and asks once', () => {
  it('carries on from each end, holding back the same side, and Keep keeps every piece', () => {
    const { plan, survey, terrain } = setup()
    usePlan.getState().load(plan)
    const first = newRetainingWall(plan, 'level_ground', [-1, 17], [10, 17], 0.2, survey.origin, terrain.grid)
    placeRetainingWall(first, { draft: true })
    expect(useRetaining.getState().run).toEqual([first.id])
    const second = newRetainingWall(usePlan.getState().plan!, 'level_ground', [10, 17], [10, 22], 0.2, survey.origin, terrain.grid)
    expect(extendRun(second, survey.origin, terrain.grid)).toBe(true)
    expect(useRetaining.getState().run).toEqual([first.id, second.id])
    // The first stays selected: its panel asks for them all.
    expect(usePlan.getState().selection).toEqual({ type: 'wall', id: first.id })
    expect(walls().map(w => w.retain?.high)).toEqual([first.retain!.high, first.retain!.high])
    expect(walls().every(w => w.retain?.draft)).toBe(true)

    // One height answer goes to both, as one undoable step, and makes them real walls.
    const steps = usePlan.getState().past.length
    answerRunHeight(first.id, 1.2, survey.origin, terrain.grid)
    expect(usePlan.getState().past.length).toBe(steps + 1)
    expect(walls().map(w => w.retain?.askedHeight)).toEqual([1.2, 1.2])
    expect(walls().some(w => w.retain?.draft)).toBe(false)
    keepNewRetaining()
    expect(useRetaining.getState()).toMatchObject({ newWall: null, run: [] })
    expect(walls()).toHaveLength(2)
  })

  it('Cancel takes the whole run off', () => {
    const { plan, survey, terrain } = setup()
    usePlan.getState().load(plan)
    const first = newRetainingWall(plan, 'level_ground', [-1, 17], [10, 17], 0.2, survey.origin, terrain.grid)
    placeRetainingWall(first, { draft: true })
    extendRun(newRetainingWall(usePlan.getState().plan!, 'level_ground', [10, 17], [10, 22], 0.2, survey.origin, terrain.grid), survey.origin, terrain.grid)
    expect(walls()).toHaveLength(2)
    cancelNewRetaining()
    expect(walls()).toHaveLength(0)
  })

  it('has no run to carry on before the first piece', () => {
    const { plan, survey, terrain } = setup()
    usePlan.getState().load(plan)
    useRetaining.setState({ newWall: null, run: [] })
    expect(extendRun(newRetainingWall(plan, 'level_ground', [0, 17], [5, 17], 0.2, survey.origin, terrain.grid), survey.origin, terrain.grid)).toBe(false)
  })
})

describe('what a retaining wall changes', () => {
  it('counts the cut and fill it adds, how far it reworks the ground, and its cost', () => {
    const { plan, survey, terrain } = setup()
    const w: Wall = { id: 'rw', level: 'level_ground', a: [-1, 17], b: [10, 17], thickness: 0.2, kind: 'retaining', retain: { high: 'left', highLevel: 'pad' } }
    const withWall: Plan = { ...plan, walls: [...plan.walls, w] }
    const earth = earthFrom(terrain.grid, survey.boundary, earthInputs(withWall, survey))
    const without = earthFrom(terrain.grid, survey.boundary, earthInputs(plan, survey))
    const c = wallChange(withWall, w, survey, terrain.grid, earth, emptyCosts())
    expect(c.cut).toBeCloseTo(earth.result.cut - without.result.cut, 9)
    expect(c.fill).toBeCloseTo(earth.result.fill - without.result.fill, 9)
    expect(c.cells.length).toBeGreaterThan(0)
    expect(c.reach).toBeGreaterThan(0)
    expect(c.height).toBeCloseTo(retainingProfile(w, withWall, survey.origin, earth.result.grid).maxHeight, 9)
    expect(c.cost).toBeGreaterThan(0)
    const text = wallChangeText(c, n => `$${Math.round(n)}`)
    expect(text).toMatch(/m wall ≈ \$\d+$/)
    expect(text).toContain(`${c.height.toFixed(2)} m wall`)
  })
})

describe('retaining walls named by where they are', () => {
  it('gives the compass side from the house and what the wall is by, numbering two the same', () => {
    const { plan, survey } = setup()
    const north: Wall = { id: 'n1', level: 'level_ground', a: [0, 16], b: [9, 16], thickness: 0.2, kind: 'retaining' }
    const north2: Wall = { id: 'n2', level: 'level_ground', a: [0, 16.5], b: [9, 16.5], thickness: 0.2, kind: 'retaining' }
    const names = retainingNames({ ...plan, walls: [...plan.walls, north, north2] }, survey)
    expect(names.get('n1')).toMatch(/^North (yard wall|wall by .+|boundary wall) \(1\)$/)
    expect(names.get('n2')).toMatch(/^North .* \(2\)$/)
  })
})

describe('Earthworks › Place', () => {
  it('lists each level with its floor and the ground under it', () => {
    const { plan, survey, terrain } = setup()
    const rows = levelGrounds(plan, survey.origin, terrain.grid)
    expect(rows).toHaveLength(plan.levels.length)
    expect(rows[0].floor).toBe(floorRL(plan))
    expect(rows[0].ground!.min).toBeLessThanOrEqual(rows[0].ground!.max)
  })

  it("starts a new house's floor at the mean ground under its first walls", () => {
    const { plan, survey, terrain } = setup()
    const empty: Plan = { ...plan, walls: [], rooms: [], openings: [], areas: [] }
    const first = firstFloorPlan(empty, plan, survey, terrain.grid)
    const lowest = plan.walls.filter(w => w.kind !== 'retaining' && w.level === plan.levels[0].id)
    const mean = meanGroundUnder(lowest, plan, survey, terrain.grid)!
    expect(first).not.toBeNull()
    expect(first!.rl).toBeCloseTo(Math.round(mean * 20) / 20, 9)
    expect(floorRL(first!.plan)).toBeCloseTo(first!.rl, 9)
    // Not once the house has walls.
    expect(firstFloorPlan(plan, plan, survey, terrain.grid)).toBeNull()
  })

  it('shows the turn clockwise and takes it back', () => {
    expect(clockwiseOf(-15)).toBe(15)
    expect(clockwiseOf(15)).toBe(345)
    expect(clockwiseOf(0)).toBe(0)
    expect(rotationFromClockwise(15)).toBe(-15)
    expect(rotationFromClockwise(345)).toBe(15)
    expect(rotationFromClockwise(clockwiseOf(37.5))).toBe(37.5)
  })
})

describe('Balance asks first', () => {
  it('previews the floor, cut and fill before and after, without changing the plan', () => {
    const { plan, survey, terrain } = setup()
    const high: Plan = { ...plan, placement: { ...plan.placement, ffl: floorRL(plan) + 1.5 } }
    const earth = earthFrom(terrain.grid, survey.boundary, earthInputs(high, survey))
    const p = balancePreview(high, survey, terrain, earth, () => 0)!
    expect(p).not.toBeNull()
    expect(p.before.ffl).toBe(floorRL(high))
    expect(floorRL(p.plan)).toBeCloseTo(p.to, 9)
    expect(Math.abs(p.after.net)).toBeLessThan(Math.abs(p.before.net))
    const rows = balanceRows(p)
    expect(rows[0]).toMatchObject({ label: 'Floor', before: `RL ${p.before.ffl.toFixed(2)}`, after: `RL ${p.to.toFixed(2)}`, changed: true })
    expect(rows.map(r => r.label)).toContain('Checks that fail')
  })
})

describe('slopes in words', () => {
  it('gives the ratio with its angle, once', () => {
    expect(batterLabel(2)).toBe('1 in 2 (27°)')
    expect(batterLabel(1)).toBe('1 in 1 (45°)')
    expect(batterLabel(0)).toBe('Retaining wall (vertical)')
  })
})

describe('a driveway drawn as a concrete slab', () => {
  it('is offered as a driveway by its name, or by reaching the street side', () => {
    const { plan, survey } = setup()
    const sq = (x: number, y: number): Vec2[] => [
      [x, y],
      [x + 3, y],
      [x + 3, y + 3],
      [x, y + 3],
    ]
    const named: Area = { id: 'a1', level: 'level_ground', pts: sq(20, 20), name: 'Concrete slab driveway', kind: 'slab' }
    const patio: Area = { id: 'a2', level: 'level_ground', pts: sq(30, 20), name: 'Patio', kind: 'slab' }
    // A slab with a corner on the first boundary edge's middle.
    const b = survey.boundary
    const mid: Vec2 = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]
    const m = fromSite(mid, plan.placement, survey.origin)
    const atStreet: Area = { id: 'a3', level: 'level_ground', pts: sq(m[0], m[1]), name: 'Slab', kind: 'slab' }
    const p: Plan = { ...plan, areas: [named, patio, atStreet] }
    expect(driveReason(named, p, survey)).toBe('name')
    expect(driveReason(patio, p, survey)).toBeNull()
    // Only once the street side is known.
    expect(driveReason(atStreet, p, survey)).toBeNull()
    const withStreet: Plan = { ...p, checks: { ...(p.checks ?? {}), frontEdge: 0 } as Plan['checks'] }
    expect(driveReason(atStreet, withStreet, survey)).toBe('street')
    expect(driveSlabs(withStreet, survey).map(x => x.area.id)).toEqual(['a1', 'a3'])
    const made = asDriveway(withStreet, 'a1')
    expect(areaKind(made.areas.find(a => a.id === 'a1')!)).toBe('driveway')
    expect(made.areas.find(a => a.id === 'a1')!.name).toBe('Concrete slab driveway')
    expect(driveSlabs(made, survey).map(x => x.area.id)).toEqual(['a3'])
  })
})
