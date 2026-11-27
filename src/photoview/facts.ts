// What a photo's own details are good for: a first guess of where it was taken and which way it
// faced (only when the block is placed on the map, so the phone's position can be put on the
// survey), and the day and time for the sun study. Pure, so it can be tested.

import type { Vec2 } from '../lib/geom'
import { mgaToGrid } from '../map/fit'
import { toMga } from '../map/geo'
import type { MapPlace } from '../map/model'
import { DAY_END, DAY_START } from '../sun/store'
import type { PhotoFacts } from './exif'
import { wrap360 } from './model'

/** A phone's position further than this from the block (m) is no help: it isn't used. */
export const GUESS_REACH = 150

export interface SpotGuess {
  /** Survey grid (easting, northing). */
  at: Vec2
  /** Compass bearing from the survey's north, when the photo said which way it faced. */
  heading: number | null
  /** How far from the middle of the block (m). */
  away: number
}

/**
 * Where the photo was taken, and which way it faced, from the phone's position and compass: rough,
 * as a phone's position can be several metres out and its compass ten degrees or more. Null when the
 * block isn't on the map, the photo has no position, or the position is nowhere near the block.
 */
export function guessSpot(facts: PhotoFacts, place: MapPlace | null, blockMiddle: Vec2): SpotGuess | null {
  if (!place || !facts.gps) return null
  const at = mgaToGrid(place.fit, toMga([facts.gps.lon, facts.gps.lat], place.zone))
  const away = Math.hypot(at[0] - blockMiddle[0], at[1] - blockMiddle[1])
  if (!Number.isFinite(away) || away > GUESS_REACH) return null
  // A bearing from the map's north is one from the survey's north turned by the fit (which turns the survey anticlockwise onto the map).
  const heading = facts.facing ? wrap360(facts.facing.deg + place.fit.rotation) : null
  return { at, heading, away }
}

export interface SunTime {
  month: number
  day: number
  /** Minutes after midnight, Australian Eastern Standard Time, as the sun study counts them. */
  minutes: number
  /** The time had to be brought inside the study's 6 am to 6 pm. */
  clamped: boolean
  /** No time zone in the photo: daylight saving was assumed from the date (NSW rules). */
  zoneGuessed: boolean
}

/** The first Sunday of a month (1-based day). */
const firstSunday = (year: number, month: number) => 1 + ((7 - new Date(Date.UTC(year, month - 1, 1)).getUTCDay()) % 7)

/** Whether a date falls in NSW daylight saving: from the first Sunday in October to the first Sunday in April. */
export function inDaylightSaving(year: number, month: number, day: number): boolean {
  if (month > 10 || month < 4) return true
  if (month === 10) return day >= firstSunday(year, 10)
  if (month === 4) return day < firstSunday(year, 4)
  return false
}

/** The sun study's day and time for when the photo was taken; null when the photo has no time. */
export function sunTimeOf(taken: string | null, offset: number | null): SunTime | null {
  const m = taken?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [year, month, day, hh, mm] = m.slice(1).map(Number)
  const zone = offset ?? (inDaylightSaving(year, month, day) ? 660 : 600)
  // The camera's clock to AEST (UTC+10).
  const raw = hh * 60 + mm - (zone - 600)
  const minutes = Math.min(DAY_END, Math.max(DAY_START, raw))
  return { month, day, minutes, clamped: minutes !== raw, zoneGuessed: offset === null }
}
