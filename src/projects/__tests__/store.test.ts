import 'fake-indexeddb/auto'
import { createStore, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval'
import { beforeEach, describe, expect, it } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { projectFileText } from '../../share/project'
import { legacySource, migrateLegacy } from '../legacy'
import { createLocalProjectStore, type LocalProjectStore } from '../localStore'
import { createMemoryProjectStore } from '../memoryStore'
import { archiveProject, createFromProjectFile, deleteProject, describeContents, duplicateProject, renameProject, restoreProject } from '../ops'
import { mergeChanges, withWriteQueue } from '../queue'
import { NotArchivedError, type ProjectStore } from '../types'

// Synthetic data only: the tilted-plane test block and the test garage.
function syntheticSurvey() {
  const dxfText = planeSurvey()
  return { fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}

let n = 0
let clock = 1_000_000
const now = () => clock
let db: UseStore
let local: LocalProjectStore

beforeEach(() => {
  n++
  db = createStore(`projects-test-${n}`, 'projects')
  local = createLocalProjectStore({ db, now })
})

describe('the local project store', () => {
  it('creates projects and lists them, most recently edited first', async () => {
    const a = await local.create({ name: 'First', records: { survey: syntheticSurvey(), plan: garageFloor() } })
    clock += 1000
    const b = await local.create({ name: 'Second' })
    expect(a.revision).toBe(1)
    expect(a.archived).toBe(false)
    expect(a.id).not.toBe(b.id)
    expect((await local.list()).map(p => p.name)).toEqual(['Second', 'First'])
    expect(await local.get(a.id)).toEqual(a)
    const recs = await local.read(a.id)
    expect(recs?.plan).toEqual(garageFloor())
    expect((recs!.survey as { fileName: string }).fileName).toBe('plane.dxf')
    expect(await local.read(b.id)).toEqual({})
    expect(await local.read('p_missing')).toBeNull()
  })

  it('keeps records it knows nothing about, as they are', async () => {
    const site = { version: 1, features: [{ id: 't1', kind: 'tree', at: [1, 2] }] }
    const survey = { ...syntheticSurvey(), extraField: { anything: true } }
    const p = await local.create({ name: 'Opaque', records: { survey, site } })
    const recs = await local.read(p.id)
    expect(recs?.site).toEqual(site)
    expect(recs?.survey).toEqual(survey)
    expect(await local.read(p.id, ['site'])).toEqual({ site })
  })

  it('bumps the revision on every save, and moves "updated" only for edits', async () => {
    const p = await local.create({ name: 'Rev', records: { plan: garageFloor() } })
    clock += 5000
    const edited = await local.save(p.id, { records: { plan: { ...garageFloor(), name: 'x' } } })
    expect(edited.revision).toBe(2)
    expect(edited.updated).toBe(clock)
    clock += 5000
    const prefs = await local.save(p.id, { records: { prefs: { view: { mode: '3d' } } }, touch: false })
    expect(prefs.revision).toBe(3)
    expect(prefs.updated).toBe(edited.updated)
    expect(prefs.created).toBe(p.created)
  })

  it('removes a record when a save passes null', async () => {
    const p = await local.create({ name: 'Null', records: { survey: syntheticSurvey(), plan: garageFloor() } })
    await local.save(p.id, { records: { survey: null } })
    expect(Object.keys((await local.read(p.id)) ?? {})).toEqual(['plan'])
  })

  it('refuses to save to a project that does not exist', async () => {
    await expect(local.save('p_nope', { meta: { name: 'x' } })).rejects.toThrow(/no project/)
    expect(await local.list()).toEqual([])
  })

  it('duplicates as a deep copy with a new id', async () => {
    const p = await local.create({ name: 'House A', records: { survey: syntheticSurvey(), plan: garageFloor(), prefs: { print: { paper: 'A4' } } } })
    const copy = await duplicateProject(local, p.id)
    expect(copy.id).not.toBe(p.id)
    expect(copy.name).toBe('Copy of House A')
    expect(copy.revision).toBe(1)
    expect(await local.read(copy.id)).toEqual(await local.read(p.id))
    // Changing the original never reaches the copy.
    const changed = garageFloor()
    changed.walls = changed.walls.slice(1)
    await local.save(p.id, { records: { plan: changed } })
    expect(((await local.read(copy.id))!.plan as { walls: unknown[] }).walls).toHaveLength(garageFloor().walls.length)
    // A second copy gets a name of its own.
    expect((await duplicateProject(local, p.id)).name).toBe('Copy of House A 2')
  })

  it('renames, and will not take an empty name', async () => {
    const p = await local.create({ name: 'Old name' })
    expect((await renameProject(local, p.id, '  New name ')).name).toBe('New name')
    await expect(renameProject(local, p.id, '   ')).rejects.toThrow(/needs a name/)
    expect((await local.get(p.id))?.name).toBe('New name')
  })

  it('archives and restores without losing anything', async () => {
    const p = await local.create({ name: 'Tuck away', records: { plan: garageFloor() } })
    expect((await archiveProject(local, p.id)).archived).toBe(true)
    expect((await local.list()).find(m => m.id === p.id)?.archived).toBe(true)
    expect((await local.read(p.id))?.plan).toEqual(garageFloor())
    expect((await restoreProject(local, p.id)).archived).toBe(false)
  })

  it('deletes only when archived, and then takes every record with it', async () => {
    const p = await local.create({ name: 'Doomed', records: { survey: syntheticSurvey(), plan: garageFloor() } })
    const keep = await local.create({ name: 'Keeper', records: { plan: garageFloor() } })
    await expect(deleteProject(local, p.id)).rejects.toBeInstanceOf(NotArchivedError)
    expect(await local.get(p.id)).not.toBeNull()
    await archiveProject(local, p.id)
    await deleteProject(local, p.id)
    expect(await local.get(p.id)).toBeNull()
    expect(await local.read(p.id)).toBeNull()
    expect((await local.list()).map(m => m.id)).toEqual([keep.id])
    expect((await local.read(keep.id))?.plan).toEqual(garageFloor())
  })

  it('names what a delete would remove', async () => {
    const p = await local.create({ name: 'Review', records: { survey: syntheticSurvey(), plan: garageFloor(), prefs: {} } })
    const lines = describeContents(p, await local.read(p.id))
    expect(lines[0]).toBe('The survey (plane.dxf) and its layer settings')
    expect(lines[1]).toMatch(/^The plan: 1 floor, \d+ walls/)
    expect(lines[2]).toBe('Its print and view settings')
  })
})

describe('the write queue', () => {
  it('never loses the last save under rapid saves', async () => {
    const q = withWriteQueue(local)
    const p = await q.create({ name: 'Rapid', records: { plan: { step: -1 } } })
    const saves = Array.from({ length: 200 }, (_, i) => q.save(p.id, { records: { plan: { step: i } } }))
    const metas = await Promise.all(saves)
    expect(((await local.read(p.id))!.plan as { step: number }).step).toBe(199)
    // Saves made meanwhile are merged, so there are far fewer writes than saves, and every
    // promise resolves with a revision at least as new as its own write.
    const last = await local.get(p.id)
    expect(last!.revision).toBeGreaterThan(1)
    expect(last!.revision).toBeLessThanOrEqual(201)
    expect(metas[199].revision).toBe(last!.revision)
  })

  it('keeps saves to different projects apart', async () => {
    const q = withWriteQueue(local)
    const a = await q.create({ name: 'A' })
    const b = await q.create({ name: 'B' })
    await Promise.all(Array.from({ length: 50 }, (_, i) => [q.save(a.id, { records: { plan: { a: i } } }), q.save(b.id, { records: { plan: { b: i } } })]).flat())
    expect((await local.read(a.id))?.plan).toEqual({ a: 49 })
    expect((await local.read(b.id))?.plan).toEqual({ b: 49 })
  })

  it('keeps the last good save when a write fails, and retries the failed one', async () => {
    let failNext = false
    const flaky: ProjectStore = {
      ...local,
      save: (id, change) => {
        if (failNext) {
          failNext = false
          return Promise.reject(new Error('QuotaExceededError'))
        }
        return local.save(id, change)
      },
    }
    const q = withWriteQueue(flaky)
    const p = await q.create({ name: 'Flaky' })
    await q.save(p.id, { records: { plan: { v: 1 }, survey: { s: 1 } } })
    failNext = true
    await expect(q.save(p.id, { records: { plan: { v: 2 }, survey: { s: 2 } } })).rejects.toThrow(/Quota/)
    // The store still has the last good save, whole.
    expect(await local.read(p.id)).toEqual({ plan: { v: 1 }, survey: { s: 1 } })
    expect(q.unsaved()).toEqual([p.id])
    // The next save carries the failed change too; newer values win.
    await q.save(p.id, { records: { plan: { v: 3 } } })
    expect(await local.read(p.id)).toEqual({ plan: { v: 3 }, survey: { s: 2 } })
    expect(q.unsaved()).toEqual([])
    // A failure with nothing queued after it is retried by flush.
    failNext = true
    await expect(q.save(p.id, { records: { plan: { v: 4 } } })).rejects.toThrow()
    await q.flush(p.id)
    expect((await local.read(p.id))?.plan).toEqual({ v: 4 })
  })

  it('reads see every save asked for before them', async () => {
    const q = withWriteQueue(local)
    const p = await q.create({ name: 'Read after write' })
    void q.save(p.id, { records: { plan: { v: 1 } } })
    void q.save(p.id, { records: { plan: { v: 2 } } })
    expect((await q.read(p.id))?.plan).toEqual({ v: 2 })
  })

  it('merges changes with the newer value winning', () => {
    expect(mergeChanges({ records: { plan: 1, survey: 1 }, touch: false }, { records: { plan: 2 }, meta: { name: 'n' }, touch: false })).toEqual({
      records: { plan: 2, survey: 1 },
      meta: { name: 'n' },
      touch: false,
    })
    expect(mergeChanges({ touch: false }, {}).touch).toBe(true)
  })
})

describe('moving the old single project in', () => {
  const plan = () => ({ ...garageFloor(), name: '' })
  let legacyDb: UseStore
  let prefs: Map<string, string>
  const source = () => legacySource({ db: legacyDb, prefs: { getItem: (k: string) => prefs.get(k) ?? null } })

  beforeEach(async () => {
    legacyDb = createStore(`keyval-test-${n}`, 'keyval')
    prefs = new Map([
      ['view-v1', JSON.stringify({ mode: '3d', exaggeration: 2 })],
      ['print-v1', JSON.stringify({ paper: 'A4' })],
    ])
    await idbSet('project-v1', syntheticSurvey(), legacyDb)
    await idbSet('plan-v1', plan(), legacyDb)
  })

  it('makes them the first project, named "My house" when the plan has no name', async () => {
    const res = await migrateLegacy(local, local, source())
    expect(res?.verified).toBe(true)
    const list = await local.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(res!.projectId)
    expect(list[0].name).toBe('My house')
    expect(list[0].surveyFileName).toBe('plane.dxf')
    const recs = await local.read(res!.projectId)
    expect(recs?.survey).toEqual(syntheticSurvey())
    expect(recs?.plan).toEqual(plan())
    expect(recs?.prefs).toEqual({ view: { mode: '3d', exaggeration: 2 }, print: { paper: 'A4' } })
    // Read back fine, so the old survey and plan are gone; the device's view and print defaults stay.
    expect(await idbGet('project-v1', legacyDb)).toBeUndefined()
    expect(await idbGet('plan-v1', legacyDb)).toBeUndefined()
    expect(prefs.has('view-v1')).toBe(true)
  })

  it('takes the plan’s project name when it has one', async () => {
    await idbSet('plan-v1', { ...plan(), name: 'Hilltop house' }, legacyDb)
    await migrateLegacy(local, local, source())
    expect((await local.list())[0].name).toBe('Hilltop house')
  })

  it('is harmless to run twice', async () => {
    const first = await migrateLegacy(local, local, source())
    expect(await migrateLegacy(local, local, source())).toBeNull()
    expect((await local.list()).map(p => p.id)).toEqual([first!.projectId])
  })

  it('keeps the old keys until the copy reads back the same', async () => {
    // A store that hands back something different from what was written.
    const garbled: ProjectStore = { ...local, read: async () => ({ survey: { fileName: 'wrong' }, plan: null }) }
    const res = await migrateLegacy(garbled, local, source())
    expect(res?.verified).toBe(false)
    expect(await idbGet('project-v1', legacyDb)).toEqual(syntheticSurvey())
    expect(await idbGet('plan-v1', legacyDb)).toEqual(plan())
    // Next load, with a store that reads back properly: same project, no duplicate, old keys gone.
    const again = await migrateLegacy(local, local, source())
    expect(again).toEqual({ projectId: res!.projectId, verified: true })
    expect(await local.list()).toHaveLength(1)
    expect(await idbGet('plan-v1', legacyDb)).toBeUndefined()
  })

  it('finishes the same project after being interrupted before it was written', async () => {
    const failing: ProjectStore = { ...local, create: () => Promise.reject(new Error('interrupted')) }
    await expect(migrateLegacy(failing, local, source())).rejects.toThrow('interrupted')
    expect(await local.list()).toEqual([])
    const res = await migrateLegacy(local, local, source())
    expect(res?.verified).toBe(true)
    expect(await local.list()).toHaveLength(1)
  })

  it('keeps later saves from an old tab as a project of their own', async () => {
    const first = await migrateLegacy(local, local, source())
    // An old tab, still open, saves the plan again under the old key.
    await idbSet('plan-v1', { ...plan(), walls: [] }, legacyDb)
    const second = await migrateLegacy(local, local, source())
    expect(second?.projectId).not.toBe(first?.projectId)
    const names = (await local.list()).map(p => p.name).sort()
    expect(names).toEqual(['My house', 'My house 2'])
    expect(((await local.read(second!.projectId))!.plan as { walls: unknown[] }).walls).toEqual([])
  })

  it('does nothing when there is no old project', async () => {
    const empty = createStore(`keyval-empty-${n}`, 'keyval')
    expect(await migrateLegacy(local, local, legacySource({ db: empty, prefs: null }))).toBeNull()
    expect(await local.list()).toEqual([])
  })

  it('moves a plan with no survey (after Replace), so the plan is not lost', async () => {
    const only = createStore(`keyval-plan-${n}`, 'keyval')
    await idbSet('plan-v1', plan(), only)
    const res = await migrateLegacy(local, local, legacySource({ db: only, prefs: null }))
    expect(await local.read(res!.projectId)).toEqual({ plan: plan() })
  })
})

describe('opening a project file', () => {
  it('creates a new project and leaves the others alone', async () => {
    const mine = await local.create({ name: 'Mine', records: { survey: syntheticSurvey(), plan: garageFloor() } })
    const shared = { ...garageFloor(), name: 'Builder’s copy' }
    const text = projectFileText(syntheticSurvey(), shared)
    expect(JSON.parse(text).name).toBe('Builder’s copy')
    const p = await createFromProjectFile(local, text)
    expect(p.id).not.toBe(mine.id)
    expect(p.name).toBe('Builder’s copy')
    expect(p.surveyFileName).toBe('plane.dxf')
    expect(((await local.read(p.id))!.plan as { name: string }).name).toBe('Builder’s copy')
    expect((await local.read(mine.id))?.plan).toEqual(garageFloor())
    // Opening the same file again makes another project rather than overwriting.
    expect((await createFromProjectFile(local, text)).name).toBe('Builder’s copy 2')
    expect(await local.list()).toHaveLength(3)
  })

  it('opens older files with no name, and names them from the plan or "Shared project"', async () => {
    const old = JSON.parse(projectFileText(syntheticSurvey(), garageFloor()))
    delete old.name
    expect((await createFromProjectFile(local, JSON.stringify(old))).name).toBe('Shared project')
  })

  it('refuses a file that is not a project and creates nothing', async () => {
    await expect(createFromProjectFile(local, '{"version":1,"walls":[]}')).rejects.toThrow(/not a Contour & Gable project/)
    expect(await local.list()).toEqual([])
  })
})

describe('the in-memory fallback store', () => {
  it('behaves like the local store', async () => {
    const mem = createMemoryProjectStore(now)
    const p = await mem.create({ name: 'Mem', records: { plan: garageFloor() } })
    const copy = await duplicateProject(mem, p.id)
    expect(await mem.read(copy.id)).toEqual(await mem.read(p.id))
    expect((await mem.save(p.id, { meta: { name: 'Renamed' } })).revision).toBe(2)
    await expect(mem.remove(p.id)).rejects.toBeInstanceOf(NotArchivedError)
    await archiveProject(mem, p.id)
    await mem.remove(p.id)
    expect((await mem.list()).map(m => m.id)).toEqual([copy.id])
  })
})
