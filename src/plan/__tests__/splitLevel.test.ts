// A split level beside a lower pad (the audit's DB-01 design): a 10 × 8 m ground floor at FFL
// RL 45.10 on the sample block, with a 4 × 8 m split level at RL 46.60 sharing its west wall line.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { impliedTotals, impliedWalls } from '../../grading/implied'
import { levelLabel } from '../../components/retainingWords'
import { sectionDrawing } from '../../sections/section'
import { buildingFootprint, levelFloorAreas, levelsBeside } from '../geometry'
import { levelSummaries } from '../keyNumbers'
import { normalizePlan, padLevelOf, toSite, type Plan, type Wall } from '../model'
import { designQuantities } from '../quantities'
import { earthworksPlatforms, padSteps, pierOutlines, piersId } from '../platforms'
import { addEdgeWalls, houseEdgeWalls } from '../retainEdges'
import { nearestPadLevel, padLevels, retainingProfile } from '../retaining'
import { newRetainingWall } from '../retainingSession'
import { earthFrom, earthInputs } from '../useEarthworks'

const SAMPLE_DXF = new URL('../../../samples/sample-block.dxf', import.meta.url)

export function sampleSite() {
  const doc = parseDxf(readFileSync(SAMPLE_DXF, 'utf8'))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const G = 'level_ground'
const S = 'level_split'

const box = (level: string, x0: number, y0: number, x1: number, y1: number): Wall[] =>
  (
    [
      [[x0, y0], [x1, y0]],
      [[x1, y0], [x1, y1]],
      [[x1, y1], [x0, y1]],
      [[x0, y1], [x0, y0]],
    ] as [[number, number], [number, number]][]
  ).map(([a, b], i) => ({ id: `${level}_${i}`, level, a, b, thickness: 0.27, kind: 'external' }))

/** The split-level design, in the middle of the sample block. */
export function splitLevelPlan(split: 'slab' | 'piers' = 'slab'): Plan {
  return normalizePlan({
    version: 1,
    levels: [
      { id: G, name: 'Ground floor', elevation: 0, height: 2.7, floorType: 'slab' },
      { id: S, name: 'Split level', elevation: 1.5, height: 2.7, floorType: split },
    ],
    walls: [...box(G, -5, -4, 5, 4), ...box(S, -9, -4, -5, 4)],
    openings: [],
    rooms: [],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 5011.68, n: 8017.25, rotation: -1.2, ffl: 45.1 },
    floorsByLevel: true,
  })
}

const earthOf = (plan: Plan, site = sampleSite()) => ({ ...site, plan, earth: earthFrom(site.terrain.grid, site.survey.boundary, earthInputs(plan, site.survey)) })

describe('a split level slab beside a lower pad (DB-01)', () => {
  it('stops each pad at the line between them: the upper slab sits on its ground', () => {
    const { survey, earth, plan } = earthOf(splitLevelPlan())
    // Before, the lower pad's batter was dug on under the upper slab: cut 85.2, fill 18.8 m³, with
    // air under the slab. A hand integration with the step held on the shared line gives 56.8 and
    // 24.9 m³ (61.4 and 24.0 with the lower pad's 0.5 m level margin let in under the upper slab).
    expect(earth.result.cut).toBeGreaterThan(54)
    expect(earth.result.cut).toBeLessThan(62)
    expect(earth.result.fill).toBeGreaterThan(23)
    expect(earth.result.fill).toBeLessThan(26.5)
    // The ground under the split level's slab is its own pad, right up to the step.
    for (const x of [-8.5, -7, -5.6]) {
      for (const y of [-3.5, 0, 3.5]) {
        const p = toSite([x, y], plan.placement, survey.origin)
        expect(earth.result.grid.sample(p[0], p[1])).toBeCloseTo(46.3, 1)
      }
    }
    // And the lower pad is its own, right up to the same line.
    const q = toSite([-4.6, 0], plan.placement, survey.origin)
    expect(earth.result.grid.sample(q[0], q[1])).toBeCloseTo(44.8, 1)
  })

  it('counts the step as an implied wall, whatever the slopes are', () => {
    const { survey, earth } = earthOf(splitLevelPlan())
    const steps = padSteps(earth.platforms)
    expect(steps).toHaveLength(1)
    expect(steps[0].high - steps[0].low).toBeCloseTo(1.5, 6)
    expect(Math.hypot(steps[0].b[0] - steps[0].a[0], steps[0].b[1] - steps[0].a[1])).toBeCloseTo(8.27, 1)
    const walls = impliedWalls(survey, earth)
    expect(walls).toHaveLength(1)
    expect(walls[0]).toMatchObject({ rule: 'implied', step: true, engineer: true })
    expect(walls[0].height).toBeCloseTo(1.5, 6)
    const totals = impliedTotals(walls)!
    expect(totals.count).toBe(1)
    expect(totals.face).toBeCloseTo(8.27 * 1.5, 0)
    expect(totals.engineer).toBe(1)
    // With vertical slopes the step is listed with the vertical edges, the tallest of them.
    const vertical = earthOf({ ...splitLevelPlan(), earthworks: { margin: 0.5, cutBatter: 0, fillBatter: 0, subfloor: 0.4 } })
    const all = impliedWalls(vertical.survey, vertical.earth)
    expect(all.filter(w => w.step)).toHaveLength(1)
    expect(all.length).toBeGreaterThan(1)
    expect(Math.max(...all.map(w => w.height))).toBeCloseTo(1.5, 6)
  })

  it('is one wall once a retaining wall is drawn along the step, and Retain the edges draws it', () => {
    const base = splitLevelPlan()
    const edges = houseEdgeWalls(base)
    // The lower floor's west side is the step: kept. The split level's east side is over the lower floor: not.
    const stepWall = edges.find(w => w.level === G && Math.abs(w.a[0] + 5.235) < 1e-6 && Math.abs(w.b[0] + 5.235) < 1e-6)
    expect(stepWall).toBeTruthy()
    expect(edges.filter(w => w.level === S)).toHaveLength(3)
    const { survey, terrain, earth, plan } = earthOf(addEdgeWalls(base, edges))
    expect(impliedWalls(survey, earth)).toHaveLength(0)
    const drawn = plan.walls.find(w => w.kind === 'retaining' && Math.abs(w.a[0] + 5.235) < 1e-6 && Math.abs(w.b[0] + 5.235) < 1e-6)!
    expect(retainingProfile(drawn, plan, survey.origin, earth.result.grid).maxHeight).toBeCloseTo(1.5, 1)
    expect(terrain.grid.cell).toBeGreaterThan(0)
  })

  it('draws the step in a section through both levels', () => {
    const site = sampleSite()
    const plan = splitLevelPlan()
    const { earth } = earthOf(plan, site)
    const d = sectionDrawing({ id: 's', label: 'A', a: [-11, 0], b: [7, 0] }, { plan, survey: site.survey, terrain: site.terrain, finished: earth.result.grid })
    expect(d.retaining).toHaveLength(1)
    expect(d.retaining[0].z1).toBeCloseTo(46.3, 6)
    expect(d.retaining[0].z0).toBeCloseTo(44.5, 6)
    // 5.865 m along: the lower floor's outside face.
    expect((d.retaining[0].s0 + d.retaining[0].s1) / 2).toBeCloseTo(5.865, 2)
  })

  it('leaves a single pad, and two pads at one level, as they were', () => {
    const one = normalizePlan({ ...splitLevelPlan(), levels: splitLevelPlan().levels.slice(0, 1), walls: splitLevelPlan().walls.filter(w => w.level === G) })
    expect(padSteps(earthOf(one).earth.platforms)).toHaveLength(0)
    const flat = splitLevelPlan()
    flat.levels[1].elevation = 0.05
    expect(padSteps(earthOf(flat).earth.platforms)).toHaveLength(0)
  })
})

describe('a level on piers (DB-06)', () => {
  it('is on piers for cut and fill as soon as it has an outline, room names or not', () => {
    const slab = earthOf(splitLevelPlan('slab'))
    const piers = earthOf(splitLevelPlan('piers'))
    expect(pierOutlines(piers.plan, S)).toHaveLength(1)
    expect(pierOutlines(slab.plan, S)).toHaveLength(0)
    expect(piers.earth.platforms.some(p => p.id === piersId(piers.plan, S))).toBe(true)
    expect(Math.abs(piers.earth.result.cut - slab.earth.result.cut) + Math.abs(piers.earth.result.fill - slab.earth.result.fill)).toBeGreaterThan(1)
    // Naming a room on it changes nothing more.
    const named = earthOf({ ...piers.plan, rooms: [{ id: 'r', level: S, name: 'Rumpus', at: [-7, 0] }] })
    expect(named.earth.result.cut).toBeCloseTo(piers.earth.result.cut, 6)
    expect(named.earth.result.fill).toBeCloseTo(piers.earth.result.fill, 6)
    // A room that says slab on a piers level is still a pad.
    const mixed = { ...piers.plan, rooms: [{ id: 'r', level: S, name: 'Garage', at: [-7, 0] as [number, number], foundation: 'slab' as const }] }
    expect(pierOutlines(mixed, S)).toHaveLength(0)
  })
})

describe('a retaining wall beside the split level (DB-12)', () => {
  it('relates to the part of the house it sits beside, whatever level was open', () => {
    const { survey, terrain, plan } = earthOf(splitLevelPlan())
    // 1 m west (uphill) of the split level, drawn with the Ground floor open.
    const w = newRetainingWall(plan, G, [-10.2, -5], [-10.2, 5], 0.2, survey.origin, terrain.grid)
    expect(nearestPadLevel(plan, w)).toBe(S)
    expect(w.level).toBe(G)
    expect(w.retain?.pad).toBe(S)
    expect(padLevelOf(plan, w)).toBe(S)
    // Its open side goes to the split level's pad, not a bench dug down to the lowest pad.
    expect(w.retain?.lowLevel).toBe('pad')
    const withWall = { ...plan, walls: [...plan.walls, w] }
    const bench = earthworksPlatforms(withWall, survey.origin).find(p => p.id?.startsWith('bench:'))!
    expect(bench.level).toBeCloseTo(46.3, 6)
    // Drawn with the Split level open it's the same wall, and needs no note of its pad.
    const same = newRetainingWall(plan, S, [-10.2, -5], [-10.2, 5], 0.2, survey.origin, terrain.grid)
    expect(same.retain?.pad).toBeUndefined()
    expect(same.retain?.lowLevel).toBe('pad')
    // East of the lower floor it's the Ground floor's, whichever level is open.
    const east = newRetainingWall(plan, S, [6.5, -5], [6.5, 5], 0.2, survey.origin, terrain.grid)
    expect(padLevelOf(plan, east)).toBe(G)
    // An older wall with no note keeps its own level.
    const old: Pick<Wall, 'level' | 'retain'> = { level: G, retain: { high: 'left' } }
    expect(padLevelOf(plan, old)).toBe(G)
    expect(padLevels(plan)).toEqual([G, S])
  })
})

describe('a level named in a retaining wall row (LF-28, AX-36)', () => {
  it('never doubles the word level', () => {
    expect(levelLabel('Living level')).toBe('Living level')
    expect(levelLabel('Ground floor')).toBe('Ground floor')
    expect(levelLabel('Rumpus')).toBe('Rumpus level')
  })
})

describe('the wall two split levels share (DB-11)', () => {
  it('is counted once in the floor area, and the areas add up to what the house covers', () => {
    const plan = splitLevelPlan()
    const levels = levelSummaries(plan)
    // 10.27 × 8.27 for the ground floor; the split level's 4.27 × 8.27 less the 0.27 m wall strip it shares.
    expect(levels[0].gross.area).toBeCloseTo(10.27 * 8.27, 6)
    expect(levels[1].gross.area).toBeCloseTo(4 * 8.27, 6)
    const total = levels.reduce((t, l) => t + l.gross.area, 0)
    expect(total).toBeCloseTo(buildingFootprint(plan), 6)
    expect(total).toBeCloseTo(14.27 * 8.27, 6)
    const q = designQuantities(plan, null, [])
    expect(q.floorArea).toBeCloseTo(total, 6)
    expect(q.ground!.area).toBeCloseTo(total, 6)
    expect(levelFloorAreas(plan).get(S)).toBeCloseTo(4 * 8.27, 6)
  })

  it('is inside the house: clad only where it rises above the lower part, and a door in it is an internal door', () => {
    const plan = splitLevelPlan()
    const q = designQuantities(plan, null, [])
    // The outside of the whole house, 2 × (14.27 + 8.27) at 2.7 m high, and the 1.5 m of the split
    // level's wall (and its two 0.27 m ends) that stands above the lower part's ceiling. Before,
    // each level's own perimeter was clad full height, the shared 8.27 m wall twice over.
    const round = 2 * (14.27 + 8.27)
    expect(q.walls.perimeter).toBeCloseTo(round + 8.27 + 2 * 0.27, 1)
    expect(q.walls.gross).toBeCloseTo(round * 2.7 + (8.27 + 2 * 0.27) * 1.5, 0)
    expect(q.walls.gross).toBeLessThan(2 * (10.27 + 8.27) * 2.7 + 2 * (4.27 + 8.27) * 2.7 - 30)
    expect(q.walls.ids).toHaveLength(6)
    expect(q.walls.ids).not.toContain(`${G}_3`)
    expect(q.walls.ids).not.toContain(`${S}_1`)
    const door = { id: 'd', wall: `${S}_1`, kind: 'door' as const, offset: 4, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false }
    const withDoor = designQuantities({ ...plan, openings: [door] }, null, [])
    expect(withDoor.internalDoors.count).toBe(1)
    expect(withDoor.externalDoors.count).toBe(0)
    expect(withDoor.walls.openings).toBe(0)
  })

  it('leaves a storey over another, and a single level, as they were', () => {
    const stacked = splitLevelPlan()
    stacked.levels[1].elevation = 3
    const levels = levelSummaries(stacked)
    expect(levels[1].gross.area).toBeCloseTo(4.27 * 8.27, 6)
    expect(levelsBeside(stacked, S)).toHaveLength(0)
    expect(levelsBeside(splitLevelPlan(), S).map(l => l.id)).toEqual([G])
    const q = designQuantities(stacked, null, [])
    expect(q.walls.perimeter).toBeCloseTo(2 * (10.27 + 8.27) + 2 * (4.27 + 8.27), 6)
    expect(q.walls.ids).toHaveLength(8)
  })
})
