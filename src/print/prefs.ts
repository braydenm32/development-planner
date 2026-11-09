import type { Paper } from '../share/plans'
import { DEFAULT_PRINT, withCurrentBed, type PrintSettings } from './build'

/** Print and plan-sheet choices, kept in this browser. */
export interface PrintPrefs {
  settings: PrintSettings
  paper: Paper
  /** Draw furniture on the PDF floor plans. */
  pdfFurniture: boolean
  /** The 3D print preview shows the parts pulled apart (missing: assembled). */
  apart?: boolean
}

const KEY = 'print-v1'

export function loadPrintPrefs(): PrintPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<PrintPrefs>) : {}
    return { settings: withCurrentBed({ ...DEFAULT_PRINT, ...saved.settings }), paper: saved.paper === 'A4' ? 'A4' : 'A3', pdfFurniture: saved.pdfFurniture !== false, apart: saved.apart === true }
  } catch {
    return { settings: DEFAULT_PRINT, paper: 'A3', pdfFurniture: true }
  }
}

export function savePrintPrefs(p: PrintPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // ignore
  }
}
