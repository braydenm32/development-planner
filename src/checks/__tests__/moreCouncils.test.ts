// Kiama, Central Coast and Blue Mountains on the made-up sample block, each held to the numbers in
// its own table (from docs/research/councils/<council>.md). The sample lot is 810.3 m²; with the
// front to the south the garage floor is 3.59 m from the front, 6.19 m from the west side and
// 15.91 m from the rear, and stands 3.78 m above the ground.

import { describe, expect, it } from 'vitest'
import { councilFor } from '../councils'
import { BLUE_MOUNTAINS } from '../councils/blueMountains'
import { CENTRAL_COAST } from '../councils/centralCoast'
import { KIAMA } from '../councils/kiama'
import type { Council } from '../councils/types'
import { controlCount, councilChecks, notChecked } from '../rules'
import type { CheckResult } from '../types'
import type { Plan } from '../../plan/model'
import { measureSample, PLACEMENT, site, threeStorey, twoStorey, withRetaining, type Scenario } from './sample'

const s = site()
const front = { frontEdge: 0 }
const moved = (to: Partial<typeof PLACEMENT>, change = (p: Plan) => p) => (p: Plan) => ({ ...change(p), placement: { ...PLACEMENT, ...to } })
const steep = { cutBatter: 2, fillBatter: 2 }

/** The council's findings for a scenario, by check id. */
function run(c: Council, sc: Scenario): Record<string, CheckResult> {
  return Object.fromEntries(councilChecks(measureSample(sc, s), c).map(r => [r.id, r]))
}
const status = (c: Council, sc: Scenario) => Object.fromEntries(Object.entries(run(c, sc)).map(([id, r]) => [id, r.status]))

describe('Kiama', () => {
  it('checks the controls its DCP has, and lists the two it couldn’t read', () => {
    expect(Object.keys(run(KIAMA, { checks: front }))).toEqual(['lot-inside', 'da-height', 'da-fsr', 'da-front', 'da-side', 'da-rear', 'da-coverage', 'da-batters', 'da-cut-fill', 'da-retaining'])
    expect(controlCount(KIAMA)).toEqual({ have: 9, of: 11 })
    expect(notChecked('da', KIAMA).slice(0, 2)).toEqual(['Erosion and sediment control: Kiama’s own rule isn’t in the app yet', 'Trees: Kiama’s own rule isn’t in the app yet'])
  })
  it('holds the front to 4.5 m, or more if the neighbours sit further back', () => {
    const near = run(KIAMA, { checks: front })['da-front']
    expect([near.status, near.value]).toEqual(['fail', '3.59 m to the south side'])
    expect(near.limit).toMatch(/^4\.5 m or the average of the two nearest houses on the same side of the road, whichever is greater/)
    // Past 4.5 m it can't pass outright: the neighbours' average isn't known.
    expect(run(KIAMA, { checks: front, plan: moved({ n: 8005 }) })['da-front'].status).toBe('warn')
    expect(run(KIAMA, { checks: { ...front, battleAxe: true } })['da-front'].status).toBe('unknown')
  })
  it('sides 900 mm, rear 6 m, coverage 60%', () => {
    expect(status(KIAMA, { checks: front })).toMatchObject({ 'da-side': 'pass', 'da-rear': 'pass', 'da-coverage': 'pass' })
    expect(run(KIAMA, { checks: front, plan: moved({ e: 5000.4 }) })['da-side']).toMatchObject({ status: 'fail', value: '0.59 m to the west side', limit: '0.9 m to walls' })
    expect(run(KIAMA, { checks: front })['da-rear'].limit).toBe('6 m to walls')
    expect(run(KIAMA, { checks: front })['da-coverage'].limit).toBe('486.2 m² on 810.3 m²')
  })
  it('cut and fill: 900 mm each, batters 1 in 4, retaining walls 1 m', () => {
    expect(status(KIAMA, { checks: front, earth: { cutBatter: 4, fillBatter: 4 } })['da-batters']).toBe('pass')
    const r = run(KIAMA, { checks: front, earth: steep })
    expect(r['da-batters']).toMatchObject({ status: 'fail', limit: 'No steeper than 1 in 4 (1 in 6 preferred)' })
    expect(r['da-cut-fill']).toMatchObject({ status: 'fail', value: 'Cut 1.33 m; fill 0.92 m', limit: 'Cut 900 mm; fill 900 mm' })
    expect(run(KIAMA, { checks: front, plan: withRetaining, earth: steep })['da-retaining']).toMatchObject({ status: 'fail', limit: 'Up to 1 m' })
  })
})

describe('Central Coast', () => {
  it('checks the controls its DCP has, and lists the two it couldn’t read', () => {
    expect(Object.keys(run(CENTRAL_COAST, { checks: front }))).toEqual(['lot-inside', 'da-height', 'da-storeys', 'da-fsr', 'da-front', 'da-side', 'da-rear', 'da-coverage', 'da-cut-fill', 'da-retaining'])
    expect(controlCount(CENTRAL_COAST)).toEqual({ have: 9, of: 11 })
  })
  it('uses the DCP’s 10 m until the map value is entered', () => {
    const h = run(CENTRAL_COAST, { checks: front })['da-height']
    expect([h.status, h.limit]).toEqual(['pass', '10.00 m (the DCP’s figure where the LEP map shows none; look up this lot’s map value)'])
    expect(run(CENTRAL_COAST, { checks: { ...front, lepHeight: 8.5 }, plan: p => twoStorey(p, 3.6) })['da-height']).toMatchObject({ status: 'fail', limit: '8.50 m (Height of Buildings Map)' })
  })
  it('a third storey needs a case, since the DCP says “generally” two', () => {
    expect(status(CENTRAL_COAST, { checks: front, plan: p => twoStorey(p) })['da-storeys']).toBe('pass')
    const r = run(CENTRAL_COAST, { checks: front, plan: threeStorey })['da-storeys']
    expect(r.status).toBe('warn')
    expect(r.note).toMatch(/generally not exceed two storeys/)
  })
  it('front 4.5 m on a lot over 300 m², else the neighbours’ average', () => {
    expect(run(CENTRAL_COAST, { checks: front })['da-front']).toMatchObject({ status: 'warn', limit: 'The average of the two nearest houses within 40 m, else 4.5 m; garages and carports 1 m behind the front setback' })
    expect(status(CENTRAL_COAST, { checks: front, plan: moved({ n: 8005 }) })['da-front']).toBe('pass')
  })
  it('side setbacks grow by a quarter of the height over 4.5 m; the rear goes to 6 m', () => {
    // 1.69 m from the west side: enough for the single-storey house, short of the 1.74 m a 7.86 m house needs.
    expect(status(CENTRAL_COAST, { checks: front, plan: moved({ e: 5001.5 }) })['da-side']).toBe('pass')
    expect(status(CENTRAL_COAST, { checks: front, plan: moved({ e: 5001.5 }, p => twoStorey(p, 3.6)) })['da-side']).toBe('fail')
    const rear = run(CENTRAL_COAST, { checks: front, plan: p => twoStorey(p) })['da-rear']
    expect(rear.note).toMatch(/^The house rises over 4\.5 m, so this uses 6 m throughout/)
  })
  it('coverage 50% on this lot; cut 3 m and fill 1 m; walls over 600 mm near a boundary need an engineer', () => {
    expect(run(CENTRAL_COAST, { checks: front })['da-coverage'].limit).toBe('405.1 m² on 810.3 m²')
    expect(run(CENTRAL_COAST, { checks: front, earth: steep })['da-cut-fill']).toMatchObject({ status: 'pass', value: 'Cut 0.00 m within 1 m of the boundary, 1.33 m elsewhere; fill 0.92 m' })
    const walls = run(CENTRAL_COAST, { checks: front, plan: withRetaining, earth: steep })
    expect(walls['da-cut-fill'].status).toBe('fail')
    expect(walls['da-retaining']).toMatchObject({ status: 'warn', limit: 'Over 600 mm within 1 m of any boundary, 1 m elsewhere: designed by a professional engineer' })
  })
})

describe('Blue Mountains', () => {
  it('checks the controls its DCP has, and lists the four it couldn’t read', () => {
    expect(Object.keys(run(BLUE_MOUNTAINS, { checks: front }))).toEqual(['lot-inside', 'da-height', 'da-fsr', 'da-front', 'da-side', 'da-rear', 'da-coverage', 'da-landscaped', 'da-cut-fill', 'da-erosion'])
    expect(controlCount(BLUE_MOUNTAINS)).toEqual({ have: 9, of: 13 })
    expect(notChecked('da', BLUE_MOUNTAINS)[0]).toBe('Batter slopes: Blue Mountains’ own rule isn’t in the app yet')
  })
  it('front 8 m, else the neighbours’; 9 m from the lot in front on a battle-axe lot', () => {
    expect(run(BLUE_MOUNTAINS, { checks: front })['da-front']).toMatchObject({ status: 'warn', limit: 'Within 20% of the average setback of the buildings on the adjoining lots, else 8 m' })
    expect(run(BLUE_MOUNTAINS, { checks: { ...front, battleAxe: true } })['da-front']).toMatchObject({
      status: 'fail',
      title: 'Setback from the lot in front',
      limit: '9 m from the rear boundary of the lot in front',
    })
  })
  it('two-storey parts sit further back: 1.5 m from the sides, 6 m from the rear', () => {
    const two = run(BLUE_MOUNTAINS, { checks: front, plan: p => twoStorey(p) })
    expect(two['da-side'].value).toBe('6.19 m to the west side, upper floor 7.37 m')
    // 4.8 m from the rear: enough on one storey, not with the upper floor.
    expect(status(BLUE_MOUNTAINS, { checks: front, plan: moved({ n: 8015 }) })['da-rear']).toBe('pass')
    expect(status(BLUE_MOUNTAINS, { checks: front, plan: moved({ n: 8015 }, p => twoStorey(p)) })['da-rear']).toBe('fail')
  })
  it('site cover 40%, pervious area 40%, cut and fill “generally” 1 m, and an erosion plan', () => {
    const r = run(BLUE_MOUNTAINS, { checks: front, earth: steep })
    expect(r['da-coverage'].limit).toBe('324.1 m² on 810.3 m²')
    expect(r['da-landscaped']).toMatchObject({ title: 'Pervious area', status: 'pass', limit: '324.1 m² on 810.3 m²' })
    expect(r['da-cut-fill']).toMatchObject({ status: 'warn', value: 'Cut 1.33 m; fill 0.92 m, outside the house' })
    expect(r['da-erosion'].limit).toBe('An erosion and sediment control plan (under 2,500 m²)')
  })
})

describe('the registry finds the new councils', () => {
  it('by LGA and LEP name', () => {
    const names: [string, string][] = [
      ['Kiama Municipal Council', 'kiama'],
      ['Kiama Local Environmental Plan 2011', 'kiama'],
      ['Blue Mountains City Council', 'blue-mountains'],
      ['Blue Mountains LEP 2015', 'blue-mountains'],
      ['Central Coast Council', 'central-coast'],
      ['Central Coast Local Environmental Plan 2022', 'central-coast'],
    ]
    for (const [n, id] of names) expect(councilFor(n)?.id, n).toBe(id)
  })
  it('and not the two whose DCPs couldn’t be read', () => {
    for (const n of ['Shellharbour City Council', 'Shellharbour Local Environmental Plan 2013', 'Lake Macquarie City Council']) expect(councilFor(n), n).toBeNull()
  })
})
