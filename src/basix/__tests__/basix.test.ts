import { describe, expect, it } from 'vitest'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan, type Opening, type Plan } from '../../plan/model'
import { addRoof } from '../../plan/ops'
import { levelOutlines } from '../../plan/roof'
import { basixOf } from '../model'
import { BASIX_LINKS, basixCsv, basixFacts, checklistRows, compassOf, facadeOf, floorAreas, livingOrientations, readyCount, windowAreaByFacade, windowFacings } from '../basix'

const win = (id: string, wall: string, offset: number, width = 1.2, height = 1.2): Opening => ({ id, wall, kind: 'window', offset, width, height, sill: 0.9, flipHinge: false, flipSwing: false })

describe('which way a window faces', () => {
  it('turns a plan direction into a compass bearing, with the plan turned on the site', () => {
    expect(compassOf([0, 1], 0)).toBe(0) // +y is north when the plan is not turned
    expect(compassOf([1, 0], 0)).toBe(90)
    expect(compassOf([0, -1], 0)).toBe(180)
    expect(compassOf([-1, 0], 0)).toBe(270)
    expect(compassOf([1, 0], 90)).toBe(0) // turned 90° anticlockwise, +x points north
    expect(facadeOf(44)).toBe('N')
    expect(facadeOf(46)).toBe('E')
    expect(facadeOf(359)).toBe('N')
  })

  it('sums window area per facade from the windows on outside walls, and skips inside walls', () => {
    // The garage floor has one window, on the east wall (x = 9.95, outside to +x).
    const plan = garageFloor()
    const f = windowFacings(plan)
    expect(f).toHaveLength(1)
    expect(f[0].facade).toBe('E')
    expect(f[0].area).toBeCloseTo(1.8 * 1.2, 9)
    // Add a window on the south wall and one on the garage's west wall, and one on the hall wall where
    // it runs between the garage and the hall (7 m from its start; its first 3.3 m face the patio outside).
    const more: Plan = { ...plan, openings: [...plan.openings, win('s', 'south', 2), win('w', 'garage_w', 3, 2, 1), win('hall', 'hall_w', 7)] }
    const by = windowAreaByFacade(more)
    expect(by.E).toBeCloseTo(2.16, 9)
    expect(by.S).toBeCloseTo(1.44, 9)
    expect(by.W).toBeCloseTo(2, 9)
    expect(by.N).toBe(0)
    expect(windowFacings(more).some(x => x.wall.id === 'hall_w')).toBe(false)
  })

  it('follows the plan when it is turned on the site', () => {
    const plan = garageFloor()
    const turned: Plan = { ...plan, placement: { ...plan.placement, rotation: 90 } }
    // Turned 90° anticlockwise, the east wall's outside (+x) faces north.
    expect(windowFacings(turned)[0].facade).toBe('N')
    const back: Plan = { ...plan, placement: { ...plan.placement, rotation: 180 } }
    expect(windowFacings(back)[0].facade).toBe('W')
  })
})

describe('living areas and floor area', () => {
  it('names the facade each living area mostly looks to', () => {
    const plan = garageFloor()
    // Call the study a living room: its only window is the east one.
    const living: Plan = { ...plan, rooms: plan.rooms.map(r => (r.id === 'r4' ? { ...r, name: 'Living' } : r)) }
    const o = livingOrientations(living)
    expect(o).toHaveLength(1)
    expect(o[0].room).toBe('Living')
    expect(o[0].main).toBe('E')
    expect(o[0].windows.E).toBeCloseTo(2.16, 9)
    // The laundry becomes a kitchen with no outside window yet.
    const kitchen: Plan = { ...plan, rooms: plan.rooms.map(r => (r.id === 'r3' ? { ...r, name: 'Kitchen' } : r)) }
    expect(livingOrientations(kitchen)[0].main).toBeNull()
    expect(livingOrientations(plan)).toEqual([])
  })

  it('leaves the garage out of the conditioned floor area', () => {
    const plan = garageFloor()
    const f = floorAreas(plan)
    // The garage floor is about 9.8 × 13.7 m to the outside of its walls, with notches: around 92 m².
    expect(f.gross).toBeGreaterThan(85)
    expect(f.gross).toBeLessThan(100)
    expect(f.garages).toBeGreaterThan(30)
    expect(f.garages).toBeLessThan(f.gross)
    expect(f.conditioned).toBeCloseTo(f.gross - f.garages, 9)
  })
})

describe('the checklist', () => {
  const plan = (() => {
    const p = normalizePlan(garageFloor())
    return addRoof(p, 'level_ground', levelOutlines(p.walls)[0], { type: 'hip', pitch: 22.5, overhang: 0.45 })
  })()

  it('has the plan facts and the person’s answers, each with a plain reason, and no stars or scores', () => {
    const facts = basixFacts(plan)
    const rows = checklistRows(facts, basixOf(plan))
    expect(rows.map(r => r.id)).toEqual(['orientation', 'glazing', 'floor-area', 'roof-tank', 'insulation', 'hot-water', 'heating', 'cooling', 'lighting', 'pool'])
    expect(rows.filter(r => r.fromPlan)).toHaveLength(4)
    for (const r of rows) {
      expect(r.why.length).toBeGreaterThan(20)
      expect(r.value.length).toBeGreaterThan(0)
      expect(r.value + r.why).not.toMatch(/star|score|pass|fail/i)
    }
    expect(rows[1].value).toMatch(/East 2\.2 m²/)
    expect(rows[3].value).toMatch(/not set yet/)
    expect(facts.roofArea).toBeGreaterThan(100)
    expect(facts.glazingRatio).toBeGreaterThan(0)
  })

  it('counts ticked items and keeps answers as plain words', () => {
    const answered: Plan = { ...plan, basix: { done: { glazing: true, 'hot-water': true }, hotWater: 'heat-pump', pool: true, poolLitres: 30000, insulation: 'R4 ceiling' } }
    const rows = checklistRows(basixFacts(answered), basixOf(answered))
    expect(readyCount(rows, basixOf(answered))).toEqual({ done: 2, of: 10 })
    expect(rows.find(r => r.id === 'hot-water')!.value).toBe('Electric heat pump')
    expect(rows.find(r => r.id === 'pool')!.value).toBe('Yes, about 30,000 L')
    expect(rows.find(r => r.id === 'insulation')!.value).toBe('R4 ceiling')
  })

  it('downloads as a CSV that says what it is not, with the links', () => {
    const csv = basixCsv(plan, 'Sample house', '9 November 2026')
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('BASIX checklist: Sample house,9 November 2026,,')
    expect(lines[1]).toMatch(/^This does not calculate a BASIX score or issue a certificate/)
    expect(lines[2]).toBe('Item,From the plan or you,What BASIX asks for,Ready')
    expect(lines).toHaveLength(3 + 10 + BASIX_LINKS.length)
    expect(csv).toContain('https://www.planningportal.nsw.gov.au/BASIX-standards')
    // Commas inside a cell are quoted.
    expect(lines[4]).toMatch(/^Window area by facade,"North/)
  })

  it('loads an old plan with no answers', () => {
    const old = garageFloor()
    expect('basix' in old).toBe(false)
    expect(basixOf(normalizePlan(old))).toEqual({})
    expect(readyCount(checklistRows(basixFacts(old), basixOf(old)), basixOf(old))).toEqual({ done: 0, of: 10 })
  })
})
