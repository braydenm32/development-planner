/**
 * A new page starts at its top, with focus on its heading: the page scrolls inside `.lg-page`, so
 * without this a link at the foot of one page opened the next at the same depth, focus still on
 * the link.
 */
export function startAtTop(scroller: { scrollTop: number } | null, heading: { focus: (o?: { preventScroll?: boolean }) => void } | null) {
  if (scroller) scroller.scrollTop = 0
  heading?.focus({ preventScroll: true })
}
