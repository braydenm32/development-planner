import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { nameFromFile, nameFromLot } from '../ops'
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

describe('a new project’s name', () => {
  it('comes from the file or the address it starts from', () => {
    expect(nameFromFile('sample-block.dxf')).toBe('Sample block')
    expect(nameFromFile('C:\\surveys\\job_204__contours.DXF')).toBe('Job 204 contours')
    expect(nameFromFile('levels.xml')).toBe('Levels')
    expect(nameFromFile('.dxf')).toBeNull()
    expect(nameFromLot({ label: 'Lot 4 DP12345', address: '12 Example St, Sampletown NSW 2000' })).toBe('12 Example St')
    expect(nameFromLot({ label: 'Lot 4 DP12345' })).toBe('Lot 4 DP12345')
  })

  it('is the one given, made free, or My house / New house without one', async () => {
    await ensureProjects()
    const survey = { fileName: 'sample-block.dxf', dxfText: '', roles: {} }
    const a = await projectActions.create({ survey }, 'Sample block')
    const b = await projectActions.create({ survey }, 'Sample block')
    const c = await projectActions.create({ survey })
    expect(a.name).toBe('Sample block')
    expect(b.name).toBe('Sample block 2')
    expect(c.name).toMatch(/^New house/)
  })
})
