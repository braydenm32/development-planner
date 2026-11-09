// The councils whose own rules (LEP and DCP) the checks know, each switched on or off per project.
// The Housing Code (CDC) checks are state-wide and always available; a council's rules add the DA
// checks. A block is in one council, so switching one on switches the others off.

import { DEFAULT_CHECK_SETTINGS, type CheckSettings, type CouncilId } from './types'

export interface Council {
  id: CouncilId
  /** "Wollongong" */
  name: string
  /** The instruments its rules come from: "Wollongong LEP 2009 and DCP 2009". */
  rules: string
}

export const COUNCILS: Council[] = [{ id: 'wollongong', name: 'Wollongong', rules: 'Wollongong LEP 2009 and DCP 2009' }]

/** The council whose rules are on, if any. */
export function activeCouncil(s: Pick<CheckSettings, 'councils'>): Council | null {
  return COUNCILS.find(c => s.councils?.[c.id]) ?? null
}

/**
 * A plan's check settings with the defaults filled in. Plans saved before councils could be switched
 * were all checked against Wollongong, so one that already had check settings keeps Wollongong on.
 * With no council on there are no DA rules to check, so the pathway reads as CDC.
 */
export function checkSettingsOf(stored: CheckSettings | undefined): CheckSettings {
  const s: CheckSettings = { ...DEFAULT_CHECK_SETTINGS, ...stored }
  if (stored && stored.councils === undefined) s.councils = { wollongong: true }
  if (s.pathway === 'da' && !activeCouncil(s)) s.pathway = 'cdc'
  return s
}

/** The councils after switching one on (the others go off) or off. */
export function switchCouncil(s: CheckSettings, id: CouncilId, on: boolean): Pick<CheckSettings, 'councils' | 'pathway'> {
  const councils = on ? { [id]: true } : { ...s.councils, [id]: false }
  return { councils, pathway: !on && s.pathway === 'da' ? 'cdc' : s.pathway }
}
