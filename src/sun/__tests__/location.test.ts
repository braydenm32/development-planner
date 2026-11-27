// The latitude and longitude boxes in Site › Sun (LD-28): a southern latitude is typed the way
// the app shows it, and a value outside Australia says so in words.

import { describe, expect, it } from 'vitest'
import { readNumber } from '../../components/readNumber'
import { coordsText, LATITUDE_RANGE, tidyLatitude, tidyLongitude } from '../location'

/** As the Latitude box reads it: degrees south, 9 to 44. */
const south = (typed: string) => readNumber(tidyLatitude(typed), '°', true, 9, 44)

describe('typing where the block is', () => {
  it('reads a latitude the way it is shown, with or without the S or the minus', () => {
    expect(coordsText({ lat: -33.87, lon: 151.21 })).toBe('33.870° S, 151.210° E')
    for (const typed of ['33.9', '33.9 S', '33.9°S', '33.9° south', '-33.9', '−33.9', ' 33,9 s ']) expect(south(typed), typed).toMatchObject({ ok: true, value: 33.9 })
  })

  it('still refuses what is not a latitude in Australia, and the box says the range in words', () => {
    // The box swaps the bare "Max 44 °" for LATITUDE_RANGE (src/components/fields.tsx).
    expect(south('60')).toEqual({ ok: false, hint: 'Max 44 °' })
    expect(south('5 S')).toEqual({ ok: false, hint: 'Min 9 °' })
    expect(south('abc')).toEqual({ ok: false, hint: 'Enter a number' })
    expect(LATITUDE_RANGE).toBe('Latitude in Australia is between 9° and 44° south')
  })

  it('reads a longitude with its E', () => {
    for (const typed of ['151.2', '151.2 E', '151.2°E', '151.2° east']) expect(readNumber(tidyLongitude(typed), '°', true, 112, 154), typed).toMatchObject({ ok: true, value: 151.2 })
    expect(readNumber(tidyLongitude('-151'), '°', true, 112, 154).ok).toBe(false)
  })
})
