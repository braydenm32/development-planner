// The house rules for numbers (src/shell/format.ts): one way to write each quantity, so the same
// figure can be matched from one screen to the next (AX-35, LD-27, LF-21, DB-25).

import { describe, expect, it } from 'vitest'
import { gradeText } from '../../lib/drape'
import { slopeText } from '../../components/SiteSections'
import { tagSize } from '../../grading/tags'
import { ROWS as COMPARE_ROWS } from '../../options/compare'
import { m2, shownArea, siteM2 } from '../format'
import { floorsText } from '../headline'

describe('one format per quantity', () => {
  it('floor areas to 2 decimals, the block’s area in whole m²', () => {
    expect(m2(82.694)).toBe('82.69 m²')
    expect(siteM2(810.3)).toBe('810 m²')
    expect(shownArea(70.434)).toBe(70.43)
  })

  it('levels always start with RL, one floor or several', () => {
    expect(floorsText([{ rl: 45.36 }], 45.36)).toBe('RL 45.36')
    expect(floorsText([{ rl: 45.36 }, { rl: 46.36 }], 45.36)).toBe('RL 45.36 / 46.36')
  })

  it('grades read 1 in N (P%), on the block as on the driveway', () => {
    expect(gradeText(0.03)).toBe('1 in 33.3 (3%)')
    expect(slopeText(17)).toBe(gradeText(0.17))
  })

  it('an implied wall’s tag gives the height it holds to 10 mm, as its row and the strip do', () => {
    expect(tagSize(1.42, false, true).label).toBe('Implied 1.42 m wall')
    // A suggestion still rounds up to a height to build to.
    expect(tagSize(1.42, true).label).toBe('1.5 m wall?')
  })

  it('Compare calls the fill what the Overview and the PDF call it', () => {
    expect(COMPARE_ROWS.find(r => r.id === 'deepest-fill')?.label).toBe('Deepest fill')
  })
})
