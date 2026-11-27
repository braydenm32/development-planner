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

  it('leaves a driveway built to its levels out of the earthworks rows: one beside a side boundary passes', () => {
    // The drive runs to the west boundary, its batters within 1 m of it: this row used to fail on the drive alone.
    const plan = withDrive(base(), true)
    const { ms, earth, r } = run(plan)
    const alone = run(base())
    const works = r('hc-works-boundary')
    expect(works.status).toBe('pass')
    expect(works.status).toBe(alone.r('hc-works-boundary').status)
    expect(works.note).toMatch(/Drives aren’t counted here/)
    expect(ms.drivesLeftOut).toBe(true)
    // The rows measure the rest exactly as without the drive...
    expect(ms.earth?.closestWorks ?? null).toBe(alone.ms.earth?.closestWorks ?? null)
    for (const id of ['hc-cut', 'hc-fill', 'hc-retaining']) {
      expect(r(id).status).toBe(alone.r(id).status)
      expect(r(id).note).toMatch(/Drives aren’t counted here/)
    }
    // ...while the drive is still graded in the cut and fill the volumes, 3D and the drive's own rows read.
    const none = earthFrom(s.terrain.grid, s.survey.boundary, earthInputs(base(), s.survey))
    expect(earth.result.cut + earth.result.fill).toBeGreaterThan(none.result.cut + none.result.fill + 0.5)
    expect(earth.platforms.some(p => p.id === 'drv')).toBe(true)
    expect(ms.drives[0]?.built).toBe(true)
    // A plan with no drive says nothing about drives.
    expect(alone.ms.drivesLeftOut).toBeUndefined()
    expect(alone.r('hc-works-boundary').note ?? '').not.toMatch(/Drives/)
  })

  it('leaves a driveway without levels, short of the house, out: it follows the ground', () => {
    // Stopping 3 m short of the garage, neither end has a level: nothing is cut or filled for it.
    const plan = withDrive(base(), false)
    const short = { ...plan, areas: plan.areas.map(a => (a.id === 'drv' ? { ...a, pts: a.pts.map(p => [Math.min(p[0], -3), p[1]] as [number, number]) } : a)) }
    expect(run(short).r('hc-works-boundary').status).toBe('pass')
  })

  it('grades a driveway that runs up to the garage to meet its slab (DB-13), and the boundary row still leaves it out', () => {
    const { ms, earth, r } = run(withDrive(base(), false))
    expect(earth.platforms.some(p => p.id === 'drv')).toBe(true)
    expect(r('hc-works-boundary').status).toBe('pass')
    expect(ms.drivesLeftOut).toBe(true)
  })

  it('still fails a row the house’s own pad breaks when a drive is there too, and names the pad', () => {
    const { ms, r } = run(withSplit(withDrive(base(), true)))
    const works = r('hc-works-boundary')
    expect(works.status).toBe('fail')
    expect(r('hc-fill').status).toBe('fail')
    const near = ms.earth!.nearBoundary
    expect(near.length).toBeGreaterThan(0)
    expect(near.map(x => x.source.kind)).not.toContain('driveway')
    expect(near.map(x => x.d)).toEqual([...near.map(x => x.d)].sort((a, b) => a - b))
    expect(ms.earth!.closestAt!.source).toMatchObject({ kind: 'pad' })
    expect(works.note).toMatch(/Upper split floor's slab pad/)
    expect(works.note).toMatch(/Drives aren’t counted here/)
    // The pin is at the pad's spot, with the boundary edge and the gap to it.
    const t = targetOf(works, ms)!
    expect(t.at).toEqual(ms.earth!.closestAt!.at)
    expect(t.gaps[0][1]).toEqual(ms.earth!.closestAt!.boundary)
    // The same numbers as the pad alone.
    const alone = run(withSplit(base())).ms.earth!
    expect(ms.earth!.closestWorks).toBeCloseTo(alone.closestWorks!, 6)
    expect(ms.earth!.fillOutside).toBeCloseTo(alone.fillOutside, 6)
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
  it('sends a row whose worst spot is a pad’s to Earthworks › Cut & fill', () => {
    expect(fixOf(run(withSplit(base())).r('hc-fill'))?.where).toBe('Earthworks › Cut & fill')
  })
})
