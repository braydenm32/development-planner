// Docked panels (DB-21): the choice and the dragged width are kept per device, older or broken
// values read as floating, and the width stays within its limits.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The tests run without a browser: a small stand-in for localStorage, in place before the modules load.
vi.hoisted(() => {
  const m = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage
})
import { DOCK_EXTRA, dockedWidth, readDock, setDocked, setDockExtra, toggleDocked, useDock } from '../dock'
import { PANEL_W } from '../panelWidth'
import { runAction } from '../actions'

const store = (v: string | null) => ({ getItem: () => v })

describe('docked panels', () => {
  beforeEach(() => {
    localStorage.clear()
    useDock.setState({ docked: false, extra: 0 })
  })

  it('floats by default, and reads anything odd as floating', () => {
    expect(readDock(store(null))).toEqual({ docked: false, extra: 0 })
    expect(readDock(store('not json'))).toEqual({ docked: false, extra: 0 })
    expect(readDock(store('{"docked":"yes","extra":"wide"}'))).toEqual({ docked: false, extra: 0 })
    expect(readDock(store('{"docked":true,"extra":9999}'))).toEqual({ docked: true, extra: DOCK_EXTRA.max })
  })

  it('remembers the choice and the width between sessions', () => {
    setDocked(true)
    setDockExtra(48)
    expect(readDock(localStorage)).toEqual({ docked: true, extra: 48 })
    toggleDocked()
    expect(readDock(localStorage).docked).toBe(false)
    setDockExtra(-1000)
    expect(useDock.getState().extra).toBe(DOCK_EXTRA.min)
  })

  it('keeps the docked width to the room there is', () => {
    expect(dockedWidth(PANEL_W, 0)).toBe(PANEL_W)
    expect(dockedWidth(PANEL_W, 64)).toBe(PANEL_W + 64)
    expect(dockedWidth(PANEL_W, 64, 300)).toBe(300)
    expect(dockedWidth(PANEL_W, -80, 100)).toBe(240)
  })

  it('switches from search, and says so', () => {
    const said: string[] = []
    const ctx = { shell: {} as never, toast: (m: string) => said.push(m), openOverview: () => {}, pickFile: () => {} }
    expect(runAction('dock-panels', ctx)).toBe(true)
    expect(useDock.getState().docked).toBe(true)
    expect(said[0]).toMatch(/docked beside the plan/)
    runAction('dock-panels', ctx)
    expect(useDock.getState().docked).toBe(false)
  })
})
