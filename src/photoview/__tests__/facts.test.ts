import { describe, expect, it } from 'vitest'
import { toMga } from '../../map/geo'
import type { MapPlace } from '../../map/model'
import { NO_FACTS } from '../exif'
import { guessSpot, inDaylightSaving, sunTimeOf } from '../facts'

// A made-up place: a point in the ocean, with a survey grid turned 10° onto the map.
const LONLAT: [number, number] = [151.3, -34.6]
const ZONE = 56
const place = { zone: ZONE, fit: { from: [1000, 2000], at: toMga(LONLAT, ZONE), rotation: 10 } } as unknown as MapPlace

describe('a first guess of the spot from the phone', () => {
  it('puts the phone’s position on the survey, and turns its compass bearing to the survey’s north', () => {
    const g = guessSpot({ ...NO_FACTS, gps: { lat: LONLAT[1], lon: LONLAT[0] }, facing: { deg: 90, north: 'true' } }, place, [1010, 2000])
    expect(g!.at[0]).toBeCloseTo(1000, 3)
    expect(g!.at[1]).toBeCloseTo(2000, 3)
    expect(g!.heading).toBeCloseTo(100, 9)
    expect(g!.away).toBeCloseTo(10, 3)
  })

  it('makes no guess off the map, with no position, or far from the block', () => {
    const facts = { ...NO_FACTS, gps: { lat: LONLAT[1], lon: LONLAT[0] } }
    expect(guessSpot(facts, null, [1000, 2000])).toBeNull()
    expect(guessSpot(NO_FACTS, place, [1000, 2000])).toBeNull()
    expect(guessSpot(facts, place, [5000, 2000])).toBeNull()
    // No compass: a spot but no direction.
    expect(guessSpot(facts, place, [1000, 2000])!.heading).toBeNull()
  })
})

describe('the sun at the time the photo was taken', () => {
  it('turns the camera’s clock into the sun study’s AEST', () => {
    expect(sunTimeOf('2026-01-10T15:30:00', 660)).toMatchObject({ month: 1, day: 10, minutes: 14 * 60 + 30, clamped: false, zoneGuessed: false })
    expect(sunTimeOf('2026-06-21T09:00:00', 600)).toMatchObject({ minutes: 9 * 60 })
  })

  it('assumes NSW daylight saving from the date when the photo has no time zone', () => {
    expect(sunTimeOf('2026-12-01T12:00:00', null)).toMatchObject({ minutes: 11 * 60, zoneGuessed: true })
    expect(sunTimeOf('2026-07-01T12:00:00', null)).toMatchObject({ minutes: 12 * 60 })
    // 2026: daylight saving ends on 5 April and starts on 4 October.
    expect(inDaylightSaving(2026, 4, 4)).toBe(true)
    expect(inDaylightSaving(2026, 4, 5)).toBe(false)
    expect(inDaylightSaving(2026, 10, 3)).toBe(false)
    expect(inDaylightSaving(2026, 10, 4)).toBe(true)
  })

  it('brings an evening photo inside the study’s day, and says so; no time, no sun', () => {
    expect(sunTimeOf('2026-03-01T20:15:00', 660)).toMatchObject({ minutes: 18 * 60, clamped: true })
    expect(sunTimeOf(null, null)).toBeNull()
  })
})
