// The words and arrows of FallPicker.tsx, apart from it so the component file holds only components.

import type { FallChoice, FallWay } from './sketch'

export const FALL_WAYS: { id: FallWay; label: string }[] = [
  { id: 'flat', label: 'It’s flat' },
  { id: 'front', label: 'Down to the street' },
  { id: 'back', label: 'Down to the back' },
  { id: 'left', label: 'Down to the left' },
  { id: 'right', label: 'Down to the right' },
  { id: 'both', label: 'Two ways (front to back and side to side)' },
]

/** The line under the choice: what left and right mean here. */
export const FALL_NOTE = 'Left and right as you stand on the street looking at the block. The amount is how much lower the low side is, in metres.'

/** Unit arrows downhill in the picture (x right, y down; the street along the bottom), from a choice. */
export function downhill(c: FallChoice): { dx: number; dy: number }[] {
  const has = (s: string) => {
    const n = Number(s.trim().replace(/^[-−]/, '').replace(',', '.'))
    return s.trim() !== '' && Number.isFinite(n) && n > 0
  }
  switch (c.way) {
    case 'flat':
      return []
    case 'front':
      return [{ dx: 0, dy: 1 }]
    case 'back':
      return [{ dx: 0, dy: -1 }]
    case 'left':
      return [{ dx: -1, dy: 0 }]
    case 'right':
      return [{ dx: 1, dy: 0 }]
    case 'both': {
      const out: { dx: number; dy: number }[] = []
      if (has(c.front)) out.push({ dx: 0, dy: c.frontTo === 'front' ? 1 : -1 })
      if (has(c.side)) out.push({ dx: c.sideTo === 'left' ? -1 : 1, dy: 0 })
      return out
    }
  }
}
