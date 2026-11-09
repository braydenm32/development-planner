import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, guessRoles } from '../../lib/survey'
import { garageFloor } from '../../plan/__tests__/fixtures'
import type { Plan } from '../../plan/model'
import { normalizeOptions, optionsForFile, singleOption, switchedTo, type OptionsRecord } from '../model'
import { parseProjectFile, projectFileText } from '../../share/project'

// Synthetic data only: the tilted-plane test block and the test garage.
const survey = () => {
  const dxfText = planeSurvey()
  return { fileName: 'plane.dxf', dxfText, roles: guessRoles(analyzeLayers(parseDxf(dxfText))) }
}
const ffl = (p: Plan | null | undefined) => p?.placement.ffl
const withFfl = (v: number): Plan => ({ ...garageFloor(), placement: { ...garageFloor().placement, ffl: v } })

/** The app as a fresh page load sees it: new modules over the same IndexedDB. */
async function load() {
  vi.resetModules()
  const session = await import('../../projects/session')
  const history = await import('../../projects/undoHistory')
  const options = await import('../store')
  const { usePlan } = await import('../../plan/store')
  await session.ensureProjects()
  const settle = async () => {
    await history.flushHistory()
    await session.projectActions.flush()
  }
  return { session, options, st: () => usePlan.getState(), settle, actions: session.projectActions, rec: () => options.useOptions.getState().rec }
}

describe('a project with no options', () => {
  it('is one option, "Option 1", with nothing saved and nothing for the person to do', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: garageFloor() })
    expect(app.rec()).toEqual(singleOption())
    expect(app.rec().items.map(i => i.name)).toEqual(['Option 1'])
    expect((await app.actions.read(id))?.options).toBeUndefined()
    // an older project's records never gain one just by opening it
    await app.settle()
    expect((await app.actions.read(id))?.options).toBeUndefined()
  })

  it('unreadable options records are ignored rather than stopping the project', () => {
    expect(normalizeOptions(undefined)).toBeNull()
    expect(normalizeOptions({ version: 2 })).toBeNull()
    expect(normalizeOptions({ version: 1, current: 'x', items: [{ id: 'y', name: 'Y' }] })).toBeNull()
    // another option with no plan to show is dropped
    const r = normalizeOptions({ version: 1, current: 'a', items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: ' ', plan: garageFloor() }] })!
    expect(r.items.map(i => i.id)).toEqual(['a', 'c'])
    expect(r.items[1].name).toBe('Option 2')
  })
})

describe('copying, opening, renaming and deleting', () => {
  it('copies the design into a new option and opens it; each keeps its own plan, and Undo never crosses', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: withFfl(45) })
    await app.options.renameOption(app.rec().current, 'Slab')
    const copied = await app.options.copyOption('Piers')
    expect(copied).toBeTruthy()
    expect(app.rec().items.map(i => i.name)).toEqual(['Slab', 'Piers'])
    expect(app.rec().current).toBe(copied)
    expect(ffl(app.st().plan)).toBe(45)

    // Work in Piers: two undoable steps.
    app.st().commit(p => ({ ...p, placement: { ...p.placement, ffl: 46 } }))
    app.st().commit(p => ({ ...p, placement: { ...p.placement, ffl: 47 } }))
    expect(app.st().past.length).toBe(2)
    await app.settle()

    // Back to Slab: it is as it was, and there is nothing to undo into Piers' steps.
    const slabId = app.rec().items[0].id
    await app.options.openOption(slabId)
    expect(ffl(app.st().plan)).toBe(45)
    expect(app.st().past).toHaveLength(0)
    expect(app.st().future).toHaveLength(0)
    await app.settle()
    const saved = await app.actions.read(id)
    expect(ffl(saved?.plan as Plan)).toBe(45)
    expect(saved?.history).toBeUndefined()
    const stored = saved?.options as OptionsRecord
    expect(stored.current).toBe(slabId)
    expect(ffl(stored.items.find(i => i.name === 'Piers')?.plan)).toBe(47)
    expect(stored.items.find(i => i.id === slabId)?.plan).toBeUndefined()

    // After a reload the same: Slab open, Undo empty, Piers waiting with its own plan.
    const again = await load()
    await again.actions.open(id)
    expect(again.rec().current).toBe(slabId)
    expect(ffl(again.st().plan)).toBe(45)
    expect(again.st().past).toHaveLength(0)
    await again.options.openOption(copied!)
    expect(ffl(again.st().plan)).toBe(47)
  })

  it('never writes a waiting edit to the wrong option when switching', async () => {
    const app = await load()
    await app.actions.create({ survey: survey(), plan: withFfl(45) })
    const first = app.rec().current
    await app.options.copyOption('Other')
    app.st().commit(p => ({ ...p, placement: { ...p.placement, ffl: 50 } })) // waiting, not yet saved
    await app.options.openOption(first)
    expect(ffl(app.st().plan)).toBe(45)
    await app.options.openOption(app.rec().items[1].id)
    expect(ffl(app.st().plan)).toBe(50)
  })

  it('renames, keeping names different', async () => {
    const app = await load()
    await app.actions.create({ survey: survey(), plan: garageFloor() })
    const one = app.rec().current
    await app.options.copyOption('Piers')
    await app.options.renameOption(one, 'Piers')
    expect(app.rec().items.map(i => i.name)).toEqual(['Piers 2', 'Piers'])
    await expect(app.options.renameOption(one, '  ')).rejects.toThrow()
  })

  it('deletes with Undo, including the open one, and always leaves one', async () => {
    const app = await load()
    await app.actions.create({ survey: survey(), plan: withFfl(45) })
    const a = app.rec().current
    expect(await app.options.removeOption(a)).toBeNull() // the only one stays
    const b = (await app.options.copyOption('B'))!
    app.st().commit(p => ({ ...p, placement: { ...p.placement, ffl: 48 } }))

    // delete the open one (B): A opens, and Undo brings B back, open, with its edit
    const removed = (await app.options.removeOption(b))!
    expect(app.rec().items.map(i => i.id)).toEqual([a])
    expect(app.rec().current).toBe(a)
    expect(ffl(app.st().plan)).toBe(45)
    await app.options.restoreOption(removed)
    expect(app.rec().items.map(i => i.id)).toEqual([a, b])
    expect(app.rec().current).toBe(b)
    expect(ffl(app.st().plan)).toBe(48)

    // delete one that isn't open
    const gone = (await app.options.removeOption(a))!
    expect(app.rec().items.map(i => i.id)).toEqual([b])
    await app.options.restoreOption(gone)
    expect(app.rec().items.map(i => i.id)).toEqual([a, b])
    await app.options.openOption(a)
    expect(ffl(app.st().plan)).toBe(45)
  })

  it('is kept by Duplicate project, and each copy keeps its own options', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: withFfl(45) })
    await app.options.copyOption('Piers')
    await app.settle()
    const copy = await app.actions.duplicate(id)
    const r = (await app.actions.read(copy.id))?.options as OptionsRecord
    expect(r.items.map(i => i.name)).toEqual(['Option 1', 'Piers'])
  })
})

describe('the project file', () => {
  it('carries every option and reads back the same', async () => {
    const app = await load()
    const { id } = await app.actions.create({ survey: survey(), plan: withFfl(45) })
    await app.options.renameOption(app.rec().current, 'Slab')
    await app.options.copyOption('Piers')
    app.st().commit(p => ({ ...p, placement: { ...p.placement, ffl: 47 } }))
    await app.settle()
    const r = (await app.actions.read(id))!
    const text = projectFileText(r.survey as never, r.plan as Plan, undefined, undefined, r.options)
    const back = parseProjectFile(text)
    expect(back.options?.items.map(i => i.name)).toEqual(['Slab', 'Piers'])
    expect(ffl(back.plan)).toBe(47)
    expect(ffl(back.options!.items.find(i => i.name === 'Slab')?.plan)).toBe(45)
    expect(back.options!.current).toBe((r.options as OptionsRecord).current)

    // opening that file makes a new project with the options in it, and they work
    const meta = await app.actions.openFile(text)
    expect(app.rec().items.map(i => i.name)).toEqual(['Slab', 'Piers'])
    expect(ffl(app.st().plan)).toBe(47)
    await app.options.openOption(app.rec().items[0].id)
    expect(ffl(app.st().plan)).toBe(45)
    expect(meta.id).not.toBe(id)
  })

  it('reads an older file, with no options, as one option', () => {
    const text = projectFileText(survey(), garageFloor())
    expect(JSON.parse(text).options).toBeUndefined()
    expect(parseProjectFile(text).options).toBeNull()
    // and a project that is only its one unnamed option adds nothing to the file
    expect(projectFileText(survey(), garageFloor(), undefined, undefined, singleOption())).not.toContain('"options"')
    expect(optionsForFile(singleOption())).toBeUndefined()
    const named = { ...singleOption(), items: [{ id: 'option-1', name: 'Slab' }] }
    expect(optionsForFile(named)?.items[0].name).toBe('Slab')
  })

  it('switchedTo files the open plan under the option it leaves', () => {
    const rec: OptionsRecord = { version: 1, current: 'a', items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', plan: withFfl(9) }] }
    const { rec: next, plan } = switchedTo(rec, 'b', withFfl(5))
    expect(ffl(plan)).toBe(9)
    expect(next.current).toBe('b')
    expect(ffl(next.items[0].plan)).toBe(5)
    expect(next.items[1].plan).toBeUndefined()
    expect(() => switchedTo(rec, 'zzz', withFfl(5))).toThrow()
  })
})
