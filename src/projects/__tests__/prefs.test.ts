import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW } from '../../lib/storage'
import { DEFAULT_PRINT } from '../../print/build'
import { edited } from '../format'
import { printFor, viewFor, viewToSave } from '../prefs'

describe('per-project view and print settings', () => {
  const device = { ...DEFAULT_VIEW, mode: 'plan' as const, collapsed: ['tools'] }

  it('a project opens in its own last view, keeping this device’s folded panels', () => {
    const v = viewFor({ view: { mode: '3d', exaggeration: 2, collapsed: [] } }, device)
    expect(v.mode).toBe('3d')
    expect(v.exaggeration).toBe(2)
    expect(v.collapsed).toEqual(['tools'])
  })

  it('a project with nothing saved yet starts the way this device was left', () => {
    expect(viewFor(undefined, device)).toEqual(device)
    expect(viewFor({}, device)).toEqual(device)
  })

  it('saves the view without the device-only layout', () => {
    const saved = viewToSave(device)
    expect(saved).not.toHaveProperty('collapsed')
    expect(saved.mode).toBe('plan')
  })

  it('print settings come from the project, filling gaps from this device', () => {
    const dev = { settings: { ...DEFAULT_PRINT, scale: 200 }, paper: 'A3' as const, pdfFurniture: true }
    expect(printFor(undefined, dev)).toBe(dev)
    const p = printFor({ print: { paper: 'A4', settings: { ...DEFAULT_PRINT, scale: 100 } } }, dev)
    expect(p.paper).toBe('A4')
    expect(p.settings.scale).toBe(100)
    expect(p.pdfFurniture).toBe(true)
  })

  it('the print preview opens Assembled or Apart as the project was left', () => {
    const dev = { settings: DEFAULT_PRINT, paper: 'A3' as const, pdfFurniture: true, apart: false }
    expect(printFor({ print: { apart: true } }, dev).apart).toBe(true)
    // An older project without it: this device's choice.
    expect(printFor({ print: { paper: 'A4' } }, { ...dev, apart: true }).apart).toBe(true)
    expect(printFor({ print: { apart: 'yes' as unknown as boolean } }, dev).apart).toBe(false)
  })

  it('the printer bed is 225 × 225 mm unless one was typed: a project that kept the old 220 × 220 default gets the new one', () => {
    const dev = { settings: DEFAULT_PRINT, paper: 'A3' as const, pdfFurniture: true }
    expect([DEFAULT_PRINT.bedX, DEFAULT_PRINT.bedY]).toEqual([225, 225])
    const old = printFor({ print: { settings: { ...DEFAULT_PRINT, bedX: 220, bedY: 220, scale: 50 } } }, dev).settings
    expect([old.bedX, old.bedY, old.scale]).toEqual([225, 225, 50])
    const typed = printFor({ print: { settings: { ...DEFAULT_PRINT, bedX: 256, bedY: 220 } } }, dev).settings
    expect([typed.bedX, typed.bedY]).toEqual([256, 220])
  })
})

describe('"last edited" on a card', () => {
  const now = new Date(2026, 10, 8, 15, 0).getTime()
  it('reads naturally', () => {
    expect(edited(now - 20_000, now)).toBe('just now')
    expect(edited(now - 60_000, now)).toBe('1 minute ago')
    expect(edited(now - 12 * 60_000, now)).toBe('12 minutes ago')
    expect(edited(new Date(2026, 10, 8, 9, 30).getTime(), now)).toMatch(/^today, /)
    expect(edited(new Date(2026, 10, 7, 9, 30).getTime(), now)).toBe('yesterday')
    expect(edited(new Date(2026, 9, 2).getTime(), now)).not.toMatch(/2026/)
    expect(edited(new Date(2025, 9, 2).getTime(), now)).toMatch(/2025/)
  })
})
