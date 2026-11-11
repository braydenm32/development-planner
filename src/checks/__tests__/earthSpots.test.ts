// The earthworks checks say what moves the ground and where: the closest works to the boundary,
// the highest fill outside the house and the deepest cut, each traced to the part of the design
// that makes it (a level's slab pad, a driveway built to its levels, a slab, a retaining wall's
// level ground, painted ground), on the made-up sample block.

import { describe, expect, it } from 'vitest'
import { evaluateEarthworks, groundSourceAt, prepareEarthworks } from '../../lib/earthworks'
import { Heightfield } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, toSite, type Plan, type Wall } from '../../plan/model'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { measure } from '../measure'
import { runChecks } from '../rules'
import { fixOf, targetOf } from '../targets'
import { L0, PLACEMENT, site } from './sample'

const s = site()
const base = (): Plan => normalizePlan({ ...garageFloor(), areas: [], placement: PLACEMENT, checks: { pathway: 'cdc', battleAxe: true } })
const ground = (plan: Plan, x: number, y: number) => {
  const q = toSite([x, y], plan.placement, s.survey.origin)
  return s.terrain.grid.sample(q[0], q[1])
}

function run(plan: Plan) {
  const earth = earthFrom(s.terrain.grid, s.survey.boundary, earthInputs(plan, s.survey))
  const ms = measure({ plan, survey: s.survey, terrain: s.terrain, earth })
  const rs = runChecks(ms, 'cdc')
  return { ms, earth, r: (id: string) => rs.find(x => x.id === id)! }
}

/** A driveway from the garage west to the west boundary (the sample house sits 6 m in from it). */
function withDrive(plan: Plan, levels: boolean): Plan {
  const street = ground(plan, -6, 7.5) - 0.4
  return {
    ...plan,
    areas: [
      ...plan.areas,
      { id: 'drv', level: L0, name: 'Drive', kind: 'driveway', pts: [[-6.2, 5], [0, 5], [0, 10], [-6.2, 10]], ...(levels ? { drive: { street: { rl: street, from: 'typed' }, garage: 'slab' } } : {}) },
    ],
  }
}

/** A second level beside the house, on the ground, 1.2 m higher: a split level with its own slab. */
function withSplit(plan: Plan): Plan {
  const L2 = 'lv_split'
  const pts: [number, number][] = [[10, 0.15], [15, 0.15], [15, 10], [10, 10]]
  const walls: Wall[] = pts.map((a, i) => ({ id: `sp${i}`, level: L2, a, b: pts[(i + 1) % 4], thickness: 0.3, kind: 'external' }))
  return normalizePlan({ ...plan, levels: [...plan.levels, { id: L2, name: 'Upper split', elevation: 1.2, height: 2.7, floorType: 'slab' }], walls: [...plan.walls, ...walls], floorsByLevel: true })
}

describe('what moves the ground', () => {
  it('names the platform and side at a node: its level ground, its cut batter, its fill batter', () => {
    // A 10 m slope rising 1 in 2 to the east, a platform at RL 2 over x 4..6, batters 1 in 4.
    const n = 41
    const z = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) z[j * n + i] = i * 0.125
    const grid = new Heightfield(0, 0, 0.25, n, n, z)
    const prep = prepareEarthworks(grid, [[0, 0], [10, 0], [10, 10], [0, 10]], [{ id: 'p', include: [[[4, 0], [6, 0], [6, 10], [4, 10]]], exclude: [], level: 2, fill: true }], { margin: 0, cutBatter: 4, fillBatter: 4 })
    const at = (x: number) => groundSourceAt(prep, 20 * n + Math.round(x / 0.25))
    expect(at(5)).toEqual({ platform: 0, how: 'level' })
    expect(at(7)).toEqual({ platform: 0, how: 'cut' })
    expect(at(3)).toEqual({ platform: 0, how: 'fill' })
    expect(evaluateEarthworks(prep).cut).toBeGreaterThan(0)
  })

  it('says a driveway built to its levels is what reaches the boundary, and pins it there', () => {
    const plan = withDrive(base(), true)
    const { ms, r } = run(plan)
    const works = r('hc-works-boundary')
    expect(works.status).toBe('fail')
    expect(ms.earth!.closestWorks!).toBeLessThan(0.3)
    expect(ms.earth!.closestAt!.source).toMatchObject({ kind: 'driveway', areaId: 'drv' })
    expect(works.value).toMatch(/from the west side boundary/)
    expect(works.note).toMatch(/driveway “Drive”/)
    // The pin is at the spot, with the boundary edge and the gap to it, and the driveway pointed out.
    const t = targetOf(works, ms)!
    expect(t.at).toEqual(ms.earth!.closestAt!.at)
    expect(t.lines).toHaveLength(1)
    expect(t.gaps[0][1]).toEqual(ms.earth!.closestAt!.boundary)
    expect(t.plan).toEqual({ kind: 'areas', ids: ['drv'] })
  })

  it('leaves a driveway without levels out: it follows the ground', () => {
    const { r } = run(withDrive(base(), false))
    expect(r('hc-works-boundary').status).toBe('pass')
  })

  it('lists every part of the design within 1 m of the boundary, closest first', () => {
    const { ms, r } = run(withSplit(withDrive(base(), true)))
    const near = ms.earth!.nearBoundary
    expect(near.map(x => x.source.kind)).toEqual(expect.arrayContaining(['driveway', 'pad']))
    expect(near.map(x => x.d)).toEqual([...near.map(x => x.d)].sort((a, b) => a - b))
    expect(r('hc-works-boundary').note).toMatch(/Within 1 m of a boundary: .*driveway “Drive”.*Upper split floor's slab pad/s)
  })

  it('counts fill under a split level’s own slab as under the house, not outside it', () => {
    // Vertical edges (retaining walls at the slabs' edges), so any fill outside a floor is the house's own.
    const vertical = (p: Plan): Plan => ({ ...p, earthworks: { margin: 0, cutBatter: 0, fillBatter: 0, subfloor: 0.4 } })
    const alone = run(vertical(base())).ms.earth!
    const split = run(vertical(withSplit(base()))).ms.earth!
    // The split level's slab is filled well over a metre above the ground...
    expect(split.maxFill).toBeGreaterThan(1)
    // ...but it's under the house, so the fill outside is no more than the house alone has.
    expect(split.fillOutside).toBeCloseTo(alone.fillOutside, 2)
  })

  it('says which pad a fill outside the house belongs to: its margin past the walls, or its batter', () => {
    const { ms, r } = run(withSplit(base()))
    const fill = r('hc-fill')
    expect(fill.status).toBe('fail')
    expect(ms.earth!.fillOutsideAt!.source).toMatchObject({ kind: 'pad' })
    expect(fill.note).toMatch(/Upper split floor's slab pad/)
    expect(targetOf(fill, ms)!.at).toEqual(ms.earth!.fillOutsideAt!.at)
  })
})

describe('where to fix it', () => {
  it('sends a row whose worst spot is a driveway’s to Earthworks › Driveway', () => {
    const { r } = run(withDrive(base(), true))
    expect(fixOf(r('hc-works-boundary'))?.where).toBe('Earthworks › Driveway')
    expect(fixOf(run(withSplit(base())).r('hc-fill'))?.where).toBe('Earthworks › Cut & fill')
  })
})
