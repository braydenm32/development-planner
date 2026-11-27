// How much of the canvas's foot a phone's open bottom sheet covers: a tab's panel, a tool's card
// or the selection. The 3D print preview centres its model in what's left (PH-24), the plan
// slides a tapped thing clear of the sheet, and the tool rail stops above it (PH-12).

import { useLayoutEffect, useState } from 'react'

/** The sheets that sit over the foot of the canvas (not the pill a hidden panel leaves). */
export const SHEET_SELECTOR = '.float-col > .float-card:not(.panel-pill), .inspector'

/** A tab's panel alone: the plan fits above it, as it fits beside a computer's panel. */
export const PANEL_SELECTOR = '.float-col > .tab-panel'

/**
 * How much of the canvas's foot the plan's fit keeps clear for a panel `panel` px tall. A panel
 * pulled up over most of the canvas leaves no room worth fitting into, so the plan stays as it was.
 */
export const fitClearOf = (panel: number, canvas: number) => (panel > 0 && panel < canvas * 0.6 ? panel + 8 : 0)

/** From the canvas's box and the sheets' tops: the pixels covered at its foot. */
export function coveredBy(canvasBottom: number, sheetTops: number[]): number {
  return Math.max(0, ...sheetTops.map(top => Math.round(canvasBottom - top)))
}

export interface Covered {
  /** Pixels of the canvas's foot under a sheet. */
  sheet: number
  /** The canvas's own height (px). */
  canvas: number
}

const NONE: Covered = { sheet: 0, canvas: 0 }

/**
 * The height covered, measured again whenever `key` changes (what is open) and as the sheets
 * resize. Nothing when `on` is false: a computer, or a phone on its side, where sheets dock beside the plan.
 */
export function useSheetHeight(el: HTMLElement | null, on: boolean, key: string, selector: string = SHEET_SELECTOR): Covered {
  const [covered, setCovered] = useState(NONE)
  useLayoutEffect(() => {
    const sheets = on && el ? [...el.querySelectorAll<HTMLElement>(selector)] : []
    const measure = () => {
      const box = el?.getBoundingClientRect()
      const next = box && sheets.length ? { sheet: coveredBy(box.bottom, sheets.map(s => s.getBoundingClientRect().top)), canvas: Math.round(box.height) } : NONE
      setCovered(was => (was.sheet === next.sheet && was.canvas === next.canvas ? was : next))
    }
    measure()
    if (!el || !sheets.length || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    sheets.forEach(s => ro.observe(s))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, on, key, selector])
  return covered
}
