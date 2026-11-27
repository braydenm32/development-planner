import 'fake-indexeddb/auto'
import { createStore } from 'idb-keyval'
import { describe, expect, it, vi } from 'vitest'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan } from '../../plan/model'
import { createLocalProjectStore } from '../localStore'
import { withWriteQueue } from '../queue'
import { StaleProjectError } from '../types'

// The same project open in two tabs (LD-02). Synthetic data only: the test garage.

/** The plan stored for a project. */
async function planIn(s: { read(id: string): Promise<Record<string, unknown> | null> }, id: string): Promise<Plan> {
  return (await s.read(id))!.plan as Plan
}

describe('the store’s check before a write', () => {
  const fresh = (name: string) => createLocalProjectStore({ db: createStore(name, 'projects') })

  it('counts edits, not preference saves', async () => {
    const s = fresh('edits-1')
    const p = await s.create({ name: 'Counts', records: { plan: garageFloor() } })
    expect(p.edits ?? 0).toBe(0)
    const a = await s.save(p.id, { records: { plan: { ...garageFloor(), name: 'x' } } })
    expect(a.edits).toBe(1)
    const b = await s.save(p.id, { records: { prefs: { view: { mode: '3d' } } }, touch: false })
    expect(b.edits).toBe(1)
    expect(b.revision).toBe(3)
  })

  it('refuses a write made from an older copy, and writes nothing', async () => {
    const s = fresh('edits-2')
    const p = await s.create({ name: 'Two tabs', records: { plan: garageFloor() } })
    // Tab A saves an edit; tab B still holds the project as it opened (edits 0).
    const mine = await s.save(p.id, { records: { plan: { ...garageFloor(), name: 'A' } }, ifEdits: 0 })
    const err = await s.save(p.id, { records: { plan: { ...garageFloor(), name: 'B' } }, ifEdits: 0 }).catch(e => e)
    expect(err).toBeInstanceOf(StaleProjectError)
    expect((err as StaleProjectError).stored.edits).toBe(1)
    expect((await planIn(s, p.id)).name).toBe('A')
    expect((await s.get(p.id))?.revision).toBe(mine.revision)
    // Even a preference save waits: the tab takes the newer version in first.
    await expect(s.save(p.id, { records: { prefs: {} }, touch: false, ifEdits: 0 })).rejects.toBeInstanceOf(StaleProjectError)
    // Up to date again, it saves.
    const next = await s.save(p.id, { records: { plan: { ...garageFloor(), name: 'B' } }, ifEdits: 1 })
    expect(next.edits).toBe(2)
  })

  it('lets another tab’s preference save through without making this one stale', async () => {
    const s = fresh('edits-3')
    const p = await s.create({ name: 'Prefs', records: { plan: garageFloor() } })
    await s.save(p.id, { records: { prefs: { place: '#/site/block' } }, touch: false })
    const ok = await s.save(p.id, { records: { plan: { ...garageFloor(), name: 'mine' } }, ifEdits: 0 })
    expect(ok.edits).toBe(1)
  })

  it('counts a project put in place whole (a cloud download) as an edit', async () => {
    const s = fresh('edits-4')
    const p = await s.create({ name: 'Whole', records: { plan: garageFloor() } })
    const w = await s.putWhole({ ...p, name: 'From the cloud' }, { plan: garageFloor() }, p.revision)
    expect(w?.edits).toBe(1)
    await expect(s.save(p.id, { records: { plan: garageFloor() }, ifEdits: 0 })).rejects.toBeInstanceOf(StaleProjectError)
  })

  it('opens a project saved before edits were counted', async () => {
    const s = fresh('edits-5')
    const p = await s.create({ name: 'Older', records: { plan: garageFloor() } })
    expect('edits' in p).toBe(false)
    expect((await s.save(p.id, { records: { plan: garageFloor() }, ifEdits: 0 })).edits).toBe(1)
  })
})

describe('the write queue, when the stored copy is newer', () => {
  it('keeps a refused edit to write later, or drops it', async () => {
    const s = createLocalProjectStore({ db: createStore('edits-queue', 'projects') })
    const q = withWriteQueue(s)
    const p = await s.create({ name: 'Queue', records: { plan: garageFloor() } })
    await s.save(p.id, { records: { plan: { ...garageFloor(), name: 'other tab' } } })
    await expect(q.save(p.id, { records: { plan: { ...garageFloor(), name: 'mine' } }, ifEdits: 0 })).rejects.toBeInstanceOf(StaleProjectError)
    expect(q.unsavedEdits(p.id)).toBe(true)
    await q.drop(p.id, new Error('dropped'))
    expect(q.unsavedEdits(p.id)).toBe(false)
    expect(q.unsaved()).toEqual([])
    await q.flush()
    expect((await planIn(s, p.id)).name).toBe('other tab')
  })

  it('doesn’t count a preference save as an unsaved edit', async () => {
    const s = createLocalProjectStore({ db: createStore('edits-queue-2', 'projects') })
    const q = withWriteQueue(s)
    const p = await s.create({ name: 'Queue', records: {} })
    const saving = q.save(p.id, { records: { prefs: {} }, touch: false })
    expect(q.unsavedEdits(p.id)).toBe(false)
    await saving
  })
})

// Two tabs: the session module loaded twice over the one (fake) IndexedDB, as two pages would.
async function openTab() {
  vi.resetModules()
  const session = await import('../session')
  const { usePlan } = await import('../../plan/store')
  await session.ensureProjects()
  const walls = () => usePlan.getState().plan?.walls.length ?? -1
  const dropWall = () => usePlan.getState().commit(p => ({ ...p, walls: p.walls.slice(1) }))
  return { ...session, usePlan, walls, dropWall }
}

describe('the same project open in two tabs', () => {
  it('each takes in what the other saves, whichever saves first', async () => {
    const a = await openTab()
    const b = await openTab()
    const p = await a.projectActions.create({ plan: garageFloor() }, 'Two tabs')
    await b.projectActions.open(p.id)
    const n = a.walls()
    expect(b.walls()).toBe(n)
    const took: string[] = []
    a.otherTab.onTookNewer(name => took.push(`a:${name}`))
    b.otherTab.onTookNewer(name => took.push(`b:${name}`))

    a.dropWall()
    await a.projectActions.flush()
    await vi.waitFor(() => expect(b.walls()).toBe(n - 1))
    expect(b.projectsNow().conflict).toBeNull()

    b.dropWall()
    await b.projectActions.flush()
    await vi.waitFor(() => expect(a.walls()).toBe(n - 2))
    expect(took).toEqual(['b:Two tabs', 'a:Two tabs'])

    // Both edits are in what's stored: neither tab saved over the other.
    expect((await planIn(a.projectActions, p.id)).walls).toHaveLength(n - 2)
    expect(a.projectsNow().saveError).toBeNull()
    expect(b.projectsNow().saveError).toBeNull()
  })

  it('a tab with unsaved changes stops saving and asks; Use the newer version opens the other tab’s', async () => {
    const a = await openTab()
    const b = await openTab()
    const p = await a.projectActions.create({ plan: garageFloor() }, 'Both edited')
    await b.projectActions.open(p.id)
    const n = a.walls()

    // Both change the plan before either has saved; A's save lands first.
    a.dropWall()
    b.dropWall()
    b.dropWall()
    await a.projectActions.flush()
    await b.projectActions.flush()
    await vi.waitFor(() => expect(b.projectsNow().conflict).toEqual({ id: p.id, name: 'Both edited' }))
    // Nothing of B's was written, and it isn't reported as a failed save.
    expect((await planIn(a.projectActions, p.id)).walls).toHaveLength(n - 1)
    expect(b.projectsNow().saveError).toBeNull()
    // Still nothing while the question is open.
    b.dropWall()
    await b.projectActions.flush()
    expect((await planIn(a.projectActions, p.id)).walls).toHaveLength(n - 1)

    await b.otherTab.useNewer()
    expect(b.projectsNow().conflict).toBeNull()
    expect(b.walls()).toBe(n - 1)
    // And B saves again from there.
    b.dropWall()
    await b.projectActions.flush()
    await vi.waitFor(() => expect(a.walls()).toBe(n - 2))
  })

  it('Keep mine saves this tab’s version, and the other tab takes it in', async () => {
    const a = await openTab()
    const b = await openTab()
    const p = await a.projectActions.create({ plan: garageFloor() }, 'Keep mine')
    await b.projectActions.open(p.id)
    const n = a.walls()

    a.dropWall()
    b.dropWall()
    b.dropWall()
    await a.projectActions.flush()
    await b.projectActions.flush()
    await vi.waitFor(() => expect(b.projectsNow().conflict).not.toBeNull())

    await b.otherTab.keepMine()
    expect(b.projectsNow().conflict).toBeNull()
    expect(b.walls()).toBe(n - 2)
    expect((await planIn(b.projectActions, p.id)).walls).toHaveLength(n - 2)
    await vi.waitFor(() => expect(a.walls()).toBe(n - 2))
    expect(a.projectsNow().conflict).toBeNull()
  })

  it('a project made, renamed or changed in one tab shows in the other’s list', async () => {
    const a = await openTab()
    const b = await openTab()
    const p = await a.projectActions.create({ plan: garageFloor() }, 'Listed')
    await vi.waitFor(() => expect(b.projectsNow().list.some(m => m.id === p.id)).toBe(true))
    await a.projectActions.rename(p.id, 'Listed again')
    await vi.waitFor(() => expect(b.projectsNow().list.find(m => m.id === p.id)?.name).toBe('Listed again'))
    // B never opened it, so nothing there was replaced.
    expect(b.projectsNow().currentId).not.toBe(p.id)
  })
})
