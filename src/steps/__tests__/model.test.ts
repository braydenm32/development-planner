// Check everything's six steps, worked out from plain data: what's left in each, where each item
// goes to be fixed, and how a step reads (Done, 3 to do, 2 to fix, Not started). The houses are the
// made-up ones in src/plan/__tests__/fixtures.ts.

import { describe, expect, it } from 'vitest'
import { NEED_FRONT } from '../../checks/rules'
import type { CheckResult, CheckStatus } from '../../checks/types'
import { askQuestion, questionOpened, useQuestionContext, type Question } from '../../flow/questions'
import type { Plan, Roof } from '../../plan/model'
import { garageFloor, splitLevels } from '../../plan/__tests__/fixtures'
import { firstOpen, progressText, statusText, stepsOf, unmatchedRooflines, unnamedRoom, wallsWithoutRoof, type Step, type StepId, type StepsInput } from '../model'

const roof = (id: string, level: string, pts: [number, number][], patch: Partial<Roof> = {}): Roof => ({ id, level, pts, type: 'hip', pitch: 22.5, overhang: 0.45, gables: pts.map(() => false), lowEdge: 0, ...patch })

/** The garage floor, roofed all over: nothing left in its drawing. */
const finished = (): Plan => ({ ...garageFloor(), roofs: [roof('roof1', 'level_ground', [[0, 0], [10.1, 0], [10.1, 14], [0, 14]])] })

const row = (id: string, status: CheckStatus, patch: Partial<CheckResult> = {}): CheckResult => ({
  id,
  title: id,
  status,
  source: { clause: 'Made-up clause', confidence: 'read', asAt: '2026' },
  ...patch,
})

function input(plan: Plan, patch: Partial<StepsInput> = {}): StepsInput {
  return {
    plan,
    site: { area: 810, slopePct: 17, sketch: null, streetSet: true, layerGuesses: 0, mapPlaced: true },
    numbers: { floorArea: 120.5, ffl: 84, earth: { net: 0.4, outOfBalance: false, balancedRL: 84 }, roofHeight: 6.08, implied: null },
    onGround: [],
    retaining: [],
    checks: { name: 'CDC', head: 'Nothing to fix', word: 'ok', results: [row('hc-front', 'pass')] },
    cost: { ready: true, total: 612_000, low: 520_000, high: 700_000, missing: [] },
    da: { address: true, lot: true, preparedBy: true },
    questions: [],
    ...patch,
  }
}

const step = (steps: Step[], id: StepId) => steps.find(s => s.id === id)!
const ids = (s: Step) => s.items.map(i => i.id)

describe('the six steps', () => {
  it('are all done for a finished design, each with its number', () => {
    const steps = stepsOf(input(finished()))
    expect(steps.map(s => s.title)).toEqual(['Block', 'Levels & rooms', 'Ground & walls', 'Roof', 'Checks', 'Costs & share'])
    expect(steps.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(steps.filter(s => s.status !== 'done').map(s => [s.id, ids(s)])).toEqual([])
    expect(steps.map(s => s.headline)).toEqual(['810 m² · 17% slope', '1 level · 120.50 m²', 'Cut and fill balance', '6.08 m above ground', 'CDC · Nothing to fix', 'About $612k'])
    expect(progressText(steps)).toBe('6 of 6 done')
    expect(steps.map(statusText)).toEqual(Array(6).fill('Done'))
  })

  it('start empty: draw the outside walls first, and the rest waits', () => {
    const empty: Plan = { ...garageFloor(), walls: [], rooms: [], openings: [], areas: [] }
    const steps = stepsOf(input(empty, { numbers: { floorArea: null, ffl: 84, earth: null, roofHeight: null, implied: null }, checks: null, cost: { ready: false, total: 0, low: 0, high: 0, missing: [] } }))
    const levels = step(steps, 'levels')
    expect(levels.items.map(i => i.go)).toEqual([{ to: 'place', area: 'design', tab: 'plan', view: 'plan', tool: 'wall' }])
    expect(levels.headline).toBe('Nothing drawn yet')
    for (const id of ['ground', 'roof', 'checks'] as const) expect(statusText(step(steps, id)), id).toBe('Not started')
    expect(step(steps, 'costs').headline).toBe('No estimate yet')
    expect(firstOpen(steps)).toBe('levels')
  })
})

describe('Block', () => {
  it('asks for the street side once: the waiting question, else the field in Site › Block', () => {
    const street: Question = { id: 'street', kind: 'street', title: 'Which side faces the street?' }
    const asked = step(stepsOf(input(finished(), { site: { ...input(finished()).site, streetSet: false }, questions: [street] })), 'block')
    expect(asked.items).toMatchObject([{ id: 'q:street', tone: 'ask', go: { to: 'question', id: 'street' } }])
    expect(statusText(asked)).toBe('1 question')
    const putOff = step(stepsOf(input(finished(), { site: { ...input(finished()).site, streetSet: false } })), 'block')
    expect(putOff.items).toMatchObject([{ id: 'street', go: { to: 'place', area: 'site', tab: 'block', focus: 'street-side' } }])
  })

  it('lists the sketch, the layers read by guessing, and the map', () => {
    const b = step(stepsOf(input(finished(), { site: { area: 600, slopePct: 4.4, sketch: 'rough', streetSet: true, layerGuesses: 5, mapPlaced: false } })), 'block')
    expect(ids(b)).toEqual(['sketch', 'sketch-size', 'layers', 'map'])
    expect(b.items[2]).toMatchObject({ text: 'Check what the survey’s 5 layers were read as', go: { area: 'site', tab: 'more', focus: 'survey-layers' } })
    expect(b.headline).toBe('600 m² · 4% slope')
  })
})

describe('Levels & rooms', () => {
  it('asks how each floor on the ground is built, through the question list when it has the question', () => {
    const plan = splitLevels()
    const own = step(stepsOf(input(plan, { onGround: ['level_low', 'level_mid'] })), 'levels')
    expect(own.items.filter(i => i.id.startsWith('floor:'))).toMatchObject([
      { text: 'How is the floor on Lower level built?', go: { to: 'place', area: 'design', tab: 'floors', level: 'level_low' } },
      { text: 'How is the floor on Middle level built?', go: { level: 'level_mid' } },
    ])
    const q: Question = { id: 'floor-type:level_mid', kind: 'floor-type', level: 'level_mid', title: 'Floor type not chosen: Middle level' }
    const asked = step(stepsOf(input(plan, { onGround: ['level_low', 'level_mid'], questions: [q] })), 'levels')
    expect(ids(asked).filter(id => id.includes('level_mid') && !id.startsWith('openings'))).toEqual(['q:floor-type:level_mid'])
    // A level whose floor is answered isn't asked.
    const answered = { ...plan, levels: plan.levels.map(l => (l.id === 'level_low' ? { ...l, floorType: 'slab' as const } : l)) }
    expect(ids(step(stepsOf(input(answered, { onGround: ['level_low'] })), 'levels')).some(id => id.startsWith('floor:'))).toBe(false)
  })

  it('names rooms still called Room 2, and spaces with no room, picking or framing them', () => {
    expect([unnamedRoom('Room 2'), unnamedRoom('  '), unnamedRoom('Rumpus'), unnamedRoom('Room for guests')]).toEqual([true, true, false, false])
    const plan = splitLevels()
    const renamed = { ...plan, rooms: plan.rooms.map(r => (r.id === 'r_mid' ? { ...r, name: 'Room 2' } : r)) }
    const named = step(stepsOf(input(renamed)), 'levels').items.find(i => i.id === 'names:level_mid')!
    expect(named.text).toBe('Name “Room 2” on Middle level')
    expect(named.go).toMatchObject({ to: 'place', area: 'design', tab: 'rooms', level: 'level_mid', sel: { type: 'room', id: 'r_mid' } })
    // The top level's room taken away: its space has no name.
    const gone = { ...plan, rooms: plan.rooms.filter(r => r.id !== 'r_top') }
    const space = step(stepsOf(input(gone)), 'levels').items.find(i => i.id === 'names:level_top')!
    expect(space.text).toBe('Name the room of 48.00 m² on Top level')
    expect(space.go).toMatchObject({ tab: 'plan', level: 'level_top', tool: 'room' })
  })

  it('finds a level with no walls, or walls that don’t close, and one with no doors or windows', () => {
    const plan = splitLevels()
    const open = { ...plan, walls: plan.walls.filter(w => w.id !== 'top_2'), rooms: plan.rooms.filter(r => r.level !== 'level_top') }
    const items = step(stepsOf(input(open)), 'levels').items
    expect(items.find(i => i.id === 'close:level_top')).toMatchObject({ text: 'Close the outside walls on Top level', go: { level: 'level_top' } })
    const bare = { ...plan, walls: plan.walls.filter(w => w.level !== 'level_top'), rooms: plan.rooms.filter(r => r.level !== 'level_top') }
    expect(step(stepsOf(input(bare)), 'levels').items.find(i => i.id === 'walls:level_top')).toMatchObject({ text: 'Draw the walls on Top level', go: { tool: 'wall' } })
    expect(ids(step(stepsOf(input(plan)), 'levels'))).toEqual(['openings:level_low', 'openings:level_mid', 'openings:level_top'])
  })

  it('points out a stair whose top meets no floor', () => {
    const plan = splitLevels()
    const loose = { ...plan, stairs: plan.stairs.map(s => ({ ...s, toLevel: undefined, rise: 2.1 })) }
    const item = step(stepsOf(input(loose)), 'levels').items.find(i => i.id === 'stair:stair_up')!
    expect(item.text).toBe('A stair on Lower level meets no floor')
    expect(item.go).toMatchObject({ level: 'level_low', sel: { type: 'stair', id: 'stair_up' } })
  })
})

describe('Ground & walls', () => {
  it('lists balance, the walls the earthworks need, and retaining walls with no height or over the engineer’s limit', () => {
    const plan = garageFloor()
    const wall = { id: 'rw', level: 'level_ground', a: [0, 20] as [number, number], b: [8, 20] as [number, number], thickness: 0.2, kind: 'retaining' as const }
    const flat = { ...wall, id: 'rw2' }
    const offer: Question = { id: 'retain-offer:r1', kind: 'retain-offer', title: 'A retaining wall on the north side?' }
    const g = step(
      stepsOf(
        input(finished(), {
          numbers: { floorArea: 120, ffl: 84, earth: { net: 36.7, outOfBalance: true, balancedRL: 84.7 }, roofHeight: 6, implied: { count: 2, length: 12, maxHeight: 0.8, face: 6, engineer: 1 } },
          retaining: [
            { wall, height: 1.2, name: 'North boundary wall' },
            { wall: flat, height: 0.01 },
            { wall: { ...wall, id: 'rw3' }, height: 0.4 },
          ],
          questions: [offer],
        }),
      ),
      'ground',
    )
    expect(g.headline).toBe('36.7 m³ to take away')
    expect(g.items.map(i => [i.id, i.text])).toEqual([
      ['balance', 'Out of balance: 36.7 m³ to take away'],
      ['q:retain-offer:r1', 'A retaining wall on the north side?'],
      ['implied', '2 walls the earthworks need, not drawn yet'],
      ['eng:rw', 'North boundary wall, 1.20 m, needs an engineer'],
      ['flat:rw2', 'A retaining wall holds back nothing yet'],
    ])
    expect(g.items[0].detail).toBe('Balance would raise the floor 0.70 m')
    expect(g.items[3]).toMatchObject({ tone: 'confirm', go: { area: 'earthworks', tab: 'retaining-walls', sel: { type: 'wall', id: 'rw' }, frame: [wall.a, wall.b] } })
    expect(plan.walls.length).toBeGreaterThan(0)
  })
})

describe('Roof', () => {
  it('asks for a roof, then finds the walls with none over them', () => {
    const plan = splitLevels()
    expect(step(stepsOf(input(plan)), 'roof').items).toMatchObject([{ id: 'roof', go: { tab: 'roofs', tool: 'roof' } }])
    // A roof on the lower level's ceiling: the top level is over it, and the middle wing (higher) has none.
    const low = { ...plan, roofs: [roof('rl', 'level_low', [[0, 0], [8, 0], [8, 6], [0, 6]])] }
    expect([...wallsWithoutRoof(low).keys()]).toEqual(['level_mid', 'level_top'])
    // On the top level instead, it covers the top and the lower level under it; the middle wing still has none.
    const top = { ...plan, roofs: [roof('rt', 'level_top', [[0, 0], [8, 0], [8, 6], [0, 6]])] }
    const bare = wallsWithoutRoof(top)
    expect([...bare.keys()]).toEqual(['level_mid'])
    // Its wall along the higher wing is under that wing's roof edge.
    expect(bare.get('level_mid')!.length).toBe(3)
    const item = step(stepsOf(input(top)), 'roof').items[0]
    expect(item).toMatchObject({ text: '3 walls on Middle level with no roof over them', go: { tab: 'roofs', level: 'level_mid', tool: 'roof' } })
  })

  it('suggests matching roofs over levels whose ceilings line up, until they share a roofline', () => {
    const plan = splitLevels()
    // The middle level's ceiling raised to the top level's.
    const lined = { ...plan, levels: plan.levels.map(l => (l.id === 'level_mid' ? { ...l, height: 4.5 } : l)) }
    const two = { ...lined, roofs: [roof('rt', 'level_top', [[0, 0], [8, 0], [8, 6], [0, 6]]), roof('rm', 'level_mid', [[0, 6], [8, 6], [8, 12], [0, 12]])] }
    expect(unmatchedRooflines(two)).toEqual([['rt', 'rm']])
    expect(step(stepsOf(input(two)), 'roof').items.map(i => i.text)).toEqual(['Match the roofs over Top level and Middle level'])
    const matched = { ...two, roofs: two.roofs.map(r => (r.id === 'rm' ? { ...r, eaves: { roof: 'rt' } } : r)) }
    expect(unmatchedRooflines(matched)).toEqual([])
  })
})

describe('Checks', () => {
  it('lists each row to fix, then to confirm, then the facts, each going where it’s fixed', () => {
    const results = [row('hc-front', 'pass'), row('da-coverage', 'warn'), row('hc-height', 'fail', { value: '9.1 m', limit: '8.5 m' }), row('lep-zone', 'unknown', { note: 'Add the zone.' })]
    const c = step(stepsOf(input(finished(), { checks: { name: 'DA', head: '1 to fix · 1 to confirm', word: 'fix', results } })), 'checks')
    expect(c.items.map(i => [i.id, i.tone])).toEqual([
      ['check:hc-height', 'fix'],
      ['check:da-coverage', 'confirm'],
      ['check:lep-zone', 'fact'],
    ])
    expect(c.items[0]).toMatchObject({ detail: '9.1 m · allowed 8.5 m', go: { to: 'check', id: 'hc-height', fix: { area: 'design', tab: 'roofs' } } })
    // Confirm and the facts go to their row, which says why.
    expect(c.items[1].go).toEqual({ to: 'check', id: 'da-coverage', fix: null })
    expect(c.items[2].detail).toBe('Add the zone.')
    expect(statusText(c)).toBe('1 to fix')
    expect(c.headline).toBe('DA · 1 to fix · 1 to confirm')
  })

  it('leaves the street side to Block while it isn’t set', () => {
    const results = [row('hc-front', 'unknown', { note: NEED_FRONT }), row('lep-fsr', 'unknown')]
    const steps = stepsOf(input(finished(), { site: { ...input(finished()).site, streetSet: false }, checks: { name: 'CDC', head: 'Nothing to fix so far', word: 'ok', results } }))
    expect(ids(step(steps, 'checks'))).toEqual(['check:lep-fsr'])
    expect(ids(step(steps, 'block'))).toEqual(['street'])
  })
})

describe('Costs & share', () => {
  it('says what the estimate has nothing for, and the DA pack’s details left blank', () => {
    const c = step(stepsOf(input(finished(), { cost: { ready: true, total: 438_000, low: 400_000, high: 480_000, missing: ['roof', 'windows'] }, da: { address: false, lot: true, preparedBy: false } })), 'costs')
    expect(c.items.map(i => i.text)).toEqual(['The estimate has nothing for the roof and windows yet', 'Add the site’s address', 'Say who prepared the plans'])
    expect(c.items[1].go).toEqual({ to: 'place', area: 'approvals', tab: 'da-pack', field: 'da-address' })
    expect(c.headline).toBe('About $438k')
  })
})

describe('asking the question list for a question', () => {
  it('counts each ask, so the same question can be asked again', () => {
    askQuestion('street')
    const first = useQuestionContext.getState().asked
    askQuestion('street')
    expect(useQuestionContext.getState().asked).toEqual({ id: 'street', n: first!.n + 1 })
    questionOpened()
    expect(useQuestionContext.getState().asked).toBeNull()
  })
})
