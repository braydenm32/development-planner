// The councils whose own rules (LEP and DCP) the checks know, each switched on or off per project.
// The app covers NSW only. The Housing Code (CDC) checks are state-wide and always available; a
// council's rules add the DA checks. A block is in one council, so switching one on switches the
// others off. Each council's rules are a data table in this folder (see types.ts).

import { DEFAULT_CHECK_SETTINGS, type CheckSettings, type CouncilId } from '../types'
import { BLUE_MOUNTAINS } from './blueMountains'
import { CENTRAL_COAST } from './centralCoast'
import { KIAMA } from './kiama'
import type { Council } from './types'
import { WOLLONGONG } from './wollongong'

export type { Council } from './types'

/**
 * Every council with its own rules in the app, by id. Shellharbour and Lake Macquarie aren't here
 * yet: their current DCPs couldn't be read (docs/research/councils/README.md).
 */
export const COUNCIL_TABLES: Record<CouncilId, Council> = {
  wollongong: WOLLONGONG,
  kiama: KIAMA,
  'blue-mountains': BLUE_MOUNTAINS,
  'central-coast': CENTRAL_COAST,
}

/** The councils, by name, as the switches list them. */
export const COUNCILS: Council[] = Object.values(COUNCIL_TABLES).sort((a, b) => a.name.localeCompare(b.name))

/** Lower case, words only, for matching a name however it's written. */
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Words a council's name comes wrapped in, in the lookups and on letterheads. */
const WRAPPING = /\b(city|shire|municipal|regional)?\s*council\b|\bcity of\b|\blocal environmental plan( \d{4})?\b|\blep( \d{4})?\b/g

/**
 * A council by its id, or by the name a lookup gives it: the LGA ("Wollongong City Council",
 * "WOLLONGONG") or the LEP ("Wollongong Local Environmental Plan 2009"). Null when the app doesn't
 * have that council's rules, so only the state-wide Housing Code applies.
 */
export function councilFor(name: string | null | undefined): Council | null {
  if (!name) return null
  const k = key(name)
  const bare = k.replace(WRAPPING, ' ').replace(/\s+/g, ' ').trim()
  return COUNCILS.find(c => c.id === name || [c.lga, c.lep, c.name].some(n => key(n) === k) || key(c.name) === bare) ?? null
}

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
