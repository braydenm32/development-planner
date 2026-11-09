import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { ensureProjects, projectActions, projectsNow } from '../../projects/session'
import { GARAGE_DOOR_DEFAULT } from '../model'
import { usePlan } from '../store'
import { applyToolDefaults, currentToolDefaults, startToolDefaults, toolDefaultsRecord, TOOLS_KIND, type ToolDefaults } from '../toolDefaults'

const base = (): ToolDefaults => ({
  wallStyle: { kind: 'external', thickness: 0.27 },
  openingDefaults: {
    door: { width: 0.82, height: 2.04, sill: 0 },
    window: { width: 1.2, height: 1.2, sill: 0.9 },
    opening: { width: 0.9, height: 2.1, sill: 0 },
    garage: GARAGE_DOOR_DEFAULT,
  },
  roofDefaults: { type: 'hip', pitch: 22.5, overhang: 0.45 },
  roofMode: 'building',
  stairDefaults: { shape: 'straight', width: 0.9, turn: 'left' },
  areaDefault: 'slab',
  furnitureDefaults: { kind: 'bed-queen', rotation: 0 },
})

describe('tool settings read back', () => {
  it('puts back every setting saved', () => {
    const saved: ToolDefaults = {
      wallStyle: { kind: 'internal', thickness: 0.09 },
      openingDefaults: { ...base().openingDefaults, door: { width: 0.92, height: 2.34, sill: 0 }, garage: { width: 5.4, height: 2.4, sill: 0 } },
      roofDefaults: { type: 'gable', pitch: 30, overhang: 0.6 },
      roofMode: 'outline',
      stairDefaults: { shape: 'l', width: 1.0, turn: 'right' },
      areaDefault: 'driveway',
      furnitureDefaults: { kind: 'sofa-3', rotation: 90 },
    }
    expect(applyToolDefaults(base(), toolDefaultsRecord(saved))).toEqual(saved)
  })

  it('keeps the settings in use where a saved one is missing or makes no sense', () => {
    const cur = base()
    const out = applyToolDefaults(cur, {
      version: 1,
      wallStyle: { kind: 'brick', thickness: 0.27 }, // no such kind
      openingDefaults: { door: { width: -1, height: 2, sill: 0 }, window: { width: 1.5, height: 1.0, sill: 1.1 } },
      roofDefaults: { type: 'hip', pitch: 'steep', overhang: 0.45 },
      roofMode: 'sideways',
      areaDefault: 'moat',
    })
    expect(out.wallStyle).toEqual(cur.wallStyle)
    expect(out.openingDefaults.door).toEqual(cur.openingDefaults.door)
    expect(out.openingDefaults.window).toEqual({ width: 1.5, height: 1.0, sill: 1.1 })
    expect(out.openingDefaults.garage).toEqual(GARAGE_DOOR_DEFAULT)
    expect(out.roofDefaults).toEqual(cur.roofDefaults)
    expect(out.roofMode).toBe('building')
    expect(out.stairDefaults).toEqual(cur.stairDefaults)
    expect(out.areaDefault).toBe('slab')
  })

  it('ignores a record from another version, or none', () => {
    const cur = base()
    expect(applyToolDefaults(cur, { version: 2, roofMode: 'outline' })).toBe(cur)
    expect(applyToolDefaults(cur, undefined)).toBe(cur)
    expect(applyToolDefaults(cur, 'tools')).toBe(cur)
  })
})

describe('tool settings kept with each project', () => {
  it('saves a change to the project open, without counting it as an edit, and puts it back on open', async () => {
    await ensureProjects()
    startToolDefaults()
    const a = await projectActions.create({ survey: { fileName: 'a.dxf', dxfText: '', roles: {} } })
    const updated = () => projectsNow().list.find(m => m.id === a.id)!.updated
    const before = updated()
    await new Promise(r => setTimeout(r, 5))

    usePlan.getState().setWallStyle({ kind: 'internal', thickness: 0.09 })
    usePlan.getState().setRoofMode('outline')
    usePlan.getState().setOpeningDefaults('garage', { width: 5.4, height: 2.4, sill: 0 })
    await projectActions.flush()
    const saved = (await projectActions.read(a.id))?.[TOOLS_KIND] as ReturnType<typeof toolDefaultsRecord>
    expect(saved.version).toBe(1)
    expect(saved.wallStyle).toEqual({ kind: 'internal', thickness: 0.09 })
    expect(saved.roofMode).toBe('outline')
    expect(saved.openingDefaults?.garage).toEqual({ width: 5.4, height: 2.4, sill: 0 })
    // A choice, not an edit: the project doesn't jump to the top of All projects.
    expect(updated()).toBe(before)

    // Another project with none saved keeps the settings in use; going back puts a's back.
    await projectActions.create({ survey: { fileName: 'b.dxf', dxfText: '', roles: {} } })
    usePlan.getState().setWallStyle({ kind: 'external', thickness: 0.3 })
    usePlan.getState().setRoofMode('building')
    await projectActions.flush()
    await projectActions.open(a.id)
    expect(currentToolDefaults().wallStyle).toEqual({ kind: 'internal', thickness: 0.09 })
    expect(currentToolDefaults().roofMode).toBe('outline')
    expect(currentToolDefaults().openingDefaults.garage).toEqual({ width: 5.4, height: 2.4, sill: 0 })
  })
})
