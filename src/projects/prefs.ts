import type { ViewSettings } from '../lib/storage'
import { DEFAULT_PRINT, withCurrentBed } from '../print/build'
import type { PrintPrefs } from '../print/prefs'
import type { ProjectPrefs } from './session'

/**
 * Each project keeps its last view (mode, 3D toggles, exaggeration, which way is up) and its
 * print settings. This device's own choices (localStorage `view-v1`, `print-v1`) fill anything a
 * project hasn't saved yet, so a new project starts the way the last one was left.
 */

/** Layout belongs to the device, not the project: which panels are folded away. */
const DEVICE_ONLY = ['collapsed'] as const

export function viewFor(prefs: ProjectPrefs | undefined, device: ViewSettings): ViewSettings {
  const saved = { ...prefs?.view }
  for (const k of DEVICE_ONLY) delete saved[k]
  return { ...device, ...saved }
}

export function viewToSave(v: ViewSettings): Partial<ViewSettings> {
  const out: Partial<ViewSettings> = { ...v }
  for (const k of DEVICE_ONLY) delete out[k]
  return out
}

export function printFor(prefs: ProjectPrefs | undefined, device: PrintPrefs): PrintPrefs {
  const p = prefs?.print
  if (!p) return device
  return {
    settings: withCurrentBed({ ...DEFAULT_PRINT, ...device.settings, ...p.settings }),
    paper: p.paper === 'A4' || p.paper === 'A3' ? p.paper : device.paper,
    pdfFurniture: typeof p.pdfFurniture === 'boolean' ? p.pdfFurniture : device.pdfFurniture,
    apart: typeof p.apart === 'boolean' ? p.apart : device.apart,
  }
}
