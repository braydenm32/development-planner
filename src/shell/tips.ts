// The small name tips on icon buttons (Undo, Redo, the tools): drawn by CSS from data-tip while
// the button is hovered or has keyboard focus (shell.css). Esc puts the tip away without moving
// the pointer or the focus (WCAG 1.4.13); it comes back the next time the button is pointed at or
// focused. Esc still does whatever else it does (ends a drawing run, closes a card).

import { useEffect } from 'react'

/** On a button whose tip was put away with Esc; shell.css hides the tip while it's there. */
export const TIP_OFF = 'data-tip-off'

/** The buttons whose tip is showing now. */
export const TIP_SHOWING = 'button[data-tip]:hover, button[data-tip]:focus-visible'

/** The little of an element this needs, so a test can stand in for one. */
export interface TipButton {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  addEventListener(type: string, fn: () => void): void
  removeEventListener(type: string, fn: () => void): void
}

/** Put these buttons' tips away until the pointer leaves or the focus moves on. */
export function dismissTips(buttons: Iterable<TipButton>) {
  for (const el of buttons) {
    el.setAttribute(TIP_OFF, '')
    const back = () => {
      el.removeAttribute(TIP_OFF)
      el.removeEventListener('pointerleave', back)
      el.removeEventListener('blur', back)
    }
    el.addEventListener('pointerleave', back)
    el.addEventListener('blur', back)
  }
}

/** Esc anywhere puts away the tip that is showing. Heard first (capture), so it works even where another handler keeps Esc to itself. */
export function useTipDismiss() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissTips(document.querySelectorAll(TIP_SHOWING))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
