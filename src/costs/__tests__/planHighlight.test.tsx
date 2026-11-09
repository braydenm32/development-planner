// A cost line pointed out on the plan: every item it counts shows, whichever floor it's on. The
// made-up split level (src/plan/__tests__/fixtures.ts) with retaining walls on two of its levels.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import type { Survey } from '../../lib/survey'
import type { Terrain } from '../../lib/terrain'
import type { Plan, Wall } from '../../plan/model'
import { splitLevels } from '../../plan/__tests__/fixtures'
import type { Target } from '../estimate'
import { Highlight } from '../PlanHighlight'

const retaining = (id: string, level: string, a: Vec2, b: Vec2): Wall => ({ id, level, a, b, thickness: 0.2, kind: 'retaining' })

function plan(): Plan {
  const p = splitLevels()
  return {
    ...p,
    walls: [
      ...p.walls,
      retaining('rw_low_1', 'level_low', [-2, -1], [-2, 7]),
      retaining('rw_low_2', 'level_low', [-2, -1], [9, -1]),
      retaining('rw_mid', 'level_mid', [-2, 13], [9, 13]),
    ],
  }
}

const survey = { origin: [1000, 1000], boundary: [] } as unknown as Survey
const terrain = {} as Terrain

const draw = (level: string, target: Target) =>
  renderToStaticMarkup(<Highlight plan={plan()} level={level} survey={survey} terrain={terrain} earth={null} S={p => [p[0] * 20, -p[1] * 20]} k={20} target={target} />)

const count = (html: string, cls: string) => html.split(`class="ch-${cls}"`).length - 1

describe('the costs plan highlight', () => {
  it('shows every retaining wall on the line, those on other floors as outlines', () => {
    const target: Target = { kind: 'retaining', ids: ['rw_low_1', 'rw_low_2', 'rw_mid'] }
    const mid = draw('level_mid', target)
    expect(count(mid, 'solid')).toBe(1)
    expect(count(mid, 'line')).toBe(2)
    const low = draw('level_low', target)
    expect(count(low, 'solid')).toBe(2)
    expect(count(low, 'line')).toBe(1)
  })

  it('shows a slab area drawn on another floor', () => {
    const html = draw('level_low', { kind: 'areas', ids: ['mid_slab'] })
    expect(count(html, 'line')).toBe(1)
    expect(count(draw('level_mid', { kind: 'areas', ids: ['mid_slab'] }), 'fill')).toBe(1)
  })
})
