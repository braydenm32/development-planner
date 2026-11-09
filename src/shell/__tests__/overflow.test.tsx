// The tab bar and the summary strip when there's more than fits: no item shows cut off mid-word,
// an arrow at each end with more says so (with a count on the strip), and the arrows page to the
// hidden items. The site's checks chip says it's the site's, beside the DA or CDC checks.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { areaRoute } from '../../nav/route'
import { overflowOf, pageTo, type Span } from '../overflow'
import { SummaryStrip } from '../SummaryStrip'

vi.mock('../../site/sync', () => ({
  TO_CHECK_ID: 'site-to-check',
  useSiteWarnings: () => [{ severity: 'attn' }, { severity: 'attn' }, { severity: 'note' }],
}))

/** Tabs of these widths, side by side from 0. */
function row(...widths: number[]): Span[] {
  let x = 0
  return widths.map(w => {
    const s = { left: x, right: x + w }
    x += w
    return s
  })
}

const A = 28
// Ten tabs, 711 px in all, in a 523 px bar (the Design tabs at 1440 × 900).
const tabs = row(56, 62, 98, 60, 80, 76, 66, 70, 62, 81)
const total = tabs[tabs.length - 1].right

describe('a row with more than fits', () => {
  it('shows everything when it all fits, with no arrows', () => {
    expect(overflowOf(tabs, 0, total, total, A)).toEqual({ cut: tabs.map(() => false), before: 0, after: 0 })
  })

  it('hides the item the end would cut through, and counts what is hidden', () => {
    const o = overflowOf(tabs, 0, 523, total, A)
    // 523 − 28 for the arrow leaves room for the first six (432 px); the seventh would be cut.
    expect(o.cut).toEqual([false, false, false, false, false, false, true, true, true, true])
    expect(o).toMatchObject({ before: 0, after: 4 })
  })

  it('never leaves part of an item in sight: every item is wholly shown or hidden', () => {
    for (let sl = 0; sl <= total - 400; sl += 7) {
      const o = overflowOf(tabs, sl, 400, total, A)
      const from = sl > 1 ? sl + A : sl
      const to = sl + 400 < total - 1 ? sl + 400 - A : sl + 400
      tabs.forEach((s, i) => {
        if (!o.cut[i]) {
          expect(s.left).toBeGreaterThanOrEqual(from - 0.5)
          expect(s.right).toBeLessThanOrEqual(to + 0.5)
        }
      })
      expect(o.before + o.after).toBe(o.cut.filter(Boolean).length)
    }
  })

  it('pages forward to the first hidden item, just after the start arrow, and back again', () => {
    // Here the end of the row comes first: the last tab lands at the end, with no arrow there.
    const fwd = pageTo(tabs, 0, 523, total, A, 1)
    expect(fwd).toBe(Math.min(tabs[6].left - A, total - 523))
    const narrow = pageTo(tabs, 0, 200, total, A, 1)
    const first = overflowOf(tabs, 0, 200, total, A).cut.indexOf(true)
    expect(narrow).toBe(tabs[first].left - A)
    expect(overflowOf(tabs, narrow, 200, total, A).cut[first]).toBe(false)
    const o = overflowOf(tabs, fwd, 523, total, A)
    expect(o.cut[6]).toBe(false)
    expect(o.after).toBe(0)
    expect(o.before).toBeGreaterThan(0)
    const back = pageTo(tabs, fwd, 523, total, A, -1)
    expect(overflowOf(tabs, back, 523, total, A).cut.slice(0, 6).filter(c => !c).length).toBeGreaterThan(0)
    expect(pageTo(tabs, back, 523, total, A, -1)).toBe(0)
  })

  it('stays within the scroll range', () => {
    expect(pageTo(tabs, total - 523, 523, total, A, 1)).toBe(total - 523)
    expect(pageTo(tabs, 0, 523, total, A, -1)).toBe(0)
  })
})

describe('the summary strip', () => {
  const n = { levels: [], floorArea: null, ffl: 63.2, floors: [], earth: null, retaining: null, roof: null, roofs: [], roofArea: 0, batterSides: [], batters: null, placement: null }
  const strip = (shown = {}) => renderToStaticMarkup(<SummaryStrip route={areaRoute('design')} numbers={n} shown={shown} onBalance={() => {}} onOverview={() => {}} overviewOpen={false} />)
  const words = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  it("labels the site's checks as the site's, so they aren't read as the DA's", () => {
    const chip = /<button class="chip warn"[^>]*>(.*?)<\/button>/.exec(strip())
    expect(chip).not.toBeNull()
    expect(words(chip![1])).toBe('Site · 2 to check')
    expect(words(strip({ 'site-checks': 'in the panel' }))).toContain('Site · 2 to check')
  })

  it('scrolls its chips in a row that has arrows when they overflow', () => {
    expect(strip()).toMatch(/<div class="scroll-cue chips-cue"><div class="chips">/)
  })
})
