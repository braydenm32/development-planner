import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan } from '../../plan/model'

// Synthetic data only: the tilted-plane test block and the test garage.
const survey = () => {
  const dxfText = planeSurvey()
  return { fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}

/** The app as a fresh page load sees it: new modules over the same IndexedDB. */
async function load() {
  vi.resetModules()
  const session = await import('../session')
  const history = await import('../undoHistory')
  const { usePlan } = await import('../../plan/store')
  await session.ensureProjects()
  const st = () => usePlan.getState()
  const settle = async () => {
    await history.flushHistory()
    await session.projectActions.flush()
  }
  return { session, history, st, settle, actions: session.projectActions }
}

/** One undoable step: take the first wall away. */
const dropWall = (p: Plan): Plan => ({ ...p, walls: p.walls.slice(1) })

describe('Undo and Redo after a reload', () => {
  it('keeps both, step for step', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    app.st().commit(dropWall)
    app.st().commit(dropWall)
    app.st().commit(dropWall)
    app.st().undo()
    expect(app.st().plan!.walls).toHaveLength(8)
    await app.settle()

    app = await load()
    await app.actions.open(id)
    expect(app.st().plan!.walls).toHaveLength(8)
    expect(app.st().past).toHaveLength(2)
    expect(app.st().future).toHaveLength(1)
    app.st().undo()
    app.st().undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
    app.st().redo()
    app.st().redo()
    app.st().redo()
    expect(app.st().plan!.walls).toHaveLength(7)
    expect(app.st().future).toHaveLength(0)
  })

  // LD-35: an Undo, then a reload before the history's own write was due, used to lose Redo
  // (the plan had saved, its history hadn't). The two go in one write now.
  it('keeps Redo when the page closes straight after an Undo', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    app.st().commit(dropWall)
    app.st().commit(dropWall)
    await app.settle()
    app.st().undo()
    // What the page does as it closes: the plan's save, with nothing waited for after it.
    await app.session.flushPlan()

    app = await load()
    await app.actions.open(id)
    expect(app.st().plan!.walls).toHaveLength(9)
    expect(app.st().future).toHaveLength(1)
    app.st().redo()
    expect(app.st().plan!.walls).toHaveLength(8)
  })

  it('writes once the edits settle, not on every one', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    const before = app.session.projectsNow().list.find(m => m.id === id)!.revision
    for (let i = 0; i < 5; i++) app.st().commit(dropWall)
    expect((await app.actions.read(id))?.history).toBeUndefined()
    // The plan's save takes the history with it: one write for the five edits, not one each.
    await app.actions.flush()
    const saved = (await app.actions.read(id))?.history as { past: Plan[]; future: Plan[] }
    expect(saved.past).toHaveLength(5)
    expect(saved.future).toEqual([])
    expect(app.session.projectsNow().list.find(m => m.id === id)!.revision).toBe(before + 1)
    // And nothing more is written when the history's own wait is over.
    await new Promise(r => setTimeout(r, app.history.HISTORY_SETTLE_MS + 150))
    await app.actions.flush()
    expect(app.session.projectsNow().list.find(m => m.id === id)!.revision).toBe(before + 1)
  })

  it('never mixes two projects’ histories, even when one opens before the other’s save', async () => {
    let app = await load()
    const a = await app.actions.create({ survey: survey(), plan: garageFloor() })
    app.st().commit(dropWall)
    // Open another straight away, before A's history has settled.
    const b = await app.actions.create({ survey: survey(), plan: garageFloor() })
    expect(app.st().past).toHaveLength(0)
    app.st().commit(dropWall)
    app.st().commit(dropWall)
    await app.settle()
    expect(((await app.actions.read(a.id))!.history as { past: Plan[] }).past).toHaveLength(1)
    expect(((await app.actions.read(b.id))!.history as { past: Plan[] }).past).toHaveLength(2)

    app = await load()
    await app.actions.open(a.id)
    expect(app.st().past).toHaveLength(1)
    app.st().undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
    await app.actions.open(b.id)
    expect(app.st().past).toHaveLength(2)
    expect(app.st().plan!.walls).toHaveLength(8)
  })

  it('keeps the steps that led to a plan saved after its history, and drops Redo that no longer fits', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    app.st().commit(dropWall)
    app.st().commit(dropWall)
    app.st().undo()
    await app.settle()
    // A later edit reached the plan record, but the page closed before its history did.
    const saved = (await app.actions.read(id))!.plan as Plan
    const later = { ...saved, walls: saved.walls.slice(2) }
    await app.actions.flush()
    app = await load()
    await app.actions.open(id)
    app.st().load(later) // what a newer plan record would open as
    await app.actions.flush()
    app = await load()
    await app.actions.open(id)
    expect(app.st().plan!.walls).toHaveLength(7)
    expect(app.st().future).toEqual([])
    // Undo goes back to the last saved step, then on as before.
    app.st().undo()
    expect(app.st().plan!.walls).toHaveLength(9)
    app.st().undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
  })

  it('a reload leaves "How is this floor built?" waiting, and adds no step that undoes nothing', async () => {
    let app = await load()
    // A plan made in today's app (floorsByLevel) whose ground floor has rooms and no floor type yet.
    const { id } = await app.actions.create({ survey: survey(), plan: { ...garageFloor(), floorsByLevel: true } })
    app.st().commit(dropWall)
    app.st().commit(dropWall)
    await app.settle()
    expect(app.st().plan!.levels[0].floorType).toBeUndefined()

    app = await load()
    await app.actions.open(id)
    expect(app.st().plan!.levels[0].floorType).toBeUndefined()
    expect(app.st().past).toHaveLength(2)
    // Undo takes back the last real edit.
    app.st().undo()
    expect(app.st().plan!.walls).toHaveLength(9)
  })

  it('keeps the last hundred steps', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    for (let i = 0; i < 130; i++) app.st().commit(p => ({ ...p, placement: { ...p.placement, ffl: 80 + i / 100 } }))
    await app.settle()
    const saved = (await app.actions.read(id))?.history as { past: Plan[]; present: Plan }
    expect(saved.past).toHaveLength(app.history.HISTORY_KEEP)
    expect(saved.past.at(-1)!.placement.ffl).toBeCloseTo(81.28, 9)
    expect(saved.present.placement.ffl).toBeCloseTo(81.29, 9)
  })

  it('a tree marked for removal from Checks is what the top bar’s Undo takes back', async () => {
    const app = await load()
    await app.actions.create({ survey: survey(), plan: garageFloor() })
    const { useSiteStore } = await import('../../site/store')
    const { setTreeRemoval } = await import('../../checks/siteTrees')
    const { undoTarget } = await import('../../shell/undoTarget')
    const site = () => useSiteStore.getState()
    useSiteStore.setState({ focus: false, data: { ...site().data, features: [{ id: 'tree1', type: 'tree', geom: { kind: 'point', at: [3, 4] }, source: 'trace', label: 'T1', trunk: 0.3 }] } })
    app.st().commit(dropWall)
    // Marked from Approvals › Checks: the site features' history, with Site › Features not open.
    setTreeRemoval('tree1', true)
    expect(site().data.features[0].remove).toBe(true)
    expect(undoTarget('undo').kind).toBe('site')
    expect(undoTarget('undo').label).toBe('mark tree for removal')
    undoTarget('undo').undo()
    expect(site().data.features[0].remove).toBeFalsy()
    // Redo puts it back; with the site's steps taken back, Undo goes on to the plan's.
    expect(undoTarget('redo').kind).toBe('site')
    undoTarget('undo').undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
    // Redo brings back the step undone last: the plan's.
    undoTarget('redo').redo()
    expect(app.st().plan!.walls).toHaveLength(garageFloor().walls.length - 1)
    // Marking again, then editing the plan, makes the plan's step the one Undo takes back.
    setTreeRemoval('tree1', true)
    expect(undoTarget('undo').kind).toBe('site')
    app.st().commit(dropWall)
    expect(undoTarget('undo').kind).toBe('plan')
  })

  it('opens a project saved before histories were kept with an empty one', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    await app.settle()
    await app.actions.open(id)
    expect((await app.actions.read(id))?.history).toBeUndefined()
    expect(app.st().past).toEqual([])
    expect(app.st().future).toEqual([])
    app.st().commit(dropWall)
    await app.settle()
    expect(((await app.actions.read(id))!.history as { past: Plan[] }).past).toHaveLength(1)
  })

  // Final check 8: leaving the page (pagehide, or the tab hidden) saves at once what was waiting
  // its 400 ms, and first keeps what is being typed in a box, which would otherwise only be kept
  // as the box lost focus, which a reload never does.
  it('saves the edit waiting, the history beside it and what is being typed, as the page is left', async () => {
    let app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    await app.settle()
    app.st().commit(dropWall)
    let blurred = 0
    // A name box whose blur keeps what was typed in it, as fields.tsx's do.
    const box = { tagName: 'INPUT', type: 'text', blur: () => (blurred++, app.st().commit(dropWall)) }
    expect(app.session.leavePage(box as unknown as Element)).toBe(box)
    expect(blurred).toBe(1)
    // Nothing waited for: the page may be gone a moment later.
    app = await load()
    await app.actions.open(id)
    expect(app.st().plan!.walls).toHaveLength(garageFloor().walls.length - 2)
    expect(app.st().past).toHaveLength(2)
    // A button with focus is left alone; so is nothing.
    const button = { tagName: 'BUTTON', blur: () => blurred++ }
    expect(app.session.leavePage(button as unknown as Element)).toBeNull()
    expect(app.session.leavePage(null)).toBeNull()
    expect(blurred).toBe(1)
  })
})

/**
 * The app as a fresh page load sees it, with the site features' and the costs' records started.
 * With `id`, that project opens first, as at start-up: the site features and costs are read after it.
 */
async function loadAll(id?: string) {
  const app = await load()
  if (id) await app.actions.open(id)
  const { startSiteRecords } = await import('../../site/persist')
  const { startCostRecords, flushCosts } = await import('../../costs/persist')
  const { useSiteStore } = await import('../../site/store')
  const { useCosts } = await import('../../costs/store')
  const { undoTarget } = await import('../../shell/undoTarget')
  startSiteRecords()
  startCostRecords()
  // Let the records read at start-up come in.
  await new Promise(r => setTimeout(r, 50))
  const site = () => useSiteStore.getState()
  const costs = () => useCosts.getState()
  const tree = (id: string) =>
    site().commit(d => ({ ...d, features: [...d.features, { id, type: 'tree' as const, geom: { kind: 'point' as const, at: [1, 2] as [number, number] }, source: 'trace' as const }] }))
  const margin = (v: number) => costs().commit(d => ({ ...d, margin: v }))
  const settleAll = async () => {
    // The site features' own save waits 400 ms.
    await new Promise(r => setTimeout(r, 500))
    await flushCosts()
    await app.settle()
  }
  return { ...app, site, costs, tree, margin, undoTarget, settleAll }
}

describe('Site and Costs Undo after a reload', () => {
  it('keeps the one order across the plan, the site features and the costs', async () => {
    let app = await loadAll()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    await new Promise(r => setTimeout(r, 50))
    app.st().commit(dropWall)
    app.tree('t1')
    app.margin(0.25)
    app.st().commit(dropWall)
    // Undo the last plan step: Redo has it.
    app.undoTarget('undo').undo()
    expect(app.st().plan!.walls).toHaveLength(garageFloor().walls.length - 1)
    await app.settleAll()

    // A reload: the project opens as the page starts, before the site features and costs are read.
    app = await loadAll(id)
    expect(app.site().past).toHaveLength(1)
    expect(app.costs().past).toHaveLength(1)
    expect(app.undoTarget('redo').kind).toBe('plan')
    expect(app.undoTarget('undo').kind).toBe('costs')
    app.undoTarget('undo').undo()
    expect(app.costs().data.margin).toBe(0.2)
    expect(app.undoTarget('undo').kind).toBe('site')
    app.undoTarget('undo').undo()
    expect(app.site().data.features).toHaveLength(0)
    expect(app.undoTarget('undo').kind).toBe('plan')
    app.undoTarget('undo').undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
    // And Redo brings them back in the same order.
    expect(app.undoTarget('redo').kind).toBe('plan')
    app.undoTarget('redo').redo()
    expect(app.undoTarget('redo').kind).toBe('site')
    app.undoTarget('redo').redo()
    expect(app.site().data.features.map(f => f.id)).toEqual(['t1'])
    app.undoTarget('redo').redo()
    expect(app.costs().data.margin).toBe(0.25)
    app.undoTarget('redo').redo()
    expect(app.st().plan!.walls).toHaveLength(garageFloor().walls.length - 2)
  })

  it('keeps Site Redo, and opening another project starts afresh', async () => {
    let app = await loadAll()
    const a = await app.actions.create({ survey: survey(), plan: garageFloor() })
    await new Promise(r => setTimeout(r, 50))
    app.tree('t1')
    app.tree('t2')
    app.undoTarget('undo').undo()
    await app.settleAll()

    const b = await app.actions.create({ survey: survey(), plan: garageFloor() })
    expect(app.site().past).toHaveLength(0)
    expect(app.undoTarget('undo').kind).toBeNull()
    app.margin(0.3)
    await app.settleAll()

    app = await loadAll(b.id)
    expect(app.site().past).toHaveLength(0)
    expect(app.costs().past).toHaveLength(1)
    // Opening A (the page already running) puts A's back, and only A's.
    await app.actions.open(a.id)
    expect(app.costs().past).toHaveLength(0)
    expect(app.site().past).toHaveLength(1)
    expect(app.site().future).toHaveLength(1)
    expect(app.undoTarget('redo').kind).toBe('site')
    app.undoTarget('redo').redo()
    expect(app.site().data.features.map(f => f.id)).toEqual(['t1', 't2'])
  })

  it('opens a history saved before the site and costs steps were kept', async () => {
    let app = await loadAll()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    await new Promise(r => setTimeout(r, 50))
    app.st().commit(dropWall)
    app.tree('t1')
    await app.settleAll()
    // What an older app wrote: the plan's steps only.
    const saved = (await app.actions.read(id))!.history as Record<string, unknown>
    expect(saved.site).toBeDefined()
    const old = { version: 1, past: saved.past, present: saved.present, future: saved.future }
    const write = app.session.registerRecordKind('history', () => {})
    await write(old, id)
    await app.actions.flush()

    app = await loadAll(id)
    expect(app.st().past).toHaveLength(1)
    expect(app.site().past).toHaveLength(0)
    expect(app.undoTarget('undo').kind).toBe('plan')
    app.undoTarget('undo').undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
  })

  it('keeps the last hundred costs steps', async () => {
    const app = await loadAll()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    for (let i = 0; i < 130; i++) app.margin(i / 1000)
    await app.settleAll()
    const saved = (await app.actions.read(id))!.history as { costs: { past: { margin: number }[]; present: { margin: number } }; order: { done: string[] } }
    expect(saved.costs.past).toHaveLength(app.history.HISTORY_KEEP)
    expect(saved.costs.present.margin).toBeCloseTo(0.129, 9)
    expect(saved.order.done.filter(k => k === 'costs')).toHaveLength(app.history.HISTORY_KEEP)
  })
})
