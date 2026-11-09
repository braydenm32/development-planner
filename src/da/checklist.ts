// The DA pack's cover checklist: what a development application for a new house usually needs, as
// data, so each council's list can differ. Every row names the checklists it comes from (read on
// the date in DA_SOURCES; see docs/research/da-pack.md), and the logic below marks it as in this
// pack (with its sheet numbers), not drawn yet (with what to add), or from someone else.
//
// The pack is a starting point for a town planner or designer, never a lodgement: the council's own
// checklist on the day, and its staff, have the final word.

import type { PlanningFacts } from '../map/planning'
import type { CouncilId } from '../checks/types'

/** A checklist a row comes from. */
export interface DaSource {
  name: string
  url: string
  /** When it was read for this list. */
  read: string
  /** How it was read, where that limits what it says. */
  note?: string
}

export type SourceKey = 'state' | CouncilId

const READ = '9 Nov 2026'
/** The council checklists came through as text without their tick boxes, so a row's "always" or "if" is from its own words. */
const NO_TICKS = 'Read as text: the tick-box columns did not come through, so each item’s condition is from its own words.'

export const DA_SOURCES: Record<SourceKey, DaSource> = {
  state: {
    name: 'NSW Department of Planning and Environment, Application requirements (March 2022)',
    url: 'https://www.planning.nsw.gov.au/sites/default/files/2023-02/application-requirements.pdf',
    read: READ,
  },
  wollongong: {
    name: 'Wollongong City Council, Lodgement Checklist for Development Applications (November 2025)',
    url: 'https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0021/113097/Lodgement-Checklist-for-Development-Applications.pdf',
    read: READ,
    note: NO_TICKS,
  },
  kiama: {
    name: 'Kiama Municipal Council, Development Application Checklist: low density residential (undated)',
    url: 'https://www.kiama.nsw.gov.au/files/sharedassets/public/v/4/environmental-services-planning-portal-checklist-low-density-residential-development-application.pdf',
    read: READ,
    note: NO_TICKS,
  },
  'blue-mountains': {
    name: 'Blue Mountains City Council, Development Application Checklist: residential, LEP 2015 (undated)',
    url: 'https://www.bmcc.nsw.gov.au/sites/default/files/docs/Residential_DA_Lodgement_Checklist_LEP_2015_0.pdf',
    read: READ,
    note: NO_TICKS,
  },
  'central-coast': {
    name: 'Central Coast Council, Development Application Checklist (July 2025 file)',
    url: 'https://www.centralcoast.nsw.gov.au/sites/default/files/2025-07/development-application-checklist.pdf',
    read: READ,
    note: NO_TICKS,
  },
}

/** What the pack can draw, as its sheets (src/da/pack.ts) are named. */
export type DaSheet = 'site' | 'floor' | 'roof' | 'elevation' | 'section' | 'shadow' | 'cutFill' | 'stormwater' | 'checks'

/** The NSW planning maps' flags that add a report (src/map/planning.ts). */
export type Hazard = 'bushfire' | 'flood' | 'landslide' | 'heritage'

export interface DaItem {
  id: string
  title: string
  /** The pack's sheets that hold it; none for a document from someone else. */
  sheets?: DaSheet[]
  /** What to add to the plan when the pack can't draw it yet. */
  toDraw?: string
  /** Who makes it, for a document from someone else: "a registered surveyor". */
  from?: string
  /** Only when the NSW planning maps flag the lot for this. */
  hazard?: Hazard
  /** Only on these councils' lists (none: on every list, and when no council is chosen). */
  only?: CouncilId[]
  /** Left off these councils' lists, whose checklist says a house doesn't need it. */
  not?: CouncilId[]
  /** Only when the plan has a driveway. */
  driveway?: boolean
  /** A council's own words on it: thresholds, forms, who prepares it. */
  says?: Partial<Record<CouncilId, string>>
  /** The checklists that list it. */
  sources: SourceKey[]
  /** The wording couldn't be checked against a source that was read. */
  unverified?: boolean
}

/** The rows, in the order a DA's documents are usually listed: drawings first, then reports, then the hazards. */
export const DA_ITEMS: DaItem[] = [
  {
    id: 'site-plan',
    title: 'Site plan',
    sheets: ['site'],
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: { wollongong: 'Council asks for plans at 1:200.', kiama: 'With easements, services and private open space too.' },
  },
  {
    id: 'site-analysis',
    title: 'Site analysis plan',
    from: 'your designer',
    only: ['blue-mountains', 'central-coast'],
    sources: ['blue-mountains', 'central-coast'],
    says: { 'blue-mountains': 'The whole site: north, contours, levels, existing features and access.' },
  },
  {
    id: 'floor-plans',
    title: 'Floor plans',
    sheets: ['floor'],
    toDraw: 'Draw the walls under Design › Floors.',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: { wollongong: 'Council asks for 1:100.' },
  },
  {
    id: 'roof-plan',
    title: 'Roof plan',
    sheets: ['roof'],
    toDraw: 'Add a roof under Design › Roofs.',
    sources: ['central-coast'],
  },
  {
    id: 'elevations',
    title: 'Elevations',
    sheets: ['elevation'],
    toDraw: 'Draw the walls under Design › Floors; the elevations draw themselves from the walls and the survey’s ground.',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: { 'central-coast': 'An elevation to each side.', 'blue-mountains': 'Natural and proposed ground, and floor, ceiling and ridge levels.' },
  },
  {
    id: 'sections',
    title: 'Sections',
    sheets: ['section'],
    toDraw: 'Draw a section line across the house under Design › Sections.',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: { 'central-coast': 'At least two sections.' },
  },
  {
    id: 'shadows',
    title: 'Shadow diagrams, 21 June at 9 am, 12 pm and 3 pm',
    sheets: ['shadow'],
    toDraw: 'Draw the walls (and a roof) so the house casts a shadow.',
    sources: ['wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: {
      kiama: 'Sun to the neighbours, and to your own living areas and open space.',
      'blue-mountains': 'Council asks for them for two or more storeys, by a qualified person.',
      'central-coast': 'With council’s Certification of Shadow Diagrams form.',
    },
  },
  {
    id: 'cut-fill',
    title: 'Cut and fill plan',
    sheets: ['cutFill'],
    toDraw: 'No cut or fill is worked out yet. Set the floor level under Earthworks › Place; if the ground isn’t cut or filled, this plan isn’t needed.',
    sources: ['blue-mountains', 'central-coast'],
    says: { 'blue-mountains': 'With retaining wall details, levels as RLs.', 'central-coast': 'Excavation and fill beyond the footings.' },
  },
  {
    id: 'stormwater',
    title: 'Stormwater concept plan',
    sheets: ['stormwater'],
    toDraw: 'Draw the ground floor walls and a roof under Design, so the app can see where the water goes.',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: { kiama: 'Council asks for one by a suitably qualified person.', 'central-coast': 'A stormwater management plan (DCP 2022 chapter 3.1).' },
  },
  {
    id: 'controls',
    title: 'Table of the planning controls (for the SEE)',
    sheets: ['checks'],
    sources: ['state', 'blue-mountains'],
  },
  {
    id: 'survey',
    title: 'Survey: boundaries, levels and contours',
    from: 'a registered surveyor',
    sources: ['wollongong', 'blue-mountains', 'central-coast'],
    says: { wollongong: 'With contours and true north, signed by a registered land surveyor.', 'central-coast': 'Less than 24 months old.' },
  },
  {
    id: 'basix',
    title: 'BASIX certificate',
    from: 'the BASIX tool on the NSW Planning Portal (you or your designer); its commitments go on the plans',
    sources: ['wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: { wollongong: 'Issued no more than 3 months before lodgement.', 'central-coast': 'Issued no more than 3 months before lodgement.' },
  },
  {
    id: 'see',
    title: 'Statement of Environmental Effects',
    from: 'you or a town planner',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
  },
  {
    id: 'landscape',
    title: 'Landscape plan',
    from: 'you, your designer or a landscape architect',
    not: ['central-coast'],
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains'],
    says: { 'blue-mountains': 'With the pervious area worked out.' },
  },
  {
    id: 'finishes',
    title: 'Schedule of external colours, materials and finishes',
    from: 'you or your designer',
    sources: ['kiama', 'blue-mountains', 'central-coast'],
  },
  {
    id: 'waste',
    title: 'Waste management plan',
    from: 'you or your builder, on council’s form',
    not: ['blue-mountains'],
    sources: ['wollongong', 'kiama', 'central-coast'],
  },
  {
    id: 'cost',
    title: 'Cost estimate report',
    from: 'your builder or a quantity surveyor',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
    says: {
      wollongong: 'A cost summary report under $2 million.',
      kiama: 'A cost summary report from $100,001 to $1 million; a registered quantity surveyor’s report over $1 million.',
      'blue-mountains': 'A registered quantity surveyor’s report over $500,000.',
      'central-coast': 'Under $500,000 your own estimate or a builder’s quote; over $1 million a registered quantity surveyor.',
    },
  },
  {
    id: 'owners-consent',
    title: 'Owner’s consent',
    from: 'every registered owner of the land',
    sources: ['state', 'wollongong', 'kiama', 'central-coast'],
  },
  {
    id: 'driveway',
    title: 'Driveway long section',
    from: 'your designer or an engineer (the driveway’s levels and grade are on the site plan)',
    driveway: true,
    only: ['kiama', 'blue-mountains', 'central-coast'],
    sources: ['kiama', 'blue-mountains', 'central-coast'],
  },
  {
    id: 'erosion',
    title: 'Erosion and sediment control plan',
    from: 'your designer or builder',
    only: ['central-coast'],
    sources: ['central-coast'],
    says: { 'central-coast': 'For disturbing under 2,500 m², to the Landcom Blue Book.' },
  },
  {
    id: 'notification',
    title: 'Notification plan',
    from: 'your designer',
    only: ['central-coast'],
    sources: ['central-coast'],
    // The checklist's matrix names it with no detail of what it shows.
    unverified: true,
  },
  {
    id: 'bushfire',
    title: 'Bushfire assessment report',
    from: 'a bushfire consultant, or the RFS single dwelling application kit',
    hazard: 'bushfire',
    sources: ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast'],
  },
  {
    id: 'flood',
    title: 'Flood report',
    from: 'a suitably qualified engineer',
    hazard: 'flood',
    sources: ['wollongong', 'kiama', 'central-coast'],
  },
  {
    id: 'geotech',
    title: 'Geotechnical report',
    from: 'a geotechnical engineer',
    hazard: 'landslide',
    sources: ['wollongong', 'blue-mountains', 'central-coast'],
    says: { wollongong: 'On council’s M11 form.' },
  },
  {
    id: 'heritage',
    title: 'Heritage impact statement',
    from: 'a heritage consultant',
    hazard: 'heritage',
    sources: ['wollongong', 'kiama', 'blue-mountains', 'central-coast'],
  },
]

export type RowStatus = 'in-pack' | 'not-drawn' | 'others'

export const STATUS_WORDS: Record<RowStatus, string> = { 'in-pack': 'In this pack', 'not-drawn': 'Not drawn yet', others: 'From someone else' }

export interface ChecklistRow {
  id: string
  title: string
  status: RowStatus
  /** The sheets that hold it: "DA-02", "DA-03 to DA-04". */
  sheets?: string
  /** Where it is, what to add, or who makes it, in a sentence or two. */
  detail: string
  sources: SourceKey[]
  unverified: boolean
}

export interface ChecklistInput {
  /** The council whose rules are switched on (Approvals › Checks), if any. */
  council: CouncilId | null
  /** What the NSW planning maps say about the placed lot; null when it isn't on the map. */
  planning: PlanningFacts | null
  /** The pack's sheet numbers of each kind it holds, in order: { site: ['DA-02'], floor: ['DA-03', 'DA-04'] }. */
  sheets: Partial<Record<DaSheet, string[]>>
  /** The plan has a driveway. */
  driveway: boolean
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** What the maps say that put a hazard row on the list: "The NSW planning maps show bush fire prone land (Vegetation Category 1)." */
export function hazardWords(h: Hazard, f: PlanningFacts): string | null {
  const names = (hits: { name: string }[]) => list([...new Set(hits.map(x => x.name))])
  switch (h) {
    case 'bushfire':
      return f.bushfire.length ? `The NSW planning maps show bush fire prone land (${names(f.bushfire)}).` : null
    case 'flood':
      return f.flood.length ? `The NSW planning maps show flood planning land (${names(f.flood)}).` : null
    case 'landslide':
      return f.landslide.length ? `The NSW planning maps show landslide risk land (${names(f.landslide)}).` : null
    case 'heritage':
      return f.heritage.length ? `The NSW planning maps show heritage on or at the lot (${names(f.heritage)}).` : null
  }
}

/** "DA-03", or "DA-03 to DA-05" for a run of sheets. */
export function sheetRange(nums: string[]): string {
  return nums.length <= 1 ? (nums[0] ?? '') : `${nums[0]} to ${nums[nums.length - 1]}`
}

/** The checklist rows for this council, the lot's flags and the sheets the pack holds. */
export function checklistRows(input: ChecklistInput): ChecklistRow[] {
  const { council, planning } = input
  const rows: ChecklistRow[] = []
  for (const item of DA_ITEMS) {
    if (item.only && (!council || !item.only.includes(council))) continue
    if (council && item.not?.includes(council)) continue
    if (item.driveway && !input.driveway) continue
    // A hazard's report only where the maps flag the lot for it.
    const flagged = item.hazard ? (planning ? hazardWords(item.hazard, planning) : null) : null
    if (item.hazard && !flagged) continue
    const says = council ? item.says?.[council] : undefined
    const base = { id: item.id, title: item.title, sources: item.sources, unverified: !!item.unverified }
    if (item.sheets) {
      const nums = item.sheets.flatMap(s => input.sheets[s] ?? [])
      if (nums.length) rows.push({ ...base, status: 'in-pack', sheets: sheetRange(nums), detail: says ?? '' })
      else rows.push({ ...base, status: 'not-drawn', detail: item.toDraw ?? 'Not in the plan yet.' })
      continue
    }
    const from = `From ${item.from}.`
    rows.push({ ...base, status: 'others', detail: [flagged, from, says].filter(Boolean).join(' ') })
  }
  return rows
}

/** The checklists a council's list is drawn from: the state's, and the council's own when one is chosen. */
export function sourcesFor(council: CouncilId | null): SourceKey[] {
  return council ? ['state', council] : ['state', 'wollongong', 'kiama', 'blue-mountains', 'central-coast']
}
