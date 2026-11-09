// View and Edit on a phone: View is where a phone starts and nothing can move there (no
// handles on the plan, the panels locked); Edit is remembered; picking a tool means Edit;
// and a desktop is always in Edit.

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanEditor } from '../../components/PlanEditor'
import { usePlan } from '../../plan/store'
import { useSiteStore } from '../../site/store'
import { canEdit, readMode, TouchCanvas, usePhoneMode, type TouchCanvasInfo } from '../device'
import { ViewLock } from '../ViewLock'
import { house, loadBlock, words } from './block'

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

describe('the View / Edit switch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('starts a phone in View, and remembers Edit on this device', () => {
    expect(readMode(memory())).toBe('view')
    expect(readMode(memory({ 'phone-mode-v1': 'edit' }))).toBe('edit')
    expect(readMode(memory({ 'phone-mode-v1': 'nonsense' }))).toBe('view')
    expect(readMode(null)).toBe('view')
    const throws = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readMode(throws)).toBe('view')
  })

  it('keeps the choice in storage', () => {
    const s = memory()
    vi.stubGlobal('localStorage', s)
    usePhoneMode.getState().setMode('edit')
    expect(s.m.get('phone-mode-v1')).toBe('edit')
    usePhoneMode.getState().setMode('view')
    expect(s.m.get('phone-mode-v1')).toBe('view')
  })

  it('lets a desktop always edit, and a phone only in Edit', () => {
    expect(canEdit(false, 'view')).toBe(true)
    expect(canEdit(true, 'view')).toBe(false)
    expect(canEdit(true, 'edit')).toBe(true)
  })

  it('puts the tools down in View, so nothing half-drawn waits for a tap', () => {
    usePlan.getState().load(house())
    usePhoneMode.getState().setMode('edit')
    usePlan.getState().setTool('wall')
    usePhoneMode.getState().setMode('view')
    expect(usePlan.getState().tool).toBe('select')
  })

  it('switches a phone to Edit when a tool is picked (from ⌘K, say), and leaves a desktop alone', () => {
    usePlan.getState().load(house())
    usePhoneMode.getState().setMode('view')
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    usePlan.getState().setTool('wall')
    expect(usePhoneMode.getState().mode).toBe('view')
    usePlan.getState().setTool('select')
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    usePlan.getState().setTool('room')
    expect(usePhoneMode.getState().mode).toBe('edit')
    usePlan.getState().setTool('select')
    usePhoneMode.getState().setMode('view')
  })

  it('switches a phone to Edit for Site features’ tools too, and puts them down in View', () => {
    usePhoneMode.getState().setMode('view')
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    useSiteStore.getState().setTool({ kind: 'trace', type: 'tree', geom: 'point' })
    expect(usePhoneMode.getState().mode).toBe('edit')
    usePhoneMode.getState().setMode('view')
    expect(useSiteStore.getState().tool).toBeNull()
  })
})

describe('the plan in View', () => {
  const { survey, terrain } = loadBlock()
  beforeEach(() => {
    usePlan.getState().load(house())
    usePlan.getState().select({ type: 'wall', id: 's' })
    // A static render reads the store's server snapshot, its initial state: put the plan there.
    Object.assign(usePlan.getInitialState(), usePlan.getState())
  })

  const render = (touch: TouchCanvasInfo | null) =>
    renderToStaticMarkup(
      <TouchCanvas.Provider value={touch}>
        <PlanEditor survey={survey} terrain={terrain} up="house" onUpChange={() => {}} showGround={false} onShowGroundChange={() => {}} earth={null} />
      </TouchCanvas.Provider>,
    )

  it('draws no handles to drag on a selected wall, so a finger cannot move it', () => {
    const view = render({ phone: true, viewOnly: true, projectKey: 'p' })
    expect(view).toContain('view-only')
    expect(view).toContain('class="wall')
    expect(view).not.toContain('class="handle"')
  })

  it('draws them in Edit, on a desktop, and with no frame', () => {
    for (const touch of [{ phone: true, viewOnly: false, projectKey: 'p' }, { phone: false, viewOnly: false, projectKey: 'p' }, null]) {
      const html = render(touch)
      expect(html).not.toContain('view-only')
      expect(html).toContain('class="handle"')
    }
  })

  it('shows the level as one short line on a phone', () => {
    const phone = words(render({ phone: true, viewOnly: true, projectKey: 'p' }))
    expect(phone).toContain('Ground floor · RL 28.60')
  })
})

describe('a panel in View', () => {
  it('is locked, says why in one line, and offers Edit', () => {
    const html = renderToStaticMarkup(
      <ViewLock>
        <button>Balance</button>
      </ViewLock>,
    )
    expect(html).toContain('<fieldset class="view-lock" disabled="">')
    expect(words(html)).toContain('View: one finger pans, nothing moves. Tap Edit to change the plan. Edit Balance')
  })

  it('puts the line after the numbers in the selection sheet', () => {
    const html = words(
      renderToStaticMarkup(
        <ViewLock after>
          <p>Wall 10.00 m</p>
        </ViewLock>,
      ),
    )
    expect(html.indexOf('Wall 10.00 m')).toBeLessThan(html.indexOf('View: one finger pans'))
  })
})
