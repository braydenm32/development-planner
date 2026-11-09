// Whether the getting-started guide is open, and where in it. It's a sheet over whatever is on
// screen (not a page of its own), so opening it from a hint or ⌘K never loses your place.

import { create } from 'zustand'

interface GuideState {
  open: boolean
  /** The section to scroll to (a section id, or "term-<id>" for a glossary entry). */
  at: string | null
}

export const useGuide = create<GuideState>(() => ({ open: false, at: null }))

export function openGuide(at: string | null = null): void {
  useGuide.setState({ open: true, at })
}

export function closeGuide(): void {
  useGuide.setState({ open: false, at: null })
}
