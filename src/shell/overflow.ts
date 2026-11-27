// A row that scrolls sideways (the area's tabs, the summary strip's chips) when there are more
// items than fit. Nothing is ever cut mid-word: an item that doesn't show whole steps out of
// sight, and an arrow at that end says there's more that way and pages to it.

/** An item's left and right edges, in the row's scrolled content (px). */
export interface Span {
  left: number
  right: number
}

export interface Overflow {
  /** Items not shown whole in the window, which hide. */
  cut: boolean[]
  /** How many are hidden off the start, and off the end. */
  before: number
  after: number
}

/** Edges are measured in fractions of a pixel and scroll positions in whole ones: this much over still counts as fitting. */
const SLACK = 1.5

/**
 * Which items show whole in the row's window. Where more is hidden at an end, its arrow
 * (`arrow` px wide, or one width for each end) takes that much of the window, so an item under
 * it hides too. Two never hide: the item at `keep` (the open tab: the bar always says where you
 * are), and one wider than the window that starts in it, which no scrolling could show whole.
 */
export function overflowOf(items: Span[], scrollLeft: number, clientWidth: number, scrollWidth: number, arrow: number | { before: number; after: number }, keep = -1): Overflow {
  const arrows = typeof arrow === 'number' ? { before: arrow, after: arrow } : arrow
  const moreBefore = scrollLeft > 1
  const moreAfter = scrollLeft + clientWidth < scrollWidth - SLACK
  const from = scrollLeft + (moreBefore ? arrows.before : 0)
  const to = scrollLeft + clientWidth - (moreAfter ? arrows.after : 0)
  const mid = (from + to) / 2
  let before = 0
  let after = 0
  const cut = items.map((s, i) => {
    if (i === keep) return false
    const tooWide = s.right - s.left > to - from
    const out = tooWide ? s.left < from - SLACK || s.left >= to : s.left < from - SLACK || s.right > to + SLACK
    if (out) {
      if ((s.left + s.right) / 2 < mid) before++
      else after++
    }
    return out
  })
  return { cut, before, after }
}

/**
 * Where to scroll for the arrow at one end: forwards, the first hidden item lands just after the
 * start's arrow, with as many after it as fit; backwards, the last hidden one before the window
 * lands just before the end's arrow. Every press moves the row on: an item that is already as far
 * along as it can go (one wider than the window) is passed over for the next.
 */
export function pageTo(items: Span[], scrollLeft: number, clientWidth: number, scrollWidth: number, arrow: number, dir: 1 | -1): number {
  const { cut } = overflowOf(items, scrollLeft, clientWidth, scrollWidth, arrow)
  const max = Math.max(0, scrollWidth - clientWidth)
  const view = scrollLeft + clientWidth / 2
  const clamp = (x: number) => Math.min(max, Math.max(0, Math.round(x)))
  if (dir > 0) {
    for (let k = 0; k < items.length; k++) {
      const s = items[k]
      if (!cut[k] || (s.left + s.right) / 2 <= view) continue
      const target = clamp(s.left - arrow)
      if (target > scrollLeft + 1) return target
    }
    return max
  }
  for (let k = items.length - 1; k >= 0; k--) {
    const s = items[k]
    if (!cut[k] || (s.left + s.right) / 2 >= view) continue
    const target = clamp(s.right - clientWidth + arrow)
    if (target < scrollLeft - 1) return target
  }
  return 0
}

/** "1 more tab", "3 more tabs": `label` is the plural ("tabs", "numbers"). */
export function moreText(n: number, label: string): string {
  return `${n} more ${n === 1 ? label.replace(/s$/, '') : label}`
}
