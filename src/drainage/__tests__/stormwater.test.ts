import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { signedArea } from '../../lib/geom'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { bearingName, buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Plan } from '../../plan/model'
import { addRoof } from '../../plan/ops'
import { levelOutlines, roofGeometry } from '../../plan/roof'
import { stormwaterOf } from '../model'
import {
  boundaryEdges,
  boundaryLowPoint,
  downpipeSpots,
  edgeFacing,
  fallReport,
  litresFromRain,
  rainHeldByTank,
  roofCatchments,
  SOURCES,
  streetEdgeOf,
  tankRoofs,
  totalCatchment,
  verdictText,
} from '../stormwater'

// The made-up sample block and the made-up garage floor; nothing here is a real place.
const SAMPLE_DXF = new URL('../../../samples/sample-block.dxf', import.meta.url)
const SAMPLE_PLACEMENT = { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }

function loadSample() {
  const doc = parseDxf(readFileSync(SAMPLE_DXF, 'utf8'))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

/** The garage floor with a hip roof over its outline, 450 mm eaves. */
function roofed(): Plan {
  const plan = garageFloor()
  const outline = levelOutlines(plan.walls)[0]
  return addRoof(plan, 'level_ground', outline, { type: 'hip', pitch: 22.5, overhang: 0.45 })
}

describe('roof catchment', () => {
  it('is the plan area of the roof with its eaves, smaller than the sloping surface', () => {
    const plan = roofed()
    const c = roofCatchments(plan)
    expect(c).toHaveLength(1)
    const g = roofGeometry(plan.roofs[0])
    expect(c[0].planArea).toBeCloseTo(Math.abs(signedArea(g.outline)), 6)
    // A 22.5° hip roof's surface is the plan area over cos(22.5°).
    expect(c[0].surfaceArea).toBeCloseTo(c[0].planArea / Math.cos((22.5 * Math.PI) / 180), 3)
    expect(c[0].surfaceArea).toBeGreaterThan(c[0].planArea)
    // The garage floor's outline covers about 9.8 × 13.7 m with notches; with 450 mm eaves the catchment lands near 125 m².
    expect(c[0].planArea).toBeGreaterThan(110)
    expect(c[0].planArea).toBeLessThan(140)
    expect(totalCatchment(c)).toBe(c[0].planArea)
  })

  it('leaves out a roof that will not build, and has none without roofs', () => {
    expect(roofCatchments(garageFloor())).toEqual([])
    const plan = roofed()
    const bad: Plan = { ...plan, roofs: [{ ...plan.roofs[0], pts: [plan.roofs[0].pts[0], plan.roofs[0].pts[1]] }] }
    expect(roofCatchments(bad)).toEqual([])
  })

  it('puts downpipe spots at the convex corners of the eaves', () => {
    const plan = roofed()
    const spots = downpipeSpots(plan)
    const g = roofGeometry(plan.roofs[0])
    expect(spots.length).toBeGreaterThanOrEqual(4)
    expect(spots.length).toBeLessThan(g.outline.length + 1)
    for (const s of spots) expect(g.outline.some(p => Math.hypot(p[0] - s[0], p[1] - s[1]) < 1e-9)).toBe(true)
  })
})

describe('the tank', () => {
  it('is plain arithmetic: 1 mm on 1 m² is 1 L', () => {
    expect(litresFromRain(120, 10)).toBe(1200)
    expect(rainHeldByTank(5000, 125)).toBe(40)
    expect(rainHeldByTank(5000, 0)).toBeNull()
  })

  it('drains every roof to the tank unless some are ticked', () => {
    const plan = roofed()
    const c = roofCatchments(plan)
    expect(tankRoofs(plan, c)).toEqual(c)
    expect(tankRoofs({ ...plan, stormwater: { tankLitres: 3000, tankRoofs: [] } }, c)).toEqual([])
    expect(tankRoofs({ ...plan, stormwater: { tankLitres: 3000, tankRoofs: [c[0].id] } }, c)).toEqual(c)
  })

  it('names a source for every rule it leans on, and suggests no tank size', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(3)
    for (const s of SOURCES) {
      expect(['read', 'secondary', 'unverified']).toContain(s.confidence)
      expect(s.asAt.length).toBeGreaterThan(0)
      expect(s.gives.length).toBeGreaterThan(0)
    }
    expect(stormwaterOf({}).tankLitres).toBe(0)
  })
})

describe('old plans', () => {
  it('load with the stormwater defaults', () => {
    const old = garageFloor()
    expect('stormwater' in old).toBe(false)
    const plan = normalizePlan(old)
    expect(stormwaterOf(plan)).toEqual({ tankLitres: 0 })
    expect(tankRoofs(plan, roofCatchments(plan))).toEqual([])
  })
})

describe('the fall of the sample block', () => {
  const { survey, terrain } = loadSample()
  const plan = normalizePlan({ ...roofed(), name: 'Sample house', placement: SAMPLE_PLACEMENT })

  it('finds the low point on the boundary where the ground is lowest', () => {
    const low = boundaryLowPoint(survey.boundary, terrain.grid)!
    expect(low).not.toBeNull()
    // No point on the boundary, sampled finely, is lower.
    for (const e of boundaryEdges(survey.boundary)) {
      for (let t = 0; t <= 1; t += 0.05) {
        const p = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t] as [number, number]
        expect(terrain.grid.sample(p[0], p[1])).toBeGreaterThanOrEqual(low.rl - 0.03)
      }
    }
    // It is on the side the block falls towards.
    const side = boundaryEdges(survey.boundary)[low.edge]
    const turn = Math.abs((((side.outBearing - terrain.stats.fallBearing) % 360) + 540) % 360 - 180)
    expect(turn).toBeLessThan(90)
    expect(low.rl).toBeGreaterThanOrEqual(terrain.stats.minRL - 0.05)
  })

  it('takes the street as the low side until the front is picked, then follows Lot facts', () => {
    const auto = streetEdgeOf(plan, survey, 'auto', terrain.stats.fallBearing)!
    expect(auto.from).toBe('low-side')
    expect(auto.edge).toBe(edgeFacing(survey.boundary, terrain.stats.fallBearing))
    const picked = streetEdgeOf(plan, survey, 'N', terrain.stats.fallBearing)!
    expect(picked.from).toBe('picked')
    expect(boundaryEdges(survey.boundary)[picked.edge].name).toBe('north side')
    const lot = streetEdgeOf({ ...plan, checks: { pathway: 'cdc', battleAxe: false, frontEdge: 2 } }, survey, 'N', terrain.stats.fallBearing)!
    expect(lot).toEqual({ edge: 2, from: 'lot-facts' })
  })

  it('drains to the street by gravity when the street is the low side', () => {
    const r = fallReport(plan, survey, terrain, streetEdgeOf(plan, survey, 'auto', terrain.stats.fallBearing))
    expect(r.verdict).toBe('street')
    expect(r.house).not.toBeNull()
    expect(r.street!.rl).toBeLessThan(r.house!.rl)
    expect(r.fall).toBeCloseTo(r.house!.rl - r.street!.rl, 9)
    expect(r.run).toBeGreaterThan(0)
    expect(r.path).toEqual([r.house!.p, r.street!.p])
    expect(verdictText(r)).toMatch(/^To the street by gravity/)
    expect(bearingName(r.fallBearing)).toBe(bearingName(terrain.stats.fallBearing))
  })

  it('says the block falls away when the street is on the high side, and heads for the low point', () => {
    const edges = boundaryEdges(survey.boundary)
    const low = boundaryLowPoint(survey.boundary, terrain.grid)!
    // The side facing the other way from the fall.
    const high = edgeFacing(survey.boundary, (terrain.stats.fallBearing + 180) % 360)!
    expect(high).not.toBe(low.edge)
    const r = fallReport(plan, survey, terrain, { edge: high, from: 'lot-facts' })
    expect(r.verdict).toBe('away')
    expect(r.street!.name).toBe(edges[high].name)
    expect(r.path[1]).toEqual(low.p)
    expect(verdictText(r)).toMatch(/falls away from the street/)
    expect(verdictText(r)).toMatch(/easement|pump/)
  })

  it('has no discharge point without walls', () => {
    const empty = { ...plan, walls: [], openings: [], rooms: [], roofs: [] }
    const r = fallReport(empty, survey, terrain, streetEdgeOf(empty, survey, 'auto', terrain.stats.fallBearing))
    expect(r.verdict).toBe('no-house')
    expect(r.house).toBeNull()
    expect(r.path).toEqual([])
    expect(r.street).not.toBeNull()
  })
})
