// What every ProjectStore must do (src/projects/types.ts), as tests any store can run: this
// browser's IndexedDB, the in-memory fallback, and the cloud. Synthetic data only.

import { describe, expect, it } from 'vitest'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { archiveProject, deleteProject, duplicateProject, renameProject, restoreProject } from '../../projects/ops'
import { NotArchivedError, type ProjectStore } from '../../projects/types'

export interface ContractStore {
  store: ProjectStore
  /** Move the store's clock on (ms). */
  tick(ms: number): void
}

const survey = () => ({ fileName: 'plane.dxf', dxfText: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', roles: { CONTOURS: 'contours' } })

export function projectStoreContract(name: string, make: () => Promise<ContractStore>) {
  describe(`${name}: the ProjectStore contract`, () => {
    it('creates projects and lists them, most recently edited first', async () => {
      const { store, tick } = await make()
      const a = await store.create({ name: 'First', records: { survey: survey(), plan: garageFloor() } })
      tick(1000)
      const b = await store.create({ name: 'Second' })
      expect(a.revision).toBe(1)
      expect(a.archived).toBe(false)
      expect(a.id).not.toBe(b.id)
      expect((await store.list()).map(p => p.name)).toEqual(['Second', 'First'])
      expect(await store.get(a.id)).toEqual(a)
      const recs = await store.read(a.id)
      expect(recs?.plan).toEqual(garageFloor())
      expect(recs?.survey).toEqual(survey())
      expect(await store.read(b.id)).toEqual({})
      expect(await store.read('p_missing')).toBeNull()
      expect(await store.get('p_missing')).toBeNull()
    })

    it('keeps records it knows nothing about, as they are, and reads just the kinds asked for', async () => {
      const { store } = await make()
      const site = { version: 1, features: [{ id: 't1', kind: 'tree', at: [1, 2] }], note: 'ünïcödé “quotes”' }
      const p = await store.create({ name: 'Opaque', records: { survey: survey(), site } })
      expect((await store.read(p.id))?.site).toEqual(site)
      expect(await store.read(p.id, ['site'])).toEqual({ site })
      expect(await store.read(p.id, ['nothing'])).toEqual({})
    })

    it('bumps the revision on every save, and moves "updated" only for edits', async () => {
      const { store, tick } = await make()
      const p = await store.create({ name: 'Rev', records: { plan: garageFloor() } })
      tick(5000)
      const edited = await store.save(p.id, { records: { plan: { ...garageFloor(), name: 'x' } } })
      expect(edited.revision).toBe(2)
      expect(edited.updated).toBe(p.updated + 5000)
      tick(5000)
      const prefs = await store.save(p.id, { records: { prefs: { view: { mode: '3d' } } }, touch: false })
      expect(prefs.revision).toBe(3)
      expect(prefs.updated).toBe(edited.updated)
      expect(prefs.created).toBe(p.created)
      expect((await store.get(p.id))?.revision).toBe(3)
    })

    it('removes a record when a save passes null, and keeps the others', async () => {
      const { store } = await make()
      const p = await store.create({ name: 'Null', records: { survey: survey(), plan: garageFloor() } })
      await store.save(p.id, { records: { survey: null } })
      expect(await store.read(p.id)).toEqual({ plan: garageFloor() })
    })

    it('refuses to save to a project that does not exist, and to create one twice', async () => {
      const { store } = await make()
      await expect(store.save('p_nope', { meta: { name: 'x' } })).rejects.toThrow(/no project/)
      expect(await store.list()).toEqual([])
      await store.create({ name: 'Once', id: 'p_once' })
      await expect(store.create({ name: 'Twice', id: 'p_once' })).rejects.toThrow(/already exists/)
    })

    it('duplicates as a deep copy with a new id, renames, archives and restores', async () => {
      const { store } = await make()
      const p = await store.create({ name: 'House A', records: { survey: survey(), plan: garageFloor(), prefs: { print: { paper: 'A4' } } } })
      const copy = await duplicateProject(store, p.id)
      expect(copy.name).toBe('Copy of House A')
      expect(await store.read(copy.id)).toEqual(await store.read(p.id))
      const changed = garageFloor()
      changed.walls = changed.walls.slice(1)
      await store.save(p.id, { records: { plan: changed } })
      expect(((await store.read(copy.id))!.plan as { walls: unknown[] }).walls).toHaveLength(garageFloor().walls.length)
      expect((await renameProject(store, p.id, '  New name ')).name).toBe('New name')
      expect((await archiveProject(store, p.id)).archived).toBe(true)
      expect((await store.read(p.id))?.plan).toEqual(changed)
      expect((await restoreProject(store, p.id)).archived).toBe(false)
    })

    it('deletes only when archived, and then takes every record with it', async () => {
      const { store } = await make()
      const p = await store.create({ name: 'Doomed', records: { survey: survey(), plan: garageFloor() } })
      const keep = await store.create({ name: 'Keeper', records: { plan: garageFloor() } })
      await expect(deleteProject(store, p.id)).rejects.toBeInstanceOf(NotArchivedError)
      await archiveProject(store, p.id)
      await deleteProject(store, p.id)
      expect(await store.get(p.id)).toBeNull()
      expect(await store.read(p.id)).toBeNull()
      expect((await store.list()).map(m => m.id)).toEqual([keep.id])
      expect((await store.read(keep.id))?.plan).toEqual(garageFloor())
      // Deleting what isn't there is harmless.
      await store.remove(p.id)
    })
  })
}
