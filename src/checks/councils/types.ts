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

/** da-front: the front setback (m). */
export interface FrontRule {
  min: number
  /** What it's measured to, for the limit: "to the front facade (infill)". */
  to: string
  /** Garages and carports (m). */
  garage?: number
  /** Why a battle-axe lot can't be checked against it yet. */
  battleAxeNote: string
  source: RuleSource
}

/** da-side-rear: side and rear setbacks to walls (m), more where the house rises over a height. */
export interface SideRearRule {
  min: number
  tall?: { over: number; min: number }
  source: RuleSource
}

/** da-coverage: the most of the site buildings can cover, as a share, by site area. */
export interface CoverageRule {
  bands: AreaBand<number>[]
  /** Shown when the title area differs from the survey's: whether the DCP counts the handle. */
  handleNote?: string
  source: RuleSource
}

/** da-landscaped: the least landscaped area (m²), by site area. */
export interface LandscapedRule {
  bands: AreaBand<Slice>[]
  /** Share of it that has to be behind the building line. */
  behindBuildingLine?: number
  source: RuleSource
}

/** da-batters: no batter steeper than 1 in `run`. */
export interface BattersRule {
  run: number
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

/** da-retaining: retaining wall heights (m), lower near a side or rear boundary. */
export interface RetainingRule {
  /** Within this far of a side or rear boundary (m), */
  near: number
  /** walls hold back at most this (m), */
  nearMax: number
  /** and this elsewhere (m). */
  max: number
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
  sideRear?: SideRearRule
  coverage?: CoverageRule
  landscaped?: LandscapedRule
  batters?: BattersRule
  geotech?: GeotechRule
  erosion?: ErosionRule
  retaining?: RetainingRule
  trees?: TreeRule
  /** What its checks don't cover yet, for the list under the checks. */
  notChecked: string[]
}

/** The controls a council's table can hold, by its key, with the check's title for when it's missing. */
export const CONTROLS = {
  height: 'Building height',
  storeys: 'Storeys',
  rearUpper: 'Upper floor and the rear boundary',
  fsr: 'Floor space ratio',
  front: 'Front setback',
  sideRear: 'Side and rear setbacks',
  coverage: 'Site coverage',
  landscaped: 'Landscaped area',
  batters: 'Batter slopes',
  geotech: 'Geotechnical report',
  erosion: 'Erosion and sediment control',
  retaining: 'Retaining walls',
  trees: 'Trees',
} as const satisfies Partial<Record<keyof Council, string>>

export type ControlKey = keyof typeof CONTROLS
