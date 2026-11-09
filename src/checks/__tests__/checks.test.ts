// The compliance checks on a synthetic block: a 20 m × 30 m rectangle (600 m²) on a gentle
// plane, with a 10 m × 8 m house placed square to it, checked against hand calculations.

import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { evaluateEarthworks, prepareEarthworks } from '../../lib/earthworks'
import { analyzeLayers, buildSurvey, guessRoles, type Survey } from '../../lib/survey'
import { buildTerrain, type Terrain } from '../../lib/terrain'
import { dxf, lwpolyline, point } from '../../lib/__tests__/fixtures'
import { earthworksOf, type Plan, type Wall } from '../../plan/model'
import { earthworksBarriers, earthworksPlatforms } from '../../plan/platforms'
import { measure, rearEdgeOf } from '../measure'
import { countChecks, dcpCoverage, dcpLandscaped, hcLandscapedShare, hcMaxGfa, hcRearSetback, hcSideSetback, minWidth, runChecks } from '../rules'
import { encroachment, srzRadius, tpzRadius } from '../trees'
import { checkTreesOf } from '../siteTrees'
import type { SiteFeature } from '../../site/model'
import { activeCouncil, checkSettingsOf, switchCouncil } from '../councils'
import { DEFAULT_CHECK_SETTINGS, type CheckSettings, type CheckTree } from '../types'

type P2 = [number, number]
// Falls 1 in 20 towards the south (north is higher).
const plane = (_E: number, N: number) => 50 + 0.05 * (N - 8000)
// Counter-clockwise from the south-west corner: south, east, north, west edges (0 to 3).
const BOUNDARY: P2[] = [
  [5000, 8000],
  [5020, 8000],
  [5020, 8030],
  [5000, 8030],
]

function loadSite(): { survey: Survey; terrain: Terrain } {
  const ents: string[] = []
  for (let E = 4990; E <= 5030; E += 2) for (let N = 7990; N <= 8040; N += 2) ents.push(point('SPOT_LEVELS', [E, N, plane(E, N)]))
  ents.push(lwpolyline('LOT_BOUNDARY', [...BOUNDARY, BOUNDARY[0]]))
  const doc = parseDxf(dxf(ents))
  const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
  return { survey, terrain: buildTerrain(survey) }
}

const L0 = 'level_ground'
const L1 = 'level_1'
const wall = (id: string, a: P2, b: P2, level = L0): Wall => ({ id, level, a, b, thickness: 0.2, kind: 'external' })
const box = (p: string, x0: number, y0: number, x1: number, y1: number, level = L0) => [
  wall(`${p}s`, [x0, y0], [x1, y0], level),
  wall(`${p}e`, [x1, y0], [x1, y1], level),
  wall(`${p}n`, [x1, y1], [x0, y1], level),
  wall(`${p}w`, [x0, y1], [x0, y0], level),
]

/** House frame = site frame offsets: a 10 × 8 m centreline box, outside 10.2 × 8.2 m, with its south-west outside corner 5 m from the south and 4 m from the west. */
function house(checks: Partial<CheckSettings> = {}, patch: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: box('g', 0, 0, 10, 8),
    openings: [],
    rooms: [{ id: 'r', level: L0, name: 'Living', at: [5, 4] }],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 5004.1, n: 8005.1, rotation: 0, ffl: 50.6 },
    earthworks: { margin: 0, cutBatter: 2, fillBatter: 2, subfloor: 0.4 },
    checks: { pathway: 'cdc', battleAxe: false, ...checks },
    ...patch,
  }
}

function run(plan: Plan, trees: CheckTree[] = [], withEarth = false) {
  const { survey, terrain } = loadSite()
  let earth = null
  if (withEarth) {
    const platforms = earthworksPlatforms(plan, survey.origin)
    const prep = prepareEarthworks(terrain.grid, survey.boundary, platforms, earthworksOf(plan), earthworksBarriers(plan, survey.origin))
    earth = { prep, result: evaluateEarthworks(prep), platforms }
  }
  const ms = measure({ plan, survey, terrain, earth, trees })
  return { ms, survey, cdc: runChecks(ms, 'cdc'), da: runChecks(ms, 'da', 'wollongong') }
}

const byId = (rs: ReturnType<typeof runChecks>, id: string) => rs.find(r => r.id === id)!

describe('rule tables (hand values from the research)', () => {
  it('Housing Code floor area by lot area (cl 3.9)', () => {
    expect(hcMaxGfa(650)).toBe(335)
    expect(hcMaxGfa(600)).toBe(300)
    expect(hcMaxGfa(800)).toBe(350)
    expect(hcMaxGfa(1200)).toBe(400)
  })
  it('Housing Code landscaped share, side and rear setbacks (cl 3.10, 3.13)', () => {
    expect(hcLandscapedShare(650) * 650).toBeCloseTo(195, 6)
    expect(hcSideSetback(20, 4)).toBe(1.5)
    expect(hcSideSetback(20, 6.5)).toBeCloseTo(2.0, 9)
    expect(hcSideSetback(30, 8)).toBe(2.5)
    expect(hcSideSetback(12, 4.5)).toBe(0.9)
    expect(hcRearSetback(650)).toEqual([3, 8])
  })
  it('Wollongong DCP coverage and landscaping (B1 4.4.2, 4.5.2)', () => {
    expect(dcpCoverage(650) * 650).toBe(325)
    expect(dcpCoverage(720) * 720).toBeCloseTo(360, 6)
    expect(dcpLandscaped(650)).toBeCloseTo(135, 6)
    expect(dcpLandscaped(720)).toBeCloseTo(156, 6)
    expect(dcpLandscaped(500)).toBe(100)
  })
  it('AS 4970 zones match the research table', () => {
    expect([0.7, 0.5, 0.9, 0.3].map(tpzRadius)).toEqual([8.4, 6, 10.8, 3.6].map(v => expect.closeTo(v, 9)))
    expect(tpzRadius(0.1)).toBe(2)
    expect(tpzRadius(2)).toBe(15)
    expect(srzRadius(0.7)).toBeCloseTo(2.8, 1)
    expect(srzRadius(0.9)).toBeCloseTo(3.2, 1)
    expect(srzRadius(0.1)).toBe(1.5)
  })
  it('narrowest lot width', () => {
    expect(minWidth(BOUNDARY.map(([x, y]) => [x - 5000, y - 8000] as P2))).toBeCloseTo(20, 9)
  })
})

describe('measurements', () => {
  it('distances, areas and roles on the synthetic block', () => {
    const { ms } = run(house({ frontEdge: 0 }))
    expect(ms.lotArea).toBeCloseTo(600, 6)
    // Outside 10.2 × 8.2 m.
    expect(ms.footprint).toBeCloseTo(83.64, 4)
    expect(ms.grossArea).toBeCloseTo(83.64, 4)
    expect(ms.roomsArea).toBeCloseTo(9.8 * 7.8, 4)
    expect(ms.edges.map(e => e.role)).toEqual(['front', 'side', 'rear', 'side'])
    // South-west outside corner at (4, 5): 5 m south, 4 m west, 30 − 13.2 = 16.8 m north, 20 − 14.2 = 5.8 m east.
    expect(ms.edges.map(e => e.clearance!)).toEqual([expect.closeTo(5, 4), expect.closeTo(5.8, 4), expect.closeTo(16.8, 4), expect.closeTo(4, 4)])
    expect(ms.storeys).toBe(1)
  })
  it('house height: wall tops over the natural ground', () => {
    const { ms } = run(house())
    // Lowest ground under a wall end: the south-west corner centreline (4.1, 5.1) → RL 50.255; top 50.6 + 2.7.
    expect(ms.height).toBeCloseTo(50.6 + 2.7 - plane(5004.1, 8005.1), 2)
  })
  it('the rear edge defaults to the one opposite the front', () => {
    const sides = [{ inward: [0, 1] as P2 }, { inward: [-1, 0] as P2 }, { inward: [0, -1] as P2 }, { inward: [1, 0] as P2 }]
    expect(rearEdgeOf(sides, 0, undefined)).toBe(2)
    expect(rearEdgeOf(sides, 1, undefined)).toBe(3)
    expect(rearEdgeOf(sides, 1, 0)).toBe(0)
    expect(rearEdgeOf(sides, undefined, undefined)).toBeUndefined()
  })
})

describe('Housing Code (CDC)', () => {
  it('asks for the front before checking setbacks', () => {
    const { cdc } = run(house())
    expect(byId(cdc, 'hc-side').status).toBe('unknown')
    expect(byId(cdc, 'hc-rear').status).toBe('unknown')
    expect(byId(cdc, 'hc-front').status).toBe('unknown')
  })
  it('passes a small single-storey house well inside the setbacks', () => {
    const { cdc } = run(house({ frontEdge: 0 }))
    const c = countChecks(cdc)
    expect(c.fail).toBe(0)
    expect(byId(cdc, 'hc-gfa').status).toBe('pass')
    expect(byId(cdc, 'hc-height').status).toBe('pass')
    // Width 20 m (front) or 30 m (sides): 1.5 m or 2.5 m; the house is 4 m from the west side.
    expect(byId(cdc, 'hc-side').status).toBe('pass')
    expect(byId(cdc, 'hc-side').limit).toContain('1.50 m')
    expect(byId(cdc, 'hc-side').limit).toContain('2.50 m')
    // 30% of 600 m² = 180 m²; 600 − 83.64 = 516.36 m².
    expect(byId(cdc, 'hc-landscaped').status).toBe('pass')
    expect(byId(cdc, 'hc-landscaped').value).toContain('516.4 m²')
  })
  it('warns when only one lot width reading passes, and fails when neither does', () => {
    // West side 2 m away: passes 1.5 m (20 m wide), fails 2.5 m (30 m).
    const p = house({ frontEdge: 0 }, { placement: { e: 5002.1, n: 8005.1, rotation: 0, ffl: 50.6 } })
    expect(byId(run(p).cdc, 'hc-side').status).toBe('warn')
    expect(byId(run(house({ frontEdge: 0, lotWidth: 20 }, { placement: p.placement })).cdc, 'hc-side').status).toBe('pass')
    expect(byId(run(house({ frontEdge: 0, lotWidth: 30 }, { placement: p.placement })).cdc, 'hc-side').status).toBe('fail')
    const q = house({ frontEdge: 0 }, { placement: { e: 5001.1, n: 8005.1, rotation: 0, ffl: 50.6 } })
    expect(byId(run(q).cdc, 'hc-side').status).toBe('fail')
  })
  it('battle-axe: 3 m from the lot in front, and the 12 × 12 m test', () => {
    const near = house({ frontEdge: 0, battleAxe: true }, { placement: { e: 5004.1, n: 8002.1, rotation: 0, ffl: 50.6 } })
    const r = run(near).cdc
    expect(byId(r, 'hc-front').status).toBe('fail') // 2 m
    expect(byId(r, 'hc-lot-shape').status).toBe('pass')
    expect(byId(run(house({ frontEdge: 0, battleAxe: true })).cdc, 'hc-front').status).toBe('pass') // 5 m
  })
  it('floor area over the limit fails, and between rooms and outside walls warns', () => {
    // A second level of the same box makes 167.28 m² gross; the limit on 600 m² is 300 m².
    const two = house({ frontEdge: 0 }, { levels: [{ id: L0, name: 'Ground', elevation: 0, height: 2.7 }, { id: L1, name: 'First', elevation: 3, height: 2.7 }], walls: [...box('g', 0, 0, 10, 8), ...box('u', 0, 0, 10, 8, L1)] })
    expect(byId(run(two).cdc, 'hc-gfa').status).toBe('pass')
    const big = house({ frontEdge: 0 }, { walls: box('g', 0, 0, 15.2, 19.8), rooms: [{ id: 'r', level: L0, name: 'Big', at: [5, 5] }] })
    // Outside 15.4 × 20 = 308 m² > 300; rooms 15 × 19.6 = 294 m² ≤ 300.
    expect(byId(run(big).cdc, 'hc-gfa').status).toBe('warn')
  })
  it('a two-storey house holds its upper floor 8 m from the rear', () => {
    const levels = [
      { id: L0, name: 'Ground', elevation: 0, height: 2.7 },
      { id: L1, name: 'First', elevation: 3, height: 2.7 },
    ]
    // Upper floor over the back of the ground floor, reaching y = 20 (site N 8025.1 + 0.1 outside): 30 − 25.2 = 4.8 m from the rear.
    const p = house({ frontEdge: 0 }, { levels, walls: [...box('g', 0, 0, 10, 20), ...box('u', 0, 12, 10, 20, L1)] })
    const r = run(p)
    expect(byId(r.cdc, 'hc-rear').status).toBe('fail')
    expect(byId(r.da, 'da-rear-upper').status).toBe('fail')
    expect(r.ms.storeys).toBe(2)
    expect(byId(r.cdc, 'hc-storeys').value).toBe('2 storeys')
  })
  it('split levels side by side on a slope are one storey, however many levels', () => {
    // Three levels stepping up the block, each 8 m deep, sharing their walls at y = 8 and 16.
    const levels = [
      { id: L0, name: 'Lower', elevation: 0, height: 2.7 },
      { id: L1, name: 'Middle', elevation: 1.2, height: 2.7 },
      { id: 'level_2', name: 'Upper', elevation: 2.4, height: 2.7 },
    ]
    const p = house({ frontEdge: 0, battleAxe: true }, { levels, walls: [...box('a', 0, 0, 10, 8), ...box('b', 0, 8, 10, 16, L1), ...box('c', 0, 16, 10, 24, 'level_2')] })
    const r = run(p)
    expect(r.ms.levels).toBe(3)
    expect(r.ms.storeys).toBe(1)
    expect(byId(r.cdc, 'hc-storeys').status).toBe('pass')
    expect(byId(r.cdc, 'hc-storeys').value).toBe('1 storey (3 levels)')
    // On a battle-axe lot a one-storey design needs no case for a second storey,
    expect(byId(r.da, 'da-storeys').status).toBe('pass')
    // and with no level over another there is no upper floor to keep out of the rear 8 m.
    expect(r.da.find(c => c.id === 'da-rear-upper')).toBeUndefined()
    expect(r.ms.edges.every(e => e.upperClearance === null)).toBe(true)
  })
  it('counts storeys where levels stack: a split level over part of another makes two', () => {
    const levels = [
      { id: L0, name: 'Lower', elevation: 0, height: 2.7 },
      { id: L1, name: 'Middle', elevation: 1.2, height: 2.7 },
      { id: 'level_2', name: 'Upper', elevation: 3, height: 2.7 },
    ]
    // The upper level sits over the back 3 m of the lower one (y 5 to 8) and runs on past it.
    const p = house({ frontEdge: 0, battleAxe: true }, { levels, walls: [...box('a', 0, 0, 10, 8), ...box('b', 0, 8, 10, 16, L1), ...box('c', 0, 5, 4, 12, 'level_2')] })
    const r = run(p)
    expect(r.ms.levels).toBe(3)
    expect(r.ms.storeys).toBe(2)
    expect(byId(r.cdc, 'hc-storeys').value).toBe('2 storeys (3 levels)')
    expect(byId(r.da, 'da-storeys').status).toBe('warn')
    // The upper floor is the stacked level alone: its north face at y = 12.1 is 30 − 17.2 = 12.8 m from the rear.
    expect(byId(r.da, 'da-rear-upper').value).toBe('12.80 m to the north side')
    // Three levels over one point fail the Housing Code's two.
    const three = house({ frontEdge: 0 }, { levels, walls: [...box('a', 0, 0, 10, 8), ...box('b', 0, 0, 10, 8, L1), ...box('c', 0, 0, 10, 8, 'level_2')] })
    expect(run(three).ms.storeys).toBe(3)
    expect(byId(run(three).cdc, 'hc-storeys').status).toBe('fail')
  })
  it('cut and fill: depth bands and the 1 m clearance to the boundary', () => {
    const { cdc, ms } = run(house({ frontEdge: 0 }), [], true)
    expect(ms.earth).not.toBeNull()
    expect(byId(cdc, 'hc-cut').status).toBe('pass')
    // The pad at RL 50.3 on ground 50.25 to 50.66: under 0.5 m either way.
    expect(ms.earth!.maxCut).toBeLessThan(0.5)
    expect(byId(cdc, 'hc-works-boundary').status).toBe('pass')
  })
})

describe('Wollongong LEP and DCP (DA)', () => {
  it('flags batters steeper than 1 in 4 and passes 1 in 4', () => {
    expect(byId(run(house({ frontEdge: 0 }), [], true).da, 'da-batters').status).toBe('fail')
    const p = house({ frontEdge: 0 }, { earthworks: { margin: 0, cutBatter: 4, fillBatter: 4, subfloor: 0.4 } })
    expect(byId(run(p, [], true).da, 'da-batters').status).toBe('pass')
  })
  it('floor space ratio needs the map value; uses the title area when given', () => {
    expect(byId(run(house()).da, 'da-fsr').status).toBe('unknown')
    const r = byId(run(house({ lepFsr: 0.5, titleArea: 660, battleAxe: true })).da, 'da-fsr')
    expect(r.status).toBe('pass')
    expect(r.value).toBe(`${(83.64 / 660).toFixed(2)}:1 on 660.0 m²`)
  })
  it('battle-axe lots: a second storey warns, the front setback is unknown', () => {
    const levels = [
      { id: L0, name: 'Ground', elevation: 0, height: 2.7 },
      { id: L1, name: 'First', elevation: 3, height: 2.7 },
    ]
    const r = run(house({ frontEdge: 0, battleAxe: true }, { levels, walls: [...box('g', 0, 0, 10, 8), ...box('u', 0, 0, 10, 8, L1)] })).da
    expect(byId(r, 'da-storeys').status).toBe('warn')
    expect(byId(r, 'da-front').status).toBe('unknown')
    expect(byId(r, 'da-rear-upper').status).toBe('pass')
  })
  it('erosion control: a small house needs only a basic plan', () => {
    const r = byId(run(house({ frontEdge: 0 }), [], true).da, 'da-erosion')
    expect(r.status).toBe('pass')
    expect(r.limit).toContain('basic')
  })
  it('site coverage between the two site areas warns', () => {
    // Outside 18.2 × 18.2 = 331.24 m²: over 300 (50% of 600 m²) but under 350 (50% of the 700 m² title).
    const p = house({ titleArea: 700, battleAxe: true }, { walls: box('g', -3, -4, 15, 14), rooms: [{ id: 'r', level: L0, name: 'Big', at: [5, 5] }] })
    expect(byId(run(p).da, 'da-coverage').status).toBe('warn')
  })
})

describe('trees', () => {
  // Tree 4.5 m north of the house's north wall face (y = 13.2 site): trunk 0.5 m, TPZ 6 m.
  const tree = (patch: Partial<CheckTree> = {}): CheckTree => ({ id: 't1', label: 'T1', at: [9, 17.7], trunk: 0.5, height: 12, remove: false, ...patch })

  it('measures how much of the protection zone the house takes', () => {
    const { ms } = run(house(), [tree()])
    const e = encroachment(ms.trees[0], ms)
    expect(e.tpz).toBe(6)
    expect(e.toHouse).toBeCloseTo(4.5, 4)
    // Circular segment of r = 6 cut 4.5 m from the centre, over the house's 10.2 m width (which covers the whole chord).
    const r = 6
    const d = 4.5
    const seg = r * r * Math.acos(d / r) - d * Math.sqrt(r * r - d * d)
    expect(e.share).toBeCloseTo(seg / (Math.PI * r * r), 2)
    expect(e.inSrz).toBe(false)
  })
  it('kept trees warn under 10%, fail over it or in the root zone, and pass when clear', () => {
    const share = (t: CheckTree) => byId(run(house(), [t]).da, 'tree:t1')
    expect(share(tree()).status).toBe('warn') // about 5.6%
    expect(share(tree({ at: [9, 15.2] })).status).toBe('fail') // 2 m away: about 29%
    expect(share(tree({ at: [9, 25] })).status).toBe('pass')
  })
  it('a tree marked for removal drops out of the checks and shows as pending', () => {
    const r = run(house(), [tree({ at: [9, 15.2], remove: true })])
    const da = byId(r.da, 'tree:t1')
    expect(da.status).toBe('pending')
    expect(da.value).toBe('Marked for removal (pending DA or CDC)')
    // 2 m from the house: within E17's 3 m.
    expect(da.note).toContain('within 3 m')
    expect(byId(r.cdc, 'tree:t1').status).toBe('pending')
    expect(countChecks(r.da).fail).toBe(countChecks(run(house(), []).da).fail)
    const far = byId(run(house(), [tree({ at: [9, 25], remove: true })]).da, 'tree:t1')
    expect(far.note).toContain('more than 3 m')
  })

  it('CDC: 3 m from the trunk fails, the AS 4970 zone only warns (cl 3.33(2))', () => {
    const cdc = (t: CheckTree) => byId(run(house(), [t]).cdc, 'tree:t1')
    expect(cdc(tree()).status).toBe('warn') // 4.5 m away, inside the 6 m zone
    expect(cdc(tree({ at: [9, 15.2] })).status).toBe('fail') // 2 m away
    expect(cdc(tree({ at: [9, 25] })).status).toBe('pass')
  })
  it('CDC: covers removing a tree only under 8 m tall and within 3 m of the house (cl 3.33(1))', () => {
    const note = (t: CheckTree) => byId(run(house(), [t]).cdc, 'tree:t1').note!
    expect(note(tree({ at: [9, 15.2], height: 6, remove: true }))).toContain('The CDC covers removing it')
    expect(note(tree({ at: [9, 15.2], height: 8, remove: true }))).toContain('it’s 8 m tall')
    expect(note(tree({ at: [9, 25], height: 6, remove: true }))).toContain('from the house (the CDC covers trees within 3 m)')
  })
  it('a neighbour’s tree is checked but can’t be marked for removal', () => {
    const r = byId(run(house(), [tree({ at: [9, 15.2], neighbour: true, remove: true })]).da, 'tree:t1')
    expect(r.status).toBe('fail')
    expect(r.removable).toBe(false)
    expect(r.title).toBe('Neighbour’s tree T1')
    expect(r.note).toContain('neighbour’s tree')
    expect(byId(run(house(), [tree()]).da, 'tree:t1').removable).toBe(true)
  })
  it('reads trees from the site features: points with a trunk, flagged outside the boundary', () => {
    const f = (id: string, at: [number, number], extra: Partial<SiteFeature> = {}): SiteFeature => ({ id, type: 'tree', geom: { kind: 'point', at }, source: 'trace', trunk: 0.4, ...extra })
    const boundary: [number, number][] = [[0, 0], [20, 0], [20, 30], [0, 30]]
    const out = checkTreesOf([f('a', [5, 5], { label: 'T1', remove: true }), f('b', [25, 5]), f('c', [5, 6], { trunk: undefined }), { ...f('d', [1, 1]), type: 'fence' }], boundary)
    expect(out.map(t => [t.id, t.label, t.remove, t.neighbour])).toEqual([
      ['a', 'T1', true, false],
      ['b', '', false, true],
    ])
  })
})

describe('council rules switched on or off', () => {
  it('a new project has no council on, so the DA pathway has nothing to check and reads as CDC', () => {
    const s = checkSettingsOf(undefined)
    expect(activeCouncil(s)).toBeNull()
    expect(checkSettingsOf({ ...DEFAULT_CHECK_SETTINGS, pathway: 'da' }).pathway).toBe('cdc')
    const { ms } = run(house({ councils: {} }))
    expect(runChecks(ms, 'da')).toEqual([])
    expect(runChecks(ms, 'cdc').length).toBeGreaterThan(0)
  })
  it('a plan saved before councils could be switched keeps Wollongong on', () => {
    const old = { pathway: 'da', battleAxe: true } as CheckSettings
    const s = checkSettingsOf(old)
    expect(activeCouncil(s)?.id).toBe('wollongong')
    expect(s.pathway).toBe('da')
    expect(s.battleAxe).toBe(true)
  })
  it('switching a council on runs its rules; switching it off goes back to CDC', () => {
    const on = { ...DEFAULT_CHECK_SETTINGS, ...switchCouncil(DEFAULT_CHECK_SETTINGS, 'wollongong', true), pathway: 'da' as const }
    expect(activeCouncil(on)?.name).toBe('Wollongong')
    const { ms } = run(house(on))
    expect(runChecks(ms, 'da').some(r => r.source.clause.startsWith('Wollongong'))).toBe(true)
    const off = { ...on, ...switchCouncil(on, 'wollongong', false) }
    expect(off.councils).toEqual({ wollongong: false })
    expect(off.pathway).toBe('cdc')
    expect(checkSettingsOf(off).councils).toEqual({ wollongong: false })
  })
})
