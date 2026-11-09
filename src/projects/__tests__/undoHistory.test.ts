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

  it('writes once the edits settle, not on every one', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    for (let i = 0; i < 5; i++) app.st().commit(dropWall)
    await app.actions.flush()
    expect((await app.actions.read(id))?.history).toBeUndefined()
    await new Promise(r => setTimeout(r, app.history.HISTORY_SETTLE_MS + 150))
    await app.actions.flush()
    const saved = (await app.actions.read(id))?.history as { past: Plan[]; future: Plan[] }
    expect(saved.past).toHaveLength(5)
    expect(saved.future).toEqual([])
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
    expect(undoTarget('undo')).toBe(site())
    undoTarget('undo').undo()
    expect(site().data.features[0].remove).toBeFalsy()
    // Redo puts it back; with the site's steps taken back, Undo goes on to the plan's.
    expect(undoTarget('redo')).toBe(site())
    undoTarget('undo').undo()
    expect(app.st().plan!.walls).toEqual(garageFloor().walls)
    // Redo follows the history just changed: the plan's step comes back.
    undoTarget('redo').redo()
    expect(app.st().plan!.walls).toHaveLength(garageFloor().walls.length - 1)
    // Marking again, then editing the plan, makes the plan's history the one Undo works on.
    setTreeRemoval('tree1', true)
    expect(undoTarget('undo')).toBe(site())
    app.st().commit(dropWall)
    expect(undoTarget('undo')).toBe(app.st())
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
})
