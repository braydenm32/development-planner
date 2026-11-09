// The compliance checker's shared types. Each rule names its source and how sure the
// research was of it (docs/research), so the panel can show that next to the result.

import type { Vec2 } from '../lib/geom'

/** CDC: complying development under the Housing Code. DA: development application under the council's LEP and DCP. */
export type Pathway = 'cdc' | 'da'

/** A council whose LEP and DCP the checks know (src/checks/councils.ts). */
export type CouncilId = 'wollongong'

/**
 * How sure the research is of a rule, as marked in docs/research:
 * read = from the official text; secondary = from an official explainer or summary;
 * unverified = commonly quoted or inferred, not confirmed.
 */
export type Confidence = 'read' | 'secondary' | 'unverified'

/** pass, warn, fail; unknown when the app can't tell yet (it needs an input); pending for a tree marked for removal. */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown' | 'pending'

export interface Source {
  /** "Housing Code cl 3.9", "Wollongong DCP B1 4.4.2(2)". */
  clause: string
  confidence: Confidence
  /** When the text was read, as the research gives it. */
  asAt: string
}

export interface CheckResult {
  /** Stable id: `rule` or `rule:item` (for example a tree). */
  id: string
  /** What is being checked, in plain words: "Building height". */
  title: string
  status: CheckStatus
  /** The design's value: "7.42 m above existing ground". */
  value?: string
  /** What the rule allows: "8.5 m". */
  limit?: string
  /** Why, or what's assumed, in a sentence. */
  note?: string
  source: Source
  /** A tree this row is about, so the panel can offer to mark it. */
  tree?: string
  /** The tree is on this block, so it can be marked for removal (not a neighbour's). */
  removable?: boolean
}

/** Facts about the block the survey doesn't hold, kept with the plan. */
export interface CheckSettings {
  pathway: Pathway
  /**
   * Which council's rules are switched on for the DA checks. A block is in one council, so at most one is on.
   * Missing on plans saved before councils could be switched (see checkSettingsOf).
   */
  councils?: Partial<Record<CouncilId, boolean>>
  /** The lot reaches the road by an access handle that the survey boundary leaves out. */
  battleAxe: boolean
  /** Lot area on the title, handle included (m²). The LEP measures floor space ratio against it. */
  titleArea?: number
  /** Boundary edge (by index) that faces the lot in front, or the street on an ordinary lot. */
  frontEdge?: number
  /** Boundary edge (by index) at the rear. Defaults to the one opposite the front. */
  rearEdge?: number
  /** Lot width at the building line (m), as council reads it. Unset shows both edge lengths' results. */
  lotWidth?: number
  /** LEP Height of Buildings Map value (m). */
  lepHeight?: number
  /** LEP Floor Space Ratio Map value (n:1). */
  lepFsr?: number
}

export const DEFAULT_CHECK_SETTINGS: CheckSettings = { pathway: 'cdc', battleAxe: false, councils: {} }

/** A tree as the checks see it (adapter over the site features' trees). Positions in the survey's local frame. */
export interface CheckTree {
  id: string
  label: string
  at: Vec2
  /** Trunk diameter (m), taken as measured at 1.4 m. */
  trunk: number
  height?: number
  /** Marked for removal, pending the DA or CDC. */
  remove: boolean
  /** The trunk is over the boundary: the neighbour's tree, not yours to mark for removal. */
  neighbour?: boolean
}
