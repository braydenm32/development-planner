// The DA pack's site details as data: their shape, the record they're kept in, and making a
// stored or opened copy safe. Apart from ./details.ts (the store) so the project file
// (src/share/project.ts) can carry them without loading the open project's session.

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

export const cleanDaDetail = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX) : '')

/** A stored record, made safe: anything missing or odd is blank. */
export function normalizeDaDetails(raw: unknown): DaDetails {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { address: cleanDaDetail(r.address), lot: cleanDaDetail(r.lot), preparedBy: cleanDaDetail(r.preparedBy) }
}

/** The details to put in a project file, or to take from one: undefined when nothing was typed. */
export function daDetailsForFile(raw: unknown): DaDetails | undefined {
  const d = normalizeDaDetails(raw)
  return d.address || d.lot || d.preparedBy ? d : undefined
}
