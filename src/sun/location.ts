// Where the block is on the earth, for the sun. The survey is in local coordinates with no map
// position yet, so the project keeps a town (or a typed latitude and longitude) instead; a few
// kilometres either way moves the sun by a few hundredths of a degree. Older projects get Sydney.

import type { Plan } from '../plan/model'
import { activeCouncil, checkSettingsOf } from '../checks/councils'
import type { CouncilId } from '../checks/types'

export interface SiteLocation {
  /** Degrees, negative south of the equator. */
  lat: number
  /** Degrees, positive east of Greenwich. */
  lon: number
  /** The town picked from the list; missing when the latitude and longitude were typed. */
  place?: string
  /**
   * Bearing of true north in the survey's grid, degrees clockwise. Missing or 0 takes the
   * survey's north as true north. Placing the survey on the map can set it from the fit.
   */
  trueNorth?: number
}

/** NSW towns on Australian Eastern Standard Time (Broken Hill keeps Central time, so it isn't here). */
export const NSW_TOWNS: { name: string; lat: number; lon: number }[] = [
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Newcastle', lat: -32.93, lon: 151.78 },
  { name: 'Wollongong', lat: -34.42, lon: 150.89 },
  { name: 'Kiama', lat: -34.67, lon: 150.85 },
  { name: 'Central Coast (Gosford)', lat: -33.43, lon: 151.34 },
  { name: 'Blue Mountains (Katoomba)', lat: -33.71, lon: 150.31 },
  { name: 'Southern Highlands (Bowral)', lat: -34.48, lon: 150.42 },
  { name: 'Nowra', lat: -34.88, lon: 150.6 },
  { name: 'Batemans Bay', lat: -35.71, lon: 150.18 },
  { name: 'Bega', lat: -36.67, lon: 149.84 },
  { name: 'Goulburn', lat: -34.75, lon: 149.72 },
  { name: 'Queanbeyan', lat: -35.35, lon: 149.23 },
  { name: 'Bathurst', lat: -33.42, lon: 149.58 },
  { name: 'Orange', lat: -33.28, lon: 149.1 },
  { name: 'Dubbo', lat: -32.25, lon: 148.6 },
  { name: 'Wagga Wagga', lat: -35.11, lon: 147.37 },
  { name: 'Albury', lat: -36.08, lon: 146.92 },
  { name: 'Griffith', lat: -34.29, lon: 146.04 },
  { name: 'Tamworth', lat: -31.09, lon: 150.93 },
  { name: 'Armidale', lat: -30.51, lon: 151.67 },
  { name: 'Port Macquarie', lat: -31.43, lon: 152.91 },
  { name: 'Coffs Harbour', lat: -30.3, lon: 153.11 },
  { name: 'Lismore', lat: -28.81, lon: 153.28 },
]

export const DEFAULT_LOCATION: SiteLocation = { lat: -33.87, lon: 151.21, place: 'Sydney' }

/** The town in the list each council's checks stand for, so its rules and its sun agree. */
export const COUNCIL_TOWN: Record<CouncilId, string> = {
  wollongong: 'Wollongong',
  kiama: 'Kiama',
  'blue-mountains': 'Blue Mountains (Katoomba)',
  'central-coast': 'Central Coast (Gosford)',
}

/** A council's town as a location; null for a council with no town in the list. */
export function councilLocation(id: CouncilId): SiteLocation | null {
  const t = NSW_TOWNS.find(x => x.name === COUNCIL_TOWN[id])
  return t ? { lat: t.lat, lon: t.lon, place: t.name } : null
}

const isSet = (l: SiteLocation | undefined): l is SiteLocation => !!l && Number.isFinite(l.lat) && Number.isFinite(l.lon)

/**
 * Where the sun works from when no place has been picked: the town of the council whose rules are
 * on (so the DA checks and the sun are for the same place), or Sydney.
 */
export function defaultLocationOf(plan: Pick<Plan, 'checks'> | null | undefined): SiteLocation {
  const council = plan?.checks ? activeCouncil(checkSettingsOf(plan.checks)) : null
  return (council && councilLocation(council.id)) || DEFAULT_LOCATION
}

/** The project's location: the place picked, else the council's town, else Sydney. */
export function locationOf(plan: Pick<Plan, 'location' | 'checks'> | null | undefined): SiteLocation {
  const l = plan?.location
  return isSet(l) ? l : defaultLocationOf(plan)
}

/** The plan's place after switching council `id` on: its town, unless a place was picked other than the last council's town. */
export function locationForCouncil(plan: Pick<Plan, 'location' | 'checks'>, id: CouncilId): SiteLocation | undefined {
  const l = plan.location
  // A place that is just the last council's town came from switching that council on, not from a pick.
  const was = plan.checks ? activeCouncil(checkSettingsOf(plan.checks)) : null
  const before = was ? councilLocation(was.id) : null
  const picked = isSet(l) && !(before && l.place === before.place && l.lat === before.lat && l.lon === before.lon)
  if (picked) return l
  const town = councilLocation(id)
  // Keep the north turn the survey was given; only the town moves.
  return town ? { ...town, trueNorth: l?.trueNorth } : l
}

/** Roughly NSW and the ACT; outside it, AEST may not be the local time. */
export const inNsw = (l: Pick<SiteLocation, 'lat' | 'lon'>) => l.lat <= -28 && l.lat >= -37.6 && l.lon >= 140.9 && l.lon <= 153.7

/** "Sydney", or "33.870° S, 151.210° E" when typed. */
export function locationText(l: SiteLocation): string {
  return l.place ?? coordsText(l)
}

export const coordsText = (l: Pick<SiteLocation, 'lat' | 'lon'>) =>
  `${Math.abs(l.lat).toFixed(3)}° ${l.lat < 0 ? 'S' : 'N'}, ${Math.abs(l.lon).toFixed(3)}° ${l.lon < 0 ? 'W' : 'E'}`

/**
 * Grid convergence on MGA (GDA2020, UTM zones of 6°): how far grid north is turned clockwise
 * from true north, in degrees. About +1° around Sydney, so if a survey's bearings are MGA, true
 * north sits about 1° anticlockwise of its grid north.
 */
export function mgaConvergence(lat: number, lon: number): number {
  const zone = Math.floor((lon + 180) / 6) + 1
  const centralMeridian = zone * 6 - 183
  const dl = ((lon - centralMeridian) * Math.PI) / 180
  return (Math.atan(Math.tan(dl) * Math.sin((lat * Math.PI) / 180)) * 180) / Math.PI
}

/** A direction's bearing in the survey's grid, from its true bearing. */
export const gridBearing = (trueBearing: number, l: SiteLocation) => trueBearing + (l.trueNorth ?? 0)
