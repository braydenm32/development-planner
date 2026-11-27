// Kinds of door and window (CB-18): names, usual sizes, plan symbols, and older plans left alone.

import { beforeEach, describe, expect, it } from 'vitest'
import { doorWindowSchedule } from '../../export/schedule'
import { DOOR_DEFAULT, normalizePlan, WINDOW_DEFAULT, type Opening } from '../model'
import { DOOR_STYLES, openingName, openingStyle, setOpeningStyle, styleSize, styleSymbol, WINDOW_STYLES } from '../openingStyles'
import { addOpening } from '../ops'
import { usePlan } from '../store'
import { applyToolDefaults, currentToolDefaults, toolDefaultsRecord } from '../toolDefaults'
import { garageFloor } from './fixtures'

const door = (patch: Partial<Opening> = {}): Opening => ({ id: 'd', wall: 'south', kind: 'door', offset: 2, ...DOOR_DEFAULT, flipHinge: false, flipSwing: false, ...patch })
const win = (patch: Partial<Opening> = {}): Opening => ({ id: 'w', wall: 'south', kind: 'window', offset: 2, ...WINDOW_DEFAULT, flipHinge: false, flipSwing: false, ...patch })

beforeEach(() => usePlan.getState().load(normalizePlan(garageFloor())))

describe('a door or window saved before kinds', () => {
  it('opens exactly as it was saved', () => {
    const p = garageFloor()
    expect(normalizePlan(p).openings).toEqual(p.openings)
    expect(p.openings.every(o => !('style' in o))).toBe(true)
  })

  it('is a hinged door, or a window of no kind, named and drawn as before', () => {
    expect(openingStyle(door())).toBe('hinged')
    expect(openingStyle(win())).toBeUndefined()
    expect(openingName(door())).toBe('Door')
    expect(openingName(win())).toBe('Window')
    expect(openingName({ kind: 'garage' })).toBe('Garage door')
    // No symbol of its own: the plan and the PDF draw the swing and the two glass lines they always did.
    expect(styleSymbol(door(), [0, 0], [0.82, 0], [0, 1], 0.15)).toBeNull()
    expect(styleSymbol(win(), [0, 0], [1.2, 0], [0, 1], 0.15)).toBeNull()
    expect(styleSymbol({ ...door(), kind: 'opening' }, [0, 0], [1, 0], [0, 1], 0.15)).toBeNull()
  })

  it('keeps the same schedule rows', () => {
    expect(doorWindowSchedule(garageFloor()).map(r => r.type)).toEqual(['Door', 'Door', 'Window', 'Opening', 'Opening'])
  })
})

describe('kinds', () => {
  it('a kind only counts on what it suits: a door changed to a window drops its door kind', () => {
    expect(openingStyle(door({ style: 'bifold' }))).toBe('bifold')
    expect(openingStyle(win({ style: 'bifold' }))).toBeUndefined()
    expect(openingStyle(door({ style: 'awning' }))).toBe('hinged')
    expect(openingStyle(win({ style: 'sliding' }))).toBe('sliding')
    expect(openingStyle(door({ style: 'sliding' }))).toBe('sliding')
  })

  it('names each kind for the schedule and the drawings', () => {
    expect(DOOR_STYLES.map(s => openingName(door({ style: s.id })))).toEqual(['Door', 'Sliding door', 'Double door', 'Bifold door'])
    expect(WINDOW_STYLES.map(s => openingName(win({ style: s.id })))).toEqual(['Sliding window', 'Awning window', 'Double-hung window', 'Fixed window'])
    const p = garageFloor()
    p.openings[1] = { ...p.openings[1], style: 'sliding' }
    p.openings[3] = { ...p.openings[3], style: 'awning' }
    expect(doorWindowSchedule(p).map(r => r.type)).toEqual(['Sliding door', 'Door', 'Awning window', 'Opening', 'Opening'])
  })

  it('every kind but the hinged door has a plan symbol that stays between its jambs along the wall', () => {
    for (const s of [...DOOR_STYLES.filter(x => x.id !== 'hinged').map(x => door({ style: x.id, width: x.size.width })), ...WINDOW_STYLES.map(x => win({ style: x.id, width: x.size.width }))]) {
      const sym = styleSymbol(s, [1, 5], [1 + s.width, 5], [0, 1], 0.135)!
      expect(sym, s.style).not.toBeNull()
      const pts = [...sym.lines, ...sym.light].flat()
      expect(pts.length).toBeGreaterThan(3)
      for (const p of pts) {
        expect(p[0]).toBeGreaterThanOrEqual(1 - 1e-9)
        expect(p[0]).toBeLessThanOrEqual(1 + s.width + 1e-9)
      }
    }
  })

  it('a double or bifold door swings to the side its Flip swing says', () => {
    const side = (o: Opening) => Math.max(...styleSymbol(o, [0, 0], [o.width, 0], [0, 1], 0.1)!.lines.flat().map(p => p[1] * (o.flipSwing ? -1 : 1)))
    for (const style of ['double', 'bifold'] as const) {
      expect(side(door({ style, width: 1.64 }))).toBeGreaterThan(0.3)
      expect(side(door({ style, width: 1.64, flipSwing: true }))).toBeGreaterThan(0.3)
    }
  })
})

describe('changing the kind', () => {
  it('takes the new kind’s usual size while the size is still the usual one', () => {
    const p = { ...garageFloor(), openings: [door({ id: 'd' })] }
    const sliding = setOpeningStyle(p, 'd', 'sliding').openings[0]
    expect(sliding).toMatchObject({ style: 'sliding', width: 2.1, height: 2.1, sill: 0 })
    const back = setOpeningStyle({ ...p, openings: [sliding] }, 'd', 'hinged').openings[0]
    expect(back).toMatchObject({ style: 'hinged', width: 0.82, height: 2.04 })
  })

  it('keeps a size that was typed', () => {
    const p = { ...garageFloor(), openings: [door({ id: 'd', width: 0.92 })] }
    expect(setOpeningStyle(p, 'd', 'bifold').openings[0]).toMatchObject({ style: 'bifold', width: 0.92, height: 2.04 })
  })

  it('takes a window back to no kind, and ignores a kind that doesn’t suit', () => {
    const p = { ...garageFloor(), openings: [win({ id: 'w', style: 'awning', ...styleSize('window', 'awning')! })] }
    const plain = setOpeningStyle(p, 'w', undefined).openings[0]
    expect('style' in plain).toBe(false)
    expect(plain).toMatchObject(WINDOW_DEFAULT)
    expect(setOpeningStyle(p, 'w', 'bifold')).toBe(p)
    expect(setOpeningStyle(p, 'w', 'awning')).toBe(p)
  })
})

describe('the tools', () => {
  it('a new door or window is the kind the tool is set to', () => {
    const p = garageFloor()
    const south = p.walls.find(w => w.id === 'south')!
    const o = addOpening(p, south, 'door', 2, { ...styleSize('door', 'sliding')!, style: 'sliding' }).openings.at(-1)!
    expect(o).toMatchObject({ kind: 'door', style: 'sliding', width: 2.1 })
    // A kind that doesn't suit the tool is left off.
    const w = addOpening(p, south, 'window', 2, { ...WINDOW_DEFAULT, style: 'bifold' }).openings.at(-1)!
    expect('style' in w).toBe(false)
    expect('style' in addOpening(p, south, 'door', 2, DOOR_DEFAULT).openings.at(-1)!).toBe(false)
  })

  it('the kind is kept with the project’s tool settings, and one that doesn’t suit is dropped', () => {
    const cur = currentToolDefaults()
    const saved = toolDefaultsRecord({ ...cur, openingDefaults: { ...cur.openingDefaults, door: { width: 2.1, height: 2.1, sill: 0, style: 'sliding' }, window: { ...WINDOW_DEFAULT, style: 'bifold' } } })
    const back = applyToolDefaults(cur, JSON.parse(JSON.stringify(saved)))
    expect(back.openingDefaults.door).toEqual({ width: 2.1, height: 2.1, sill: 0, style: 'sliding' })
    expect(back.openingDefaults.window).toEqual(WINDOW_DEFAULT)
  })
})
