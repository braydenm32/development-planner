// Compare options: two options of the made-up garage floor on the made-up sample block, with
// different floor levels, give different cut and fill, and every number in the table is the one
// the rest of the app shows for that plan (the strip's hook, the checks' hook, the estimate's).

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useChecks } from '../../checks/useChecks'
import { useEstimate } from '../../costs/useEstimate'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Plan } from '../../plan/model'
import { useEarthworks } from '../../plan/useEarthworks'
import { emptyCosts } from '../../costs/model'
import type { Loaded } from '../../shell/useSite'
import { useKeyNumbers } from '../../shell/useKeyNumbers'
import { bestIn, checksText, differs, ROWS } from '../compare'
import { optionNumbers } from '../numbers'

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)

const option = (name: string, ffl: number): Plan => normalizePlan({ ...garageFloor(), name, placement: { e: 5006, n: 8004, rotation: 0, ffl } })
const slab = option('Slab', 45.5)
const piers = option('Piers', 46.3)
/** Checked for a DA with a council's rules on, so the sun to the neighbours is one of the checks. */
const da: Plan = { ...slab, name: 'DA', checks: { pathway: 'da', battleAxe: false, councils: { wollongong: true } } }

/** What the app's own hooks give for a plan, as the strip, Checks and Costs call them. */
function appNumbers(plan: Plan) {
  const box: { key?: ReturnType<typeof useKeyNumbers>; checks?: ReturnType<typeof useChecks>; est?: ReturnType<typeof useEstimate> } = {}
  function Probe() {
    const earth = useEarthworks(plan, survey, terrain)
    box.key = useKeyNumbers(plan, survey, terrain, earth)
    box.checks = useChecks(plan, survey, terrain, earth)
    box.est = useEstimate({ plan, survey, terrain, earth } as unknown as Loaded)
    return null
  }
  renderToStaticMarkup(<Probe />)
  return box as Required<typeof box>
}

describe('an option’s numbers', () => {
  it('different floor levels give different cut and fill', () => {
    const a = optionNumbers(slab, survey, terrain, emptyCosts(), [])
    const b = optionNumbers(piers, survey, terrain, emptyCosts(), [])
    expect(a.earth).not.toBeNull()
    expect(b.earth).not.toBeNull()
    expect(a.earth!.cut).not.toBeCloseTo(b.earth!.cut, 1)
    expect(a.earth!.fill).not.toBeCloseTo(b.earth!.fill, 1)
    expect(b.earth!.fill).toBeGreaterThan(a.earth!.fill)
    expect(a.ffl).toBe(45.5)
    expect(b.ffl).toBe(46.3)
  })

  it.each([
    ['slab', slab],
    ['piers', piers],
    ['DA', da],
  ])('the %s column matches the strip, Checks and Costs for that plan', (_n, plan) => {
    const n = optionNumbers(plan, survey, terrain, emptyCosts(), [])
    const app = appNumbers(plan)
    expect(n.floorArea).toBe(app.key.floorArea)
    expect(n.ffl).toBe(app.key.ffl)
    expect(n.earth).toEqual({ cut: app.key.earth!.cut, fill: app.key.earth!.fill, net: app.key.earth!.net, deepestCut: app.key.earth!.deepestCut, deepestFill: app.key.earth!.deepestFill })
    expect(n.retainingLength).toBe(app.key.retaining?.length ?? null)
    expect(n.checks.counts).toEqual(app.checks.counts)
    expect(n.cost.total).toBe(app.est.total)
    expect(n.cost.low).toBe(app.est.low)
    expect(n.cost.high).toBe(app.est.high)
    expect(n.cost.incomplete).toBe(app.est.lines.some(l => l.missing))
  })

  it('says Incomplete where the estimate has gaps (no roof is drawn on the garage floor)', () => {
    const n = optionNumbers(slab, survey, terrain, emptyCosts(), [])
    expect(n.cost.incomplete).toBe(true)
    const cost = ROWS.find(r => r.id === 'cost')!
    expect(cost.note!(n)).toMatch(/^Incomplete/)
  })
})

describe('the table’s rows', () => {
  const a = optionNumbers(slab, survey, terrain, emptyCosts(), [])
  const b = optionNumbers(piers, survey, terrain, emptyCosts(), [])
  const row = (id: string) => ROWS.find(r => r.id === id)!

  it('words each number as the app does', () => {
    expect(row('cut').text(a)).toBe(`${a.earth!.cut.toFixed(1)} m³`)
    expect(row('net').text(a)).toMatch(/m³ (to take away|to bring in)$/)
    expect(row('floor-area').text(a)).toBe(`${a.floorArea!.toFixed(2)} m²`)
    expect(row('ffl').text(b)).toBe('RL 46.30')
    // Design › Checks' summary, in its order: passes after what needs doing.
    expect(checksText(a)).toMatch(/\d+ OK$/)
  })

  it('marks the lowest cut and fill, and nothing on floor level or when they tie', () => {
    const cuts = bestIn(row('cut'), [a, b])
    expect(cuts.filter(Boolean)).toHaveLength(1)
    expect(cuts[a.earth!.cut < b.earth!.cut ? 0 : 1]).toBe(true)
    expect(bestIn(row('ffl'), [a, b])).toEqual([false, false])
    expect(bestIn(row('cut'), [a, a])).toEqual([false, false])
    expect(bestIn(row('cut'), [a])).toEqual([false])
  })

  it('leaves out a cost with gaps from the best-value mark', () => {
    const whole = { ...a, cost: { ...a.cost, total: 900_000, incomplete: false } }
    const gappy = { ...b, cost: { ...b.cost, total: 100, incomplete: true } }
    expect(bestIn(row('cost'), [whole, gappy])).toEqual([false, false])
    const cheaper = { ...b, cost: { ...b.cost, total: 800_000, incomplete: false } }
    expect(bestIn(row('cost'), [whole, cheaper])).toEqual([false, true])
  })

  it('left over is best when closest to nothing, either way', () => {
    const over = { ...a, earth: { ...a.earth!, net: 50 } }
    const short = { ...a, earth: { ...a.earth!, net: -10 } }
    expect(bestIn(row('net'), [over, short])).toEqual([false, true])
  })

  it('checks: fewer fails win, then fewer to check, then fewer unknowns or not drawn yet', () => {
    const c = (fail: number, warn: number, unknown: number, incomplete = 0) => ({ ...a, checks: { ...a.checks, counts: { fail, warn, unknown, incomplete, pass: 5, pending: 0, info: 0 } } })
    expect(bestIn(row('checks'), [c(1, 0, 0), c(0, 9, 9)])).toEqual([false, true])
    expect(bestIn(row('checks'), [c(0, 1, 0), c(0, 0, 3)])).toEqual([false, true])
    // An option that's barely drawn can't win by having nothing to fail.
    expect(bestIn(row('checks'), [c(0, 0, 0, 9), c(0, 0, 1)])).toEqual([false, true])
    expect(checksText(c(0, 1, 0, 2))).toBe('1 to confirm · 2 not drawn yet · 5 OK')
  })

  it('checks: the Checks panel’s words, trees marked for removal on their own, and what they were checked against', () => {
    const counts = { fail: 1, warn: 0, unknown: 1, incomplete: 0, pass: 5, pending: 2, info: 0 }
    const n = { ...a, checks: { counts, pathway: 'da' as const, council: 'Wollongong', fix: ['Batter slopes'], confirm: [] } }
    expect(checksText(n)).toBe('1 to fix · 1 fact to add · 2 to remove · 5 OK')
    expect(checksText(n)).not.toMatch(/can’t tell yet/)
    expect(row('checks').note!(n)).toBe('DA (Wollongong)')
    expect(row('checks').note!(a)).toBe('CDC (Housing Code)')
    const d = optionNumbers(da, survey, terrain, emptyCosts(), [])
    expect(d.checks).toMatchObject({ pathway: 'da', council: 'Wollongong' })
  })

  it('height and levels are the checks’ own numbers, with no best', () => {
    const app = appNumbers(slab)
    expect(a.height).toBe(app.checks.measures.height)
    expect(a.levels).toBe(app.checks.measures.levels)
    expect(a.storeys).toBe(app.checks.measures.storeys)
    expect(row('height').text(a)).toBe(`${app.checks.measures.height.toFixed(2)} m`)
    expect(row('levels').text(a)).toBe('1 level')
    expect(bestIn(row('height'), [a, { ...a, height: 1 }])).toEqual([false, false])
  })

  it('each option lists its own checks to fix and to confirm, as Checks names them', () => {
    const d = optionNumbers(da, survey, terrain, emptyCosts(), [])
    const app = appNumbers(da)
    expect(d.checks.fix).toEqual(app.checks.results.filter(r => r.status === 'fail').map(r => r.title))
    expect(d.checks.confirm).toEqual(app.checks.results.filter(r => r.status === 'warn').map(r => r.title))
    expect(d.checks.fix.length).toBe(d.checks.counts.fail)
    expect(row('to-fix').list!(d)).toEqual(d.checks.fix)
    const clean = { ...d, checks: { ...d.checks, fix: [] } }
    expect(row('to-fix').text(clean)).toBe('Nothing')
  })

  it('differences only keeps the rows where the options say something different', () => {
    expect(differs(row('ffl'), [a, b])).toBe(true)
    expect(differs(row('floor-area'), [a, b])).toBe(false)
    expect(differs(row('levels'), [a, b])).toBe(false)
    expect(differs(row('to-fix'), [a, { ...a, checks: { ...a.checks, fix: [...a.checks.fix, 'Batter slopes'] } }])).toBe(true)
  })
})
