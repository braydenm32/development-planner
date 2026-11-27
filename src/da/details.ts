// The DA pack's site details, typed above its Download button: the street address, the Lot and DP,
// and who prepared it. They're kept as the project's own "da-details" record, not in the plan, so
// they never ride along on a share link. They go onto the downloaded PDF's title blocks, and into
// the project file (the backup), which restores them when it's opened (src/share/project.ts).
// Blank fields fall back to the map placement (Site › Map), as before.

import { create } from 'zustand'
import { registerRecordKind } from '../projects/session'
import { cleanDaDetail, daDetailsForFile, DA_DETAILS_KIND, emptyDaDetails, normalizeDaDetails, type DaDetails } from './detailsModel'

export { DA_DETAILS_KIND, daDetailsForFile, emptyDaDetails, normalizeDaDetails, type DaDetails } from './detailsModel'

const clean = cleanDaDetail

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

/** The open project's details, for its project file; undefined when nothing was typed. */
export const daForProject = (): DaDetails | undefined => daDetailsForFile(useDaDetails.getState().details)

/** A project's details from its saved records, for its project file. */
export const daFromRecords = (records: Record<string, unknown> | null): DaDetails | undefined => daDetailsForFile(records?.[DA_DETAILS_KIND])
