// Putting a starter on a block: in the middle, facing the street, its floor on the ground, as one
// undo step; or beside a house already drawn. Afterwards it's ordinary plan data, so the checks,
// areas, costs and roofs all work on it as on any house.

import { describe, expect, it } from 'vitest'
import { measure } from '../../checks/measure'
import { runChecks } from '../../checks/rules'
import { emptyCosts } from '../../costs/model'
import { estimate } from '../../costs/estimate'
import { centroidOf, pointInPolygon, type Vec2 } from '../../lib/geom'
import { grossFloorArea } from '../../plan/keyNumbers'
import { levelGrounds } from '../../plan/levelGround'
import { emptyPlan, floorRL, sortedLevels, toSite, type Plan } from '../../plan/model'
import { houseBounds } from '../../plan/ops'
import { designQuantities } from '../../plan/quantities'
import { retainingProfiles } from '../../plan/retaining'
import { roofGeometry } from '../../plan/roof'
import { usePlan } from '../../plan/store'
import { withStreetSide } from '../../plan/streetSide'
import { defaultPlacement } from '../../plan/placement'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { readSite } from '../../safety/files'
import { sketchSurvey, type StreetSide } from '../../start/sketch'
import { examplePlan } from '../../example/examplePlan'
import { starterFacts } from '../facts'
import { starterById, starters } from '../houses'
import { BESIDE_GAP, hasHouse, placeStarter } from '../place'

/** A sketch block, rising 2 m to the back, with the street on one side, and the empty plan on it. */
function block(street: StreetSide = 'S', width = 20, depth = 40) {
  const site = readSite(sketchSurvey({ width, depth, fall: 2, street }))
  const plan = withStreetSide(emptyPlan(defaultPlacement(site.survey, site.terrain)), site.survey.boundary, street)
  return { site, plan }
}

/** The house's middle on the block (survey frame). */
const middleOnSite = (p: Plan, origin: Vec2): Vec2 => {
  const b = houseBounds(p)!
  return toSite([(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2], p.placement, origin)
}

/** Which way the house's front (−y) faces on the site, as a unit vector (east, north). */
const frontFacing = (p: Plan): Vec2 => {
  const t = (p.placement.rotation * Math.PI) / 180
  return [Math.round(Math.sin(t) * 1e6) / 1e6 + 0, Math.round(-Math.cos(t) * 1e6) / 1e6 + 0]
}

describe('a starter on an empty block', () => {
  it('goes in the middle, facing the street, with its floor at the mean ground under it', () => {
    for (const [street, facing] of [
      ['S', [0, -1]],
      ['E', [1, 0]],
      ['N', [0, 1]],
      ['W', [-1, 0]],
    ] as const) {
      const { site, plan } = block(street)
      const { plan: next } = placeStarter(plan, starterById('family-3')!.plan, site, 'replace')
      expect(frontFacing(next), street).toEqual(facing)
      const mid = middleOnSite(next, site.survey.origin)
      const c = centroidOf(site.survey.boundary)
      expect(Math.hypot(mid[0] - c[0], mid[1] - c[1])).toBeLessThan(0.02)
      // On the block, every wall end.
      for (const w of next.walls) for (const e of [w.a, w.b]) expect(pointInPolygon(...toSite(e, next.placement, site.survey.origin), site.survey.boundary)).toBe(true)
      const [g] = levelGrounds(next, site.survey.origin, site.terrain.grid)
      expect(floorRL(next)).toBeGreaterThan(g.ground!.min)
      expect(floorRL(next)).toBeLessThan(g.ground!.max)
    }
  })

  it('keeps the plan’s own things: its name, the street side, retaining walls and outdoor areas, where they were on the block', () => {
    const { site, plan: empty } = block('E')
    const plan: Plan = {
      ...empty,
      name: 'My house',
      walls: [{ id: 'rw', level: 'level_ground', a: [-6, -6], b: [6, -6], thickness: 0.2, kind: 'retaining' }],
      areas: [{ id: 'lawn', level: 'level_ground', name: 'Lawn', kind: 'garden', pts: [[-2, -9], [2, -9], [2, -7], [-2, -7]] }],
    }
    expect(hasHouse(plan)).toBe(false)
    const { plan: next } = placeStarter(plan, starterById('compact-2')!.plan, site, 'replace')
    expect(next.name).toBe('My house')
    expect(next.checks).toEqual(plan.checks)
    const at = (p: Plan, pt: Vec2) => toSite(pt, p.placement, site.survey.origin).map(v => Math.round(v * 1000) / 1000)
    expect(at(next, next.walls.find(w => w.id === 'rw')!.a)).toEqual(at(plan, plan.walls[0].a))
    expect(at(next, next.areas[0].pts[2])).toEqual(at(plan, plan.areas[0].pts[2]))
  })

  it('is one undo step in the store, adds no rooms of its own and narrows no doors', () => {
    const { site, plan } = block()
    const st = usePlan.getState()
    st.load(plan)
    const house = starterById('two-storey-4')!.plan
    const placed = placeStarter(plan, house, site, 'replace')
    st.commit(() => placed.plan)
    const now = usePlan.getState()
    expect(now.past).toHaveLength(1)
    expect(now.plan!.rooms).toHaveLength(house.rooms.length)
    expect(now.plan!.openings).toEqual(placed.plan.openings)
    // Its stair still climbs to its first floor.
    expect(now.plan!.stairs[0].toLevel).toBe(sortedLevels(now.plan!)[1].id)
    now.undo()
    expect(usePlan.getState().plan).toBe(plan)
  })

  it('gives fresh ids each time, so two copies never clash', () => {
    const { site, plan } = block()
    const house = starterById('studio-1')!.plan
    const a = placeStarter(plan, house, site, 'replace').plan
    const b = placeStarter(a, house, site, 'beside').plan
    const ids = [...b.walls, ...b.openings, ...b.rooms, ...b.roofs, ...b.furniture].map(x => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const o of b.openings) expect(b.walls.some(w => w.id === o.wall)).toBe(true)
  })

  it('is ordinary plan data: areas, the checks, the costs and the roofs all work on every starter', () => {
    for (const s of starters()) {
      const { site, plan } = block('S', 20, 40)
      const { plan: next } = placeStarter(plan, s.plan, site, 'replace')
      expect(Math.round(grossFloorArea(next).outside)).toBe(Math.round(starterFacts(s.plan).area))
      const earth = earthFrom(site.terrain.grid, site.survey.boundary, earthInputs(next, site.survey))
      const ms = measure({ plan: next, survey: site.survey, terrain: site.terrain, earth })
      const rs = runChecks(ms, 'cdc')
      expect(rs.length, s.id).toBeGreaterThan(5)
      const walls = retainingProfiles(next, site.survey.origin, earth.result.grid)
      const e = estimate(designQuantities(next, earth.result, walls), emptyCosts())
      expect(e.lines.filter(l => l.missing).map(l => l.label), s.id).toEqual([])
      expect(e.total, s.id).toBeGreaterThan(100_000)
      for (const r of next.roofs) expect(roofGeometry(r), s.id).toMatchObject({ error: null, height: expect.any(Number) as number })
    }
  })
})

describe('a starter beside a house already drawn', () => {
  it('goes to the side of it on the levels at the same heights, leaving the house and its place alone', () => {
    const plan = examplePlan(0)
    const house = starterById('two-storey-4')!.plan
    const placed = placeStarter(plan, house, null, 'beside')
    const next = placed.plan
    expect(next.placement).toEqual(plan.placement)
    for (const k of ['walls', 'openings', 'rooms', 'roofs', 'stairs', 'furniture'] as const) {
      expect(next[k].slice(0, plan[k].length)).toEqual(plan[k])
      expect(next[k].length).toBe(plan[k].length + house[k].length)
    }
    const added = next.walls.slice(plan.walls.length)
    const oldMax = Math.max(...plan.walls.filter(w => w.kind !== 'retaining').flatMap(w => [w.a[0], w.b[0]]))
    expect(Math.min(...added.flatMap(w => [w.a[0], w.b[0]]))).toBeCloseTo(oldMax + BESIDE_GAP, 6)
    // Its ground floor goes on the example's living level; its first floor (3 m up) is a new level.
    expect(placed.level).toBe('level_ground')
    expect(next.levels).toHaveLength(3)
    expect(next.levels[2]).toMatchObject({ name: 'First floor', elevation: 3 })
    expect(placed.added.length).toBeGreaterThan(10)
    expect(placed.added.every(s => [...next.walls, ...next.rooms, ...next.roofs, ...next.stairs, ...next.furniture].find(x => x.id === s.id)?.level === 'level_ground')).toBe(true)
  })

  it('replaces the house when asked, keeping the retaining wall and outdoor areas', () => {
    const plan = examplePlan(0)
    const { plan: next } = placeStarter(plan, starterById('family-4')!.plan, null, 'replace')
    expect(next.walls.filter(w => w.kind === 'retaining')).toHaveLength(1)
    expect(next.areas).toHaveLength(plan.areas.length)
    expect(next.rooms.map(r => r.name)).toEqual(starterById('family-4')!.plan.rooms.map(r => r.name))
    expect(next.levels.map(l => l.id)).toEqual(['level_ground'])
  })
})
