// The plan's zoom and pan: remembered for each project and each floor, kept across a reload
// (the project in IndexedDB, the view on this device), written only when a gesture settles,
// and the wheel's step small and even. Synthetic blocks only: the tilted-plane test block and
// the test garage.

import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import type { SavedProject } from '../../lib/storage'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { readSite } from '../../safety/files'
import { garageFloor } from './fixtures'
import type { Plan } from '../model'

// ---------------------------------------------------------------------------
// This device's storage, kept across "page loads" (vi.resetModules), as localStorage is.

class DeviceStorage {
  m = new Map<string, string>()
  writes: string[] = []
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.writes.push(k)
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  viewWrites() {
    return this.writes.filter(k => k.startsWith('plan-view-v1:')).length
  }
}

let device: DeviceStorage
beforeEach(() => {
  device = new DeviceStorage()
  vi.stubGlobal('localStorage', device)
})
afterEach(() => vi.unstubAllGlobals())

const survey = (): SavedProject => {
  const dxfText = planeSurvey()
  return { fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}

/** The garage with a first floor above it. */
const twoFloors = (): Plan => {
  const p = garageFloor()
  return { ...p, levels: [...p.levels, { id: 'level_first', name: 'First floor', elevation: 2.9, height: 2.7 }] }
}

/** The app as a fresh page load sees it: new modules over the same IndexedDB and localStorage. */
async function load() {
  vi.resetModules()
  const session = await import('../../projects/session')
  const memory = await import('../viewMemory')
  const { usePlan } = await import('../store')
  const { PlanEditor } = await import('../../components/PlanEditor')
  await session.ensureProjects()
  const site = readSite(survey())
  /** The plan as it draws, for the project `viewKey` (none: nothing remembered). */
  const draw = (viewKey: string | null) => {
    // A static render reads the store's server snapshot, its initial state: put the plan there.
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    return renderToStaticMarkup(
      <PlanEditor survey={site.survey} terrain={site.terrain} up="house" onUpChange={() => {}} showGround={false} onShowGroundChange={() => {}} earth={null} viewKey={viewKey} />,
    )
  }
  return { session, memory, usePlan, draw, actions: session.projectActions, st: () => usePlan.getState() }
}

/** The plan's scale, in pixels a metre, read off its scale bar (a bar of `m` metres is `m * k` pixels). */
const scaleBar = (html: string) => {
  const m = /<div class="scalebar"><div style="width:([\d.]+)px"><\/div><span>([\d.]+) m<\/span>/.exec(html)
  return m ? Number(m[1]) / Number(m[2]) : NaN
}

describe('the plan’s zoom and pan after a reload', () => {
  it('comes back where it was left, on the same project', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: twoFloors() })
    const fitted = app.draw(id)
    // A pinch or the wheel settles here (what the plan writes when the gesture ends).
    app.memory.savePlanView(id, 'level_ground', { cx: 3.2, cy: 6.4, k: 61.5 })
    const zoomed = app.draw(id)
    expect(zoomed).not.toBe(fitted)
    expect(scaleBar(zoomed)).toBeCloseTo(61.5, 6)
    await app.actions.flush()

    app = await load()
    // The project opened again by itself (this browser's pointer), its plan on the ground floor.
    expect(app.session.projectsNow().currentId).toBe(id)
    expect(app.draw(id)).toBe(zoomed)
  })

  it('keeps each floor’s own view, and a floor not looked at yet opens where the last one was left', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: twoFloors() })
    app.memory.savePlanView(id, 'level_ground', { cx: 3, cy: 6, k: 40 })
    const ground = app.draw(id)
    app.st().setActiveLevel('level_first')
    // Nothing saved for the first floor yet: it opens as the ground floor was left.
    expect(scaleBar(app.draw(id))).toBeCloseTo(40, 6)
    app.memory.savePlanView(id, 'level_first', { cx: 1, cy: 2, k: 90 })
    const first = app.draw(id)
    await app.actions.flush()

    app = await load()
    expect(app.st().activeLevel).toBe('level_ground')
    expect(app.draw(id)).toBe(ground)
    app.st().setActiveLevel('level_first')
    expect(app.draw(id)).toBe(first)
  })

  it('opens framed the same way after Fit block or Fit house', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    app.memory.savePlanView(id, 'level_ground', { cx: 3, cy: 6, k: 140 })
    app.st().requestFit('block')
    expect(app.memory.loadPlanView(id, 'level_ground')).toEqual({ fit: 'block' })
    await app.actions.flush()

    app = await load()
    const restored = app.draw(id)
    // The same as fitting the block afresh, here and now
    app.st().requestFit('block')
    expect(restored).toBe(app.draw(null))
    app.st().requestFit('house')
    expect(app.memory.loadPlanView(id, 'level_ground')).toEqual({ fit: 'house' })
    expect(app.draw(id)).toBe(app.draw(null))
  })

  it('fits a project opened for the first time, as before, and never lends it another project’s view', async () => {
    const app = await load()
    const a = await app.actions.create({ survey: survey(), plan: garageFloor() })
    app.memory.savePlanView(a.id, 'level_ground', { cx: 3, cy: 6, k: 140 })
    const b = await app.actions.create({ survey: survey(), plan: garageFloor() })
    expect(app.memory.loadPlanView(b.id, 'level_ground')).toBeNull()
    // Opening a project loads its plan, which isn't a Fit: nothing is written for it.
    expect(device.m.has(`plan-view-v1:${b.id}`)).toBe(false)
    expect(app.draw(b.id)).toBe(app.draw(null))
    expect(scaleBar(app.draw(b.id))).not.toBeCloseTo(140, 0)
  })

  it('writes nothing while the plan only draws, and nothing again for the same view', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    const before = device.viewWrites()
    for (let i = 0; i < 5; i++) app.draw(id)
    expect(device.viewWrites()).toBe(before)
    expect(app.memory.savePlanView(id, 'level_ground', { cx: 1, cy: 1, k: 50 })).toBe(true)
    expect(app.memory.savePlanView(id, 'level_ground', { cx: 1, cy: 1, k: 50 })).toBe(false)
    expect(device.viewWrites()).toBe(before + 1)
  })
})

describe('what is kept', () => {
  it('ignores what it can’t read, and keeps the view for the page when storage is blocked', async () => {
    const { loadPlanView, savePlanView } = await import('../viewMemory')
    device.m.set('plan-view-v1:junk', '{"version":1,"levels":{"a":{"cx":"x","cy":1,"k":2},"b":{"fit":"nope"},"c":{"cx":1,"cy":2,"k":-3}}}')
    expect(loadPlanView('junk', 'a')).toBeNull()
    expect(loadPlanView('junk', 'b')).toBeNull()
    expect(loadPlanView('junk', 'c')).toBeNull()
    device.m.set('plan-view-v1:bad', 'not json')
    expect(loadPlanView('bad', 'a')).toBeNull()
    // Zoomed past the limits: brought back to them.
    device.m.set('plan-view-v1:far', '{"version":1,"levels":{"a":{"cx":0,"cy":0,"k":99999}}}')
    expect(loadPlanView('far', 'a')).toEqual({ cx: 0, cy: 0, k: 1500 })

    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(savePlanView('private', 'a', { cx: 1, cy: 2, k: 30 }, blocked)).toBe(true)
    expect(loadPlanView('private', 'a', false, blocked)).toEqual({ cx: 1, cy: 2, k: 30 })
  })

  it('keeps a floor’s own view apart from the last one saved', async () => {
    const { loadPlanView, savePlanView } = await import('../viewMemory')
    savePlanView('p', 'g', { cx: 1, cy: 1, k: 20 })
    expect(loadPlanView('p', 'f')).toEqual({ cx: 1, cy: 1, k: 20 })
    expect(loadPlanView('p', 'f', true)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('the zoom step', () => {
  it('is about 12% a wheel notch, the same in and out', async () => {
    const { ZOOM_STEP, wheelZoom } = await import('../viewMemory')
    expect(ZOOM_STEP - 1).toBeGreaterThanOrEqual(0.1)
    expect(ZOOM_STEP - 1).toBeLessThanOrEqual(0.15)
    // Chrome and Safari: about 100 px a notch, negative is towards you (in).
    expect(wheelZoom(-100)).toBeCloseTo(1.12, 10)
    expect(wheelZoom(100)).toBeCloseTo(1 / 1.12, 10)
    expect(wheelZoom(-100) * wheelZoom(100)).toBeCloseTo(1, 12)
    // Firefox counts lines, 3 a notch.
    expect(wheelZoom(-3, 1)).toBeCloseTo(1.12, 10)
    expect(wheelZoom(0)).toBe(1)
  })

  it('never jumps more than a notch for one event, however far the wheel says it went', async () => {
    const { wheelZoom } = await import('../viewMemory')
    expect(wheelZoom(-300)).toBeCloseTo(1.12, 10)
    expect(wheelZoom(-5000)).toBeCloseTo(1.12, 10)
    expect(wheelZoom(1, 2)).toBeCloseTo(1 / 1.12, 10) // a page
    // The audit's six 300 px notches: once 15× (full screen to a postage stamp), now about 2×.
    const before = Math.exp(300 * 0.0015 * 6)
    const now = wheelZoom(-300) ** 6
    expect(before).toBeGreaterThan(14)
    expect(now).toBeCloseTo(1.12 ** 6, 10)
    expect(now).toBeLessThan(2)
  })

  it('follows a trackpad smoothly, in proportion', async () => {
    const { wheelZoom } = await import('../viewMemory')
    expect(wheelZoom(-4)).toBeCloseTo(1.12 ** 0.04, 10)
    expect(wheelZoom(-25) ** 4).toBeCloseTo(wheelZoom(-100), 10)
  })

  it('takes two notches for a press of + or −, about the middle of the plan', async () => {
    const { BUTTON_ZOOM, ZOOM_STEP, usePlanZoom, zoomPlan } = await import('../viewMemory')
    expect(BUTTON_ZOOM).toBeCloseTo(ZOOM_STEP ** 2, 12)
    expect(Math.round((BUTTON_ZOOM - 1) * 100)).toBe(25)
    const n = usePlanZoom.getState().n
    zoomPlan(1)
    expect(usePlanZoom.getState()).toMatchObject({ n: n + 1, factor: BUTTON_ZOOM })
    zoomPlan(-1)
    expect(usePlanZoom.getState()).toMatchObject({ n: n + 2, factor: 1 / BUTTON_ZOOM })
  })
})
