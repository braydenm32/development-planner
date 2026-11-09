// The design flow, on synthetic blocks: floor types per level (and their migration), the ask-once
// rule, cut and fill along a room's outside edges worked by hand on a plane, the retaining wall
// offer (its side, height and both placements), picking a contour for a floor, and the tooltip.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { LevelFloorType, RoomFloorType } from '../../components/FloorTypeFields'
import { FlowCards } from '../../flow/FlowCards'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { nearestContour, floorFromContour, type ContourLine } from '../contourPick'
import {
  DEFAULT_FLOOR_TYPE,
  FLOOR_TYPES,
  floorTypeChoices,
  isFloorType,
  levelFloorType,
  migrateFloorTypes,
  onNaturalGround,
  onPad,
  roomFloorNote,
  roomFloorText,
  roomFloorType,
  setLevelFloorType,
  shouldAskFloorType,
} from '../floorTypes'
import { pointInPolygon } from '../../lib/geom'
import { buildingOutline, planarFaces, roomShape } from '../geometry'
import { FLOOR_STRUCTURE, floorRL, houseWalls, normalizePlan, type Plan, type Wall } from '../model'
import { addLevelAbove, addRoom, addWall, updateRoom } from '../ops'
import { earthworksPlatforms, MIN_BENCH, pierOutlines } from '../platforms'
import { retainingProfile } from '../retaining'
import { edgeGround, houseSides, newEnclosures, offeredHeight, offeredWall, retainOfferFor } from '../retainOffer'
import { setEarthSide, sideOfWall, useRetaining } from '../retainingSession'
import { parsePlanFile, usePlan } from '../store'
import { earthFrom, earthInputs } from '../useEarthworks'
import { garageFloor } from './fixtures'
import {
  acceptOffer,
  answerFloorType,
  cancelContourPick,
  dismissOffer,
  offerFor,
  pickContour,
  putOffFloorType,
  quietOffer,
  roomMade,
  setFlowGround,
  setFlowSettings,
  setOfferPlacement,
  startContourPick,
  useFlow,
  wallsPlaced,
  DEFAULT_SETTINGS,
} from '../../flow/store'
import { tooltipText } from '../../flow/tooltip'
import { siteFeatureAt } from '../../flow/PlanFlow'
import type { SiteFeature } from '../../site/model'

const L = 'level_ground'

// The plane block: natural ground at RL 80 + 0.1x + 0.2y, x and y metres east and north of
// (1000, 1000), so it rises 0.2 m per metre to the north. The house goes at (1006, 1006), square
// to the grid, so a plan point (px, py) sits on natural ground at RL 81.8 + 0.1 px + 0.2 py.
const doc = parseDxf(planeSurvey())
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const natural = terrain.grid
const groundAt = (px: number, py: number) => 81.8 + 0.1 * px + 0.2 * py

const box = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, level: L, a, b, thickness: 0.3, kind: 'external' })

/** A 10 × 8 m box of 300 mm external walls (centrelines on x 0–10, y 0–8), its floor at `ffl`, no floor type yet. */
function boxHouse(ffl: number, withRoom = true): Plan {
  return {
    version: 1,
    levels: [{ id: L, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [box('s', [0, 0], [10, 0]), box('e', [10, 0], [10, 8]), box('n', [10, 8], [0, 8]), box('w', [0, 8], [0, 0])],
    openings: [],
    rooms: withRoom ? [{ id: 'room', level: L, name: 'Living', at: [5, 4] }] : [],
    areas: [],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 1006, n: 1006, rotation: 0, ffl },
  }
}

const innerFace = (plan: Plan) => planarFaces(plan.walls.filter(w => w.level === L)).find(f => f.area > 0)!

/** A wall's profile on the finished ground of the plan with it placed: what its panel shows. */
function finishedProfile(plan: Plan, w: Wall) {
  const next = { ...plan, walls: [...plan.walls.filter(x => x.id !== w.id), w] }
  return retainingProfile(w, next, survey.origin, earthFrom(natural, survey.boundary, earthInputs(next, survey)).result.grid)
}

function resetStores(plan: Plan | null) {
  usePlan.getState().load(plan)
  useRetaining.setState({ newWall: null, sidePick: null })
  useFlow.setState({ ask: null, offer: null, picking: null, dismissed: new Set(), settings: DEFAULT_SETTINGS })
  setFlowGround({ survey, natural })
}

// ---------------------------------------------------------------------------

describe('floor types', () => {
  it('are one list: the two usual ones first, waffle pod and suspended slabs behind More', () => {
    expect(FLOOR_TYPES.map(t => t.id)).toEqual(['slab', 'piers', 'waffle', 'suspended'])
    expect(floorTypeChoices(false).map(t => t.label)).toEqual(['Slab on ground', 'Bearers and joists on piers'])
    expect(floorTypeChoices(true).map(t => t.id)).toEqual(['slab', 'piers', 'waffle', 'suspended'])
    // a rarer type already chosen shows without opening More
    expect(floorTypeChoices(false, 'suspended').map(t => t.id)).toEqual(['slab', 'piers', 'suspended'])
    for (const t of FLOOR_TYPES) expect(t.earthworks.length, t.id).toBeGreaterThan(20)
    expect(isFloorType('waffle')).toBe(true)
    expect(isFloorType('raft')).toBe(false)
  })

  it('default to a slab on ground, rooms follow their level unless they say otherwise, upper floors are framed', () => {
    const plan = boxHouse(83)
    const room = plan.rooms[0]
    expect(levelFloorType(plan, L)).toBeUndefined()
    expect(roomFloorType(plan, room)).toBe(DEFAULT_FLOOR_TYPE)
    const piers = setLevelFloorType(plan, L, 'piers')
    expect(roomFloorType(piers, room)).toBe('piers')
    expect(roomFloorText(piers, room)).toBe('bearers and joists on piers')
    expect(roomFloorType(piers, { ...room, foundation: 'slab' })).toBe('slab')
    const two = addLevelAbove(piers)
    const up = { ...room, level: two.id }
    expect(levelFloorType(two.plan, two.id)).toBe('framed')
    expect(roomFloorType(two.plan, up)).toBe('framed')
    expect(roomFloorText(two.plan, up)).toBe('framed floor')
    expect(onPad(two.plan, up) || onNaturalGround(two.plan, up)).toBe(false)
    // a type the app doesn't know reads as not chosen
    const odd = { ...plan, levels: [{ ...plan.levels[0], floorType: 'raft' as never }] }
    expect(levelFloorType(odd, L)).toBeUndefined()
  })

  it('build a waffle pod slab like a slab on ground: a levelled pad', () => {
    const slab = setLevelFloorType(garageFloor(), L, 'slab')
    const waffle = setLevelFloorType(garageFloor(), L, 'waffle')
    expect(waffle.rooms.every(r => onPad(waffle, r) && !onNaturalGround(waffle, r))).toBe(true)
    expect(earthworksPlatforms(waffle, [1000, 1000])).toEqual(earthworksPlatforms(slab, [1000, 1000]))
    expect(pierOutlines(waffle)).toEqual([])
    expect(roomFloorNote(waffle, waffle.rooms[0])).toBe('waffle pod slab')
    expect(roomFloorNote(slab, slab.rooms[0])).toBeUndefined()
  })

  it('build a suspended slab like a floor on piers: natural ground, with the same gap kept clear', () => {
    const piers = setLevelFloorType(garageFloor(), L, 'piers')
    const suspended = setLevelFloorType(garageFloor(), L, 'suspended')
    expect(suspended.rooms.every(r => onNaturalGround(suspended, r) && !onPad(suspended, r))).toBe(true)
    expect(pierOutlines(suspended)).toEqual(pierOutlines(piers))
    expect(pierOutlines(suspended).length).toBeGreaterThan(0)
    expect(earthworksPlatforms(suspended, [1000, 1000])).toEqual(earthworksPlatforms(piers, [1000, 1000]))
    const cut = earthworksPlatforms(suspended, [1000, 1000]).find(p => !p.fill)!
    expect(cut.level).toBeCloseTo(84 - FLOOR_STRUCTURE - 0.4, 9)
    expect(roomFloorNote(suspended, suspended.rooms[0])).toBe('suspended slab')
    // one room on piers under a slab level: only that room is cut back
    const one = updateRoom(setLevelFloorType(garageFloor(), L, 'slab'), 'r2', { foundation: 'suspended' })
    expect(pierOutlines(one)).toEqual(pierOutlines(updateRoom(garageFloor(), 'r2', { foundation: 'piers' })))
  })

  it('migrate plans saved before them so nothing builds differently and nobody is asked about a floor already drawn', () => {
    const old = garageFloor()
    const withPiers = updateRoom(old, 'r2', { foundation: 'piers' })
    const migrated = normalizePlan(withPiers)
    expect(migrated.levels[0].floorType).toBe('slab')
    // every room keeps its own foundation, and none is given one
    expect(migrated.rooms).toEqual(withPiers.rooms)
    expect(migrated.rooms.map(r => roomFloorType(migrated, r))).toEqual(withPiers.rooms.map(r => (r.foundation === 'piers' ? 'piers' : 'slab')))
    expect(earthworksPlatforms(migrated, [1000, 1000])).toEqual(earthworksPlatforms(withPiers, [1000, 1000]))
    expect(shouldAskFloorType(migrated, L)).toBe(false)
    // once is enough, and a plan with no rooms yet waits to be asked
    expect(normalizePlan(migrated)).toEqual(migrated)
    expect(migrateFloorTypes(boxHouse(83, false)).levels[0].floorType).toBeUndefined()
    // an answer already given stays
    expect(migrateFloorTypes(setLevelFloorType(old, L, 'piers')).levels[0].floorType).toBe('piers')
    // and it survives a plan file
    const back = parsePlanFile(JSON.stringify(setLevelFloorType(old, L, 'waffle')))
    expect(back.levels[0].floorType).toBe('waffle')
  })
})

// ---------------------------------------------------------------------------

describe('asking how a floor is built, once', () => {
  beforeEach(() => resetStores(boxHouse(83, false)))

  it('asks only on the lowest level, only while it has no floor type, and not after Decide later', () => {
    const plan = boxHouse(83, false)
    expect(shouldAskFloorType(plan, L)).toBe(true)
    expect(shouldAskFloorType(plan, L, new Set([L]))).toBe(false)
    expect(shouldAskFloorType(setLevelFloorType(plan, L, 'slab'), L)).toBe(false)
    const two = addLevelAbove(plan)
    expect(shouldAskFloorType(two.plan, two.id)).toBe(false)
  })

  it('asks when the Room tool names a room, sets it for the level as one undoable step, then not again', () => {
    const st = usePlan.getState()
    st.commit(p => addRoom(p, L, [5, 4], 'Living'))
    const id = usePlan.getState().plan!.rooms[0].id
    roomMade(id)
    expect(useFlow.getState().ask).toMatchObject({ space: { level: L, room: id }, more: false })
    answerFloorType('piers')
    expect(useFlow.getState().ask).toBeNull()
    expect(levelFloorType(usePlan.getState().plan!, L)).toBe('piers')
    // piers: no retaining wall offer, however deep
    expect(useFlow.getState().offer).toBeNull()
    // a second room isn't asked
    usePlan.getState().commit(p => addRoom(p, L, [2, 2], 'Study'))
    roomMade(usePlan.getState().plan!.rooms[1].id)
    expect(useFlow.getState().ask).toBeNull()
    // undo takes the answer back, in one step
    usePlan.getState().undo()
    usePlan.getState().undo()
    expect(levelFloorType(usePlan.getState().plan!, L)).toBeUndefined()
    expect(usePlan.getState().plan!.rooms).toHaveLength(1)
  })

  it('asks when walls close round a new space, and Decide later puts it off for this visit', () => {
    resetStores({ ...boxHouse(83, false), walls: [] })
    const st = usePlan.getState()
    const corners: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 5],
      [0, 5],
    ]
    // three walls: nothing enclosed yet
    for (let i = 0; i < 3; i++) {
      const before = usePlan.getState().plan!
      st.commit(p => addWall(p, L, corners[i], corners[i + 1], { kind: 'external', thickness: 0.3 }))
      wallsPlaced(before, L)
      expect(useFlow.getState().ask, `wall ${i + 1}`).toBeNull()
    }
    const before = usePlan.getState().plan!
    st.commit(p => addWall(p, L, corners[3], corners[0], { kind: 'external', thickness: 0.3 }))
    expect(newEnclosures(before, usePlan.getState().plan!, L)).toHaveLength(1)
    wallsPlaced(before, L)
    expect(useFlow.getState().ask?.space.level).toBe(L)
    putOffFloorType()
    expect(useFlow.getState().ask).toBeNull()
    expect(levelFloorType(usePlan.getState().plan!, L)).toBeUndefined()
    // another room this visit isn't asked; a plan opened afresh is
    usePlan.getState().commit(p => addRoom(p, L, [3, 2], 'Living'))
    roomMade(usePlan.getState().plan!.rooms[0].id)
    expect(useFlow.getState().ask).toBeNull()
    usePlan.getState().load({ ...usePlan.getState().plan! })
    roomMade(usePlan.getState().plan!.rooms[0].id)
    expect(useFlow.getState().ask).not.toBeNull()
  })

  it("doesn't ask on an upper level, or for walls that close nothing new", () => {
    resetStores(boxHouse(83, false))
    const two = addLevelAbove(usePlan.getState().plan!)
    usePlan.getState().load(two.plan)
    setFlowGround({ survey, natural })
    usePlan.getState().commit(p => addRoom(p, two.id, [5, 4], 'Bedroom'))
    roomMade(usePlan.getState().plan!.rooms.find(r => r.level === two.id)!.id)
    expect(useFlow.getState().ask).toBeNull()
    // a wall across the box makes two new spaces where there was one: each is inside the old one
    const before = usePlan.getState().plan!
    usePlan.getState().commit(p => addWall(p, L, [5, 0], [5, 8], { kind: 'internal', thickness: 0.1 }))
    expect(newEnclosures(before, usePlan.getState().plan!, L)).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('cut and fill along a room’s outside edges, on a plane', () => {
  it('reads the natural ground along each outside face against the floor', () => {
    // Floor at RL 83.00. The outside faces are 150 mm out from the centrelines, over the centreline's length.
    const plan = boxHouse(83)
    const faces = planarFaces(plan.walls)
    const edges = edgeGround(plan, innerFace(plan), faces, survey, natural, 83)
    expect(edges).toHaveLength(4)
    const byY = (y: number) => edges.find(e => Math.abs(e.side.a[1] - y) < 1e-9 && Math.abs(e.side.b[1] - y) < 1e-9)!
    const byX = (x: number) => edges.find(e => Math.abs(e.side.a[0] - x) < 1e-9 && Math.abs(e.side.b[0] - x) < 1e-9)!
    // north face, y = 8.15, x 0–10: ground 83.43 + 0.1x, so up to 84.43, 1.43 above the floor; at least 83.43, never below it
    expect(byY(8.15).cut).toBeCloseTo(groundAt(10, 8.15) - 83, 4)
    expect(byY(8.15).cut).toBeCloseTo(1.43, 4)
    expect(byY(8.15).fill).toBeCloseTo(83 - groundAt(0, 8.15), 4)
    expect(byY(8.15).fill).toBeLessThan(0)
    // south face, y = −0.15: ground 81.77 + 0.1x, so 1.23 below the floor at worst
    expect(byY(-0.15).fill).toBeCloseTo(1.23, 4)
    expect(byY(-0.15).cut).toBeCloseTo(groundAt(10, -0.15) - 83, 4)
    // east face, x = 10.15, y 0–8: 82.815 to 84.415
    expect(byX(10.15).cut).toBeCloseTo(1.415, 4)
    expect(byX(10.15).fill).toBeCloseTo(0.185, 4)
    // west face, x = −0.15: 81.785 to 83.385
    expect(byX(-0.15).cut).toBeCloseTo(0.385, 4)
    expect(byX(-0.15).fill).toBeCloseTo(1.215, 4)
    // each runs with the outside on its left
    const n = byY(8.15)
    expect(n.side.b[0]).toBeGreaterThan(n.side.a[0])
  })

  it('skips an edge shared with another room', () => {
    const plan = { ...boxHouse(83), walls: [...boxHouse(83).walls, { id: 'mid', level: L, a: [5, 0], b: [5, 8], thickness: 0.1, kind: 'internal' } as Wall] }
    const faces = planarFaces(plan.walls)
    const west = faces.filter(f => f.area > 0).find(f => f.pts.every(p => p[0] <= 5 + 1e-9))!
    const edges = edgeGround(plan, west, faces, survey, natural, 83)
    expect(edges).toHaveLength(3)
    expect(edges.some(e => e.side.a[0] > 4 && e.side.b[0] > 4)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('offering a retaining wall', () => {
  it('offers the uphill side for a deep cut, along the whole side, 1 m out, holding back the natural ground', () => {
    const plan = setLevelFloorType(boxHouse(83), L, 'slab')
    const offer = retainOfferFor(plan, innerFace(plan), L, survey, natural)!
    // north cut 1.43 beats south fill 1.23 and east cut 1.415
    expect(offer).toMatchObject({ kind: 'cut', facing: 'north', level: L })
    expect(offer.depth).toBeCloseTo(1.43, 4)
    // the whole north side of the house, outside face, outside on the left
    expect(offer.side.a).toEqual([-0.15, 8.15])
    expect(offer.side.b).toEqual([10.15, 8.15])
    const w = offeredWall(offer, 'gap', 1)
    expect(w).toMatchObject({ kind: 'retaining', level: L, thickness: 0.2, retain: { high: 'left', lowLevel: 'pad', lowBench: 1 } })
    // 1 m gap plus half the wall out from the face, and 1 m past each corner so the bench wraps them
    expect(w.a).toEqual([-1.15, 9.25])
    expect(w.b).toEqual([11.15, 9.25])
    // Measured on the finished ground with the wall in place (the panel's own sample line): the bench
    // in front at the house pad, natural ground behind it, except near the ends, where the house's
    // own cut batters round them. So it holds back more than the natural ground well inside the ends
    // and less than the highest natural ground at its east end.
    const off = w.thickness / 2 + Math.max(0.3, natural.cell * 1.4)
    const pad = 83 - FLOOR_STRUCTURE
    const h = offeredHeight(plan, w, survey, natural)
    const fin = finishedProfile(plan, w)
    const mid = fin.samples.find(x => x.s >= 6.15)!
    expect(mid.right).toBeCloseTo(pad, 3)
    expect(mid.left).toBeCloseTo(groundAt(w.a[0] + mid.s, 9.25 + off), 3)
    expect(h).toBeGreaterThan(groundAt(7, 9.25 + off) - pad)
    expect(h).toBeLessThan(groundAt(11.15, 9.25 + off) - pad)
    expect(h).toBeCloseTo(fin.maxHeight, 9)
  })

  it('offers the downhill side for a high fill, holding up the pad', () => {
    const plan = setLevelFloorType(boxHouse(84.2), L, 'slab')
    const offer = retainOfferFor(plan, innerFace(plan), L, survey, natural)!
    // south fill 84.2 − 81.77 = 2.43; north cut only 0.23
    expect(offer).toMatchObject({ kind: 'fill', facing: 'south' })
    expect(offer.depth).toBeCloseTo(2.43, 4)
    const w = offeredWall(offer, 'gap', 1)
    // runs west along the south side, outside (south) on its left; the house side is high, at the pad
    expect(w.a).toEqual([11.15, -1.25])
    expect(w.b).toEqual([-1.15, -1.25])
    expect(w.retain).toEqual({ high: 'right', highLevel: 'pad', highBench: 1 })
    // On the finished ground: the pad on the house side, natural ground in front well inside the
    // ends, the pad's fill battered round them
    const off = w.thickness / 2 + Math.max(0.3, natural.cell * 1.4)
    const pad = 84.2 - FLOOR_STRUCTURE
    const h = offeredHeight(plan, w, survey, natural)
    const fin = finishedProfile(plan, w)
    const mid = fin.samples.find(x => x.s >= 6.15)!
    expect(mid.right).toBeCloseTo(pad, 3)
    expect(mid.left).toBeCloseTo(groundAt(w.a[0] - mid.s, -1.25 - off), 3)
    expect(h).toBeGreaterThan(pad - groundAt(3, -1.25 - off))
    expect(h).toBeLessThan(pad - groundAt(-1.15, -1.25 - off))
    expect(h).toBeCloseTo(fin.maxHeight, 9)
  })

  it('stops the wall at an inside corner of an L-shaped house, rather than running into the house', () => {
    // A 10 × 8 m main part with a 4 m wide wing running north off its west end, the wing its own room
    const ell: Plan = {
      ...boxHouse(83),
      walls: [
        box('s', [0, 0], [10, 0]),
        box('e', [10, 0], [10, 8]),
        box('n', [10, 8], [4, 8]),
        box('we', [4, 8], [4, 12]),
        box('wn', [4, 12], [0, 12]),
        box('w', [0, 12], [0, 0]),
        { id: 'mid', level: L, a: [0, 8], b: [4, 8], thickness: 0.1, kind: 'internal' },
      ],
      rooms: [
        { id: 'room', level: L, name: 'Living', at: [5, 4] },
        { id: 'wing', level: L, name: 'Bed', at: [2, 10] },
      ],
    }
    const plan = setLevelFloorType(ell, L, 'slab')
    const main = planarFaces(plan.walls).find(f => f.area > 0 && pointInPolygon(5, 4, f.pts))!
    const offer = retainOfferFor(plan, main, L, survey, natural)!
    // the main part's north side: from the wing's east face (an inside corner) to the north-east corner
    expect(offer).toMatchObject({ kind: 'cut', facing: 'north' })
    expect(offer.side).toMatchObject({ a: [4.15, 8.15], b: [10.15, 8.15], startConvex: false, endConvex: true })
    const w = offeredWall(offer, 'gap', 1)
    // it stops against the wing's east face, and runs 1 m past the outside corner
    expect(w.a).toEqual([4.15, 9.25])
    expect(w.b).toEqual([11.15, 9.25])
    const outline = buildingOutline(planarFaces(plan.walls)).outlines[0]
    for (let s = 0.05; s < 1; s += 0.05) {
      const p: [number, number] = [w.a[0] + (w.b[0] - w.a[0]) * s, w.a[1] + (w.b[1] - w.a[1]) * s]
      expect(pointInPolygon(p[0], p[1], outline), `${p}`).toBe(false)
    }
    // the house-wall option is the side itself, no overrun at either end
    const hw = offeredWall(offer, 'house')
    expect(hw.a).toEqual([4.15, 8.25])
    expect(hw.b).toEqual([10.15, 8.25])
  })

  it('offers nothing within the threshold, which is a setting', () => {
    const plan = setLevelFloorType(boxHouse(83.9), L, 'slab')
    // north: 84.43 − 83.9 = 0.53 cut; south fill 83.9 − 81.77 = 2.13
    expect(retainOfferFor(plan, innerFace(plan), L, survey, natural)?.kind).toBe('fill')
    // a gentler plan: a 4 × 2 m shed, floor at its middle ground
    const shed: Plan = {
      ...plan,
      walls: [box('s', [0, 0], [4, 0]), box('e', [4, 0], [4, 2]), box('n', [4, 2], [0, 2]), box('w', [0, 2], [0, 0])],
      placement: { ...plan.placement, ffl: groundAt(2, 1) },
    }
    // floor 82.20; the north face (y 2.15, x 0–4) runs 82.23–82.63 and the south (y −0.15) 81.77–82.17: 0.43 at most
    expect(retainOfferFor(shed, innerFace(shed), L, survey, natural)).toBeNull()
    const at3 = retainOfferFor(shed, innerFace(shed), L, survey, natural, 0.3)!
    expect(at3.depth).toBeCloseTo(0.43, 4)
  })

  it('places the house-wall option hard against the house, still not part of it', () => {
    const plan = setLevelFloorType(boxHouse(83), L, 'slab')
    const offer = retainOfferFor(plan, innerFace(plan), L, survey, natural)!
    const w = offeredWall(offer, 'house')
    // its inner face on the house's outside face, no gap and no overrun
    expect(w.a).toEqual([-0.15, 8.25])
    expect(w.b).toEqual([10.15, 8.25])
    expect(w.retain).toEqual({ high: 'left', lowLevel: 'pad', lowBench: MIN_BENCH })
    const with_ = { ...plan, walls: [...plan.walls, w] }
    expect(houseWalls(with_.walls)).toHaveLength(4)
    expect(roomShape(plan.rooms[0], planarFaces(with_.walls))!.area).toBeCloseTo(roomShape(plan.rooms[0], planarFaces(plan.walls))!.area, 9)
    expect(houseSides(with_, L)).toEqual(houseSides(plan, L))
    // the earth it holds is the ground right against the house
    expect(offeredHeight(plan, w, survey, natural)).toBeGreaterThan(offer.depth)
    // and once there, that side isn't offered again
    expect(retainOfferFor(with_, innerFace(with_), L, survey, natural)?.facing).not.toBe('north')
  })

  it('places nothing until Add is clicked, as one undoable step, either way; Not now and Don’t ask leave the plan alone', () => {
    for (const placement of ['gap', 'house'] as const) {
      resetStores(setLevelFloorType(boxHouse(83), L, 'slab'))
      const before = usePlan.getState().plan!
      offerFor({ level: L, room: 'room', keys: ['room'] })
      expect(useFlow.getState().offer).toMatchObject({ placement: 'gap', gap: 1, offer: { kind: 'cut', facing: 'north' } })
      expect(usePlan.getState().plan).toBe(before)
      setOfferPlacement(placement)
      const o = useFlow.getState().offer!
      const said = offeredHeight(before, offeredWall(o.offer, o.placement, o.gap), survey, natural)
      acceptOffer()
      const walls = usePlan.getState().plan!.walls.filter(x => x.kind === 'retaining')
      expect(walls, placement).toHaveLength(1)
      // the card's "hold back about" is the number the placed wall's panel then shows
      expect(finishedProfile(usePlan.getState().plan!, walls[0]).maxHeight, placement).toBeCloseTo(said, 9)
      expect(walls[0].a[1]).toBeCloseTo(placement === 'gap' ? 9.25 : 8.25, 9)
      // placed at once (no second Place to press), selected so its panel shows it to change
      expect(useRetaining.getState().newWall).toBeNull()
      expect(walls[0].retain?.draft).toBeUndefined()
      expect(usePlan.getState().selection).toEqual({ type: 'wall', id: walls[0].id })
      usePlan.getState().undo()
      expect(usePlan.getState().plan).toBe(before)
    }
    resetStores(setLevelFloorType(boxHouse(83), L, 'slab'))
    const before = usePlan.getState().plan!
    offerFor({ level: L, room: 'room', keys: ['room'] })
    dismissOffer()
    expect(useFlow.getState().offer).toBeNull()
    offerFor({ level: L, room: 'room', keys: ['room'] })
    quietOffer()
    offerFor({ level: L, room: 'room', keys: ['room'] })
    expect(useFlow.getState().offer).toBeNull()
    expect(usePlan.getState().plan).toBe(before)
    // turned off altogether
    setFlowSettings({ quiet: [], offers: false })
    offerFor({ level: L, room: 'room', keys: ['room'] })
    expect(useFlow.getState().offer).toBeNull()
    setFlowSettings(DEFAULT_SETTINGS)
  })

  it('follows the floor type answer: offered on a slab or waffle pod, never on piers or a suspended slab', () => {
    for (const [type, offered] of [
      ['slab', true],
      ['waffle', true],
      ['piers', false],
      ['suspended', false],
    ] as const) {
      resetStores(boxHouse(83))
      roomMade('room')
      expect(useFlow.getState().ask, type).not.toBeNull()
      answerFloorType(type)
      expect(!!useFlow.getState().offer, type).toBe(offered)
    }
  })
})

// ---------------------------------------------------------------------------

describe('a new retaining wall’s earth side', () => {
  it('is the side of the wall the click is on, set as one undoable step', () => {
    const wall: Wall = { id: 'rw', level: L, a: [0, 12], b: [10, 12], thickness: 0.2, kind: 'retaining', retain: { high: 'left' } }
    expect(sideOfWall(wall, [5, 14])).toBe('left')
    expect(sideOfWall(wall, [5, 10])).toBe('right')
    expect(sideOfWall(wall, [20, 12])).toBeNull()
    resetStores({ ...setLevelFloorType(boxHouse(83), L, 'slab'), walls: [...boxHouse(83).walls, wall] })
    setEarthSide('rw', 'right', survey.origin, natural)
    expect(usePlan.getState().plan!.walls.find(w => w.id === 'rw')!.retain?.high).toBe('right')
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.walls.find(w => w.id === 'rw')!.retain?.high).toBe('left')
  })
})

// ---------------------------------------------------------------------------

describe('a floor level from a contour', () => {
  const lines: ContourLine[] = [
    { z: 82, pts: [[0, 0], [20, 0]] },
    { z: 82.5, pts: [[0, 1], [20, 1]] },
    { z: 82.25, pts: [[0, 0.5], [20, 0.5]], finished: true },
  ]

  it('finds the contour nearest the pointer, natural or finished, within reach', () => {
    expect(nearestContour([5, 0.1], lines, 0.2)).toMatchObject({ z: 82, finished: false })
    expect(nearestContour([5, 0.9], lines, 0.2)).toMatchObject({ z: 82.5 })
    expect(nearestContour([5, 0.55], lines, 0.2)).toMatchObject({ z: 82.25, finished: true })
    expect(nearestContour([5, 0.25], lines, 0.1)).toBeNull()
    expect(nearestContour([25, 0], lines, 0.2)).toBeNull()
    // the survey's own contours, in the local frame
    const real = survey.contours.map(c => ({ z: c.z, pts: c.pts }))
    // on the plane, RL 83 runs where 0.1x + 0.2y = 3: through (1010, 1010)
    const at = (x: number, y: number): [number, number] => [x - survey.origin[0], y - survey.origin[1]]
    expect(nearestContour(at(1010, 1010.05), real, 0.2)?.z).toBeCloseTo(83, 9)
    expect(nearestContour(at(1010, 1012.45), real, 0.2)?.z).toBeCloseTo(83.5, 9)
  })

  it('sets the ground floor’s FFL, or another floor’s height above it, to the mm, as one undoable step', () => {
    const plan = garageFloor()
    expect(floorFromContour(plan, L, 83.25).placement.ffl).toBe(83.25)
    const two = addLevelAbove(plan)
    const up = floorFromContour(two.plan, two.id, 87.0004)
    expect(up.levels.find(l => l.id === two.id)!.elevation).toBe(3)
    expect(floorRL(up, two.id)).toBeCloseTo(87, 9)
    expect(up.placement.ffl).toBe(84)
    expect(floorFromContour(plan, 'nowhere', 80)).toBe(plan)

    resetStores(two.plan)
    startContourPick(L)
    expect(useFlow.getState().picking).toEqual({ level: L })
    pickContour(82.5)
    expect(useFlow.getState().picking).toBeNull()
    expect(usePlan.getState().plan!.placement.ffl).toBe(82.5)
    // the floor above moves with it
    expect(floorRL(usePlan.getState().plan!, two.id)).toBeCloseTo(82.5 + two.plan.levels.find(l => l.id === two.id)!.elevation, 9)
    usePlan.getState().undo()
    expect(usePlan.getState().plan!.placement.ffl).toBe(84)
    // Esc
    startContourPick(two.id)
    cancelContourPick()
    pickContour(90)
    expect(usePlan.getState().plan).toBe(two.plan)
  })
})

// ---------------------------------------------------------------------------

describe('the tooltip', () => {
  const plan = setLevelFloorType(boxHouse(83), L, 'slab')
  const ctx = { plan, retained: () => 0.6 }

  it('says what a thing is, with a key number or two', () => {
    expect(tooltipText({ type: 'wall', item: { id: 'w', level: L, a: [0, 0], b: [4.3, 0], thickness: 0.3, kind: 'external' } }, ctx)).toBe('External wall · 4.30 m')
    expect(tooltipText({ type: 'wall', item: { id: 'w', level: L, a: [0, 0], b: [2.4, 0], thickness: 0.09, kind: 'internal' } }, ctx)).toBe('Internal wall · 2.40 m')
    expect(tooltipText({ type: 'wall', item: { id: 'r', level: L, a: [0, 0], b: [5, 0], thickness: 0.2, kind: 'retaining' } }, ctx)).toBe('Retaining wall · holds back 0.60 m')
    expect(tooltipText({ type: 'wall', item: { id: 'r', level: L, a: [0, 0], b: [5, 0], thickness: 0.2, kind: 'retaining' } }, { plan })).toBe('Retaining wall')
    const door = { id: 'd', wall: 's', kind: 'door' as const, offset: 2, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false }
    expect(tooltipText({ type: 'opening', item: door }, ctx)).toBe('Door · 820 wide')
    expect(tooltipText({ type: 'opening', item: { ...door, kind: 'window', width: 1.8 } }, ctx)).toBe('Window · 1800 wide')
    expect(tooltipText({ type: 'opening', item: { ...door, kind: 'garage', width: 4.8 } }, ctx)).toBe('Garage door · 4800 wide')
    // the room inside 300 mm walls on 10 × 8 m centrelines: 9.7 × 7.7 = 74.69 m²
    expect(tooltipText({ type: 'room', item: plan.rooms[0] }, ctx)).toBe('Living · 74.69 m² · slab on ground')
    const piers = setLevelFloorType(plan, L, 'piers')
    expect(tooltipText({ type: 'room', item: piers.rooms[0] }, { plan: piers })).toBe('Living · 74.69 m² · bearers and joists on piers')
    expect(tooltipText({ type: 'room', item: { id: 'x', level: L, name: 'Yard', at: [30, 30] } }, ctx)).toBe('Yard · not enclosed')
    const roof = { id: 'f', level: L, pts: [[0, 0], [10, 0], [10, 8], [0, 8]] as [number, number][], type: 'gable' as const, pitch: 22.5, overhang: 0.45 }
    expect(tooltipText({ type: 'roof', item: roof as never }, ctx)).toBe('Roof · gable 22.5°')
    expect(tooltipText({ type: 'roof', item: { ...roof, type: 'flat' } as never }, ctx)).toBe('Roof · flat')
    const stair = { id: 's', level: L, at: [0, 0] as [number, number], angle: 90, width: 0.9, base: 0, rise: 2.97, going: 0.25, shape: 'straight' as const, turn: 'left' as const }
    expect(tooltipText({ type: 'stair', item: stair }, ctx)).toMatch(/^Stair · \d+ risers$/)
    const sofa = { id: 'u', level: L, kind: 'sofa-3', at: [5, 4] as [number, number], rotation: 0, width: 2.1, depth: 0.9, height: 0.85 }
    expect(tooltipText({ type: 'furniture', item: sofa }, ctx)).toBe('3-seat sofa')
    expect(tooltipText({ type: 'furniture', item: { ...sofa, label: 'Sofa' } }, ctx)).toBe('Sofa')
    const tree: SiteFeature = { id: 't', type: 'tree', label: 'T2', trunk: 0.5, canopy: 6, geom: { kind: 'point', at: [0, 0] }, source: 'trace' }
    expect(tooltipText({ type: 'site', item: tree }, ctx)).toBe('Tree T2 · trunk Ø 0.5 m')
    const easement: SiteFeature = { id: 'e', type: 'easement', label: '(C)', geom: { kind: 'area', pts: [[0, 0], [4, 0], [4, 30], [0, 30]] }, source: 'trace' }
    expect(tooltipText({ type: 'site', item: easement }, ctx)).toBe('Easement (C)')
    expect(tooltipText({ type: 'contour', z: 83, finished: false }, ctx)).toBe('Contour RL 83.00')
    expect(tooltipText({ type: 'contour', z: 82.5, finished: true }, ctx)).toBe('Finished contour RL 82.50')
  })

  it('finds the site feature under the pointer: points and lines over areas', () => {
    const tree: SiteFeature = { id: 't', type: 'tree', label: 'T2', trunk: 0.5, canopy: 6, geom: { kind: 'point', at: [10, 10] }, source: 'trace' }
    const fence: SiteFeature = { id: 'f', type: 'fence', geom: { kind: 'line', pts: [[0, 0], [20, 0]] }, source: 'trace' }
    const easement: SiteFeature = { id: 'e', type: 'easement', label: '(C)', geom: { kind: 'area', pts: [[0, -2], [20, -2], [20, 12], [0, 12]] }, source: 'trace' }
    const all = [easement, fence, tree]
    expect(siteFeatureAt(all, [12.5, 10], 0.1)?.id).toBe('t')
    expect(siteFeatureAt(all, [5, 0.05], 0.1)?.id).toBe('f')
    expect(siteFeatureAt(all, [5, 5], 0.1)?.id).toBe('e')
    expect(siteFeatureAt(all, [30, 30], 0.1)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('where the floor type is shown and asked', () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('lists the two usual types first in Design › Floors, the rest behind More floor types, and framed or suspended above', () => {
    const plan = boxHouse(83)
    const floors = text(renderToStaticMarkup(createElement(LevelFloorType, { plan, level: L })))
    expect(floors).toContain('Not chosen yet (builds as a slab)')
    expect(floors).toContain('Slab on ground')
    expect(floors).toContain('Bearers and joists on piers')
    expect(floors).not.toContain('Waffle pod slab')
    expect(floors).toContain('More floor types')
    // a rarer type already chosen shows
    const waffle = text(renderToStaticMarkup(createElement(LevelFloorType, { plan: setLevelFloorType(plan, L, 'waffle'), level: L })))
    expect(waffle).toContain('Waffle pod slab')
    expect(waffle).not.toContain('Not chosen yet')
    const two = addLevelAbove(plan)
    // A level well above the ground: framed, or a suspended slab.
    const above = text(renderToStaticMarkup(createElement(LevelFloorType, { plan: two.plan, level: two.id })))
    expect(above).toContain('Framed floor')
    expect(above).toContain('Suspended slab')
    expect(above).not.toContain('Bearers and joists on piers')
  })

  it('lets a room follow its level or set its own', () => {
    const plan = setLevelFloorType(boxHouse(83), L, 'piers')
    const room = text(renderToStaticMarkup(createElement(RoomFloorType, { plan, room: plan.rooms[0] })))
    expect(room).toContain('Same as Ground floor (bearers and joists on piers)')
    expect(room).toContain('More floor types')
  })

  // Rendered on the server, the stores read their initial state: make it the current one.
  const cards = () => {
    Object.assign(usePlan.getInitialState(), usePlan.getState())
    Object.assign(useFlow.getInitialState(), useFlow.getState())
    return text(renderToStaticMarkup(createElement(FlowCards)))
  }

  it('asks in a card with what each type does to the ground, and offers the wall either way', () => {
    resetStores(boxHouse(83))
    roomMade('room')
    const ask = cards()
    expect(ask).toContain('How is the Ground floor built?')
    expect(ask).toContain('A levelled pad under the house')
    expect(ask).toContain('Decide later')
    answerFloorType('slab')
    const offer = cards()
    expect(offer).toContain('A retaining wall on the north side?')
    expect(offer).toContain('out from the house')
    expect(offer).toContain('The house wall itself')
    expect(offer).toContain('waterproofing and an engineer')
    expect(offer).toContain('Add retaining wall')
    expect(offer).toContain('Don’t ask for this room')
  })
})
