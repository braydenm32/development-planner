// Where the sun is in the sky, worked out from the NOAA solar calculator's equations (which
// follow Meeus, Astronomical Algorithms). They're good to about 0.01° this century: far finer
// than a shadow on a plan needs, and close to NREL's SPA for the same moment.
//
// Times in the app are Australian Eastern Standard Time (UTC+10) all year, with no daylight
// saving, the way shadow diagrams for council are usually drawn. In summer, clock time is an
// hour later than the times shown.

/** NSW local standard time (AEST) is UTC plus this many minutes. */
export const AEST_OFFSET_MIN = 600

/** A calendar day; month is 1 to 12. */
export interface SunDate {
  year: number
  month: number
  day: number
}

export interface SunPosition {
  /** Compass bearing of the sun from true north, clockwise (degrees). */
  azimuth: number
  /** Height of the sun above the horizon (degrees), as seen: with atmospheric refraction. Below 0 it has set. */
  elevation: number
  /** The same without refraction, for sunrise and sunset. */
  trueElevation: number
  /** The sun's declination (degrees). */
  declination: number
  /** Equation of time (minutes): sundial time less mean solar time. */
  eqTime: number
}

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const mod = (a: number, n: number) => ((a % n) + n) % n

/** Julian day for a moment (milliseconds since 1970 UTC). */
export const julianDay = (utcMs: number) => utcMs / 86_400_000 + 2_440_587.5

/** The moment (UTC milliseconds) a given AEST clock time falls on a day. `minutes` is minutes after midnight. */
export function aestToUtc(d: SunDate, minutes: number): number {
  return Date.UTC(d.year, d.month - 1, d.day, 0, 0) + (minutes - AEST_OFFSET_MIN) * 60_000
}

/** Atmospheric refraction (degrees) at a true elevation, as the NOAA calculator corrects for it. */
function refraction(elev: number): number {
  if (elev > 85) return 0
  const te = Math.tan(elev * RAD)
  let arcsec: number
  if (elev > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
  else if (elev > -0.575) arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)))
  else arcsec = -20.774 / te
  return arcsec / 3600
}

/**
 * Where the sun is from a point on the earth at a moment. Latitude is negative south of the
 * equator and longitude positive east of Greenwich (Sydney is -33.87, 151.21).
 */
export function sunPosition(lat: number, lon: number, utcMs: number): SunPosition {
  const T = (julianDay(utcMs) - 2_451_545) / 36_525
  // The sun's mean longitude and anomaly, and the earth's orbit's eccentricity.
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360)
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * RAD
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C = Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M) * (0.019993 - 0.000101 * T) + Math.sin(3 * M) * 0.000289
  const omega = (125.04 - 1934.136 * T) * RAD
  // Apparent longitude, corrected for nutation and aberration.
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * RAD
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const y = Math.tan(eps / 2) ** 2
  const L0r = L0 * RAD
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(M) +
      4 * e * y * Math.sin(M) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * M))

  // Hour angle from true solar time: negative in the morning, zero at solar noon.
  const utcMinutes = mod(utcMs / 60_000, 1440)
  const solarMinutes = mod(utcMinutes + eqTime + 4 * lon, 1440)
  const H = (solarMinutes / 4 - 180) * RAD
  const phi = lat * RAD
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)
  const trueElevation = 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) * DEG
  const azimuth = mod(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * DEG + 180, 360)
  return { azimuth, elevation: trueElevation + refraction(trueElevation), trueElevation, declination: decl * DEG, eqTime }
}

/** Where the sun is at an AEST clock time on a day. */
export function sunAt(lat: number, lon: number, d: SunDate, minutes: number): SunPosition {
  return sunPosition(lat, lon, aestToUtc(d, minutes))
}

/** The sun's centre is this far below the horizon (degrees) when its top edge rises or sets, refraction included. */
const RISE_ELEVATION = -0.833

export interface SunDay {
  /** AEST minutes after midnight; null when the sun doesn't rise or set that day. */
  sunrise: number | null
  sunset: number | null
  /** When the sun is highest, and how high. */
  noon: number
  noonElevation: number
}

/** Sunrise, solar noon and sunset on a day, in AEST minutes after midnight. */
export function sunDay(lat: number, lon: number, d: SunDate): SunDay {
  const elev = (m: number) => sunAt(lat, lon, d, m).trueElevation - RISE_ELEVATION
  // Solar noon from the equation of time at midday, refined once.
  let noon = 720 - 4 * lon + AEST_OFFSET_MIN - sunAt(lat, lon, d, 720).eqTime
  noon = 720 - 4 * lon + AEST_OFFSET_MIN - sunAt(lat, lon, d, noon).eqTime
  const cross = (a: number, b: number): number | null => {
    let fa = elev(a)
    const fb = elev(b)
    if (fa * fb > 0) return null
    let lo = a
    let hi = b
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      const fm = elev(mid)
      if (fa * fm <= 0) hi = mid
      else {
        lo = mid
        fa = fm
      }
    }
    return (lo + hi) / 2
  }
  return {
    sunrise: cross(noon - 720, noon),
    sunset: cross(noon, noon + 720),
    noon,
    noonElevation: sunAt(lat, lon, d, noon).elevation,
  }
}

/** "9:00 am", "12:30 pm", from AEST minutes after midnight. */
export function clockText(minutes: number): string {
  const m = Math.round(mod(minutes, 1440))
  const h = Math.floor(m / 60) % 24
  const mm = m % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** "9 am", "12 pm", "3 pm" for whole hours; otherwise as clockText. */
export function hourText(minutes: number): string {
  const m = Math.round(mod(minutes, 1440))
  if (m % 60) return clockText(m)
  const h = m / 60
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** The compass point nearest a bearing: "north-east". */
export const compassPoint = (bearing: number) => POINTS[Math.round(mod(bearing, 360) / 45) % 8]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "21 June". */
export const dayText = (d: Pick<SunDate, 'month' | 'day'>) => `${d.day} ${MONTHS[d.month - 1]}`
