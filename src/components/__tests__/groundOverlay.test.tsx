// Cut and fill on the plan are told apart by more than colour (AX-26): the orange and the blue
// are about as light as each other, so cut carries − marks and fill + marks, the floor-vs-ground
// hatch leans opposite ways, and the Key says so.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import type { WorksOverlay } from '../../plan/groundOverlay'
import { GroundKey, WorksTint } from '../GroundOverlay'

const square = 'M0 0H4V4H0Z'
const works: WorksOverlay = { x0: 0, y0: 0, cell: 1, cut: [square], fill: ['M5 0H9V4H5Z'], edge: '', clip: 'M0 0H10V10H0Z' }
/** North up, 20 px to the metre, y down the screen. */
const toScreen = ([x, y]: Vec2): Vec2 => [x * 20, -y * 20]
const pattern = (html: string, id: string) => new RegExp(`<pattern id="${id}"[^>]*>(.*?)</pattern>`).exec(html)?.[1] ?? ''

describe('the cut and fill tint', () => {
  const html = renderToStaticMarkup(
    <svg>
      <WorksTint overlay={works} toScreen={toScreen} />
    </svg>,
  )

  it('draws a − on cut and a + on fill: one stroke against two', () => {
    expect(pattern(html, 'works-marks-cut').match(/<line/g)).toHaveLength(1)
    expect(pattern(html, 'works-marks-fill').match(/<line/g)).toHaveLength(2)
  })

  it('lays each set of marks over its own ground', () => {
    expect(html).toContain(`<path class="works-marks" d="${works.cut[0]}" fill="url(#works-marks-cut)"`)
    expect(html).toContain(`<path class="works-marks" d="${works.fill[0]}" fill="url(#works-marks-fill)"`)
  })

  it('keeps the marks upright when the plan is turned, so a − never reads as a hatch', () => {
    const turned = renderToStaticMarkup(
      <svg>
        <WorksTint overlay={works} toScreen={([x, y]) => [y * 20, x * 20]} />
      </svg>,
    )
    // The plan's x axis runs down the screen here: the pattern turns back by that quarter turn.
    expect(turned).toMatch(/<pattern id="works-marks-cut"[^>]*patternTransform="rotate\(-?90\.00\)"/)
    expect(html).toMatch(/<pattern id="works-marks-cut"[^>]*patternTransform="rotate\(-?0\.00\)"/)
  })
})

describe('the Key', () => {
  it('names the marks beside each colour', () => {
    const key = renderToStaticMarkup(<GroundKey on onChange={() => {}} lowest works />)
    expect(key).toContain('Ground cut down (− marks)')
    expect(key).toContain('Ground filled up (+ marks)')
  })

  it('shows the floor-below-ground hatch leaning the other way', () => {
    const key = renderToStaticMarkup(<GroundKey on onChange={() => {}} lowest />)
    expect(key).toMatch(/<i class="hatch"[^>]*><\/i> Floor above ground/)
    expect(key).toMatch(/<i class="hatch back"[^>]*><\/i> Floor below ground/)
  })
})
