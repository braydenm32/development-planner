// Rough starting rates for building in NSW, November 2026, including GST: what a trade charges
// to supply and install, before a builder's margin (which the estimate adds as its own line
// when a builder builds it). Every rate can be changed for a project (Costs › More › Rates),
// and a quote replaces a line's estimate altogether.
//
// Each rate has a materials share: the part of it that is materials (and plant, tip fees or
// fees), the rest being labour. An owner-builder sees the two apart. Where a public guide gave
// a range, the rate sits inside it; where none was found it says so plainly ("Rough figure").

/** When the starting rates were set. */
export const RATES_AS_AT = 'November 2026'

/** How far either way the true cost could reasonably land: the estimate's ± range. */
export const RANGE = 0.2

/** Contingency for the unknown, as a share of everything else (editable per project). */
export const CONTINGENCY = 0.1

/** A builder's margin and overheads on the building work (editable per project). */
export const MARGIN = 0.2

export type GroupId = 'prelims' | 'site' | 'floor' | 'frame' | 'roof' | 'walls' | 'openings' | 'fitout' | 'services' | 'outside' | 'fees' | 'gov'

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'prelims', label: 'Preliminaries' },
  { id: 'site', label: 'Site works' },
  { id: 'floor', label: 'Slab and floor' },
  { id: 'frame', label: 'Frame' },
  { id: 'roof', label: 'Roof' },
  { id: 'walls', label: 'Walls and cladding' },
  { id: 'openings', label: 'Windows and doors' },
  { id: 'fitout', label: 'Fit-out' },
  { id: 'services', label: 'Services' },
  { id: 'outside', label: 'Outside' },
  { id: 'fees', label: 'Fees and allowances' },
  { id: 'gov', label: 'Council and government fees (rough)' },
]

/** The groups the builder's margin goes on: the building work, so not the fees. */
export const WORKS_GROUPS: GroupId[] = ['prelims', 'site', 'floor', 'frame', 'roof', 'walls', 'openings', 'fitout', 'services', 'outside']

/** The unit a rate is per: an area, a volume, one of something, or a lump sum. */
export type Unit = 'm²' | 'm³' | 'm² face' | 'each' | 'room' | 'item'

export interface StartingRate {
  id: string
  group: GroupId
  /** What it buys, as the rates list names it. */
  label: string
  unit: Unit
  /** $ per unit, including GST. For a fit-out rate, at a mid finish. */
  rate: number
  /** The share of the rate that is materials (plant, tip fees and fees count as materials), 0 to 1. */
  materials: number
  /** Where the figure comes from, in a line. */
  source: string
  /** Scaled by the finish level (basic, mid, high). */
  finish?: boolean
}

/** The rates' groups as Costs › More › Rates folds them, with the margin and contingency last. */
export const RATE_GROUPS = GROUPS.filter(g => g.id !== 'gov')

const OB_PERMIT = 'NSW owner-builder permit $233 (July 2026 to June 2027 fees, nsw.gov.au); the approved course, needed for work over $20,000, from about $180 (Edway, 2026)'

// Reviewed in November 2026 (audit C57): a mid-finish design came to about half the low end of
// the guide below. Part of the gap is the guide itself (custom-built houses), part was items a
// builder prices that no line counted: preliminaries and the fix-out. Those are lines now, and
// the frame, slab, linings and electrical rates moved up to the middle of what trades quote.
export const STARTING_RATES = [
  // Preliminaries
  { id: 'prelims', group: 'prelims', label: 'Preliminaries: supervision, insurance, scaffolding and cleaning', unit: 'm²', rate: 170, materials: 0.5, source: 'Rough figure per m² of floor: a builder’s site supervision, home warranty insurance (HBCF), scaffolding, cleaning and the like, often 6–10% of a house.' },
  // Site works
  { id: 'site-setup', group: 'site', label: 'Site set-up: temporary fence, toilet, skips', unit: 'item', rate: 9500, materials: 0.6, source: 'Rough figure: hire for about six months.' },
  { id: 'cut', group: 'site', label: 'Dig out (cut), machine and operator', unit: 'm³', rate: 55, materials: 0.35, source: 'Oneflare excavation guide: $30–50/m³ in plain soil, up to $150/m³ with rock or roots.' },
  { id: 'fill', group: 'site', label: 'Fill from the site, placed and compacted', unit: 'm³', rate: 45, materials: 0.3, source: 'Rough figure, near the cost of digging it.' },
  { id: 'spoil', group: 'site', label: 'Take away spare earth: trucks and tip fees', unit: 'm³', rate: 85, materials: 0.65, source: 'Rough figure for clean fill to a Sydney or Illawarra tip.' },
  { id: 'import', group: 'site', label: 'Bring in fill, placed and compacted', unit: 'm³', rate: 75, materials: 0.6, source: 'Rough figure.' },
  { id: 'retaining-sleeper', group: 'site', label: 'Retaining walls, concrete sleepers and steel posts', unit: 'm² face', rate: 450, materials: 0.5, source: 'Yellow Pages retaining wall guide, May 2026: sleeper walls $220–650/m².' },
  { id: 'retaining-block', group: 'site', label: 'Retaining walls, reinforced concrete block', unit: 'm² face', rate: 650, materials: 0.45, source: 'Yellow Pages retaining wall guide, May 2026: reinforced block $480–700/m², Besser block $550–850/m².' },
  // Slab and floor
  { id: 'floor-slab', group: 'floor', label: 'Slab on ground', unit: 'm²', rate: 185, materials: 0.5, source: 'Yellow Pages slab guide, May 2026: $75–110/m², plus site preparation, steel, formwork, a pump and termite protection.' },
  { id: 'floor-waffle', group: 'floor', label: 'Waffle pod slab', unit: 'm²', rate: 155, materials: 0.5, source: 'Rough figure: a little under a slab on ground.' },
  { id: 'floor-piers', group: 'floor', label: 'Bearers and joists on piers, with flooring', unit: 'm²', rate: 200, materials: 0.5, source: 'Rough figure.' },
  { id: 'floor-suspended', group: 'floor', label: 'Suspended slab', unit: 'm²', rate: 380, materials: 0.45, source: 'Rough figure: formwork, propping and more steel.' },
  { id: 'floor-upper', group: 'floor', label: 'Upper floor framing and flooring', unit: 'm²', rate: 160, materials: 0.5, source: 'Rough figure.' },
  // Frame
  { id: 'frame-timber', group: 'frame', label: 'Wall frames and roof trusses, timber', unit: 'm²', rate: 260, materials: 0.55, source: 'Rough figure per m² of floor, with the carpentry to lock-up: eaves, fascia and wrap.' },
  { id: 'frame-steel', group: 'frame', label: 'Wall frames and roof trusses, steel', unit: 'm²', rate: 295, materials: 0.6, source: 'Rough figure: about 10–15% over timber.' },
  { id: 'stairs', group: 'frame', label: 'Stairs, built and fixed', unit: 'each', rate: 6500, materials: 0.5, source: 'Rough figure.' },
  // Roof
  { id: 'roof-colorbond', group: 'roof', label: 'Roofing, Colorbond, with sarking and gutters', unit: 'm²', rate: 115, materials: 0.55, source: 'Yellow Pages Colorbond guide, May 2026: $80–150/m² installed.' },
  { id: 'roof-concrete-tile', group: 'roof', label: 'Roofing, concrete tile, with sarking and gutters', unit: 'm²', rate: 120, materials: 0.5, source: 'Rough figure: about the same as Colorbond.' },
  { id: 'roof-terracotta', group: 'roof', label: 'Roofing, terracotta tile, with sarking and gutters', unit: 'm²', rate: 165, materials: 0.55, source: 'Rough figure.' },
  // Walls and cladding
  { id: 'wall-brick', group: 'walls', label: 'External walls, brick veneer', unit: 'm²', rate: 190, materials: 0.45, source: 'Rough figure, with wrap and insulation.' },
  { id: 'wall-weatherboard', group: 'walls', label: 'External walls, weatherboard', unit: 'm²', rate: 150, materials: 0.55, source: 'Rough figure, painted, with wrap and insulation.' },
  { id: 'wall-fibre-cement', group: 'walls', label: 'External walls, fibre cement', unit: 'm²', rate: 120, materials: 0.5, source: 'Rough figure, painted, with wrap and insulation.' },
  // Windows and doors
  { id: 'win-aluminium', group: 'openings', label: 'Windows, aluminium', unit: 'm²', rate: 750, materials: 0.8, source: 'Rough figure, supplied and installed.' },
  { id: 'win-double', group: 'openings', label: 'Windows, double glazed', unit: 'm²', rate: 1050, materials: 0.8, source: 'Rough figure: about 40% over single glazed.' },
  { id: 'win-timber', group: 'openings', label: 'Windows, timber', unit: 'm²', rate: 1300, materials: 0.75, source: 'Rough figure.' },
  { id: 'door-external', group: 'openings', label: 'External doors, hung with locks', unit: 'each', rate: 1600, materials: 0.7, source: 'Rough figure.' },
  { id: 'door-garage', group: 'openings', label: 'Garage door, sectional, with motor', unit: 'each', rate: 3400, materials: 0.8, source: 'Rough figure for a double door.' },
  { id: 'door-internal', group: 'openings', label: 'Internal doors, hung with handles', unit: 'each', rate: 520, materials: 0.45, source: 'Rough figure, mid finish.', finish: true },
  // Fit-out
  { id: 'linings', group: 'fitout', label: 'Linings, ceiling insulation, cornice and paint', unit: 'm²', rate: 125, materials: 0.4, source: 'Rough figure per m² of floor, mid finish: plasterboard to walls and ceilings, insulation, cornice and paint.', finish: true },
  { id: 'fix-out', group: 'fitout', label: 'Fix-out: skirting, architraves, wardrobes and shelves', unit: 'm²', rate: 85, materials: 0.5, source: 'Rough figure per m² of floor, mid finish.', finish: true },
  { id: 'floor-finishes', group: 'fitout', label: 'Floor finishes: tiles, timber or carpet', unit: 'm²', rate: 95, materials: 0.5, source: 'Rough figure, mid finish.', finish: true },
  { id: 'kitchen', group: 'fitout', label: 'Kitchen: cabinets, benchtops and appliances', unit: 'room', rate: 28000, materials: 0.7, source: 'Rough figure, mid finish.', finish: true },
  { id: 'bathroom', group: 'fitout', label: 'Bathroom, tiled and fitted out', unit: 'room', rate: 22000, materials: 0.5, source: 'Rough figure, mid finish.', finish: true },
  { id: 'laundry', group: 'fitout', label: 'Laundry, fitted out', unit: 'room', rate: 7500, materials: 0.55, source: 'Rough figure, mid finish.', finish: true },
  { id: 'toilet', group: 'fitout', label: 'Toilet, fitted out', unit: 'room', rate: 7000, materials: 0.5, source: 'Rough figure, mid finish.', finish: true },
  // Services
  { id: 'electrical', group: 'services', label: 'Electrical: wiring, lights and power points', unit: 'm²', rate: 110, materials: 0.4, source: 'Rough figure per m² of floor, with smoke alarms and the switchboard.' },
  { id: 'drainage', group: 'services', label: 'Drainage, connections and hot water', unit: 'item', rate: 15000, materials: 0.45, source: 'Rough figure: sewer, stormwater and water to the house, and a hot water system.' },
  { id: 'plumbing', group: 'services', label: 'Plumbing to each wet room', unit: 'room', rate: 4500, materials: 0.4, source: 'Rough figure.' },
  // Outside
  { id: 'driveway', group: 'outside', label: 'Driveway, plain concrete', unit: 'm²', rate: 125, materials: 0.45, source: 'Yellow Pages driveway guide, May 2026: $110–130/m², about $10/m² more on a slope.' },
  { id: 'outdoor-slab', group: 'outside', label: 'Outdoor concrete slabs', unit: 'm²', rate: 115, materials: 0.45, source: 'Yellow Pages slab guide, May 2026: $60–90/m² plain, $100–170/m² decorative.' },
  { id: 'deck', group: 'outside', label: 'Decks on posts, hardwood', unit: 'm²', rate: 550, materials: 0.5, source: 'Rough figure.' },
  { id: 'garden', group: 'outside', label: 'Garden and lawn', unit: 'm²', rate: 55, materials: 0.5, source: 'Rough figure: soil, turf or planting.' },
  // Fees and allowances
  { id: 'fees', group: 'fees', label: 'Engineer, certifier, BASIX, surveys and approvals', unit: 'item', rate: 14000, materials: 1, source: 'Rough allowance.' },
  { id: 'permit', group: 'fees', label: 'Owner-builder permit and course', unit: 'item', rate: 500, materials: 1, source: OB_PERMIT },
] as const satisfies readonly StartingRate[]

export type RateId = (typeof STARTING_RATES)[number]['id']

export const rateInfo = (id: RateId): StartingRate => STARTING_RATES.find(r => r.id === id)!

export const isRateId = (id: unknown): id is RateId => STARTING_RATES.some(r => r.id === id)

// ---------------------------------------------------------------------------
// Material choices: each picks which rate a line uses.

export type ChoiceGroup = 'frame' | 'walls' | 'roof' | 'windows' | 'finish'

export const FINISH_LEVELS = { basic: 0.8, mid: 1, high: 1.45 } as const
export type FinishLevel = keyof typeof FINISH_LEVELS

export interface Choice {
  id: string
  label: string
  /** The rate it uses; the finish level scales the fit-out rates instead. */
  rate?: RateId
}

export const CHOICES: Record<ChoiceGroup, { label: string; options: Choice[] }> = {
  frame: {
    label: 'Frame',
    options: [
      { id: 'timber', label: 'Timber', rate: 'frame-timber' },
      { id: 'steel', label: 'Steel', rate: 'frame-steel' },
    ],
  },
  walls: {
    label: 'Walls',
    options: [
      { id: 'brick', label: 'Brick veneer', rate: 'wall-brick' },
      { id: 'weatherboard', label: 'Weatherboard', rate: 'wall-weatherboard' },
      { id: 'fibre-cement', label: 'Fibre cement', rate: 'wall-fibre-cement' },
    ],
  },
  roof: {
    label: 'Roof',
    options: [
      { id: 'colorbond', label: 'Colorbond', rate: 'roof-colorbond' },
      { id: 'concrete-tile', label: 'Concrete tile', rate: 'roof-concrete-tile' },
      { id: 'terracotta', label: 'Terracotta', rate: 'roof-terracotta' },
    ],
  },
  windows: {
    label: 'Windows',
    options: [
      { id: 'aluminium', label: 'Aluminium', rate: 'win-aluminium' },
      { id: 'double', label: 'Double glazed', rate: 'win-double' },
      { id: 'timber', label: 'Timber', rate: 'win-timber' },
    ],
  },
  finish: {
    label: 'Finish',
    options: [
      { id: 'basic', label: 'Basic' },
      { id: 'mid', label: 'Mid' },
      { id: 'high', label: 'High' },
    ],
  },
}

export const CHOICE_GROUPS = Object.keys(CHOICES) as ChoiceGroup[]

export type Choices = Record<ChoiceGroup, string>

export const DEFAULT_CHOICES: Choices = { frame: 'timber', walls: 'brick', roof: 'colorbond', windows: 'aluminium', finish: 'mid' }

/** The rate a choice uses, or the first option's when the choice isn't one of them. */
export function choiceRate(group: Exclude<ChoiceGroup, 'finish'>, id: string): RateId {
  const opts = CHOICES[group].options
  return (opts.find(o => o.id === id) ?? opts[0]).rate!
}

export const finishFactor = (id: string) => FINISH_LEVELS[(id in FINISH_LEVELS ? id : 'mid') as FinishLevel]

/**
 * Rough guides to what a house costs to build per m² of floor at each finish level, GST
 * included. RLB's Riders Digest Sydney 2026 puts single and double storey custom-built houses at
 * $2,500 to $7,600 per m² of floor before GST (rates at the fourth quarter of 2025, with the
 * builder's margin, without site works, fees or land). Here that range is split into thirds, a
 * third for each finish level, with GST added.
 */
export const FINISH_GUIDES: Record<FinishLevel, { low: number; high: number }> = {
  basic: { low: 2750, high: 4600 },
  mid: { low: 4600, high: 6500 },
  high: { low: 6500, high: 8350 },
}

export const finishGuide = (id: string) => FINISH_GUIDES[(id in FINISH_GUIDES ? id : 'mid') as FinishLevel]

/** Where the finish guides come from, in a line. */
export const FINISH_GUIDE_SOURCE = 'RLB Riders Digest Sydney 2026: custom-built houses $2,500 to $7,600 per m² before GST, with the builder’s margin, without site works, fees or land. Split into thirds for Basic, Mid and High, GST added.'

/** What a guide is compared with: the house itself, so not site works, outside works or fees. */
export const HOUSE_GROUPS: GroupId[] = ['prelims', 'floor', 'frame', 'roof', 'walls', 'openings', 'fitout', 'services']

/** The public pages the starting rates and the owner-builder figures come from. */
export const SOURCES: { label: string; url: string }[] = [
  { label: 'Owner-builder permits: when one is needed (NSW Government)', url: 'https://www.nsw.gov.au/housing-and-construction/building-or-renovating-a-home/owner-builder/when-a-permit-needed' },
  { label: 'Fees for licences and certificates, July 2026 to June 2027 (NSW Government)', url: 'https://www.nsw.gov.au/business-and-economy/licences-and-credentials/building-and-trade/fees-for-licences-and-certificates' },
  { label: 'Riders Digest Sydney 2026: the finish guides (Rider Levett Bucknall)', url: 'https://www.rlb.com/wp-content/uploads/sites/1/2026/01/2026-RLB-Rider-Digest_Sydney_Digital_2.pdf' },
  { label: 'Excavation costs (Oneflare)', url: 'https://oneflare.com.au/costs/excavation' },
  { label: 'Retaining wall costs, 2026 (Yellow Pages)', url: 'https://www.yellowpages.com.au/articles/builders-and-building-contractors/retaining-wall-cost' },
  { label: 'Colorbond roofing costs, 2026 (Yellow Pages)', url: 'https://www.yellowpages.com.au/articles/roof-restoration-and-repairs/how-much-does-colorbond-roofing-cost' },
  { label: 'Concrete slab costs, 2026 (Yellow Pages)', url: 'https://www.yellowpages.com.au/articles/concrete-contractors/how-much-does-a-concrete-slab-cost' },
  { label: 'Concrete driveway costs, 2026 (Yellow Pages)', url: 'https://www.yellowpages.com.au/articles/concrete-contractors/how-much-does-a-concrete-driveway-cost' },
]

/** NSW owner-builder thresholds (nsw.gov.au, checked November 2026). */
export const OWNER_BUILDER = {
  /** Work worth more than this, GST included, needs a permit ($). */
  permitOver: 10000,
  /** Work worth more than this also needs the approved course ($). */
  courseOver: 20000,
  /** The permit's fee for a year, July 2026 to June 2027 ($). */
  permitFee: 233,
}
