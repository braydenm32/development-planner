// The estimate, worked by hand from made-up quantities: each line its quantity times its rate,
// the builder's margin on the building work, the contingency on everything, the likely range,
// the cost per m², quotes in place of estimates, owner-builder's materials and labour, what a
// material choice adds or saves, and the CSV.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FinishGuide } from '../CostsTabs'
import type { DesignQuantities } from '../../plan/quantities'
import { CHOICE_LINES, choiceDeltas, estimate, rateFor, type Estimate } from '../estimate'
import { CAVEAT_LINE } from '../../legal/caveat'
import { atName, dateText, delta, estimateCsv, incompleteText, money, parseMoney, qtyText, rateText } from '../format'
import { costsSummary, emptyCosts, normalizeCosts, type CostsData } from '../model'
import { CHOICES, CONTINGENCY, FINISH_GUIDES, FINISH_LEVELS, finishGuide, MARGIN, RANGE, rateInfo, STARTING_RATES, type RateId } from '../rates'
import { daFee, longServiceLevy, type FeeContext } from '../govFees'

const R = (id: RateId) => rateInfo(id).rate
const share = (id: RateId) => rateInfo(id).materials
const none = () => ({ count: 0, area: 0, ids: [] as string[] })
const named = () => ({ ...none(), names: [] as string[] })

/**
 * A 100 m² single-storey house: a slab, 100 m² of outside wall net of 4 m² of windows, a front
 * door and two inside, three finished rooms (80 m²) of which a kitchen and a bathroom, a 120 m²
 * roof, 50 m³ cut and 30 m³ fill, and a 40 m² driveway.
 */
function quantities(): DesignQuantities {
  return {
    floorArea: 100,
    ground: { level: 'g', name: 'Ground floor', area: 100, parts: [{ type: 'slab', area: 100 }] },
    upper: { area: 0, names: [] },
    slabUnder: { ...none(), names: [], areas: [] },
    finishes: { count: 3, area: 80, ids: ['r1', 'r2', 'r3'] },
    wet: {
      kitchen: { count: 1, area: 15, ids: ['r1'], names: ['Kitchen'] },
      bathroom: { count: 1, area: 8, ids: ['r2'], names: ['Bathroom'] },
      laundry: named(),
      toilet: named(),
    },
    walls: { perimeter: 40, gross: 108, openings: 8, net: 100, ids: ['w1'] },
    windows: { count: 2, area: 4, ids: ['o1', 'o2'] },
    externalDoors: { count: 1, area: 2, ids: ['o3'] },
    internalDoors: { count: 2, area: 3.3, ids: ['o4', 'o5'] },
    garageDoors: { ...none(), sizes: [] },
    stairs: none(),
    roofs: { count: 1, area: 120, ids: ['roof'], first: { id: 'roof', level: 'g', pts: [], type: 'hip', pitch: 22.5, overhang: 0.45, gables: [], lowEdge: 0 } },
    outdoor: { slab: named(), driveway: { count: 1, area: 40, ids: ['a1'], names: ['Driveway'] }, deck: named(), garden: named() },
    earth: { cut: 50, fill: 30, net: 20 },
    retaining: { sleeper: { ...none(), length: 0, maxHeight: 0 }, block: { ...none(), length: 0, maxHeight: 0 } },
  }
}

/** The building work, by hand, at the starting rates and the first choices (timber, brick veneer, Colorbond, aluminium, mid). */
const WORKS =
  100 * R('prelims') +
  R('site-setup') +
  50 * R('cut') +
  30 * R('fill') +
  20 * R('spoil') +
  100 * R('floor-slab') +
  100 * R('frame-timber') +
  120 * R('roof-colorbond') +
  100 * R('wall-brick') +
  4 * R('win-aluminium') +
  1 * R('door-external') +
  2 * R('door-internal') +
  100 * R('linings') +
  100 * R('fix-out') +
  80 * R('floor-finishes') +
  R('kitchen') +
  R('bathroom') +
  100 * R('electrical') +
  R('drainage') +
  2 * R('plumbing') +
  40 * R('driveway')

/** The council and government fees on a cost of work, with no council known, as a DA: the DA fee and the levy. */
const GOV = (cost: number) => daFee(cost) + longServiceLevy(cost)

/**
 * Complying development with no council: no DA fee and no contribution, so only the building and
 * the long service levy on it move the total. The house here costs over $250,000, so the levy is
 * 0.25% of every dollar of work, the builder's margin included.
 */
const CDC: FeeContext = { council: null, da: false }
const LEVIED = 1.0025

const line = (e: Estimate, id: string) => e.lines.find(l => l.id === id)!
const quote = (amount: number, from = 'A trade') => ({ amount, from, date: '2026-11-08' })

describe('the estimate, built by a builder', () => {
  const e = estimate(quantities(), emptyCosts())

  it('works each line out as its quantity times its rate', () => {
    expect(line(e, 'cut')).toMatchObject({ qty: 50, unit: 'm³', rate: R('cut'), estimate: 50 * R('cut'), amount: 50 * R('cut'), from: 'From Cut & fill', at: 'earthworks/cut-fill' })
    expect(line(e, 'spoil')).toMatchObject({ qty: 20, estimate: 20 * R('spoil') })
    expect(e.lines.some(l => l.id === 'import')).toBe(false)
    expect(line(e, 'floor-slab')).toMatchObject({ qty: 100, estimate: 100 * R('floor-slab'), at: 'design/floors' })
    expect(line(e, 'frame')).toMatchObject({ rateId: 'frame-timber', estimate: 100 * R('frame-timber') })
    expect(line(e, 'roof')).toMatchObject({ qty: 120, rateId: 'roof-colorbond', from: 'Hip 22.5°, eaves 450 mm', missing: null })
    expect(line(e, 'cladding')).toMatchObject({ qty: 100, rateId: 'wall-brick', from: 'Outside walls, less windows and doors' })
    expect(line(e, 'windows')).toMatchObject({ qty: 4, from: '2 windows', estimate: 4 * R('win-aluminium') })
    expect(line(e, 'door-internal')).toMatchObject({ qty: 2, from: '2 doors' })
    expect(line(e, 'kitchen')).toMatchObject({ qty: 1, unit: 'room', from: 'Kitchen, 15.00 m²' })
    expect(line(e, 'plumbing')).toMatchObject({ qty: 2, from: '2 wet rooms' })
    expect(line(e, 'driveway')).toMatchObject({ qty: 40, label: 'Driveway, concrete', from: 'From Earthworks › Driveway' })
    // nothing drawn, no line
    for (const id of ['door-garage', 'stairs', 'floor-upper', 'retaining-sleeper', 'retaining-block', 'deck', 'laundry', 'permit']) expect(e.lines.some(l => l.id === id), id).toBe(false)
  })

  it('adds the fees and the council and government fees, then the margin on the building work and the contingency on everything', () => {
    expect(e.works).toBeCloseTo(WORKS, 6)
    expect(line(e, 'fees').amount).toBe(R('fees'))
    // The DA fee and the levy go on what the work would cost, the builder's margin included.
    expect(e.feeBasis).toBeCloseTo(WORKS * (1 + MARGIN), 6)
    expect(line(e, 'da-fee')).toMatchObject({ group: 'gov', computed: false, rate: null, quote: null })
    expect(line(e, 'da-fee').amount).toBeCloseTo(daFee(WORKS * (1 + MARGIN)), 6)
    expect(line(e, 'lsl').amount).toBeCloseTo(longServiceLevy(WORKS * (1 + MARGIN)), 6)
    expect(line(e, 'contribution')).toMatchObject({ amount: 0, from: 'Switch on your council in Design › Checks, or ask the council and add it' })
    const subtotal = WORKS + R('fees') + GOV(WORKS * (1 + MARGIN))
    expect(e.subtotal).toBeCloseTo(subtotal, 6)
    expect(line(e, 'margin')).toMatchObject({ amount: WORKS * MARGIN, computed: true, group: 'summary', from: '20% of the building work' })
    expect(e.margin).toEqual({ amount: WORKS * MARGIN, share: MARGIN })
    const before = subtotal + WORKS * MARGIN
    expect(line(e, 'contingency')).toMatchObject({ computed: true, group: 'summary', from: '10% of the above' })
    expect(line(e, 'contingency').amount).toBeCloseTo(before * CONTINGENCY, 6)
    expect(e.contingency.amount).toBeCloseTo(before * CONTINGENCY, 6)
    expect(e.total).toBeCloseTo(before * (1 + CONTINGENCY), 6)
    // every line but the summary's is in a group, and the groups add up to the subtotal
    expect(e.groups.reduce((t, g) => t + g.total, 0)).toBeCloseTo(e.subtotal, 6)
    expect(e.groups.flatMap(g => g.lines).length).toBe(e.lines.length - 2)
    expect(e.groups.map(g => g.id)).toEqual(['prelims', 'site', 'floor', 'frame', 'roof', 'walls', 'openings', 'fitout', 'services', 'outside', 'fees', 'gov'])
    // Fees aren't marked up: the margin is on the building work only.
    expect(e.groups.find(g => g.id === 'fees')!.lines.map(l => l.id)).toEqual(['fees'])
  })

  it('gives the range 20% either way and the cost per m² of floor', () => {
    expect(RANGE).toBe(0.2)
    expect(e.low).toBeCloseTo(e.total * 0.8, 6)
    expect(e.high).toBeCloseTo(e.total * 1.2, 6)
    expect(e.floorArea).toBe(100)
    expect(e.perM2).toBeCloseTo(e.total / 100, 6)
    expect(estimate({ ...quantities(), floorArea: 0 }, emptyCosts()).perM2).toBeNull()
  })

  it('gives the house itself per m², as the finish guides measure it: no site works, outside works, fees or contingency', () => {
    // By hand: the slab, frame, roof, cladding, windows and doors, fit-out and services, with the builder's 20% on them.
    const house =
      100 * R('prelims') +
      100 * R('floor-slab') +
      100 * R('frame-timber') +
      120 * R('roof-colorbond') +
      100 * R('wall-brick') +
      4 * R('win-aluminium') +
      R('door-external') +
      2 * R('door-internal') +
      100 * R('linings') +
      100 * R('fix-out') +
      80 * R('floor-finishes') +
      R('kitchen') +
      R('bathroom') +
      100 * R('electrical') +
      R('drainage') +
      2 * R('plumbing')
    expect(e.housePerM2).toBeCloseTo((house * (1 + MARGIN)) / 100, 6)
    // Building it yourself: no margin.
    expect(estimate(quantities(), { ...emptyCosts(), who: 'owner' }).housePerM2).toBeCloseTo(house / 100, 6)
    expect(estimate({ ...quantities(), floorArea: 0 }, emptyCosts()).housePerM2).toBeNull()
  })

  it('prices the same total with the house from the finish guide, everything else as it is', () => {
    const g = finishGuide('mid')
    const house = e.housePerM2! * 100
    const rest = e.total - house * (1 + CONTINGENCY)
    expect(e.guide!.low).toBeCloseTo(rest + g.low * 100 * (1 + CONTINGENCY), 6)
    expect(e.guide!.high).toBeCloseTo(rest + g.high * 100 * (1 + CONTINGENCY), 6)
    expect(estimate({ ...quantities(), floorArea: 0 }, emptyCosts()).guide).toBeNull()
  })

  it('counts every line but the margin and the contingency as one that can be quoted', () => {
    expect(e.quoted).toBe(0)
    expect(e.quotable).toBe(e.lines.length - 2)
  })

  it('changes with the contingency and margin the project sets', () => {
    const x = estimate(quantities(), { ...emptyCosts(), contingency: 0.15, margin: 0.18 })
    expect(x.total).toBeCloseTo((WORKS * 1.18 + R('fees') + GOV(WORKS * 1.18)) * 1.15, 6)
    expect(line(x, 'contingency').from).toBe('15% of the above')
  })

  it('uses a rate the project changed, and the starting rate otherwise', () => {
    const data: CostsData = { ...emptyCosts(), rates: { cut: 62 } }
    expect(rateFor(data, 'cut')).toBe(62)
    expect(rateFor(data, 'fill')).toBe(R('fill'))
    const x = estimate(quantities(), data)
    expect(line(x, 'cut')).toMatchObject({ rate: 62, estimate: 50 * 62 })
    expect(x.works - e.works).toBeCloseTo(50 * (62 - R('cut')), 6)
  })

  it('says what to draw when there is nothing to count', () => {
    const q = quantities()
    const bare = estimate({ ...q, ground: null, earth: null, roofs: { count: 0, area: 0, ids: [], first: null }, windows: none(), externalDoors: none(), internalDoors: none(), finishes: none() }, emptyCosts())
    expect(line(bare, 'roof')).toMatchObject({ qty: 0, amount: 0, missing: 'No roof drawn yet' })
    expect(line(bare, 'floor-slab')).toMatchObject({ qty: 0, missing: 'No floor enclosed by walls yet' })
    expect(line(bare, 'cut').missing).toMatch(/^Nothing levelled yet/)
    expect(line(bare, 'windows').missing).toBe('No windows drawn yet')
    expect(line(bare, 'floor-finishes').missing).toBe('No rooms named yet')
  })

  it('brings fill in when there is more fill than cut', () => {
    const x = estimate({ ...quantities(), earth: { cut: 10, fill: 25, net: -15 } }, emptyCosts())
    expect(x.lines.some(l => l.id === 'spoil')).toBe(false)
    expect(line(x, 'import')).toMatchObject({ qty: 15, estimate: 15 * R('import') })
  })

  it('splits the ground floor by how each part is built', () => {
    const q = quantities()
    q.ground = { ...q.ground!, parts: [{ type: 'slab', area: 60 }, { type: 'piers', area: 40 }] }
    const x = estimate(q, emptyCosts())
    expect(line(x, 'floor-slab')).toMatchObject({ qty: 60, from: 'Part of the ground floor, from Design › Floors' })
    expect(line(x, 'floor-piers')).toMatchObject({ qty: 40, estimate: 40 * R('floor-piers') })
  })
})

describe('quotes', () => {
  const data: CostsData = { ...emptyCosts(), quotes: { cut: quote(2000, 'South Coast Earthmoving'), windows: quote(3500), 'door-garage': quote(3000) } }
  const plain = estimate(quantities(), emptyCosts(), CDC)
  const e = estimate(quantities(), data, CDC)

  it('replace the estimate on their line, which keeps the estimate to show struck through', () => {
    expect(line(e, 'cut')).toMatchObject({ amount: 2000, estimate: 50 * R('cut'), quote: { amount: 2000, from: 'South Coast Earthmoving' } })
    expect(line(e, 'windows')).toMatchObject({ amount: 3500, estimate: 4 * R('win-aluminium') })
  })

  it('carry into the margin and the contingency', () => {
    const change = 2000 - 50 * R('cut') + 3500 - 4 * R('win-aluminium')
    expect(e.works - plain.works).toBeCloseTo(change, 6)
    expect(plain.feeBasis).toBeGreaterThan(250_000)
    expect(e.total - plain.total).toBeCloseTo(change * (1 + MARGIN) * LEVIED * (1 + CONTINGENCY), 6)
  })

  it('count as lines quoted, by group too; a quote for a line the design doesn’t have counts for nothing', () => {
    expect(e.quoted).toBe(2)
    expect(e.quotable).toBe(plain.quotable)
    expect(e.groups.find(g => g.id === 'site')!.quoted).toBe(1)
    expect(e.groups.find(g => g.id === 'openings')!.quoted).toBe(1)
    expect(e.lines.some(l => l.id === 'door-garage')).toBe(false)
  })

  it('stay put when a material choice changes the rate under them', () => {
    const x = estimate(quantities(), { ...data, choices: { ...data.choices, windows: 'double' } })
    expect(line(x, 'windows')).toMatchObject({ amount: 3500, estimate: 4 * R('win-double') })
    expect(choiceDeltas(quantities(), data, CDC).windows.double).toBeCloseTo(0, 6)
  })

  it('take the council’s own figure in place of a rough council or government fee', () => {
    const x = estimate(quantities(), { ...emptyCosts(), quotes: { 'da-fee': quote(2100, 'Council') } })
    expect(line(x, 'da-fee')).toMatchObject({ amount: 2100, quote: { from: 'Council' } })
    expect(line(x, 'da-fee').estimate).toBeCloseTo(daFee(x.feeBasis), 6)
    expect(x.groups.find(g => g.id === 'gov')!.quoted).toBe(1)
  })
})

describe('building it yourself', () => {
  const data: CostsData = { ...emptyCosts(), who: 'owner', quotes: { cut: quote(2000) } }
  const e = estimate(quantities(), data)

  it('leaves out the builder’s margin and adds the permit and course', () => {
    expect(e.lines.some(l => l.id === 'margin')).toBe(false)
    expect(line(e, 'permit')).toMatchObject({ amount: R('permit'), group: 'fees' })
    const works = WORKS - 50 * R('cut') + 2000
    // No margin, so the council and government fees go on the work alone.
    expect(e.feeBasis).toBeCloseTo(works, 6)
    expect(e.margin).toEqual({ amount: 0, share: 0 })
    expect(e.total).toBeCloseTo((works + R('fees') + R('permit') + GOV(works)) * (1 + CONTINGENCY), 6)
    expect(e.quotable).toBe(estimate(quantities(), emptyCosts()).quotable + 1)
  })

  it('splits each line into materials and labour by its share, and the contingency in proportion', () => {
    for (const id of ['cladding', 'kitchen', 'fees'] as const) {
      const l = line(e, id)
      expect(l.materials, id).toBeCloseTo(l.amount * share(id === 'cladding' ? 'wall-brick' : id), 6)
      expect(l.materials + l.labour, id).toBeCloseTo(l.amount, 6)
    }
    // a quote splits the same way as the estimate it replaces
    expect(line(e, 'cut').materials).toBeCloseTo(2000 * share('cut'), 6)
    // A council or government fee is all fees.
    expect(line(e, 'da-fee').labour).toBe(0)
    const c = line(e, 'contingency')
    const open = e.lines.filter(l => !l.computed)
    const before = open.reduce((t, l) => t + l.amount, 0)
    const beforeMaterials = open.reduce((t, l) => t + l.materials, 0)
    expect(c.materials).toBeCloseTo(c.amount * (beforeMaterials / before), 6)
    expect(e.materials).toBeCloseTo(beforeMaterials * (1 + CONTINGENCY), 6)
    expect(e.materials + e.labour).toBeCloseTo(e.total, 6)
    expect(e.labour).toBeGreaterThan(0)
  })

  it('counts a builder’s margin with the materials and fees, so the split still adds up', () => {
    const b = estimate(quantities(), emptyCosts())
    expect(line(b, 'margin').labour).toBe(0)
    expect(b.materials + b.labour).toBeCloseTo(b.total, 6)
  })
})

describe('material choices', () => {
  const q = quantities()
  const data = emptyCosts()
  const d = choiceDeltas(q, data, CDC)
  const onTop = (1 + MARGIN) * LEVIED * (1 + CONTINGENCY)

  it('show what each other option adds or saves, with the margin and contingency on top', () => {
    expect(d.walls.brick).toBe(0)
    expect(d.walls.weatherboard).toBeCloseTo(100 * (R('wall-weatherboard') - R('wall-brick')) * onTop, 6)
    expect(d.walls['fibre-cement']).toBeCloseTo(100 * (R('wall-fibre-cement') - R('wall-brick')) * onTop, 6)
    expect(d.frame.steel).toBeCloseTo(100 * (R('frame-steel') - R('frame-timber')) * onTop, 6)
    expect(d.roof.terracotta).toBeCloseTo(120 * (R('roof-terracotta') - R('roof-colorbond')) * onTop, 6)
    expect(d.windows.timber).toBeCloseTo(4 * (R('win-timber') - R('win-aluminium')) * onTop, 6)
    expect(d.walls.weatherboard).toBeLessThan(0)
    expect(d.frame.steel).toBeGreaterThan(0)
  })

  it('scale the fit-out with the finish', () => {
    const fitout = 2 * R('door-internal') + 100 * R('linings') + 100 * R('fix-out') + 80 * R('floor-finishes') + R('kitchen') + R('bathroom')
    expect(d.finish.high).toBeCloseTo(fitout * (FINISH_LEVELS.high - 1) * onTop, 6)
    expect(d.finish.basic).toBeCloseTo(fitout * (FINISH_LEVELS.basic - 1) * onTop, 6)
    const high = estimate(q, { ...data, choices: { ...data.choices, finish: 'high' } })
    expect(line(high, 'linings').rate).toBeCloseTo(R('linings') * 1.45, 9)
    // a rate that isn't fit-out doesn't move
    expect(line(high, 'electrical').rate).toBe(R('electrical'))
    for (const id of CHOICE_LINES.finish) if (high.lines.some(l => l.id === id)) expect(rateInfo(line(high, id).rateId!).finish, id).toBe(true)
  })

  it('name the lines they change', () => {
    const e = estimate(q, { ...data, choices: { frame: 'steel', walls: 'weatherboard', roof: 'terracotta', windows: 'double', finish: 'mid' } })
    expect(line(e, 'frame').label).toBe('Wall frames and roof trusses, steel')
    expect(line(e, 'cladding').label).toBe('External walls, weatherboard')
    expect(line(e, 'roof').label).toBe('Roofing, Terracotta, with sarking and gutters')
    expect(line(e, 'windows').label).toBe('Windows, double glazed')
  })
})

describe('an estimate for a design that isn’t finished', () => {
  /** The house with these parts not drawn. */
  const without = (patch: Partial<DesignQuantities>) => estimate({ ...quantities(), ...patch }, emptyCosts())
  const noWalls: Partial<DesignQuantities> = {
    floorArea: 0,
    ground: null,
    walls: { perimeter: 0, gross: 0, openings: 0, net: 0, ids: [] },
    roofs: { ...none(), first: null },
    windows: none(),
    externalDoors: none(),
    internalDoors: none(),
    finishes: none(),
    wet: { kitchen: named(), bathroom: named(), laundry: named(), toilet: named() },
    earth: null,
    outdoor: { slab: named(), driveway: named(), deck: named(), garden: named() },
  }

  it('has no total before there are outside walls: only allowances would add up', () => {
    const e = without(noWalls)
    expect(e.ready).toBe(false)
    expect(e.missing).toEqual(['outside walls', 'roof', 'windows', 'outside doors', 'rooms'])
    // The allowances still come to something, which used to show as the total.
    expect(e.total).toBeGreaterThan(0)
  })

  it('totals once there are walls, and says what it leaves out', () => {
    const e = without({ roofs: { ...none(), first: null }, windows: none() })
    expect(e.ready).toBe(true)
    expect(e.missing).toEqual(['roof', 'windows'])
    expect(incompleteText(e.missing)).toBe('Incomplete: no roof, no windows')
    const whole = estimate(quantities(), emptyCosts())
    expect(whole.missing).toEqual([])
    expect(incompleteText(whole.missing)).toBe('')
  })

  it('says so in the CSV too', () => {
    const rows = estimateCsv(without({ roofs: { ...none(), first: null } }), 'House', 'November 2026').split('\r\n')
    const at = rows.findIndex(r => r.startsWith(',Estimate,'))
    expect(rows[at + 1]).toBe(',Incomplete: no roof.')
    const none_ = estimateCsv(without(noWalls), 'House', 'November 2026').split('\r\n')
    expect(none_.some(r => r.startsWith(',Estimate,'))).toBe(false)
    expect(none_).toContain(',No total yet. Draw the house’s outside walls to start the estimate.')
  })
})

describe('the CSV', () => {
  const data: CostsData = { ...emptyCosts(), quotes: { 'site-setup': quote(8450, 'Fence, Toilet & Co') } }
  const e = estimate(quantities(), data)
  const csv = estimateCsv(e, 'My "house"', 'November 2026')
  const rows = csv.split('\r\n')

  it('has a header, a row per line and per group, then the totals, with Windows line endings', () => {
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(rows[0]).toBe('Group,Item,Where the quantity comes from,Quantity,Unit,Rate ($),Estimate ($),Quote ($),Quote from,Amount ($)')
    expect(rows).toContain(`Site works,Dig out (cut),From Cut & fill,50.0,m³,${R('cut')},${50 * R('cut')},,,${50 * R('cut')}`)
    expect(rows).toContain(`Site works,Site works total,,,,,,,,${Math.round(e.groups.find(g => g.id === 'site')!.total)}`)
    // The summary under the groups, as the panel shows it.
    expect(rows).toContain(`,Subtotal,,,,,,,,${Math.round(e.subtotal)}`)
    expect(rows).toContain(`,Builder’s margin and overheads,20% of the building work,,,,,,,${Math.round(e.margin.amount)}`)
    expect(rows).toContain(`,Estimate,,,,,,,,${Math.round(e.total)}`)
    expect(rows).toContain(`,Likely low (−20%),,,,,,,,${Math.round(e.low)}`)
    expect(rows).toContain(`,Per m² of floor (100.00 m²),,,,,,,,${Math.round(e.perM2!)}`)
    expect(rows).toContain(`,"House only, per m² of floor (no site works, outside works, fees or contingency)",,,,,,,,${Math.round(e.housePerM2!)}`)
    // header, the groups' lines and totals, the subtotal and summary between blanks, five totals, a blank, the footer and caveat, and the last line ending
    expect(rows.length).toBe(1 + (e.lines.length - 2) + e.groups.length + 1 + 1 + 2 + 1 + 5 + 1 + 1 + 1 + 1)
  })

  it('quotes fields with commas and quote marks, and shows a quote beside its estimate', () => {
    expect(rows).toContain(`Site works,"Site set-up: temporary fence, toilet, skips",Allowance,,,${R('site-setup')},${R('site-setup')},8450,"Fence, Toilet & Co",8450`)
    expect(rows.at(-3)).toBe(',"My ""house"": built by a builder. 1 of ' + e.quotable + ' lines quoted. Starting rates are rough NSW figures as at November 2026, GST included."')
  })

  it('ends with the one caveat, as a field of its own', () => {
    expect(rows.at(-2)).toBe(`,"${CAVEAT_LINE}"`)
  })

  it('adds materials and labour columns for an owner-builder', () => {
    const ob = estimate(quantities(), { ...data, who: 'owner' })
    const r = estimateCsv(ob, 'House', 'November 2026').split('\r\n')
    expect(r[0].endsWith(',Amount ($),Materials and fees ($),Labour ($)')).toBe(true)
    const cut = line(ob, 'cut')
    expect(r).toContain(`Site works,Dig out (cut),From Cut & fill,50.0,m³,${R('cut')},${50 * R('cut')},,,${50 * R('cut')},${Math.round(cut.materials)},${Math.round(cut.labour)}`)
    expect(r).toContain(`,"Labour, if you hire trades",,,,,,,,${Math.round(ob.labour)},,`)
    expect(r).toContain(`,Materials and fees,,,,,,,,${Math.round(ob.materials)},,`)
  })
})

describe('how costs read', () => {
  it('writes whole dollars with commas and a true minus', () => {
    expect(money(205934.4)).toBe('$205,934')
    expect(money(999.5)).toBe('$1,000')
    expect(money(-3812)).toBe('−$3,812')
    expect(delta(2218)).toBe('+$2,218')
    expect(delta(-3812.2)).toBe('−$3,812')
    expect(delta(0.2)).toBe('+$0')
  })

  it('writes rates and quantities as the lines show them', () => {
    expect(rateText(750, 'm²')).toBe('$750/m²')
    expect(rateText(450, 'm² face')).toBe('$450/m²')
    expect(rateText(1600, 'each')).toBe('$1,600 each')
    expect(rateText(4500, 'room')).toBe('$4,500 a room')
    expect(rateText(9500, 'item')).toBe('$9,500')
    expect(qtyText({ qty: 11.2, unit: 'm²', dp: 2 })).toBe('11.20 m²')
    expect(qtyText({ qty: 226, unit: 'm³', dp: 1 })).toBe('226.0 m³')
    expect(qtyText({ qty: 3, unit: 'each', dp: 0 })).toBe('3 each')
    expect(qtyText({ qty: 1, unit: 'room', dp: 0 })).toBe('1 room')
    expect(qtyText({ qty: 1, unit: 'item', dp: 0 })).toBe('')
    expect(dateText('2026-11-08')).toBe('8 Nov 2026')
    expect(atName('earthworks/cut-fill')).toBe('Earthworks › Cut & fill')
    expect(atName('design/floors')).toBe('Design › Floors')
  })

  it('reads a typed amount, with or without a dollar sign and commas', () => {
    expect(parseMoney('1,250')).toBe(1250)
    expect(parseMoney('$1,250.50')).toBe(1250.5)
    expect(parseMoney(' 8450 ')).toBe(8450)
    expect(parseMoney('.5')).toBe(0.5)
    for (const bad of ['', 'abc', '-20', '1.2.3', '$']) expect(parseMoney(bad), bad).toBeNull()
  })
})

describe('the finish guides', () => {
  it('split RLB’s $2,500 to $7,600 per m² (before GST) into thirds, GST added, one after another', () => {
    // By hand: thirds of 2,500–7,600 are 4,200 and 5,900; ×1.1 is 2,750, 4,620, 6,490 and 8,360, rounded to $50.
    const edges = [2500, 4200, 5900, 7600].map(x => x * 1.1)
    const levels = ['basic', 'mid', 'high'] as const
    levels.forEach((f, i) => {
      expect(Math.abs(FINISH_GUIDES[f].low - edges[i])).toBeLessThanOrEqual(25)
      expect(Math.abs(FINISH_GUIDES[f].high - edges[i + 1])).toBeLessThanOrEqual(25)
      if (i > 0) expect(FINISH_GUIDES[f].low).toBe(FINISH_GUIDES[levels[i - 1]].high)
    })
    expect(finishGuide('nonsense')).toBe(FINISH_GUIDES.mid)
    expect(CHOICES.finish.options.map(o => o.id)).toEqual(levels)
  })
})

describe('the rates', () => {
  it('have a source, a materials share and a positive rate each, with unique ids', () => {
    const ids = STARTING_RATES.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of STARTING_RATES) {
      expect(r.rate, r.id).toBeGreaterThan(0)
      expect(r.materials, r.id).toBeGreaterThanOrEqual(0)
      expect(r.materials, r.id).toBeLessThanOrEqual(1)
      expect(r.source.length, r.id).toBeGreaterThan(5)
    }
  })
})

describe('a project’s costs', () => {
  it('start as a builder, the first choices, the starting rates, 10% contingency and no quotes', () => {
    expect(emptyCosts()).toEqual({ version: 1, who: 'builder', choices: { frame: 'timber', walls: 'brick', roof: 'colorbond', windows: 'aluminium', finish: 'mid' }, rates: {}, contingency: 0.1, margin: 0.2, quotes: {} })
  })

  it('keep what is sound from a saved record and drop the rest', () => {
    const d = normalizeCosts({
      who: 'owner',
      choices: { frame: 'steel', walls: 'straw', roof: 'terracotta' },
      rates: { cut: 60, fill: -5, nonsense: 10, spoil: Number.NaN },
      contingency: 3,
      margin: 0.15,
      quotes: { cut: { amount: 2000, from: 'Ann', date: '2026-11-08' }, fill: { amount: 'lots' }, windows: { amount: 900, from: 7 } },
    })
    expect(d).toEqual({
      version: 1,
      who: 'owner',
      choices: { frame: 'steel', walls: 'brick', roof: 'terracotta', windows: 'aluminium', finish: 'mid' },
      rates: { cut: 60 },
      contingency: 0.1,
      margin: 0.15,
      quotes: { cut: { amount: 2000, from: 'Ann', date: '2026-11-08' }, windows: { amount: 900, from: '', date: '' } },
    })
    expect(normalizeCosts(undefined)).toEqual(emptyCosts())
    expect(normalizeCosts('nope')).toEqual(emptyCosts())
  })

  it('say in a few words what they hold', () => {
    expect(costsSummary(emptyCosts())).toBe('Material choices')
    expect(costsSummary({ ...emptyCosts(), who: 'owner', rates: { cut: 60 }, quotes: { cut: quote(1), fill: quote(2) } })).toBe('2 quotes, 1 changed rate, built by the owner')
  })
})

describe('the house against the finish guide', () => {
  const guide = (e: Estimate) => renderToStaticMarkup(createElement(FinishGuide, { e }))

  it('says where a complete estimate sits', () => {
    const e = estimate(quantities(), emptyCosts())
    expect(e.missing).toEqual([])
    expect(guide(e)).toMatch(/ce-guide-tag (in|under|over)/)
  })

  it("holds back the comparison while the estimate is missing things, so cheap doesn't read as good news", () => {
    const e = estimate({ ...quantities(), windows: none(), externalDoors: none(), finishes: none() }, emptyCosts())
    expect(e.missing.length).toBeGreaterThan(0)
    expect(e.housePerM2).not.toBeNull()
    const html = guide(e)
    expect(html).not.toContain('ce-guide-tag')
    expect(html).not.toContain('the guide<')
    expect(html).toContain('Compare once there are ')
  })
})
