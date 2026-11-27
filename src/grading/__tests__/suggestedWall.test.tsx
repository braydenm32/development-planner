// A suggested wall's Add and Dismiss on the plan are big enough to hit (AX-31): 24 px high, with
// Dismiss 24 px square, a gap between them, and the tag's reserved width covering both.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Suggested } from '../SuggestedWall'
import type { WallSuggestion } from '../suggest'
import { placeTags, tagSize } from '../tags'

const wall = { key: 'w', source: 'pad', kind: 'cut', rule: 'boundary', path: [], a: [0, 0], b: [4, 0], level: 45, height: 1, face: 4, why: 'The batter would cross the boundary', engineer: true } as unknown as WallSuggestion

const buttons = (html: string) =>
  [...html.matchAll(/<g class="grade-suggest-btn[^"]*" role="button" aria-label="([^"]+)" transform="translate\(([-\d.]+) ([-\d.]+)\)"><rect width="(\d+)" height="(\d+)"/g)].map(m => ({ name: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))

describe('a suggested wall’s buttons on the plan', () => {
  const html = renderToStaticMarkup(
    <svg>
      <Suggested n={1} s={wall} at={[100, 100]} readOnly={false} onAdd={() => {}} onDismiss={() => {}} />
    </svg>,
  )
  const [add, dismiss] = buttons(html)

  it('are each at least 24 px each way', () => {
    expect(add.name).toBe('Add suggested wall 1')
    expect(dismiss.name).toBe('Dismiss suggested wall 1')
    for (const b of [add, dismiss]) {
      expect(b.w).toBeGreaterThanOrEqual(24)
      expect(b.h).toBeGreaterThanOrEqual(24)
    }
  })

  it('sit side by side with a gap, inside the room the tag keeps for them', () => {
    expect(dismiss.x - (add.x + add.w)).toBeGreaterThanOrEqual(4)
    const { w, total } = tagSize(wall.height, true)
    expect(dismiss.x + dismiss.w).toBeLessThanOrEqual(total - w / 2)
  })
})

describe('a suggested wall’s tag stays in the open plan (final check, problem 4)', () => {
  it('slides left so Add and Dismiss are clear of the buttons down the right', () => {
    const line = { A: [300, 100] as [number, number], B: [300, 400] as [number, number], height: 1 }
    const { w, total } = tagSize(1, true)
    const free = placeTags([line], true)[0]
    expect(free[0] - w / 2 + total).toBeGreaterThan(330)
    const [at] = placeTags([line], true, { x0: 0, y0: 0, x1: 330, y1: 600 })
    expect(at[0] - w / 2 + total + 2).toBeLessThanOrEqual(330.01)
    expect(at[0] - w / 2 - 2).toBeGreaterThanOrEqual(0)
  })
})
