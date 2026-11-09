// The sun's position against published values: NREL's SPA worked example, and Sydney's
// solstices as the Bureau of Meteorology and the NOAA calculator give them.

import { describe, expect, it } from 'vitest'
import { aestToUtc, clockText, compassPoint, hourText, sunAt, sunDay, sunPosition } from '../solar'

const SYDNEY = { lat: -33.87, lon: 151.21 }
const JUNE = { year: 2026, month: 6, day: 21 }
const DECEMBER = { year: 2026, month: 12, day: 21 }

describe('sun position', () => {
  it('matches NREL’s SPA example (Golden, Colorado, 17 Oct 2003 12:30:30 MST) to a few hundredths of a degree', () => {
    // Reda and Andreas (2004), table A5.1: topocentric zenith 50.11162°, azimuth 194.34024°.
    const utc = Date.UTC(2003, 9, 17, 19, 30, 30)
    const s = sunPosition(39.742476, -105.1786, utc)
    expect(90 - s.elevation).toBeCloseTo(50.11, 1)
    expect(Math.abs(90 - s.elevation - 50.11162)).toBeLessThan(0.05)
    expect(Math.abs(s.azimuth - 194.34024)).toBeLessThan(0.05)
  })

  it('puts Sydney’s midwinter noon sun about 32.7° up, due north', () => {
    const day = sunDay(SYDNEY.lat, SYDNEY.lon, JUNE)
    expect(day.noonElevation).toBeGreaterThan(32.6)
    expect(day.noonElevation).toBeLessThan(32.8)
    const s = sunAt(SYDNEY.lat, SYDNEY.lon, JUNE, day.noon)
    expect(Math.min(s.azimuth, 360 - s.azimuth)).toBeLessThan(0.2)
    // Solar noon is a few minutes before 12 in Sydney: it sits east of AEST's 150° meridian.
    expect(day.noon).toBeGreaterThan(11 * 60 + 55)
    expect(day.noon).toBeLessThan(11 * 60 + 59)
  })

  it('puts Sydney’s midsummer noon sun about 79.6° up, due north', () => {
    const day = sunDay(SYDNEY.lat, SYDNEY.lon, DECEMBER)
    expect(day.noonElevation).toBeGreaterThan(79.5)
    expect(day.noonElevation).toBeLessThan(79.7)
    expect(Math.min(sunAt(SYDNEY.lat, SYDNEY.lon, DECEMBER, day.noon).azimuth, 360 - sunAt(SYDNEY.lat, SYDNEY.lon, DECEMBER, day.noon).azimuth)).toBeLessThan(0.5)
  })

  it('rises north of east in winter and south of east in summer, at the times the almanacs give', () => {
    const june = sunDay(SYDNEY.lat, SYDNEY.lon, JUNE)
    const dec = sunDay(SYDNEY.lat, SYDNEY.lon, DECEMBER)
    // Sydney, 21 June: sunrise 7:00 am, sunset 4:54 pm AEST. 21 December: 5:41 am and 8:05 pm AEDT (4:41 am, 7:05 pm AEST).
    expect(Math.abs(june.sunrise! - (7 * 60 + 0))).toBeLessThan(2)
    expect(Math.abs(june.sunset! - (16 * 60 + 54))).toBeLessThan(2)
    expect(Math.abs(dec.sunrise! - (4 * 60 + 41))).toBeLessThan(2)
    expect(Math.abs(dec.sunset! - (19 * 60 + 5))).toBeLessThan(2)
    // Azimuths at sunrise and sunset, from cos A = (sin δ − sin φ sin h) / (cos φ cos h) with the
    // sun's centre at h = −0.833°: 62.0° and 298.0° in June, 119.3° and 240.7° in December.
    const at = (d: typeof JUNE, m: number) => sunAt(SYDNEY.lat, SYDNEY.lon, d, m).azimuth
    expect(Math.abs(at(JUNE, june.sunrise!) - 62.0)).toBeLessThan(0.3)
    expect(Math.abs(at(JUNE, june.sunset!) - 298.0)).toBeLessThan(0.3)
    expect(Math.abs(at(DECEMBER, dec.sunrise!) - 119.3)).toBeLessThan(0.3)
    expect(Math.abs(at(DECEMBER, dec.sunset!) - 240.7)).toBeLessThan(0.3)
    // Near the horizon the air lifts the sun's image by about half a degree; high up, hardly at all.
    const rise = sunAt(SYDNEY.lat, SYDNEY.lon, JUNE, june.sunrise!)
    expect(rise.elevation - rise.trueElevation).toBeGreaterThan(0.3)
    expect(rise.elevation - rise.trueElevation).toBeLessThan(0.6)
    const high = sunAt(SYDNEY.lat, SYDNEY.lon, DECEMBER, dec.noon)
    expect(high.elevation - high.trueElevation).toBeLessThan(0.01)
  })

  it('swings from the north-east to the north-west across a winter’s day, lowest at 9 and 3', () => {
    const nine = sunAt(SYDNEY.lat, SYDNEY.lon, JUNE, 9 * 60)
    const three = sunAt(SYDNEY.lat, SYDNEY.lon, JUNE, 15 * 60)
    expect(compassPoint(nine.azimuth)).toBe('north-east')
    expect(compassPoint(three.azimuth)).toBe('north-west')
    // Sydney, 21 June: about 19.0° up at 9 am and 18.1° at 3 pm (noon is a little before 12, so 3 pm is further from it).
    expect(nine.elevation).toBeCloseTo(19.0, 0)
    expect(three.elevation).toBeCloseTo(18.1, 0)
    expect(three.elevation).toBeLessThan(nine.elevation)
  })

  it('reads AEST as UTC+10 with no daylight saving', () => {
    expect(new Date(aestToUtc(JUNE, 9 * 60)).toISOString()).toBe('2026-06-20T23:00:00.000Z')
    expect(new Date(aestToUtc(DECEMBER, 12 * 60)).toISOString()).toBe('2026-12-21T02:00:00.000Z')
  })

  it('writes times the way the app does', () => {
    expect(clockText(9 * 60)).toBe('9:00 am')
    expect(clockText(12 * 60 + 5)).toBe('12:05 pm')
    expect(clockText(15 * 60 + 30)).toBe('3:30 pm')
    expect(hourText(9 * 60)).toBe('9 am')
    expect(hourText(12 * 60)).toBe('12 pm')
    expect(hourText(0)).toBe('12 am')
  })
})
