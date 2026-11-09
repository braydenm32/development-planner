// A council's own rules (its LEP and DCP) as data: what each control allows, when, and where the
// number comes from. The DA checks in rules.ts read these tables, so adding a council is adding a
// data file next to wollongong.ts and a line in index.ts. A control the research couldn't read
// from the council's own text is left out of its table, and the checks list it as not checked.

import type { Confidence, CouncilId } from '../types'

/** A planning instrument (an LEP, or a DCP chapter) as the research read it. */
export interface Instrument {
  /** Its full name: "Wollongong Development Control Plan 2009, Chapter B1 Residential Development". */
  name: string
  /** How a finding cites it, before the clause: "Wollongong DCP". */
  cite: string
  /** The version read, as a finding shows it: "chapter B1, in force 14 Dec 2016". */
  version: string
  /** Where the research read it. */
  url: string
}

/** Where a rule comes from: an instrument (by its key in the council's table), the clause, and how sure the research is. */
export interface RuleSource {
  in: string
  /** Other instruments the rule also cites, by key, for their links. */
  also?: string[]
  /** "B1 4.4.2(2)"; the finding shows it after the instrument's cite. */
  clause: string
  sure: Confidence
  /** The versions, as a finding shows them, when a rule cites more than one instrument. */
  version?: string
}

/** A band of area (m²): applies while the area is under `below`, or up to and including `upTo`. The last band has neither. */
export interface AreaBand<T> {
  below?: number
  upTo?: number
  value: T
}

/** A share of the area over a threshold, plus a base: base + share × (area − over), in m². */
export interface Slice {
  base: number
  share: number
  over: number
}

/** da-height: the LEP's Height of Buildings Map, with the DCP's own figure until the lot's map value is entered. */
export interface HeightRule {
  source: RuleSource
  /** The height to use until the map value is entered under Lot facts, and what it is: "B1’s figure for R2". */
  fallback?: { max: number; says: string; source: RuleSource }
}

/** da-storeys: the most storeys, and fewer on a battle-axe lot unless the DCP's objectives are met (a warning, not a fail). */
export interface StoreysRule {
  max: number
  /** The DCP says "generally": more storeys warn, with this note, rather than fail. */
  generally?: string
  source: RuleSource
  battleAxe?: { max: number; note: string; source: RuleSource }
}

/** da-rear-upper: no upper floor within this far of the rear boundary (m). */
export interface RearUpperRule {
  min: number
  source: RuleSource
}

/** da-fsr: the LEP's Floor Space Ratio Map, measured against the whole lot (handle included, as cl 4.5(3) reads). */
export interface FsrRule {
  source: RuleSource
}

/**
 * The front setback for a band of site area (m). With `average`, the two nearest houses' setbacks
 * come into it: 'instead' means their average applies and `min` is only the fallback (so less
 * warns), 'or-greater' means the greater of `min` and their average (so less fails, more warns).
 */
export interface FrontSetback {
  min: number
  average?: 'instead' | 'or-greater'
}

/** da-front: the front setback. */
export interface FrontRule {
  bands: AreaBand<FrontSetback>[]
  /** What a plain distance is measured to, for the limit: "to the front facade (infill)". */
  to: string
  /** Whose average counts, for the limit: "the average of the two nearest houses within 40 m". */
  neighbours?: string
  /** Garages and carports, for the limit: "garages 5.5 m". */
  garage?: string
  /** Said whenever the front is checked, such as mapped building lines that can replace it. */
  note?: string
  /** A battle-axe lot: a setback from the lot in front, or why it can't be checked yet. */
  battleAxe: { min: number; note?: string; source: RuleSource } | { note: string }
  source: RuleSource
}

/** A setback from the side or rear boundaries (m). */
export interface SetbackRule {
  min: number
  /** More once the house rises over a height (m): a step up to `min`, or `perMetre` more for each metre over. */
  tall?: { over: number; min?: number; perMetre?: number }
  /** Two-storey parts (the upper floor) instead of a height (m). */
  upper?: number
  /** Said whenever it's checked: what the check leaves out. */
  note?: string
  source: RuleSource
}

/** da-coverage: the most of the site buildings can cover, as a share, by site area. */
export interface CoverageRule {
  bands: AreaBand<number>[]
  /** The share or this area (m²), whichever is greater. */
  atLeast?: number
  /** Shown when the title area differs from the survey's: whether the DCP counts the handle. */
  handleNote?: string
  source: RuleSource
}

/** da-landscaped: the least landscaped area (m²), by site area. */
export interface LandscapedRule {
  /** What the DCP calls it, when not "Landscaped area": "Pervious area". */
  name?: string
  bands: AreaBand<Slice>[]
  /** Share of it that has to be behind the building line. */
  behindBuildingLine?: number
  source: RuleSource
}

/** da-batters: no batter steeper than 1 in `run`, and 1 in `prefer` preferred. */
export interface BattersRule {
  run: number
  prefer?: number
  source: RuleSource
}

/** da-cut-fill: how deep the cut and how high the fill can be (m). */
export interface CutFillRule {
  cut: number
  /** Cut within 1 m of a boundary (the band the checks measure), when it's held lower there. */
  nearCut?: number
  fill: number
  /** Only what's outside the house counts: inside, the house's walls retain it. */
  outsideHouse?: boolean
  /** The DCP says "generally": more warns rather than fails. */
  generally?: boolean
  source: RuleSource
}

/** da-geotech: when the DA needs a geotechnical report. */
export interface GeotechRule {
  /** Cut or fill deeper than this (m). */
  depth: number
  /** Or land this steep or steeper (%). */
  slope: number
  /** What the DCP says when it's triggered: "E19 says the DA will generally need a geotechnical report". */
  why: string
  /** Said either way. */
  also?: string
  source: RuleSource
}

/** da-erosion: the erosion and sediment plan the DA needs, by the area disturbed. */
export interface ErosionRule {
  bands: AreaBand<string>[]
  note?: string
  source: RuleSource
}

/** da-retaining: retaining wall heights (m), lower near a boundary. */
export interface RetainingRule {
  /** Within this far of a boundary (m), */
  near?: number
  /** walls hold back at most this (m), */
  nearMax?: number
  /** and this elsewhere (m). */
  max: number
  /** Which boundaries `near` is measured to, for the limit: "a side or rear boundary". */
  nearWhat?: string
  /** Over these heights a wall needs a professional engineer's design (a warning), rather than not being allowed. */
  engineer?: boolean
  /** Walls over a height need more: "terraced and engineered", and what the note says they need. */
  tall?: { over: number; limit: string; note: string }
  source: RuleSource
}

/** Trees on the DA route: removing them, and building near the ones that stay. */
export interface TreeRule {
  /**
   * Removing a tree marked for removal: what the note says when its base is within `within` (m) of the
   * house, and when it's further. The notes fill in {toHouse} (the distance) and {within}.
   */
  removal: { within: number; near: string; far: string; source: RuleSource }
  /** Protection zones (AS 4970): the share of a zone that's a minor encroachment. */
  zone: { minor: number; source: RuleSource }
}

/** One council's LEP and DCP rules for a dwelling house, as the research read them. */
export interface Council {
  id: CouncilId
  /** "Wollongong" */
  name: string
  /** The council's name as the LGA: "Wollongong City Council". */
  lga: string
  /** The LEP's name as the Planning Portal gives it: "Wollongong Local Environmental Plan 2009". */
  lep: string
  /** The instruments its rules come from, in a few words: "Wollongong LEP 2009 and DCP 2009". */
  rules: string
  /** What the table covers: "Dwelling houses, zone R2". */
  covers: string
  /** The research note it comes from, and when it was checked. */
  research: string
  checked: string
  instruments: Record<string, Instrument>
  height?: HeightRule
  storeys?: StoreysRule
  rearUpper?: RearUpperRule
  fsr?: FsrRule
  front?: FrontRule
  /** Side and rear setbacks as one rule (da-side-rear), or each on its own (da-side, da-rear). */
  sideRear?: SetbackRule
  side?: SetbackRule
  rear?: SetbackRule
  coverage?: CoverageRule
  landscaped?: LandscapedRule
  batters?: BattersRule
  cutFill?: CutFillRule
  geotech?: GeotechRule
  erosion?: ErosionRule
  retaining?: RetainingRule
  trees?: TreeRule
  /**
   * Controls the research read the council's text for and found it has none of its own (so there's
   * nothing to check), as against ones it couldn't read, which the checks list as not checked.
   */
  absent?: ControlKey[]
  /** What its checks don't cover yet, for the list under the checks. */
  notChecked: string[]
}

/** The controls the checks know, in the panel's order, with the title the not-checked list uses and whether a table has it. */
export const CONTROLS = [
  { key: 'height', title: 'Building height', has: (c: Council) => !!c.height },
  { key: 'storeys', title: 'Storeys', has: (c: Council) => !!c.storeys },
  { key: 'rearUpper', title: 'Upper floor and the rear boundary', has: (c: Council) => !!c.rearUpper },
  { key: 'fsr', title: 'Floor space ratio', has: (c: Council) => !!c.fsr },
  { key: 'front', title: 'Front setback', has: (c: Council) => !!c.front },
  { key: 'side', title: 'Side setbacks', has: (c: Council) => !!(c.sideRear || c.side) },
  { key: 'rear', title: 'Rear setback', has: (c: Council) => !!(c.sideRear || c.rear) },
  { key: 'coverage', title: 'Site coverage', has: (c: Council) => !!c.coverage },
  { key: 'landscaped', title: 'Landscaped area', has: (c: Council) => !!c.landscaped },
  { key: 'batters', title: 'Batter slopes', has: (c: Council) => !!c.batters },
  { key: 'cutFill', title: 'Depth of cut and fill', has: (c: Council) => !!c.cutFill },
  { key: 'geotech', title: 'Geotechnical report', has: (c: Council) => !!c.geotech },
  { key: 'erosion', title: 'Erosion and sediment control', has: (c: Council) => !!c.erosion },
  { key: 'retaining', title: 'Retaining walls', has: (c: Council) => !!c.retaining },
  { key: 'trees', title: 'Trees', has: (c: Council) => !!c.trees },
] as const

export type ControlKey = (typeof CONTROLS)[number]['key']
