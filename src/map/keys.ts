// The aerial map from the keyboard, and without dragging: what each key does, and the lot that
// sits under the cross in the middle of the map (the one Enter picks).

import { pointInPolygon } from '../lib/geom'
import type { LonLat } from './geo'
import type { Lot } from './services'

/** Pixels the map moves for one arrow key or one press of a move button; Shift moves it further. */
export const PAN_STEP = 80
const PAN_FAR = 240

export type MapKey = { pan: [number, number] } | { zoom: 1 | -1 } | { pick: true }

/** What a key pressed on the map does; null for a key the map leaves alone (Tab, letters, Esc). */
export function mapKey(key: string, shift = false): MapKey | null {
  const d = shift ? PAN_FAR : PAN_STEP
  switch (key) {
    case 'ArrowLeft':
      return { pan: [-d, 0] }
    case 'ArrowRight':
      return { pan: [d, 0] }
    case 'ArrowUp':
      return { pan: [0, -d] }
    case 'ArrowDown':
      return { pan: [0, d] }
    case '+':
    case '=':
      return { zoom: 1 }
    case '-':
    case '_':
      return { zoom: -1 }
    case 'Enter':
    case ' ':
      return { pick: true }
    default:
      return null
  }
}

/** The lot the middle of the map is over, if any. */
export function lotAt(center: LonLat, lots: Lot[]): Lot | null {
  return lots.find(l => pointInPolygon(center[0], center[1], l.ring)) ?? null
}

/** What a screen reader hears as the map moves under the cross. */
export function crossWords(lot: Lot | null, lotsShown: boolean): string {
  if (!lotsShown) return 'Zoom in to see the lots.'
  return lot ? `${lot.label} is under the cross. Enter picks it.` : 'No lot under the cross.'
}
