import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ensureProjects, projectActions, projectsNow, registerRecordKind } from '../session'

// A feature's own per-project record (site features' `site`, say), through the session the app uses.
describe('a record kind of a feature’s own', () => {
  it('loads with each project, saves to the one open, and is copied by Duplicate', async () => {
    await ensureProjects()
    const seen: unknown[] = []
    const saveSite = registerRecordKind<{ version: 1; trees: number }>('site', v => seen.push(v))

    const a = await projectActions.create({ survey: { fileName: 'a.dxf', dxfText: '', roles: {} } })
    expect(seen.at(-1)).toBeUndefined()
    await saveSite({ version: 1, trees: 3 })
    await projectActions.flush()
    expect((await projectActions.read(a.id))?.site).toEqual({ version: 1, trees: 3 })

    const b = await projectActions.create({ survey: { fileName: 'b.dxf', dxfText: '', roles: {} } })
    expect(projectsNow().currentId).toBe(b.id)
    expect(seen.at(-1)).toBeUndefined()

    await projectActions.open(a.id)
    expect(seen.at(-1)).toEqual({ version: 1, trees: 3 })

    const c = await projectActions.duplicate(a.id)
    expect((await projectActions.read(c.id))?.site).toEqual({ version: 1, trees: 3 })
    expect((await projectActions.read(b.id))?.site).toBeUndefined()

    // archiving the open project closes it, and the feature hears that nothing is open
    await projectActions.archive(a.id)
    expect(projectsNow().currentId).toBeNull()
    expect(seen.at(-1)).toBeUndefined()
  })

  it('keeps the app’s own kinds to the app', () => {
    expect(() => registerRecordKind('plan', () => {})).toThrow()
    expect(() => registerRecordKind('survey', () => {})).toThrow()
  })
})
