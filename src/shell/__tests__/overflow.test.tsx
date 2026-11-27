// The tab bar and the summary strip when there's more than fits: no item shows cut off mid-word,
// an arrow at each end with more says so (with a count on the strip), and the arrows page to the
// hidden items. The site's checks chip says it's the site's, beside the DA or CDC checks.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { areaRoute } from '../../nav/route'
import { moreText, overflowOf, pageTo, type Span } from '../overflow'
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
          // Within a pixel and a half: edges are measured in fractions of a pixel.
          expect(s.left).toBeGreaterThanOrEqual(from - 1.5)
          expect(s.right).toBeLessThanOrEqual(to + 1.5)
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

  // PH-01: Design's tabs in a phone's 154 px bar. "Rooms & areas" (116 px) is wider than the bar
  // less its two arrows, so it could never show, and the arrow kept paging to it and stuck.
  const design = row(51, 63, 116, 60, 80, 78, 72, 77)
  const designW = design[design.length - 1].right

  it('pages on to the end however narrow the row, one press after another, and back to the start', () => {
    for (const w of [154, 124, 244]) {
      let sl = 0
      let presses = 0
      while (sl < designW - w) {
        const next = pageTo(design, sl, w, designW, 20, 1)
        expect(next).toBeGreaterThan(sl)
        sl = next
        expect(++presses).toBeLessThan(12)
      }
      while (sl > 0) {
        const next = pageTo(design, sl, w, designW, 20, -1)
        expect(next).toBeLessThan(sl)
        sl = next
      }
    }
  })

  it('shows an item wider than the window where it starts in it, rather than hiding it for good', () => {
    // Scrolled so "Rooms & areas" starts just after the start's arrow: it shows, though its end is clipped.
    const sl = design[2].left - 20
    expect(overflowOf(design, sl, 154, designW, 20).cut[2]).toBe(false)
    // Every item shows at some scroll position.
    const seen = design.map(() => false)
    for (let x = 0; x <= designW - 154; x++) overflowOf(design, x, 154, designW, 20).cut.forEach((c, i) => (seen[i] ||= !c))
    expect(seen).toEqual(design.map(() => true))
  })

  it('never hides the open tab, and a last tab a rounded pixel over still fits (PH-02)', () => {
    // Approvals' tabs at 390 px: the last tab's edge measured 289 against a scroll width of 288.
    const approvals: Span[] = [
      { left: 0, right: 76 },
      { left: 76, right: 135 },
      { left: 135, right: 230 },
      { left: 230, right: 289 },
    ]
    const o = overflowOf(approvals, 134, 154, 288, 20)
    expect(o.cut[3]).toBe(false)
    expect(o.after).toBe(0)
    // The open tab stays, whatever the window: here it would be under the end's arrow.
    expect(overflowOf(design, 0, 154, designW, 20).cut[2]).toBe(true)
    expect(overflowOf(design, 0, 154, designW, 20, 2).cut[2]).toBe(false)
  })

  it('takes room for an arrow only at the end that has one (the tabs’ list of what is hidden)', () => {
    // Scrolled on: with no arrow at the start, the first item in the window shows.
    const o = overflowOf(tabs, tabs[1].left, 400, total, { before: 0, after: 50 })
    expect(o.cut[0]).toBe(true)
    expect(o.cut[1]).toBe(false)
    expect(o.before).toBe(1)
  })

  it('names its arrows in good English: "1 more tab", "3 more tabs" (AX-36)', () => {
    expect(moreText(1, 'tabs')).toBe('1 more tab')
    expect(moreText(3, 'tabs')).toBe('3 more tabs')
    expect(moreText(1, 'numbers')).toBe('1 more number')
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

  it('puts the checks and the estimate straight after the floor, so they are the last to hide (HO-12)', () => {
    const full = {
      ...n,
      floorArea: 203.52,
      levels: [{ id: 'g', name: 'Ground floor', area: 203.52 }],
      floors: [{ id: 'g', name: 'Ground floor', rl: 101.85 }],
      ffl: 101.85,
      earth: { cut: 120, fill: 29, net: 91, outOfBalance: true, balancedRL: 102.12 },
      roof: { roof: { id: 'r' }, height: 5.4 },
    }
    const html = renderToStaticMarkup(
      <SummaryStrip
        route={areaRoute('design')}
        numbers={full as never}
        checks={{ pathway: 'cdc', council: null, counts: { pass: 3, fail: 0, warn: 2, info: 0, unknown: 0, incomplete: 0 } as never }}
        cost={{ ready: true, total: 561000, low: 449000, high: 673000, missing: [] } as never}
        shown={{}}
        onBalance={() => {}}
        onOverview={() => {}}
        overviewOpen={false}
      />,
    )
    const text = words(html)
    const at = (t: string) => {
      expect(text).toContain(t)
      return text.indexOf(t)
    }
    expect(at('Floor 203.52')).toBeLessThan(at('Fast-track (CDC) checks'))
    expect(at('Fast-track (CDC) checks')).toBeLessThan(at('Estimate'))
    expect(at('Estimate')).toBeLessThan(at('Floor level (FFL)'))
    expect(at('Floor level (FFL)')).toBeLessThan(at('Out of balance'))
  })

  it('says an estimate under the guide for custom-built houses is a floor: "or more", with the range on a hover (HO-08)', () => {
    const cost = { ready: true, total: 560_837, low: 448_670, high: 673_005, missing: [] }
    const chip = (c: typeof cost & { under?: { low: number; high: number } }) =>
      /<button class="chip" title="([^"]*)">(<span class="chip-label">Estimate.*?)<\/button>/.exec(
        renderToStaticMarkup(<SummaryStrip route={areaRoute('design')} numbers={n} cost={c} shown={{}} onBalance={() => {}} onOverview={() => {}} overviewOpen={false} />),
      )!
    const under = chip({ ...cost, under: { low: 1_058_766, high: 1_468_000 } })
    expect(words(under[2])).toBe('Estimate $561k or more')
    expect(under[1]).toBe('Likely $449k to $673k. A floor, not a budget: custom-built houses like it run $1.06M to $1.47M (Costs › Estimate)')
    const plain = chip(cost)
    expect(words(plain[2])).toBe('Estimate $561k')
    expect(plain[1]).toBe('Likely $449k to $673k')
  })
})
