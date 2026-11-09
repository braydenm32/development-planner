// What makes the new layout feel like an app on a phone rather than a page: it runs edge
// to edge (clear of the notch and the home bar, through the safe-area insets in the CSS),
// and the page itself never zooms, so pinches belong to the plan and the 3D view. The old
// layout keeps the page as it was.

import { useEffect } from 'react'

const COVER = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

export function useNativeFeel(on: boolean) {
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
