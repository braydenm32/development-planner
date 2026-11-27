// How much of the phone's screen the Key numbers sheet takes on the plan and the 3D view: one
// line, or the card with the three numbers and the two answers. It starts as the line, so the
// picture has the screen (PH-04); pulled up or down, the choice is kept on this device. A tap, or a
// pull up from the card, still opens every number.

import { create } from 'zustand'

export type PeekSize = 'line' | 'card'

const KEY = 'peek-size-v1'

export function readPeekSize(raw: string | null): PeekSize {
  return raw === 'card' ? 'card' : 'line'
}

function load(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const usePeekSize = create<{ size: PeekSize; setSize: (s: PeekSize) => void }>(set => ({
  size: readPeekSize(load()),
  setSize: size => {
    set({ size })
    try {
      localStorage.setItem(KEY, size)
    } catch {
      // Kept for this visit only.
    }
  },
}))

/** How far up a pull has to go before letting go takes the sheet a stop up, in px. */
export const PULL_TO_OPEN = 48
/** And how far down, to fold the card to its line. */
export const PULL_TO_FOLD = 36

/**
 * What letting go of the sheet does. Its three stops are the line, the card and the Overview: a
 * pull up goes one stop up, a pull down folds the card to the line, and a tap opens the Overview
 * from either. Where the sheet can't change size (the line while editing, or turned sideways), a
 * pull up opens the Overview as a tap does.
 */
export function peekRelease(pulledUp: number, moved: boolean, slim: boolean, resizes: boolean): 'open' | PeekSize | 'stay' {
  if (!moved) return 'open'
  if (pulledUp >= PULL_TO_OPEN) return slim && resizes ? 'card' : 'open'
  if (pulledUp <= -PULL_TO_FOLD && !slim && resizes) return 'line'
  return 'stay'
}
