// The sketch layer's colours: a few bright ones to tell kinds of feature apart (a fence line, a
// setback, a tree's reach). Each is strong enough to read on the white plan and on paper; the
// yellow is a deep amber, as plain yellow fades on white.

import { SKETCH_COLOURS, type Plan, type SketchColour, type SketchItem } from '../plan/model'
import type { RGB } from '../share/pdfWriter'

export interface SketchPaint {
  label: string
  /** The line on the screen. */
  hex: string
  /** A selected line, its handles and centre mark: a shade darker. */
  strong: string
  /** On the PDF plans. */
  rgb: RGB
}

export const SKETCH_PAINT: Record<SketchColour, SketchPaint> = {
  blue: { label: 'Blue', hex: '#2f6fdb', strong: '#1c4ea6', rgb: [0.18, 0.44, 0.86] },
  red: { label: 'Red', hex: '#d93636', strong: '#a71f1f', rgb: [0.85, 0.21, 0.21] },
  green: { label: 'Green', hex: '#24994a', strong: '#167233', rgb: [0.14, 0.6, 0.29] },
  purple: { label: 'Purple', hex: '#8a46d1', strong: '#652aa3', rgb: [0.54, 0.27, 0.82] },
  amber: { label: 'Amber', hex: '#d49100', strong: '#9c6a00', rgb: [0.83, 0.57, 0] },
}

/** A sketch line's colour: its own, or blue. */
export const colourOf = (s: Pick<SketchItem, 'colour'>): SketchColour => s.colour ?? 'blue'

/** What a colour is called on this plan: the name given to it, or none. */
export const sketchName = (plan: Plan, c: SketchColour): string | undefined => plan.sketchNames?.[c]

/** The colours the plan's sketch lines use, in palette order. */
export function coloursUsed(plan: Plan): SketchColour[] {
  const used = new Set((plan.sketch ?? []).filter(s => s.kind !== 'measure').map(colourOf))
  return SKETCH_COLOURS.filter(c => used.has(c))
}

/**
 * The Key's (and the PDF's) list of what each colour means: the colours in use that have a name,
 * or every colour in use when more than one is and none is named. Empty when one plain colour is used.
 */
export function sketchLegend(plan: Plan): { colour: SketchColour; text: string }[] {
  const used = coloursUsed(plan)
  const named = used.filter(c => sketchName(plan, c))
  if (named.length) return named.map(c => ({ colour: c, text: sketchName(plan, c)! }))
  return used.length > 1 ? used.map(c => ({ colour: c, text: SKETCH_PAINT[c].label })) : []
}
