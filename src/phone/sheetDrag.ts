// Bottom sheets that follow the finger: drag one down by its top and let go, and it either
// slides away (as its close button would) or springs back. A tab's panel also pulls up to the
// full height of the canvas, and stays that tall from tab to tab until it's pulled back down.
// One listener on the shell serves the Overview, the selection and the tab panels, so they
// need nothing of their own.

import { useEffect, type RefObject } from 'react'
import { create } from 'zustand'

/** Each sheet, where it can be grabbed, the button that closes it, and whether it pulls up taller. */
export const SHEETS = [
  { sheet: '.overview-sheet', grab: '.sheet-grab, .overview-sheet > header', close: '.overview-sheet > header .icon-button', grow: false },
  { sheet: '.inspector', grab: '.sheet-grab', close: '.inspector-close', grow: false },
  // Costs' panel on a phone is the whole screen, not a sheet: it doesn't move.
  { sheet: '.tab-panel', grab: '.tab-panel:not(.report) > .sheet-grab, .tab-panel:not(.report) > header', close: '.tab-panel > header .icon-button', grow: true },
] as const

/** Whether the tab panels are pulled up to full height (the shell's .float-col.tall). */
export const useSheetSize = create<{ tall: boolean }>(() => ({ tall: false }))

/**
 * Whether letting go closes the sheet: dragged a quarter of its height (at least 80 px),
 * or flicked down quickly.
 */
export function shouldClose(dy: number, height: number, ms: number): boolean {
  if (dy <= 0) return false
  const speed = dy / Math.max(ms, 1)
  return dy >= Math.max(80, height * 0.25) || (speed > 0.6 && dy > 24)
}

/** Whether letting go after a drag up pulls the sheet up tall: 48 px, or a quick flick. */
export function shouldGrow(dy: number, ms: number): boolean {
  if (dy >= 0) return false
  const speed = -dy / Math.max(ms, 1)
  return -dy >= 48 || (speed > 0.6 && -dy > 24)
}

/**
 * What letting go does. A sheet that grows goes tall on a drag up, and a tall one comes back
 * to its usual height on a drag down (another drag down closes it); others close or stay.
 */
export function release(dy: number, height: number, ms: number, grow: boolean, tall: boolean): 'close' | 'grow' | 'shrink' | 'stay' {
  if (grow && !tall && shouldGrow(dy, ms)) return 'grow'
  if (!shouldClose(dy, height, ms)) return 'stay'
  return grow && tall ? 'shrink' : 'close'
}

/** How far the sheet moves for a finger's drag: freely down; up, freely where it can grow, otherwise only a little. */
export const sheetOffset = (dy: number, grow = false) => (dy >= 0 || grow ? dy : -Math.min(-dy, 60) * 0.25)

/** A finger that moved less than this (px) on the handle tapped it; further is a drag. */
export const TAP_SLOP = 6

/** Drops the click that the browser sends after a drag which ended over a button. */
function swallowClick(el: HTMLElement) {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  el.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 0)
}

/** The handle's tap, click or Enter: taller, or back to the usual height. */
export const toggleTall = () => useSheetSize.setState(s => ({ tall: !s.tall }))

export function useSheetDrag(root: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = root.current
    if (!on || !el) return
    let d: { sheet: HTMLElement; close: HTMLElement | null; grow: boolean; h0: number; y0: number; t0: number; id: number; dy: number } | null = null

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || d) return
      const t = e.target as HTMLElement
      // The tab panel's handle is itself a button (a tap makes the panel taller or shorter, AX-13) and still drags.
      const handle = t.closest('button.sheet-grab')
      if (!handle && t.closest('button, a, input, select, textarea, label')) return
      for (const s of SHEETS) {
        if (!t.closest(s.grab)) continue
        const sheet = t.closest<HTMLElement>(s.sheet)
        if (!sheet) continue
        // Only a panel in the canvas's column grows: it's the column that holds its height.
        const grow = s.grow && !!sheet.parentElement?.classList.contains('float-col')
        d = { sheet, close: sheet.querySelector<HTMLElement>(s.close), grow, h0: sheet.parentElement?.getBoundingClientRect().height ?? 0, y0: e.clientY, t0: e.timeStamp, id: e.pointerId, dy: 0 }
        sheet.style.transition = 'none'
        // Capturing would send the handle's click to the sheet instead, so a tap on it would do nothing.
        if (handle) return
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
      const growing = d.grow && !useSheetSize.getState().tall
      const off = sheetOffset(d.dy, growing)
      const col = d.sheet.parentElement
      if (growing && off < 0 && col) {
        // Pulling up: the column lets the sheet grow under the finger.
        col.style.maxHeight = `${d.h0 - off}px`
        d.sheet.style.transform = ''
      } else {
        if (growing && col) col.style.maxHeight = ''
        d.sheet.style.transform = `translateY(${off}px)`
      }
    }
    const up = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.id) return
      const { sheet, close, dy, t0, grow } = d
      d = null
      // A drag that ends on the handle is not also a tap on it.
      if (Math.abs(dy) > TAP_SLOP) swallowClick(el)
      const col = sheet.parentElement
      if (col && grow) col.style.maxHeight = ''
      sheet.style.transition = 'transform 180ms ease-out'
      const what = release(dy, sheet.getBoundingClientRect().height, e.timeStamp - t0, grow, useSheetSize.getState().tall)
      if (what === 'grow' || what === 'shrink') {
        useSheetSize.setState({ tall: what === 'grow' })
        sheet.style.transform = ''
        setTimeout(() => (sheet.style.transition = ''), 200)
      } else if (what === 'close' && close) {
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
