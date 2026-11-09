// Bottom sheets that follow the finger: drag one down by its top and let go, and it either
// slides away (as its close button would) or springs back. One listener on the shell
// serves the Overview, the selection and the tab panels, so they need nothing of their own.

import { useEffect, type RefObject } from 'react'

/** Each sheet, where it can be grabbed, and the button that closes it. */
export const SHEETS = [
  { sheet: '.overview-sheet', grab: '.sheet-grab, .overview-sheet > header', close: '.overview-sheet > header .icon-button' },
  { sheet: '.inspector', grab: '.sheet-grab', close: '.inspector-close' },
  // Costs' panel on a phone is the whole screen, not a sheet: it doesn't move.
  { sheet: '.tab-panel', grab: '.tab-panel:not(.report) > .sheet-grab, .tab-panel:not(.report) > header', close: '.tab-panel > header .icon-button' },
] as const

/**
 * Whether letting go closes the sheet: dragged a quarter of its height (at least 80 px),
 * or flicked down quickly.
 */
export function shouldClose(dy: number, height: number, ms: number): boolean {
  if (dy <= 0) return false
  const speed = dy / Math.max(ms, 1)
  return dy >= Math.max(80, height * 0.25) || (speed > 0.6 && dy > 24)
}

/** How far the sheet moves for a finger's drag: freely down, and only a little up. */
export const sheetOffset = (dy: number) => (dy >= 0 ? dy : -Math.min(-dy, 60) * 0.25)

export function useSheetDrag(root: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = root.current
    if (!on || !el) return
    let d: { sheet: HTMLElement; close: HTMLElement | null; y0: number; t0: number; id: number; dy: number } | null = null

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || d) return
      const t = e.target as HTMLElement
      if (t.closest('button, a, input, select, textarea, label')) return
      for (const s of SHEETS) {
        if (!t.closest(s.grab)) continue
        const sheet = t.closest<HTMLElement>(s.sheet)
        if (!sheet) continue
        d = { sheet, close: sheet.querySelector<HTMLElement>(s.close), y0: e.clientY, t0: e.timeStamp, id: e.pointerId, dy: 0 }
        sheet.style.transition = 'none'
        try {
          sheet.setPointerCapture(e.pointerId)
        } catch {
          // a pointer the page no longer has
        }
        return
      }
    }
    const move = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.id) return
      d.dy = e.clientY - d.y0
      d.sheet.style.transform = `translateY(${sheetOffset(d.dy)}px)`
    }
    const up = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.id) return
      const { sheet, close, dy, t0 } = d
      d = null
      sheet.style.transition = 'transform 180ms ease-out'
      if (close && shouldClose(dy, sheet.getBoundingClientRect().height, e.timeStamp - t0)) {
        sheet.style.transform = `translateY(${sheet.getBoundingClientRect().height + 20}px)`
        setTimeout(() => {
          close.click()
          // The tab panel stays mounted as a pill; leave it unmoved for next time.
          sheet.style.transform = ''
          sheet.style.transition = ''
        }, 170)
      } else {
        sheet.style.transform = ''
        setTimeout(() => (sheet.style.transition = ''), 200)
      }
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [root, on])
}
