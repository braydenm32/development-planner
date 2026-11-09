// Levels on a split-level house: floor types asked of every level on the ground and kept with
// their level whatever order the levels are in, a pad for each level built on the ground, levels
// added below or beside at an RL, a level's floor set by its RL, and the level menu's rows.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { LevelFloorType, RoomFloorType } from '../../components/FloorTypeFields'
import { answerFloorType, roomMade, setFlowGround, useFlow, DEFAULT_SETTINGS } from '../../flow/store'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import {
  keepFloorTypes,
  levelBuildsAs,
  levelFloorAnswer,
  levelFloorChoices,
  levelFloorType,
  migrateFloorTypes,
  onGroundLevels,
  onPad,
  roomFloorType,
  setLevelFloorType,
  shouldAskFloorType,
} from '../floorTypes'
import type { Vec2 } from '../../lib/geom'
import { ghostOpacity, groundedLevels, levelRows, setGhost, stepLevel, useGhosts } from '../levelMenu'
import { FLOOR_STRUCTURE, floorRL, normalizePlan, type Plan } from '../model'
import { addLevelAt, addLevelBelow, setLevelRL, updateLevel } from '../ops'
import { earthworksPlatforms, padId, pierOutlines, PAD_ID } from '../platforms'
import { designQuantities } from '../quantities'
import { usePlan } from '../store'
import { garageFloor, splitLevels } from './fixtures'

// The plane block: natural ground at RL 80 + 0.1x + 0.2y east and north of (1000, 1000). The split
// levels sit at (1006, 1004), so a plan point (px, py) is on ground at RL 81.4 + 0.1 px + 0.2 py.
const doc = parseDxf(planeSurvey())
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const groundAt = (p: Vec2) => 81.4 + 0.1 * p[0] + 0.2 * p[1]

// splitLevels: Lower level RL 82 (y 0..6), Middle RL 83.2 beside it up the slope (y 6..12), Top RL 85 over the Lower level.
const LOW = 'level_low'
const MID = 'level_mid'
const TOP = 'level_top'
const split = (): Plan => ({ ...splitLevels(), floorsByLevel: true })

describe('which levels sit on the ground', () => {
  it('is the lowest, and any level within 1 m of the ground under its walls; not a storey above', () => {
    const plan = split()
    expect([...onGroundLevels(plan, groundAt)].sort()).toEqual([LOW, MID])
    // Without the ground, only the lowest is known to be on it.
    expect([...onGroundLevels(plan)]).toEqual([LOW])
    // The real survey reads the same.
    expect([...groundedLevels(plan, survey, terrain.grid)].sort()).toEqual([LOW, MID])
    // Lift the middle level to RL 86.5, nearly 2 m over the highest ground under it, and it's well above.
    expect(onGroundLevels(updateLevel(plan, MID, { elevation: 4.5 }), groundAt).has(MID)).toBe(false)
  })

  it('asks the floor type once of each level on the ground, and not of one well above it', () => {
    const plan = split()
    const grounded = onGroundLevels(plan, groundAt)
    expect(shouldAskFloorType(plan, MID, new Set(), grounded)).toBe(true)
    expect(shouldAskFloorType(plan, TOP, new Set(), grounded)).toBe(false)
    expect(shouldAskFloorType(setLevelFloorType(plan, MID, 'slab'), MID, new Set(), grounded)).toBe(false)
    // An answer of framed is an answer too.
    expect(shouldAskFloorType(setLevelFloorType(plan, MID, 'framed'), MID, new Set(), grounded)).toBe(false)
  })

  it('offers the floor types on the ground, and framed or a suspended slab well above it', () => {
    expect(levelFloorChoices(true, true, false).map(c => c.id)).toEqual(['slab', 'piers'])
    expect(levelFloorChoices(true, false, false).map(c => c.id)).toEqual(['slab', 'piers', 'framed'])
    expect(levelFloorChoices(true, false, true).map(c => c.id)).toEqual(['slab', 'piers', 'waffle', 'suspended', 'framed'])
    expect(levelFloorChoices(false, false, false).map(c => c.id)).toEqual(['framed', 'suspended'])
    // An answer already given always shows.
    expect(levelFloorChoices(false, false, false, 'slab').map(c => c.id)).toEqual(['framed', 'slab', 'suspended'])
  })
})

describe('floor types belong to their level', () => {
  it('build an unanswered split level framed, as before, and an answered one as answered', () => {
    const plan = split()
    expect(levelFloorType(plan, LOW)).toBeUndefined()
    expect(levelBuildsAs(plan, LOW)).toBe('slab')
    expect(levelBuildsAs(plan, MID)).toBe('framed')
    const mid = setLevelFloorType(plan, MID, 'slab')
    expect(levelBuildsAs(mid, MID)).toBe('slab')
    expect(roomFloorType(mid, mid.rooms.find(r => r.level === MID)!)).toBe('slab')
    // A room on it can be on piers of its own.
    expect(roomFloorType(mid, { level: MID, foundation: 'piers' })).toBe('piers')
    // On a framed level a room's own type doesn't apply.
    expect(roomFloorType(plan, { level: MID, foundation: 'piers' })).toBe('framed')
  })

  it('never move when a level is added below or a floor’s RL changes', () => {
    const plan = setLevelFloorType(setLevelFloorType(split(), LOW, 'piers'), MID, 'slab')
    const below = addLevelBelow(plan)
    expect(levelFloorType(below.plan, LOW)).toBe('piers')
    expect(levelFloorType(below.plan, MID)).toBe('slab')
    // The new lowest level waits to be asked, built as a slab until then.
    expect(levelFloorAnswer(below.plan, below.id)).toBeUndefined()
    expect(levelBuildsAs(below.plan, below.id)).toBe('slab')
    // Moving the middle level under the others keeps every answer where it was.
    const moved = setLevelRL(plan, MID, 80)
    expect([LOW, MID, TOP].map(id => levelFloorType(moved, id))).toEqual(['piers', 'slab', 'framed'])
  })

  it('keeps the old ground floor a slab when one is added below it before it was answered', () => {
    usePlan.getState().load(split())
    usePlan.getState().commit(p => addLevelBelow(p).plan)
    const plan = usePlan.getState().plan!
    expect(levelFloorAnswer(plan, LOW)).toBe('slab')
    expect(levelBuildsAs(plan, LOW)).toBe('slab')
    // A negative step typed in does the same.
    usePlan.getState().load(split())
    usePlan.getState().commit(p => updateLevel(p, MID, { elevation: -3 }))
    expect(levelBuildsAs(usePlan.getState().plan!, LOW)).toBe('slab')
    // Nothing else changes, and a change that leaves the order alone writes nothing.
    expect(keepFloorTypes(split(), updateLevel(split(), TOP, { elevation: 3.3 })).levels.every(l => l.floorType === undefined)).toBe(true)
  })

  it('opens older plans meaning what they did: an answer left on a level that was no longer the lowest stays framed', () => {
    // Saved before: the Lower level had been the ground floor (slab) until the Basement went in below it.
    const base = splitLevels()
    const old: Plan = {
      ...base,
      levels: [{ id: 'level_base', name: 'Basement', elevation: -3, height: 2.7 }, ...base.levels.map(l => (l.id === LOW ? { ...l, floorType: 'slab' as const } : l))],
    }
    expect(old.floorsByLevel).toBeUndefined()
    const opened = normalizePlan(old)
    expect(opened.floorsByLevel).toBe(true)
    expect(levelBuildsAs(opened, LOW)).toBe('framed')
    expect(earthworksPlatforms(opened, survey.origin).map(p => p.id)).toEqual(earthworksPlatforms({ ...old, levels: opened.levels }, survey.origin).map(p => p.id))
    // Once opened, answers stay: open it again and nothing changes.
    const answered = setLevelFloorType(opened, LOW, 'slab')
    expect(normalizePlan(answered)).toEqual(answered)
    expect(levelBuildsAs(normalizePlan(answered), LOW)).toBe('slab')
    // A one-level plan and the lowest level's answer are untouched.
    expect(migrateFloorTypes(setLevelFloorType(garageFloor(), 'level_ground', 'piers')).levels[0].floorType).toBe('piers')
  })
})

describe('a pad for every level built on the ground', () => {
  const origin: Vec2 = survey.origin

  it('levels the ground under a split level given a slab, at its own floor', () => {
    const before = earthworksPlatforms(split(), origin)
    expect(before.filter(p => p.id?.startsWith(PAD_ID)).map(p => p.id)).toEqual([PAD_ID])
    const plan = setLevelFloorType(split(), MID, 'slab')
    const pads = earthworksPlatforms(plan, origin).filter(p => p.id?.startsWith(PAD_ID))
    expect(pads.map(p => p.id)).toEqual([PAD_ID, padId(plan, MID)])
    expect(pads[1].level).toBeCloseTo(floorRL(plan, MID) - FLOOR_STRUCTURE, 9)
    // The lowest level's pad is just as it was.
    expect(pads[0]).toEqual(before.find(p => p.id === PAD_ID))
    // A level over one already on the ground leaves that ground to the lower level.
    const top = setLevelFloorType(split(), TOP, 'slab')
    const topPad = earthworksPlatforms(top, origin).find(p => p.id === padId(top, TOP))!
    expect(topPad.exclude.length).toBeGreaterThan(0)
  })

  it('keeps the ground natural under a split level on piers, and makes no pad under a framed one', () => {
    const piers = setLevelFloorType(split(), MID, 'piers')
    expect(pierOutlines(piers, MID)).toHaveLength(1)
    expect(earthworksPlatforms(piers, survey.origin).some(p => p.id === `piers:${MID}` && !p.fill)).toBe(true)
    expect(onPad(piers, { level: MID })).toBe(false)
    const framed = setLevelFloorType(split(), MID, 'framed')
    expect(earthworksPlatforms(framed, survey.origin).some(p => p.id?.includes(MID))).toBe(false)
  })

  it('counts a split level built on the ground as ground floor in the costs, not as framed', () => {
    const plan = setLevelFloorType(setLevelFloorType(split(), LOW, 'slab'), MID, 'slab')
    const q = designQuantities(plan, null, [])
    expect(q.ground?.name).toBe('Lower level and Middle level')
    expect(q.ground?.parts.map(p => p.type)).toEqual(['slab'])
    expect(q.upper.names).toEqual(['Top level'])
    // Its old slab area isn't counted again under it.
    expect(q.slabUnder.area).toBe(0)
  })
})

describe('adding levels and setting their RL', () => {
  it('adds a level below the lowest, and one beside at an RL, both empty', () => {
    const plan = split()
    const below = addLevelBelow(plan)
    const lv = below.plan.levels.find(l => l.id === below.id)!
    expect(floorRL(below.plan, below.id)).toBeCloseTo(82 - 2.7 - FLOOR_STRUCTURE, 9)
    expect(below.plan.walls.some(w => w.level === lv.id)).toBe(false)
    const beside = addLevelAt(plan, 84.6)
    expect(floorRL(beside.plan, beside.id)).toBeCloseTo(84.6, 9)
    expect(beside.plan.levels.find(l => l.id === beside.id)!.name).toBe('Level 4')
  })

  it('sets a level’s floor by its RL', () => {
    const plan = setLevelRL(split(), MID, 86.3)
    expect(floorRL(plan, MID)).toBeCloseTo(86.3, 9)
    expect(plan.levels.find(l => l.id === MID)!.elevation).toBeCloseTo(4.3, 9)
  })
})

describe('the level menu', () => {
  beforeEach(() => useGhosts.setState({ off: [] }))

  it('lists every level highest first with its RL and floor, and ghosts the rest, fainter further away', () => {
    const plan = setLevelFloorType(split(), MID, 'slab')
    const rows = levelRows(plan, LOW, new Set(), onGroundLevels(plan, groundAt))
    expect(rows.map(r => [r.name, r.rl.toFixed(2), r.floorText, r.onGround, r.steps, r.ghost])).toEqual([
      ['Top level', '85.00', 'framed floor', false, 2, true],
      ['Middle level', '83.20', 'slab on ground', true, 1, true],
      ['Lower level', '82.00', 'floor not chosen yet', true, 0, false],
    ])
    expect(ghostOpacity(1)).toBeGreaterThan(ghostOpacity(2))
    expect(ghostOpacity(-1)).toBe(ghostOpacity(1))
    expect(ghostOpacity(6)).toBeGreaterThan(0)
    // A level's ghost can be switched off.
    setGhost(TOP, false)
    expect(levelRows(plan, LOW, new Set(useGhosts.getState().off), new Set()).find(r => r.id === TOP)!.ghost).toBe(false)
    setGhost(TOP, true)
    expect(useGhosts.getState().off).toEqual([])
  })

  it('steps up and down with Page Up and Page Down, stopping at the ends', () => {
    const plan = split()
    expect(stepLevel(plan, LOW, 1)).toBe(MID)
    expect(stepLevel(plan, MID, 1)).toBe(TOP)
    expect(stepLevel(plan, TOP, 1)).toBeNull()
    expect(stepLevel(plan, LOW, -1)).toBeNull()
  })
})

describe('asking a split level on the ground', () => {
  beforeEach(() => {
    usePlan.getState().load(normalizePlan(split()))
    useFlow.setState({ ask: null, offer: null, picking: null, dismissed: new Set(), settings: DEFAULT_SETTINGS })
    setFlowGround({ survey, natural: terrain.grid })
  })

  it('asks when a room is made on it, keeps the answer on that level, and never asks a storey above', () => {
    roomMade('r_mid')
    expect(useFlow.getState().ask?.space.level).toBe(MID)
    answerFloorType('slab')
    expect(levelFloorType(usePlan.getState().plan!, MID)).toBe('slab')
    roomMade('r_top')
    expect(useFlow.getState().ask).toBeNull()
  })

  it('shows its floor type field with framed among the choices, and a room field once it’s on the ground', () => {
    const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const plan = split()
    const field = text(renderToStaticMarkup(createElement(LevelFloorType, { plan, level: MID, onGround: true })))
    expect(field).toContain('Not chosen yet (builds as a framed floor)')
    expect(field).toContain('Slab on ground')
    expect(field).toContain('Framed floor')
    expect(field).toContain('within 1 m of the ground')
    const high = text(renderToStaticMarkup(createElement(LevelFloorType, { plan: setLevelFloorType(plan, TOP, 'slab'), level: TOP, onGround: false })))
    expect(high).toContain('more than 1 m above the ground')
    const room = plan.rooms.find(r => r.level === MID)!
    expect(renderToStaticMarkup(createElement(RoomFloorType, { plan, room }))).toBe('')
    expect(text(renderToStaticMarkup(createElement(RoomFloorType, { plan: setLevelFloorType(plan, MID, 'slab'), room })))).toContain('Same as Middle level (slab on ground)')
  })
})
