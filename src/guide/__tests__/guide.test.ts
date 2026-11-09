// The tips on the plan, the guide they link to, and the words it explains.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIndex, search } from '../../nav/search'
import features from '../../nav/features.json'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { emptyPlan, type Plan } from '../../plan/model'
import { findTerm, LABEL_TERMS, TERMS, termById } from '../glossary'
import { hideAllHints, hideHint, hintPrefs, nextHint, NO_PREFS, showHintsAgain, TIPS, type HintId } from '../hints'
import { SECTIONS } from '../sections'

const L0 = 'level_ground'
const garage = garageFloor()
const empty = emptyPlan(garage.placement)

/** The garage drawn so far: walls only, then rooms, then doors and windows, then a roof. */
function upTo(step: 'walls' | 'rooms' | 'openings' | 'roof'): Plan {
  const walls = garage.walls.filter(w => w.level === L0 && w.kind !== 'retaining')
  const ids = new Set(walls.map(w => w.id))
  return {
    ...garage,
    walls,
    rooms: step === 'walls' ? [] : garage.rooms.filter(r => r.level === L0),
    openings: step === 'walls' || step === 'rooms' ? [] : garage.openings.filter(o => ids.has(o.wall)),
    roofs: step === 'roof' ? [{ id: 'roof_1', level: L0, pts: [[0, 0], [6, 0], [6, 6], [0, 6]], type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0 }] : [],
    stairs: [],
    furniture: [],
  }
}

describe('the tips on the plan', () => {
  it('start an empty floor with its walls', () => {
    expect(nextHint(empty, L0, NO_PREFS)).toBe('walls')
  })

  it('then say the next step, one at a time, until the house has rooms, doors and windows and a roof', () => {
    expect(nextHint(upTo('walls'), L0, NO_PREFS)).toBe('rooms')
    expect(nextHint(upTo('rooms'), L0, NO_PREFS)).toBe('openings')
    expect(nextHint(upTo('openings'), L0, NO_PREFS)).toBe('roof')
    expect(nextHint(upTo('roof'), L0, NO_PREFS)).toBeNull()
  })

  it('say nothing while the first walls are going in and nothing is closed yet', () => {
    const one = { ...empty, walls: [garage.walls[0]] }
    expect(nextHint(one, L0, NO_PREFS)).toBeNull()
  })

  it('leave a tip hidden, going on to the next, and all of them when tips are off', () => {
    expect(nextHint(upTo('walls'), L0, { hidden: ['rooms'], off: false })).toBe('openings')
    expect(nextHint(empty, L0, { hidden: ['walls'], off: false })).toBeNull()
    expect(nextHint(empty, L0, { hidden: [], off: true })).toBeNull()
  })

  it('count only the floor being drawn on, and never a retaining wall as a house wall', () => {
    expect(nextHint(upTo('roof'), 'level_upper', NO_PREFS)).toBe('walls')
    const retaining = { ...empty, walls: [{ ...garage.walls[0], kind: 'retaining' as const }] }
    expect(nextHint(retaining, L0, NO_PREFS)).toBe('walls')
  })

  it('link to a section of the guide that is there', () => {
    const ids = SECTIONS.map(s => s.id)
    for (const id of Object.keys(TIPS) as HintId[]) expect(ids, id).toContain(TIPS[id].section)
  })

  it('say how drawing walls works, as the Wall tool does: W, each corner, the first corner to close, double-click or Esc to stop', () => {
    expect(TIPS.walls.desk).toMatch(/Press W/)
    expect(TIPS.walls.desk).toMatch(/first corner again to close/)
    expect(TIPS.walls.desk).toMatch(/double-click or press Esc/)
    expect(TIPS.walls.tool).toBe('wall')
  })

  describe('remembered on this device', () => {
    const store = new Map<string, string>()
    beforeEach(() => {
      store.clear()
      vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
      showHintsAgain()
    })
    afterEach(() => vi.unstubAllGlobals())

    it('keeps the tips hidden, one by one or all at once, until they are turned back on', () => {
      hideHint('rooms')
      hideHint('rooms')
      expect(hintPrefs()).toEqual({ hidden: ['rooms'], off: false })
      expect(JSON.parse(store.get('plan-hints-v1')!)).toEqual({ hidden: ['rooms'], off: false })
      hideAllHints()
      expect(hintPrefs().off).toBe(true)
      showHintsAgain()
      expect(hintPrefs()).toEqual(NO_PREFS)
    })
  })
})

describe('the words explained', () => {
  it('cover the words the planner uses', () => {
    const ids = TERMS.map(t => t.id)
    for (const id of ['ffl', 'rl', 'ahd', 'cdc', 'da', 'lep', 'dcp', 'fsr', 'gfa', 'batter', 'cut-fill', 'out-of-balance', 'setback', 'building-line', 'battle-axe', 'tpz', 'landscaped', 'private-open-space', 'basix'])
      expect(ids, id).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of TERMS) expect(t.says.length, t.id).toBeGreaterThan(40)
  })

  it('find the planning word in a field label, and leave everyday labels alone', () => {
    const at = (label: string) => findTerm(label, LABEL_TERMS)
    expect(at('Floor level (FFL)')).toMatchObject({ term: { id: 'ffl' }, start: 13, end: 16 })
    expect(at('Top of wall RL')?.term.id).toBe('rl')
    expect(at('Ground behind the wall, finished RL')?.term.id).toBe('rl')
    expect(at('LEP floor space ratio')?.term.id).toBe('lep')
    expect(at('Lot width at the building line')?.term.id).toBe('building-line')
    expect(at('Setbacks')?.term.id).toBe('setback')
    expect(at('Holds back up to')).toBeNull()
    expect(at('Fill')).toBeNull()
    expect(at('Daily')).toBeNull()
    // Everyday words only where asked.
    expect(findTerm('Fill')?.term.id).toBe('cut-fill')
  })

  it('each have a ⌘K entry that opens the guide at the word, without outranking the places they name', () => {
    const index = buildIndex(features)
    for (const t of TERMS) expect(search(index, t.short).some(r => r.action === `term:${t.id}`), t.id).toBe(true)
    expect(search(index, 'retaining walls')[0]).toMatchObject({ kind: 'tab', label: 'Retaining walls' })
    expect(termById('ffl')?.long).toBe('Finished floor level')
  })
})

describe('the guide', () => {
  it('has the steps from the block to sharing, each with something to say', () => {
    expect(SECTIONS.map(s => s.id)).toEqual(['block', 'walls', 'rooms', 'openings', 'levels', 'roof', 'earthworks', 'checks', 'costs', 'share'])
    for (const s of SECTIONS) expect(s.steps.length, s.id).toBeGreaterThan(0)
  })

  it('is found in ⌘K by the words people use for help', () => {
    const index = buildIndex(features)
    for (const q of ['help', 'how do I', 'guide', 'tutorial', 'getting started']) expect(search(index, q).slice(0, 3).some(r => r.action === 'guide'), q).toBe(true)
    for (const q of ['glossary', 'jargon', 'what does it mean']) expect(search(index, q).slice(0, 3).some(r => r.action === 'glossary'), q).toBe(true)
    for (const q of ['example', 'sample', 'demo']) expect(search(index, q).slice(0, 3).some(r => r.action === 'open-example'), q).toBe(true)
  })
})
