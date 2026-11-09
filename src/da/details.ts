// The DA pack's site details, typed above its Download button: the street address, the Lot and DP,
// and who prepared it. They're kept as the project's own "da-details" record, not in the plan, so
// they never ride along on a share link or a project file: they go only onto the downloaded PDF's
// title blocks. Blank fields fall back to the map placement (Site › Map), as before.

import { create } from 'zustand'
import { registerRecordKind } from '../projects/session'

export interface DaDetails {
  /** The site's street address. */
  address: string
  /** "Lot 12 DP 34567". */
  lot: string
  /** Who prepared the pack: a name, a business, or blank to write in. */
  preparedBy: string
}

export const DA_DETAILS_KIND = 'da-details'

export const emptyDaDetails = (): DaDetails => ({ address: '', lot: '', preparedBy: '' })

/** Longest a detail can be: a title block has room for a line or two. */
const MAX = 120

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX) : '')

/** A stored record, made safe: anything missing or odd is blank. */
export function normalizeDaDetails(raw: unknown): DaDetails {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { address: clean(r.address), lot: clean(r.lot), preparedBy: clean(r.preparedBy) }
}

export const useDaDetails = create<{ details: DaDetails }>(() => ({ details: emptyDaDetails() }))

const save = registerRecordKind<DaDetails>(DA_DETAILS_KIND, value => useDaDetails.setState({ details: normalizeDaDetails(value) }))

/** Change one detail; saved with the open project. */
export function setDaDetail(key: keyof DaDetails, value: string) {
  const details = { ...useDaDetails.getState().details, [key]: clean(value) }
  useDaDetails.setState({ details })
  void save(details)
}

/** What the pack's title blocks show: a typed detail, else the map placement's. */
export function packDetails(d: DaDetails, place: { address: string | null; lot: string | null } | null): { place: { address: string | null; lot: string | null } | null; preparedBy: string | null } {
  const address = d.address || place?.address || null
  const lot = d.lot || place?.lot || null
  return { place: address || lot ? { address, lot } : null, preparedBy: d.preparedBy || null }
}
