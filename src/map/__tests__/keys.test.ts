// The aerial map from the keyboard (AX-29): arrows move it, + and − zoom, Enter picks the lot
// under the cross, and the words a screen reader hears as it moves.

import { describe, expect, it } from 'vitest'
import { crossWords, lotAt, mapKey, PAN_STEP } from '../keys'
import type { Lot } from '../services'

// Two made-up lots side by side.
const lot = (id: string, w: number): Lot => ({
  id,
  label: `Lot ${id} DP0000`,
  ring: [
    [w, -34.001],
    [w + 0.001, -34.001],
    [w + 0.001, -34],
    [w, -34],
  ],
})
const lots = [lot('1', 150), lot('2', 150.001)]

describe('keys on the map', () => {
  it('moves with the arrow keys, further with Shift', () => {
    expect(mapKey('ArrowLeft')).toEqual({ pan: [-PAN_STEP, 0] })
    expect(mapKey('ArrowDown')).toEqual({ pan: [0, PAN_STEP] })
    expect(mapKey('ArrowUp', true)).toEqual({ pan: [0, -PAN_STEP * 3] })
  })

  it('zooms with + and −, on either key of the pair', () => {
    expect(mapKey('+')).toEqual({ zoom: 1 })
    expect(mapKey('=')).toEqual({ zoom: 1 })
    expect(mapKey('-')).toEqual({ zoom: -1 })
  })

  it('picks with Enter or Space, and leaves Tab, Esc and letters to the page', () => {
    expect(mapKey('Enter')).toEqual({ pick: true })
    expect(mapKey(' ')).toEqual({ pick: true })
    for (const k of ['Tab', 'Escape', 'w', '?']) expect(mapKey(k)).toBeNull()
  })
})

describe('the lot under the cross', () => {
  it('is the lot the middle of the map is over', () => {
    expect(lotAt([150.0015, -34.0005], lots)?.id).toBe('2')
    expect(lotAt([150.0005, -34.0005], lots)?.id).toBe('1')
    expect(lotAt([149.9, -34.0005], lots)).toBeNull()
  })

  it('is read out by name, with what Enter does', () => {
    expect(crossWords(lots[0], true)).toBe('Lot 1 DP0000 is under the cross. Enter picks it.')
    expect(crossWords(null, true)).toBe('No lot under the cross.')
    expect(crossWords(null, false)).toBe('Zoom in to see the lots.')
  })
})
