// Labels on the plan that would pile up on one another (C20): room names, outdoor area names,
// wall lengths, warning flags and contour numbers. After each drawing, a pass measures them and
// hides the lower of any two that overlap, by priority: room name > room's area and note > outdoor
// area > stair's UP > dimension > warning > "Ground meets floor" > contour number. A hidden one
// comes back under the pointer. On a phone zoomed out, the contour numbers and wall lengths wait
// until it's zoomed in, so the room names have the room.
//
// A room's label is three lines (name, area, a note such as "on piers"). The name always stays;
// the area and the note are measured on their own, so at a phone's fitted zoom they give way to a
// neighbour's name instead of printing through it (PH-16, HO-43).
//
// It works on what was drawn, by class, so the plan's own drawing code stays as it is.

import { useLayoutEffect, type RefObject } from 'react'

/** The labels, highest priority first, by the selector that finds them. */
export const LABEL_PRIORITY = [
  '.room-label .room-name',
  '.room-label .room-area',
  '.area-label',
  'text.stair-label',
  'text.dim',
  '.rw-flag, text.site-label',
  'text.ground-meets-label',
  'text.contour-label',
] as const

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
 * Lines of one label (the same `own`) sit a hair apart by design and never hide each other.
 */
export function crowded(labels: { priority: number; box: Box; own?: unknown }[], pad = 1): Set<number> {
  const order = labels.map((l, i) => ({ ...l, i })).sort((a, b) => a.priority - b.priority || a.i - b.i)
  const kept: { box: Box; own?: unknown }[] = []
  const hidden = new Set<number>()
  for (const l of order) {
    // A label with nothing to show (an empty text) takes no room.
    if (l.box.w <= 0 || l.box.h <= 0) continue
    if (l.priority > 0 && kept.some(k => !(l.own !== undefined && k.own === l.own) && overlaps(k.box, l.box, pad))) hidden.add(l.i)
    else kept.push({ box: l.box, own: l.own })
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
    const labels: { priority: number; box: Box; own?: unknown }[] = []
    LABEL_PRIORITY.forEach((sel, priority) => {
      el.querySelectorAll(sel).forEach(n => {
        // Already hidden for the zoom (display: none) measures as nothing.
        const r = n.getBoundingClientRect()
        nodes.push(n)
        labels.push({ priority, box: { x: r.left, y: r.top, w: r.width, h: r.height }, own: n.closest('.room-label') ?? undefined })
      })
    })
    const hide = crowded(labels)
    nodes.forEach((n, i) => n.classList.toggle('crowded', hide.has(i)))
  })
}

/** About how wide one character of a room's name is on the plan (12 px, semibold), in px. */
export const NAME_CHAR_PX = 7

/**
 * A room's name as it fits across the room, `roomPx` wide on screen: whole where it fits,
 * otherwise cut at a word with "…" ("Kitchen…"), never shorter than its first word. On a phone at
 * its fitted zoom a long name otherwise runs out over the walls into the next room (PH-16).
 */
export function fitName(name: string, roomPx: number, charPx = NAME_CHAR_PX): string {
  const fits = (s: string) => s.length * charPx <= roomPx
  if (fits(name)) return name
  const words = name.split(/\s+/)
  for (let n = words.length - 1; n > 1; n--) {
    // "Kitchen and…" says less than "Kitchen…".
    if (/^(and|&|of|the|to|with)$/i.test(words[n - 1])) continue
    const cut = `${words.slice(0, n).join(' ')}…`
    if (fits(cut)) return cut
  }
  return words.length > 1 ? `${words[0]}…` : name
}
