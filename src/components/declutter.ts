// Labels on the plan that would pile up on one another (C20): room names, outdoor area names,
// wall lengths, warning flags and contour numbers. After each drawing, a pass measures them and
// hides the lower of any two that overlap, by priority: room > area > dimension > warning >
// contour number. A hidden one comes back under the pointer. On a phone zoomed out, the contour
// numbers and wall lengths wait until it's zoomed in, so the room names have the room.
//
// It works on what was drawn, by class, so the plan's own drawing code stays as it is.

import { useLayoutEffect, type RefObject } from 'react'

/** The labels, highest priority first, by the selector that finds them. */
export const LABEL_PRIORITY = ['.room-label', '.area-label', 'text.dim', '.rw-flag, text.site-label', 'text.contour-label'] as const

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: Box, b: Box, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

/**
 * Which labels to hide: each in priority order is kept unless it overlaps one kept already.
 * `labels` are in priority order (lowest number first), each with its box. Returns the indexes hidden.
 * The rooms' own names (priority 0) always stay, even over one another: a room never loses its name.
 */
export function crowded(labels: { priority: number; box: Box }[], pad = 1): Set<number> {
  const order = labels.map((l, i) => ({ ...l, i })).sort((a, b) => a.priority - b.priority || a.i - b.i)
  const kept: Box[] = []
  const hidden = new Set<number>()
  for (const l of order) {
    // A label with nothing to show (an empty text) takes no room.
    if (l.box.w <= 0 || l.box.h <= 0) continue
    if (l.priority > 0 && kept.some(k => overlaps(k, l.box, pad))) hidden.add(l.i)
    else kept.push(l.box)
  }
  return hidden
}

/** On a phone, below this many pixels to the metre the contour numbers and wall lengths hide. */
export const PHONE_LABELS_K = 26

/** Hide the plan's crowded labels after every drawing of it; `far` hides the small numbers altogether. */
export function useLabelDeclutter(svg: RefObject<SVGSVGElement | null>, far: boolean) {
  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    el.classList.toggle('labels-far', far)
    const nodes: Element[] = []
    const labels: { priority: number; box: Box }[] = []
    LABEL_PRIORITY.forEach((sel, priority) => {
      el.querySelectorAll(sel).forEach(n => {
        // Already hidden for the zoom (display: none) measures as nothing.
        const r = n.getBoundingClientRect()
        nodes.push(n)
        labels.push({ priority, box: { x: r.left, y: r.top, w: r.width, h: r.height } })
      })
    })
    const hide = crowded(labels)
    nodes.forEach((n, i) => n.classList.toggle('crowded', hide.has(i)))
  })
}
