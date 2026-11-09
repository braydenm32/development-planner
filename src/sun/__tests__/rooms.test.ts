// Winter sun on a living room's windows, and the day's shadow over the boundary, for a box house
// in Sydney on 21 June.

import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import type { Opening, Plan, Wall } from '../../plan/model'
import { hoursText, overRuns, overText, shadowDiagram, sunFacts, type SiteInput } from '../facts'
import { isLiving, roomWindows } from '../rooms'
import type { Ground } from '../shadow'

const L0 = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2, level = L0): Wall => ({ id, level, a, b, thickness: 0.2, kind: 'external' })
const window = (id: string, wallId: string, offset = 5): Opening => ({ id, wall: wallId, kind: 'window', offset, width: 2, height: 1.2, sill: 0.9, flipHinge: false, flipSwing: false })

/** A 10 × 8 m box, 3 m tall from RL 50, with a living room inside and one window on the side named. */
function house(sides: ('n' | 's' | 'e' | 'w')[], patch: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])],
    openings: sides.map(s => window(`win-${s}`, s, s === 'e' || s === 'w' ? 4 : 5)),
    rooms: [{ id: 'r', level: L0, name: 'Living', at: [5, 4] }],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 0, n: 0, rotation: 0, ffl: 50.3 },
    ...patch,
  }
}

const flat: Ground = { sample: () => 50 }
/** Room all round: the 9 am and 3 pm shadows reach about 6 m west and east. */
const BLOCK: Vec2[] = [
  [-10, -10],
  [20, -10],
  [20, 20],
  [-10, 20],
]
const input = (plan: Plan, ground: Ground = flat, boundary = BLOCK): SiteInput => ({ plan, boundary, origin: [0, 0], ground, date: { year: 2026, month: 6, day: 21 } })
const hours = (plan: Plan, ground?: Ground) => sunFacts(input(plan, ground)).rooms[0]

describe('living areas', () => {
  it('reads a room as a living area by its name, unless it is ticked one way or the other', () => {
    expect(isLiving({ name: 'Living' })).toBe(true)
    expect(isLiving({ name: 'Family room' })).toBe(true)
    expect(isLiving({ name: 'Kitchen / dining' })).toBe(true)
    expect(isLiving({ name: 'Bed 2' })).toBe(false)
    expect(isLiving({ name: 'Living', living: false })).toBe(false)
    expect(isLiving({ name: 'Study', living: true })).toBe(true)
  })

  it('finds the room’s windows to the outside and which way they face', () => {
    const plan = house(['n', 's'])
    const ws = roomWindows(plan, plan.rooms[0], [0, 0])
    expect(ws.map(w => w.opening).sort()).toEqual(['win-n', 'win-s'])
    const north = ws.find(w => w.opening === 'win-n')!
    expect(north.out[0]).toBeCloseTo(0, 9)
    expect(north.out[1]).toBeCloseTo(1, 9)
    // Points just outside the glass, between the sill (RL 51.2) and the head (RL 52.4).
    for (const p of north.pts) {
      expect(p[1]).toBeCloseTo(8.13, 6)
      expect(p[2]).toBeGreaterThan(51.2)
      expect(p[2]).toBeLessThan(52.4)
    }
  })

  it('gives a north window all six hours, a south window none, and east and west the morning and the afternoon', () => {
    const r = hours(house(['n', 's', 'e', 'w']))
    const by = (id: string) => r.windows.find(w => w.opening === id)!
    expect(by('win-n')).toMatchObject({ facing: 'north', hours: 6 })
    expect(by('win-s')).toMatchObject({ facing: 'south', hours: 0 })
    expect(by('win-e').facing).toBe('east')
    expect(by('win-e').hours).toBeGreaterThan(1)
    expect(by('win-e').hours).toBeLessThan(4)
    expect(by('win-w').hours).toBeGreaterThan(1)
    expect(by('win-w').hours).toBeLessThan(4)
    expect(r.hours).toBe(6)
    expect(hoursText(r.hours)).toBe('6 h')
    expect(hoursText(0)).toBe('no sun')
  })

  it('turns with the house: a north window on a house turned 90° faces west', () => {
    const r = hours(house(['n'], { placement: { e: 0, n: 0, rotation: 90, ffl: 50.3 } }))
    expect(r.windows[0].facing).toBe('west')
    expect(r.windows[0].hours).toBeGreaterThan(0)
    expect(r.windows[0].hours).toBeLessThan(6)
  })

  it('loses the sun behind a bank of ground to the north', () => {
    const bank: Ground = { sample: (_x, y) => (y > 9 ? 50 + 2 * (y - 9) : 50) }
    expect(hours(house(['n']), bank).hours).toBe(0)
  })

  it('loses some of it under an upper floor that juts out over the window', () => {
    const upper = [wall('s2', [0, 0], [10, 0], 'up'), wall('e2', [10, 0], [10, 11], 'up'), wall('n2', [10, 11], [0, 11], 'up'), wall('w2', [0, 11], [0, 0], 'up')]
    const two = house(['n'], {
      levels: [
        { id: L0, name: 'Ground floor', elevation: 0, height: 2.7 },
        { id: 'up', name: 'First floor', elevation: 3, height: 2.7 },
      ],
      walls: [...house(['n']).walls, ...upper],
    })
    const r = hours(two)
    expect(r.hours).toBeLessThan(6)
  })

  it('leaves out rooms that aren’t living areas, and rooms with no windows get none', () => {
    expect(sunFacts(input(house(['n'], { rooms: [{ id: 'b', level: L0, name: 'Bed 1', at: [5, 4] }] }))).rooms).toEqual([])
    expect(hours(house([]))).toMatchObject({ windows: [], hours: 0 })
  })
})

describe('the day’s shadow over the boundary', () => {
  it('stays on a roomy block all day', () => {
    const f = sunFacts(input(house(['n'])))
    expect(f.over).toHaveLength(13)
    expect(overRuns(f.over)).toEqual([])
    expect(overText(f)).toBe('The house’s shadow stays on your block from 9 am to 3 pm.')
  })

  it('reaches over the south boundary when the house is close to it', () => {
    // The south side 1 m from the house: winter shadows reach 4 to 5 m south.
    const tight: Vec2[] = [
      [-10, -1.1],
      [20, -1.1],
      [20, 20],
      [-10, 20],
    ]
    const f = sunFacts(input(house(['n']), flat, tight))
    expect(overRuns(f.over)).toEqual([[9 * 60, 15 * 60]])
    expect(overText(f)).toMatch(/^Over the south boundary 9 am to 3 pm, up to \d+\.\d m² of the neighbours’ land\.$/)
    // At noon the sun is 32.7° up, so the 3 m house throws 4.7 m: 3.6 m past the boundary along 10.2 m.
    const noon = f.over.find(o => o.minutes === 12 * 60)!
    expect(noon.area).toBeGreaterThan(10.2 * 3.3)
    expect(noon.area).toBeLessThan(10.2 * 3.9)
  })

  it('draws the shadow diagram at 9 am, 12 pm and 3 pm', () => {
    const d = shadowDiagram(input(house(['n'])))
    expect(d.shadows.map(s => s.minutes)).toEqual([540, 720, 900])
    expect(d.location.place).toBe('Sydney')
    for (const s of d.shadows) expect(s.shadow!.area).toBeGreaterThan(10.2 * 8.2)
    // The morning shadow points south-west, the afternoon one south-east.
    expect(d.shadows[0].shadow!.tip[0]).toBeLessThan(0)
    expect(d.shadows[2].shadow!.tip[0]).toBeGreaterThan(10)
    // An empty plan casts nothing.
    expect(shadowDiagram(input(house([], { walls: [] }))).shadows.every(s => s.shadow === null)).toBe(true)
  })
})
