// The section lines kept with the plan (Plan.sections): reading them, and the changes the
// Sections tab and the plan make to them, each as a plain function on the plan for commit().

import type { Vec2 } from '../lib/geom'
import { newId, type Plan, type SectionLine } from '../plan/model'

/** The plan's section lines; none in a plan saved before there were any. */
export const sectionsOf = (plan: Pick<Plan, 'sections'>): SectionLine[] => plan.sections ?? []

/** A line shorter than this (m) is a slip of the mouse, not a section. */
export const MIN_SECTION = 0.5

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O, which read as 1 and 0 on drawings

/** The next free letter for a new section: A, B, … then A1, B1, … */
export function nextLabel(plan: Pick<Plan, 'sections'>): string {
  const used = new Set(sectionsOf(plan).map(s => s.label))
  for (let round = 0; ; round++) {
    for (const c of LETTERS) {
      const label = round ? `${c}${round}` : c
      if (!used.has(label)) return label
    }
  }
}

/** The plan with a new section line from a to b (house frame), and the new line. */
export function addSection(plan: Plan, a: Vec2, b: Vec2): { plan: Plan; line: SectionLine } {
  const line: SectionLine = { id: newId('section'), label: nextLabel(plan), a: [a[0], a[1]], b: [b[0], b[1]] }
  return { plan: { ...plan, sections: [...sectionsOf(plan), line] }, line }
}

export function removeSection(plan: Plan, id: string): Plan {
  if (!sectionsOf(plan).some(s => s.id === id)) return plan
  return { ...plan, sections: sectionsOf(plan).filter(s => s.id !== id) }
}

/** Swap the ends, so the drawing looks the other way. */
export function flipSection(plan: Plan, id: string): Plan {
  if (!sectionsOf(plan).some(s => s.id === id)) return plan
  return { ...plan, sections: sectionsOf(plan).map(s => (s.id === id ? { ...s, a: s.b, b: s.a } : s)) }
}

/** How a section is named on drawings and in lists: "Section A–A". */
export const sectionName = (s: Pick<SectionLine, 'label'>) => `Section ${s.label}–${s.label}`

/**
 * Snap the end of a line being drawn so it runs square to the house (or at 45°) when it is
 * within a few degrees of that; `free` (Shift) leaves it where it is.
 */
export function snapEnd(a: Vec2, p: Vec2, free: boolean): Vec2 {
  if (free) return p
  const dx = p[0] - a[0]
  const dy = p[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return p
  const ang = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const snapped = Math.round(ang / step) * step
  if (Math.abs(snapped - ang) > (4 * Math.PI) / 180) return p
  return [a[0] + Math.cos(snapped) * len, a[1] + Math.sin(snapped) * len]
}
