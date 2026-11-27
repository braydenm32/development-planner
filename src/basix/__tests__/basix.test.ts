import { describe, expect, it } from 'vitest'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { grossFloorArea } from '../../plan/keyNumbers'
import { normalizePlan, type Opening, type Plan } from '../../plan/model'
import { addRoof } from '../../plan/ops'
import { levelOutlines } from '../../plan/roof'
import { basixOf } from '../model'
import { BASIX_LINKS, basixCsv, basixFacts, basixFileName, checklistRows, compassOf, facadeOf, floorAreas, glassDoorFacings, livingOrientations, onOutsideWall, readyCount, windowAreaByFacade, windowFacings } from '../basix'

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

describe('glass doors in the glazing', () => {
  /** The garage floor's entry door (hinged, in the north outside wall), made another kind or ticked. */
  const withEntry = (patch: Partial<Opening>): Plan => {
    const p = garageFloor()
    return { ...p, openings: p.openings.map(o => (o.id === 'entry' ? { ...o, ...patch } : o)) }
  }

  it('counts a sliding, bifold or double door in an outside wall by default, and a hinged one only when ticked', () => {
    expect(glassDoorFacings(garageFloor())).toEqual([])
    for (const style of ['sliding', 'bifold', 'double'] as const) {
      const f = glassDoorFacings(withEntry({ style }))
      expect(f).toHaveLength(1)
      expect(f[0].facade).toBe('N')
      expect(f[0].area).toBeCloseTo(0.92 * 2.04, 9)
    }
    // Ticked on, a hinged door counts; ticked off, a slider doesn't.
    expect(glassDoorFacings(withEntry({ glazed: true }))).toHaveLength(1)
    expect(glassDoorFacings(withEntry({ style: 'sliding', glazed: false }))).toEqual([])
  })

  it('never counts a door inside the house, ticked or not', () => {
    const p = garageFloor()
    const inside: Plan = { ...p, openings: p.openings.map(o => (o.id === 'office_door' ? { ...o, style: 'sliding', glazed: true } : o)) }
    expect(onOutsideWall(inside, 'office_door')).toBe(false)
    expect(onOutsideWall(inside, 'entry')).toBe(true)
    expect(glassDoorFacings(inside)).toEqual([])
  })

  it('adds windows and glass doors into one total the facades and the ratio agree with', () => {
    const plan = withEntry({ style: 'sliding', width: 2.1, height: 2.1 })
    const f = basixFacts(plan)
    expect(f.windowTotal).toBeCloseTo(2.16, 9)
    expect(f.doorTotal).toBeCloseTo(4.41, 9)
    expect(f.glassTotal).toBeCloseTo(6.57, 9)
    expect(f.glass.N + f.glass.E + f.glass.S + f.glass.W).toBeCloseTo(f.glassTotal, 9)
    expect(f.glass.N).toBeCloseTo(4.41, 9)
    expect(f.glazingRatio).toBeCloseTo(f.glassTotal / f.floor.conditioned, 9)
    const row = checklistRows(f, basixOf(plan)).find(r => r.id === 'glazing')!
    expect(row.value).toMatch(/North 4\.4 m², East 2\.2 m²/)
    expect(row.value).toMatch(/6\.6 m² in all \(windows 2\.2 m², glass doors 4\.4 m²\)/)
    // A living area looking out through only a glass door looks that way.
    const living: Plan = { ...plan, rooms: plan.rooms.map(r => (r.id === 'r2' ? { ...r, name: 'Living' } : r)) }
    expect(livingOrientations(living)[0].main).toBe('N')
  })

  it('opens a door saved before the tick with the default for its kind', () => {
    const old = withEntry({ style: 'bifold' })
    expect('glazed' in old.openings.find(o => o.id === 'entry')!).toBe(false)
    expect(basixFacts(normalizePlan(old)).doorTotal).toBeCloseTo(0.92 * 2.04, 9)
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
    // Both figures are on the inside faces (DB-29): the floor inside its outside walls, less the garage inside its own.
    const g = grossFloorArea(plan)
    expect(f.inside).toBeCloseTo(g.inside, 9)
    expect(f.inside).toBeLessThan(g.outside)
    expect(f.inside).toBeGreaterThan(g.outside - 12)
    expect(f.garages).toBeGreaterThan(30)
    expect(f.garages).toBeLessThan(f.inside)
    expect(f.conditioned).toBeCloseTo(f.inside - f.garages, 9)
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

  it('names the CSV like every other download: the project name in lower case', () => {
    expect(basixFileName('Example split-level house')).toBe('example-split-level-house-basix-checklist.csv')
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
    expect(lines[4]).toMatch(/^Glass area by facade,"North/)
  })

  it('loads an old plan with no answers', () => {
    const old = garageFloor()
    expect('basix' in old).toBe(false)
    expect(basixOf(normalizePlan(old))).toEqual({})
    expect(readyCount(checklistRows(basixFacts(old), basixOf(old)), basixOf(old))).toEqual({ done: 0, of: 10 })
  })
})
