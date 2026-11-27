// What makes the new layout feel like an app on a phone rather than a page: it runs edge
// to edge (clear of the notch and the home bar, through the safe-area insets in the CSS),
// and the page itself never zooms, so pinches belong to the plan and the 3D view. The old
// layout keeps the page as it was.

import { useEffect } from 'react'

const COVER = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

/**
 * How much of the window the on-screen keyboard covers (px). The keyboard shrinks the visual
 * viewport and leaves the layout alone, so a field low in a bottom sheet ends up under it (PH-08).
 * Anything under 80 px is a toolbar coming or going, not a keyboard.
 */
export function keyboardInset(layoutHeight: number, visualHeight: number): number {
  const covered = Math.round(layoutHeight - visualHeight)
  return covered >= 80 ? covered : 0
}

export function useNativeFeel(on: boolean) {
  // The shell stops above the keyboard (--keyboard-inset, phone.css), and the field being typed in stays in sight.
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport
    if (!on || !vv) return
    const root = document.documentElement
    let last = 0
    const fit = () => {
      const inset = keyboardInset(window.innerHeight, vv.height)
      if (inset === last) return
      last = inset
      root.style.setProperty('--keyboard-inset', `${inset}px`)
      if (!inset) return
      // The browser may have slid the page up to show the field; the shorter shell has it in view already.
      window.scrollTo(0, 0)
      const field = document.activeElement
      if (field instanceof HTMLElement && field.matches('input, select, textarea')) requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }))
    }
    vv.addEventListener('resize', fit)
    fit()
    return () => {
      vv.removeEventListener('resize', fit)
      root.style.removeProperty('--keyboard-inset')
    }
  }, [on])
  useEffect(() => {
    if (!on) return
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    const before = meta?.content
    if (meta) meta.content = COVER
    // Safari's own pinch-to-zoom the page, which touch-action alone doesn't stop on iOS.
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.addEventListener('gesturechange', stop)
    return () => {
      if (meta && before !== undefined) meta.content = before
      document.removeEventListener('gesturestart', stop)
      document.removeEventListener('gesturechange', stop)
    }
  }, [on])
}
