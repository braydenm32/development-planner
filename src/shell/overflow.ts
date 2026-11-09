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

/**
 * Which items show whole in the row's window. Where more is hidden at an end, its arrow
 * (`arrow` px wide) takes that much of the window, so an item under it hides too.
 */
export function overflowOf(items: Span[], scrollLeft: number, clientWidth: number, scrollWidth: number, arrow: number): Overflow {
  const moreBefore = scrollLeft > 1
  const moreAfter = scrollLeft + clientWidth < scrollWidth - 1
  const from = scrollLeft + (moreBefore ? arrow : 0)
  const to = scrollLeft + clientWidth - (moreAfter ? arrow : 0)
  const mid = (from + to) / 2
  let before = 0
  let after = 0
  const cut = items.map(s => {
    const out = s.left < from - 0.5 || s.right > to + 0.5
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
 * lands just before the end's arrow.
 */
export function pageTo(items: Span[], scrollLeft: number, clientWidth: number, scrollWidth: number, arrow: number, dir: 1 | -1): number {
  const { cut } = overflowOf(items, scrollLeft, clientWidth, scrollWidth, arrow)
  const max = Math.max(0, scrollWidth - clientWidth)
  const view = scrollLeft + clientWidth / 2
  let target = scrollLeft
  if (dir > 0) {
    const i = items.findIndex((s, k) => cut[k] && (s.left + s.right) / 2 > view)
    if (i < 0) return max
    target = items[i].left - arrow
  } else {
    let i = -1
    items.forEach((s, k) => {
      if (cut[k] && (s.left + s.right) / 2 < view) i = k
    })
    if (i < 0) return 0
    target = items[i].right - clientWidth + arrow
  }
  return Math.min(max, Math.max(0, Math.round(target)))
}
