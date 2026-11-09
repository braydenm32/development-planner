// The estimate: each element's quantity from the design (src/plan/quantities.ts) times its
// rate, grouped as a builder prices a house, with a quote in place of the estimate wherever
// there is one, then the fees and the council and government fees (src/costs/govFees.ts). Under
// the groups, unfolded: the subtotal, the builder's margin (none when you build it yourself, who
// pays for the owner-builder permit instead), the contingency and the total, then the likely
// range and the cost per m² of floor.

import { floorTypeInfo, type FloorTypeId } from '../plan/floorTypes'
import { WET_ROOMS, type DesignQuantities } from '../plan/quantities'
import { contribution, DA_FEE_YEAR, daFee, LSL, longServiceLevy, NO_FEE_CONTEXT, type FeeContext } from './govFees'
import type { CostsData, Quote, Who } from './model'
import { CHOICE_GROUPS, CHOICES, choiceRate, finishFactor, finishGuide, GROUPS, HOUSE_GROUPS, RANGE, rateInfo, WORKS_GROUPS, type ChoiceGroup, type GroupId, type RateId, type Unit } from './rates'

/** What a line measures, to point out on the plan. */
export interface Target {
  /**
   * floor: the floor being shown; ground: the lowest floor; walls, openings, rooms, areas, roofs,
   * retaining, stairs: those items by id; cut and fill: where the ground is dug or filled.
   */
  kind: 'floor' | 'ground' | 'walls' | 'openings' | 'rooms' | 'areas' | 'roofs' | 'retaining' | 'stairs' | 'cut' | 'fill'
  ids?: string[]
}

export interface CostLine {
  /** Stable across changes to the design, so a quote stays on its line. */
  id: string
  /** Its group; the margin and contingency are the summary under the groups. */
  group: GroupId | 'summary'
  label: string
  /** Where its quantity comes from, in a few words: "From Cut & fill", "3 windows". */
  from: string
  qty: number
  unit: Unit
  /** Decimals the quantity is shown with, as the panel it comes from shows it. */
  dp: number
  /** $ per unit, finish level applied; null for a share of other lines. */
  rate: number | null
  rateId: RateId | null
  /** Quantity times rate. */
  estimate: number
  quote: Quote | null
  /** The quote where there is one, else the estimate. */
  amount: number
  /** The share of the amount that is materials (and fees). */
  share: number
  materials: number
  labour: number
  target: Target | null
  /** Where its quantity lives in the app, as area/tab. */
  at: string | null
  /** Nothing to count yet: what to draw. */
  missing: string | null
  /** A share of other lines (margin, contingency): it can't be quoted. */
  computed: boolean
}

export interface CostGroup {
  id: GroupId
  label: string
  lines: CostLine[]
  total: number
  quoted: number
}

export interface Estimate {
  who: Who
  groups: CostGroup[]
  /** Every line: the groups' lines, then the summary's (margin and contingency). */
  lines: CostLine[]
  /** The building work: every group but the fees. */
  works: number
  /** What the groups come to, before the margin and contingency. */
  subtotal: number
  /** The builder's margin on the building work (0 when you build it yourself), and its share. */
  margin: { amount: number; share: number }
  /** The contingency on the subtotal and margin, and its share. */
  contingency: { amount: number; share: number }
  /** The estimated cost of the building work the council and government fees go on. */
  feeBasis: number
  total: number
  low: number
  high: number
  floorArea: number
  /** Total per m² of floor; null before there is any floor. */
  perM2: number | null
  /**
   * The house itself per m² of floor, as the finish guides measure it: the slab to the services,
   * with a builder's margin on them, but not site works, outside works, fees or contingency.
   */
  housePerM2: number | null
  /**
   * The same total with the house itself priced from the finish guide instead (its low and high
   * per m² of floor), everything else as it is; null before there is any floor.
   */
  guide: { low: number; high: number } | null
  /** The total split into materials (and fees) and labour. */
  materials: number
  labour: number
  /** Lines with a quote, and lines that can have one. */
  quoted: number
  quotable: number
  /**
   * The design has outside walls (a closed outline). Before them the lines are only allowances,
   * so no total is shown: an empty design used to read as a $47,740 house.
   */
  ready: boolean
  /** What a house is priced on that the design doesn't have yet, in words ("roof", "windows"). */
  missing: string[]
}

/** Whole dollars, as a line's words say them. */
const money0 = (n: number) => `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const listOf = (names: string[]) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/** A rate as the project has it: its own, or the starting rate. */
export const rateFor = (data: Pick<CostsData, 'rates'>, id: RateId): number => data.rates[id] ?? rateInfo(id).rate

const ROOF_TYPES = { hip: 'Hip', gable: 'Gable', skillion: 'Skillion', flat: 'Flat' } as const

/** The estimate for a design's quantities and the project's costs, for the council and pathway in `fees`. */
export function estimate(q: DesignQuantities, data: CostsData, fees: FeeContext = NO_FEE_CONTEXT): Estimate {
  const finish = finishFactor(data.choices.finish)
  const lines: CostLine[] = []
  const add = (
    id: string,
    rateId: RateId,
    qty: number,
    o: { label?: string; from: string; dp?: number; target?: Target | null; at?: string | null; missing?: string | null },
  ) => {
    const info = rateInfo(rateId)
    const rate = rateFor(data, rateId) * (info.finish ? finish : 1)
    const est = qty * rate
    const quote = data.quotes[id] ?? null
    const amount = quote ? quote.amount : est
    lines.push({
      id,
      group: info.group,
      label: o.label ?? info.label,
      from: o.from,
      qty,
      unit: info.unit,
      dp: o.dp ?? 0,
      rate,
      rateId,
      estimate: est,
      quote,
      amount,
      share: info.materials,
      materials: amount * info.materials,
      labour: amount * (1 - info.materials),
      target: o.target ?? null,
      at: o.at ?? null,
      missing: o.missing ?? null,
      computed: false,
    })
  }
  const choice = (g: ChoiceGroup) => CHOICES[g].options.find(o => o.id === data.choices[g]) ?? CHOICES[g].options[0]

  // Preliminaries
  add('prelims', 'prelims', q.floorArea, { from: 'Per m² of floor', dp: 2, target: { kind: 'floor' }, at: 'design/rooms' })

  // Site works
  add('site-setup', 'site-setup', 1, { from: 'Allowance' })
  const e = q.earth
  const noEarth = 'Nothing levelled yet: draw the house’s walls'
  add('cut', 'cut', e?.cut ?? 0, { label: 'Dig out (cut)', from: 'From Cut & fill', dp: 1, target: { kind: 'cut' }, at: 'earthworks/cut-fill', missing: e ? null : noEarth })
  add('fill', 'fill', e?.fill ?? 0, { label: 'Fill, placed and compacted', from: 'From Cut & fill', dp: 1, target: { kind: 'fill' }, at: 'earthworks/cut-fill', missing: e ? null : noEarth })
  if (e && e.net >= 0.05) add('spoil', 'spoil', e.net, { label: 'Take away spare earth', from: 'Cut less fill, from Cut & fill', dp: 1, target: { kind: 'cut' }, at: 'earthworks/cut-fill' })
  if (e && e.net <= -0.05) add('import', 'import', -e.net, { label: 'Bring in fill', from: 'Fill less cut, from Cut & fill', dp: 1, target: { kind: 'fill' }, at: 'earthworks/cut-fill' })
  for (const kind of ['sleeper', 'block'] as const) {
    const r = q.retaining[kind]
    if (!r.count) continue
    add(`retaining-${kind}`, `retaining-${kind}`, r.area, {
      from: `${plural(r.count, 'wall')}, ${r.length.toFixed(1)} m long, holding back up to ${r.maxHeight.toFixed(2)} m`,
      dp: 1,
      target: { kind: 'retaining', ids: r.ids },
      at: 'earthworks/retaining-walls',
    })
  }
  // Walls nobody has drawn yet but the cut and fill need: its vertical edges, priced as block walls.
  const im = q.impliedRetaining
  if (im?.count)
    add('retaining-implied', 'retaining-block', im.face, {
      label: 'Retaining walls the cut and fill imply (not drawn)',
      from: `${plural(im.count, 'implied wall')}, ${im.length.toFixed(1)} m long, holding back up to ${im.maxHeight.toFixed(2)} m`,
      dp: 1,
      target: { kind: 'cut' },
      at: 'earthworks/cut-fill',
    })

  // Slab and floor
  if (q.ground)
    for (const p of q.ground.parts) {
      const id = `floor-${p.type}` as `floor-${FloorTypeId}`
      add(id, id, p.area, {
        label: floorTypeInfo(p.type).label,
        from: q.ground.parts.length > 1 ? `Part of the ${q.ground.name.toLowerCase()}, from Design › Floors` : `${q.ground.name}, from Design › Floors`,
        dp: 2,
        target: { kind: 'ground' },
        at: 'design/floors',
      })
    }
  else add('floor-slab', 'floor-slab', 0, { label: 'Slab on ground', from: 'From Design › Floors', dp: 2, at: 'design/floors', missing: 'No floor enclosed by walls yet' })
  if (q.upper.area > 0) add('floor-upper', 'floor-upper', q.upper.area, { from: listOf(q.upper.names), dp: 2, target: { kind: 'floor' }, at: 'design/floors' })
  // A split level's slab poured on the ground under an upper level: once, as slab on ground.
  if (q.slabUnder.area > 0)
    add('floor-slab-under', 'floor-slab', q.slabUnder.area, {
      label: `Slab on ground under the ${listOf(q.slabUnder.names.map(n => n.toLowerCase()))}`,
      from: listOf(q.slabUnder.areas),
      dp: 2,
      target: { kind: 'areas', ids: q.slabUnder.ids },
      at: 'design/floors',
    })

  // Frame
  const frame = choice('frame')
  add('frame', choiceRate('frame', frame.id), q.floorArea, { label: `Wall frames and roof trusses, ${frame.label.toLowerCase()}`, from: 'Per m² of floor', dp: 2, target: { kind: 'floor' }, at: 'design/rooms' })
  if (q.stairs.count) add('stairs', 'stairs', q.stairs.count, { label: q.stairs.count === 1 ? 'Stair' : 'Stairs', from: plural(q.stairs.count, 'stair'), target: { kind: 'stairs', ids: q.stairs.ids }, at: 'design/plan' })

  // Roof
  const roof = choice('roof')
  const r0 = q.roofs.first
  add('roof', choiceRate('roof', roof.id), q.roofs.area, {
    label: `Roofing, ${roof.label}, with sarking and gutters`,
    from: q.roofs.count > 1 ? `${q.roofs.count} roofs, sloping area` : r0 ? `${ROOF_TYPES[r0.type]} ${r0.pitch}°, eaves ${Math.round(r0.overhang * 1000)} mm` : 'From Design › Roofs',
    dp: 1,
    target: { kind: 'roofs', ids: q.roofs.ids },
    at: 'design/roofs',
    missing: q.roofs.count ? null : 'No roof drawn yet',
  })

  // Walls and cladding
  const walls = choice('walls')
  add('cladding', choiceRate('walls', walls.id), q.walls.net, {
    label: `External walls, ${walls.label.toLowerCase()}`,
    from: 'Outside walls, less windows and doors',
    dp: 1,
    target: { kind: 'walls', ids: q.walls.ids },
    at: 'design/plan',
    missing: q.walls.net > 0 ? null : 'No outside walls yet',
  })

  // Windows and doors
  const win = choice('windows')
  add('windows', choiceRate('windows', win.id), q.windows.area, {
    label: `Windows, ${win.label.toLowerCase()}`,
    from: plural(q.windows.count, 'window'),
    dp: 2,
    target: { kind: 'openings', ids: q.windows.ids },
    at: 'design/plan',
    missing: q.windows.count ? null : 'No windows drawn yet',
  })
  add('door-external', 'door-external', q.externalDoors.count, {
    label: 'External doors',
    from: `${plural(q.externalDoors.count, 'door')} in outside walls`,
    target: { kind: 'openings', ids: q.externalDoors.ids },
    at: 'design/plan',
    missing: q.externalDoors.count ? null : 'No outside doors drawn yet',
  })
  if (q.garageDoors.count)
    add('door-garage', 'door-garage', q.garageDoors.count, {
      label: q.garageDoors.count === 1 ? 'Garage door' : 'Garage doors',
      from: q.garageDoors.sizes.map(([w, h]) => `${w.toFixed(1)} × ${h.toFixed(1)} m`).join(', '),
      target: { kind: 'openings', ids: q.garageDoors.ids },
      at: 'design/plan',
    })
  add('door-internal', 'door-internal', q.internalDoors.count, {
    label: 'Internal doors',
    from: plural(q.internalDoors.count, 'door'),
    target: { kind: 'openings', ids: q.internalDoors.ids },
    at: 'design/plan',
    missing: q.internalDoors.count ? null : 'No internal doors drawn yet',
  })

  // Fit-out
  add('linings', 'linings', q.floorArea, { from: 'Per m² of floor', dp: 2, target: { kind: 'floor' }, at: 'design/rooms' })
  add('fix-out', 'fix-out', q.floorArea, { label: 'Fix-out: skirting, architraves, wardrobes', from: 'Per m² of floor', dp: 2, target: { kind: 'floor' }, at: 'design/rooms' })
  add('floor-finishes', 'floor-finishes', q.finishes.area, {
    label: 'Floor finishes',
    from: q.finishes.count ? 'Rooms, except a garage' : 'From Rooms & areas',
    dp: 2,
    target: { kind: 'rooms', ids: q.finishes.ids },
    at: 'design/rooms',
    missing: q.finishes.count ? null : 'No rooms named yet',
  })
  const wetIds: string[] = []
  let wetCount = 0
  for (const w of WET_ROOMS) {
    const c = q.wet[w.id]
    if (!c.count) continue
    wetIds.push(...c.ids)
    wetCount += c.count
    add(w.id, w.id, c.count, {
      label: cap(c.count === 1 ? w.label : w.plural),
      from: c.count === 1 ? `${c.names[0]}, ${c.area.toFixed(2)} m²` : listOf(c.names),
      target: { kind: 'rooms', ids: c.ids },
      at: 'design/rooms',
    })
  }

  // Services
  add('electrical', 'electrical', q.floorArea, { label: 'Electrical, lights and power', from: 'Per m² of floor', dp: 2, target: { kind: 'floor' }, at: 'design/rooms' })
  add('drainage', 'drainage', 1, { from: 'Allowance: sewer, stormwater and water' })
  if (wetCount) add('plumbing', 'plumbing', wetCount, { from: plural(wetCount, 'wet room'), target: { kind: 'rooms', ids: wetIds }, at: 'design/rooms' })

  // Outside
  const outdoor = [
    ['driveway', 'driveway', 'Driveway, concrete', 'earthworks/driveway'],
    ['slab', 'outdoor-slab', 'Outdoor slabs', 'design/rooms'],
    ['deck', 'deck', 'Decks', 'design/rooms'],
    ['garden', 'garden', 'Garden and lawn', 'design/rooms'],
  ] as const
  for (const [kind, id, label, at] of outdoor) {
    const c = q.outdoor[kind]
    if (!c.count) continue
    add(id, id, c.area, { label: c.count === 1 && kind !== 'garden' ? label.replace(/s$/, '') : label, from: kind === 'driveway' ? 'From Earthworks › Driveway' : listOf(c.names), dp: 2, target: { kind: 'areas', ids: c.ids }, at })
  }

  // Fees and allowances
  const works = lines.filter(l => WORKS_GROUPS.includes(l.group as GroupId)).reduce((t, l) => t + l.amount, 0)
  add('fees', 'fees', 1, { from: 'Allowance' })
  if (data.who === 'owner') add('permit', 'permit', 1, { from: 'NSW permit and the approved course', at: null })

  // Council and government fees, on what the building work would cost: with the builder's margin
  // when a builder builds it, as a contract price would have it.
  const marginAmount = data.who === 'builder' ? works * data.margin : 0
  const feeBasis = works + marginAmount
  const basis = money0(feeBasis)
  const gov = (id: string, label: string, est: number, from: string, at: string | null = null) => {
    const quote = data.quotes[id] ?? null
    const amount = quote ? quote.amount : est
    lines.push({ id, group: 'gov', label, from, qty: 1, unit: 'item', dp: 0, rate: null, rateId: null, estimate: est, quote, amount, share: 1, materials: amount, labour: 0, target: null, at, missing: null, computed: false })
  }
  gov(
    'da-fee',
    'Development application fee',
    fees.da ? daFee(feeBasis) : 0,
    fees.da ? `NSW scale ${DA_FEE_YEAR}, on ${basis} of work` : 'None for complying development (CDC): the certifier’s fee is in Fees',
    'design/checks',
  )
  gov('lsl', 'Long service levy', longServiceLevy(feeBasis), feeBasis >= LSL.from ? `0.25% of ${basis} of work` : `None for work under ${money0(LSL.from)}`)
  const c = contribution(fees.council?.id ?? null, feeBasis)
  gov(
    'contribution',
    'Council development contribution',
    c?.amount ?? 0,
    c
      ? `${c.plan.plan}: ${Number((c.rate * 100).toFixed(2))}% of ${basis}${c.plan.except ? `, ${c.plan.except}` : ''}`
      : fees.council
        ? `No figure for ${fees.council.name} here yet: ask the council and add it`
        : 'Switch on your council in Design › Checks, or ask the council and add it',
    'design/checks',
  )

  // The summary under the groups: margin and contingency, each a share of what's above it.
  const summary = (id: string, label: string, from: string, amount: number, materials: number): CostLine => ({
    id,
    group: 'summary',
    label,
    from,
    qty: 1,
    unit: 'item',
    dp: 0,
    rate: null,
    rateId: null,
    estimate: amount,
    quote: null,
    amount,
    share: amount ? materials / amount : 0,
    materials,
    labour: amount - materials,
    target: null,
    at: null,
    missing: null,
    computed: true,
  })
  const pct = (x: number) => `${Number((x * 100).toFixed(1))}%`
  const subtotal = lines.reduce((t, l) => t + l.amount, 0)
  // A builder's margin is the builder's own, neither materials nor a trade's labour: shown with the materials and fees.
  if (data.who === 'builder') lines.push(summary('margin', 'Builder’s margin and overheads', `${pct(data.margin)} of the building work`, marginAmount, marginAmount))
  const before = subtotal + marginAmount
  const beforeMaterials = lines.reduce((t, l) => t + l.materials, 0)
  const cont = before * data.contingency
  lines.push(summary('contingency', 'Contingency', `${pct(data.contingency)} of the above`, cont, before ? cont * (beforeMaterials / before) : 0))

  const total = before + cont
  const materials = lines.reduce((t, l) => t + l.materials, 0)
  const groups = GROUPS.map(g => {
    const ls = lines.filter(l => l.group === g.id)
    return { id: g.id, label: g.label, lines: ls, total: ls.reduce((t, l) => t + l.amount, 0), quoted: ls.filter(l => l.quote).length }
  }).filter(g => g.lines.length > 0)
  const open = lines.filter(l => !l.computed)
  // What's priced at nothing because it isn't drawn: the total leaves it out, so it says so.
  const missing = [
    q.walls.perimeter > 0 ? null : 'outside walls',
    q.roofs.count ? null : 'roof',
    q.windows.count ? null : 'windows',
    q.externalDoors.count ? null : 'outside doors',
    q.finishes.count || wetCount ? null : 'rooms',
  ].filter((m): m is string => m !== null)
  const house = open.filter(l => HOUSE_GROUPS.includes(l.group as GroupId)).reduce((t, l) => t + l.amount, 0) * (data.who === 'builder' ? 1 + data.margin : 1)
  // The guide's figure for the house has a builder's margin in it already; the contingency goes on top, as on the rest.
  const band = finishGuide(data.choices.finish)
  const rest = total - house * (1 + data.contingency)
  const guide = q.floorArea > 0 ? { low: rest + band.low * q.floorArea * (1 + data.contingency), high: rest + band.high * q.floorArea * (1 + data.contingency) } : null
  return {
    who: data.who,
    groups,
    lines,
    works,
    subtotal,
    margin: { amount: marginAmount, share: data.who === 'builder' ? data.margin : 0 },
    contingency: { amount: cont, share: data.contingency },
    feeBasis,
    total,
    low: total * (1 - RANGE),
    high: total * (1 + RANGE),
    floorArea: q.floorArea,
    perM2: q.floorArea > 0 ? total / q.floorArea : null,
    housePerM2: q.floorArea > 0 ? house / q.floorArea : null,
    guide,
    materials,
    labour: total - materials,
    quoted: open.filter(l => l.quote).length,
    quotable: open.length,
    ready: q.walls.perimeter > 0,
    missing,
  }
}

/** For each material choice, how much each other option adds to the total (negative saves). */
export function choiceDeltas(q: DesignQuantities, data: CostsData, fees: FeeContext = NO_FEE_CONTEXT): Record<ChoiceGroup, Record<string, number>> {
  const now = estimate(q, data, fees).total
  const out = {} as Record<ChoiceGroup, Record<string, number>>
  for (const g of CHOICE_GROUPS) {
    out[g] = {}
    for (const o of CHOICES[g].options) out[g][o.id] = o.id === data.choices[g] ? 0 : estimate(q, { ...data, choices: { ...data.choices, [g]: o.id } }, fees).total - now
  }
  return out
}

/** The lines a choice changes, by id. */
export const CHOICE_LINES: Record<ChoiceGroup, string[]> = {
  frame: ['frame'],
  walls: ['cladding'],
  roof: ['roof'],
  windows: ['windows'],
  finish: ['door-internal', 'linings', 'fix-out', 'floor-finishes', 'kitchen', 'bathroom', 'laundry', 'toilet'],
}
