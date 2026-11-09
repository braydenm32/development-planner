// What the Sections tab and the plan share while you look at the drawings: whether a section
// line is being drawn (and its first end), which drawing shows, and whether it shows large.
// The lines themselves live in the plan (Plan.sections), with its undo.

import { create } from 'zustand'
import type { Vec2 } from '../lib/geom'
import type { Side } from './elevation'

/** Which drawing shows: a section by its line's id, or an elevation by its side. */
export type Shown = { kind: 'section'; id: string } | { kind: 'elevation'; side: Side }

interface SectionsUi {
  /** Drawing a section line: null when not, else its first end once placed (house frame). */
  drawing: { a: Vec2 | null } | null
  shown: Shown | null
  large: boolean
}

export const useSections = create<SectionsUi>(() => ({ drawing: null, shown: null, large: false }))

export const startSectionLine = () => useSections.setState({ drawing: { a: null } })
export const stopSectionLine = () => useSections.setState({ drawing: null })
export const showDrawing = (shown: Shown) => useSections.setState({ shown })
export const showLarge = (large: boolean) => useSections.setState({ large })
