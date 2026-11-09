// The example project's house: a made-up split-level house on the sample block
// (samples/sample-block.dxf, made by ./sampleSurvey.ts), finished enough to show what the planner
// does. The block falls about 16% to the east, so the house steps down with it: a bedroom level on
// the high (west) side and a living level with the garage on the low side, a half flight apart. A
// retaining wall under the step holds the bedroom level's pad, as an engineer would for a stepped
// slab. It isn't anyone's house or block.
//
// The plan is in the house's own frame, in metres: x east, y north, with (0, 0) at the outside
// corner of the walls' south-west centrelines. `placement` puts it about 3.2 m in from the block's
// west boundary and 6 m back from the street (the south boundary).

import type { CheckSettings } from '../checks/types'
import type { Vec2 } from '../lib/geom'
import type { Area, Furniture, Level, Opening, OpeningKind, Plan, Roof, Room, Stair, Wall, WallKind } from '../plan/model'
import { catalogItem } from '../plan/furnitureCatalog'
import { SAMPLE_E0, SAMPLE_N0 } from './sampleSurvey'

/** The project's name: plainly an example, so nobody takes it for their own. */
export const EXAMPLE_NAME = 'Example: split-level house'

const LIVING = 'level_ground'
const BEDROOMS = 'level_bedrooms'

/** How far the bedroom level sits above the living level (m): six risers of about 167 mm. */
export const SPLIT = 1
/** RL of the living level's floor: where its cut and fill about balance. */
export const EXAMPLE_FFL = 45.36

const EXT = 0.27 // brick veneer
const INT = 0.11 // stud

const wall = (id: string, level: string, a: Vec2, b: Vec2, kind: WallKind = 'external', thickness = kind === 'external' ? EXT : INT): Wall => ({ id, level, a, b, thickness, kind })

const opening = (id: string, w: string, kind: OpeningKind, offset: number, width: number, extra: Partial<Opening> = {}): Opening => {
  const size = kind === 'window' ? { height: 1.2, sill: 0.9 } : kind === 'garage' ? { height: 2.1, sill: 0 } : kind === 'opening' ? { height: 2.1, sill: 0 } : { height: 2.04, sill: 0 }
  return { id, wall: w, kind, offset, width, ...size, flipHinge: false, flipSwing: false, ...extra }
}

const room = (id: string, level: string, name: string, at: Vec2): Room => ({ id, level, name, at })

/** A piece from the catalog at its usual size. */
function piece(id: string, level: string, kind: string, at: Vec2, rotation: number): Furniture {
  const [width, depth, height] = catalogItem(kind)?.size ?? [1, 1, 1]
  return { id, level, kind, at, rotation, width, depth, height }
}

// The two levels' wall centrelines. Living level: 8.4 × 12.8 m, from x 7.6 to 16.0. Bedroom
// level: 7.2 × 10.8 m, from x 0.4 to 7.6, set back 2 m from the garage's front.
const X_WEST = 0.4
const X_SPLIT = 7.6
const X_EAST = 16
const Y_FRONT = 0
const Y_BEDS = 2
const Y_BACK = 12.8
/**
 * RL of the bedroom level's pad: under its floor framing (less 10 mm), where the cut and fill
 * of the whole house balance with the living level's floor at EXAMPLE_FFL.
 */
const BEDROOM_PAD = 46.05
/** The step's retaining wall: its centreline, just outside the living level's west wall. */
const STEP_X = X_SPLIT - EXT / 2 - 0.1

const levels: Level[] = [
  { id: LIVING, name: 'Living level', elevation: 0, height: 2.7, floorType: 'slab' },
  { id: BEDROOMS, name: 'Bedroom level', elevation: SPLIT, height: 2.7 },
]

const walls: Wall[] = [
  // Living level: the outside walls, then the garage, the entry and the laundry.
  wall('l_south', LIVING, [X_SPLIT, Y_FRONT], [X_EAST, Y_FRONT]),
  wall('l_east', LIVING, [X_EAST, Y_FRONT], [X_EAST, Y_BACK]),
  wall('l_north', LIVING, [X_EAST, Y_BACK], [X_SPLIT, Y_BACK]),
  wall('l_west', LIVING, [X_SPLIT, Y_BACK], [X_SPLIT, Y_FRONT]),
  wall('garage_w', LIVING, [9.7, Y_FRONT], [9.7, 6.3], 'internal'),
  wall('garage_n', LIVING, [X_SPLIT, 6.3], [X_EAST, 6.3], 'internal'),
  wall('laundry_w', LIVING, [13.6, 6.3], [13.6, 8.6], 'internal'),
  wall('laundry_n', LIVING, [13.6, 8.6], [X_EAST, 8.6], 'internal'),
  wall('kitchen_w', LIVING, [11.6, 6.3], [11.6, Y_BACK], 'internal'),
  // Bedroom level: the outside walls, the hall and the four rooms off it.
  wall('b_south', BEDROOMS, [X_WEST, Y_BEDS], [X_SPLIT, Y_BEDS]),
  wall('b_east', BEDROOMS, [X_SPLIT, Y_BEDS], [X_SPLIT, Y_BACK]),
  wall('b_north', BEDROOMS, [X_SPLIT, Y_BACK], [X_WEST, Y_BACK]),
  wall('b_west', BEDROOMS, [X_WEST, Y_BACK], [X_WEST, Y_BEDS]),
  wall('hall_s', BEDROOMS, [X_WEST, 6.6], [X_SPLIT, 6.6], 'internal'),
  wall('hall_n', BEDROOMS, [X_WEST, 7.8], [X_SPLIT, 7.8], 'internal'),
  wall('beds_div', BEDROOMS, [4, Y_BEDS], [4, 6.6], 'internal'),
  wall('bath_div', BEDROOMS, [4.4, 7.8], [4.4, Y_BACK], 'internal'),
  // Under the step between the levels: a concrete block wall against the living level's west
  // wall, holding up the bedroom level's pad. It runs a metre past each end of the bedroom level,
  // so the pad carries on as a level terrace in front and behind.
  {
    id: 'step_wall',
    level: LIVING,
    a: [STEP_X, Y_BEDS - EXT / 2 - 1],
    b: [STEP_X, Y_BACK + EXT / 2 + 1],
    thickness: 0.2,
    kind: 'retaining',
    // Looking from its start (south) to its end (north), the bedroom level is on the left.
    retain: { high: 'left', highLevel: BEDROOM_PAD, highBench: STEP_X - 0.1 - (X_WEST - EXT / 2), lowLevel: 'pad', lowBench: 0.5 },
  },
]

const openings: Opening[] = [
  // Living level
  opening('front_door', 'l_south', 'door', 1.05, 0.92),
  opening('garage_door', 'l_south', 'garage', 5.25, 4.8),
  opening('garage_entry', 'garage_w', 'door', 4.8, 0.82, { flipSwing: true }),
  opening('entry_living', 'garage_n', 'opening', 1.05, 1.2),
  opening('laundry_door', 'garage_n', 'door', 7.2, 0.82),
  opening('laundry_living', 'laundry_w', 'door', 1.2, 0.82, { flipSwing: true }),
  // The half flight up to the bedroom level goes through the step's wall: full height on this side.
  opening('stair_low', 'l_west', 'opening', 5.6, 1, { height: 2.7 }),
  // The living room and the kitchen are one space, through a wide opening.
  opening('kitchen_living', 'kitchen_w', 'opening', 3.6, 4.2),
  opening('living_slider', 'l_north', 'window', 6.45, 2.7, { height: 2.1, sill: 0 }),
  opening('dining_window', 'l_north', 'window', 3, 1.8),
  opening('kitchen_window', 'l_east', 'window', 10.2, 1.5, { height: 1, sill: 1.05 }),
  opening('laundry_window', 'l_east', 'window', 7.45, 0.9, { height: 0.9, sill: 1.2 }),
  opening('garage_window', 'l_east', 'window', 3, 1.2, { height: 0.6, sill: 1.5 }),
  // Bedroom level
  opening('stair_high', 'b_east', 'opening', 5.2, 1),
  opening('bed2_door', 'hall_s', 'door', 2.9, 0.82, { flipSwing: true }),
  opening('bed3_door', 'hall_s', 'door', 4.6, 0.82, { flipSwing: true, flipHinge: true }),
  opening('main_door', 'hall_n', 'door', 3.4, 0.82, { flipHinge: true }),
  opening('bath_door', 'hall_n', 'door', 5.4, 0.82),
  opening('bed2_window', 'b_south', 'window', 1.9, 1.8),
  opening('bed3_window', 'b_south', 'window', 5.4, 1.8),
  opening('bed2_side', 'b_west', 'window', 8.5, 1.2),
  opening('hall_window', 'b_west', 'window', 5.6, 0.6, { height: 1.5, sill: 0.6 }),
  opening('main_window', 'b_west', 'window', 2.5, 1.8),
  opening('bath_window', 'b_north', 'window', 1.6, 1, { height: 0.9, sill: 1.2 }),
]

const rooms: Room[] = [
  room('r_garage', LIVING, 'Garage', [12.85, 3.15]),
  room('r_entry', LIVING, 'Entry', [8.65, 3.15]),
  // The ground falls away under the laundry and the kitchen: they're on piers, the rest on the slab.
  { ...room('r_laundry', LIVING, 'Laundry', [14.8, 7.45]), foundation: 'piers' },
  room('r_living', LIVING, 'Living', [10.3, 8.6]),
  { ...room('r_kitchen', LIVING, 'Kitchen and dining', [13.8, 10.6]), foundation: 'piers' },
  room('r_bed2', BEDROOMS, 'Bedroom 2', [2.2, 4.3]),
  room('r_bed3', BEDROOMS, 'Bedroom 3', [5.8, 4.3]),
  room('r_hall', BEDROOMS, 'Hall', [4, 7.2]),
  room('r_main', BEDROOMS, 'Main bedroom', [2.4, 10.3]),
  room('r_bath', BEDROOMS, 'Bathroom', [6, 10.3]),
]

const areas: Area[] = [
  // From the street to the garage door. It follows the ground, so it changes no levels.
  { id: 'a_drive', level: LIVING, name: 'Driveway', kind: 'driveway', top: 0, pts: [[10.2, -5.35], [15.5, -5.2], [15.5, -EXT / 2], [10.2, -EXT / 2]] },
  { id: 'a_deck', level: LIVING, name: 'Deck', kind: 'deck', top: 0, pts: [[9, Y_BACK + EXT / 2], [15, Y_BACK + EXT / 2], [15, 16], [9, 16]] },
  { id: 'a_lawn', level: LIVING, name: 'Back lawn', kind: 'garden', top: 0, pts: [[-1, 15], [8.6, 15], [8.6, 21], [-1, 21]] },
]

/** The eaves line of a rectangle, counter-clockwise from its south-west corner. */
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

const roofs: Roof[] = [
  // Hip roofs on each level, to the outside of the walls.
  { id: 'roof_living', level: LIVING, pts: rect(X_SPLIT - EXT / 2, Y_FRONT - EXT / 2, X_EAST + EXT / 2, Y_BACK + EXT / 2), type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0 },
  { id: 'roof_bedrooms', level: BEDROOMS, pts: rect(X_WEST - EXT / 2, Y_BEDS - EXT / 2, X_SPLIT + EXT / 2, Y_BACK + EXT / 2), type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0 },
]

const stairs: Stair[] = [
  // From the living room up to the bedroom level's hall: six risers, ending at the step's wall.
  { id: 'stair_split', level: LIVING, at: [X_SPLIT + EXT / 2 + 5 * 0.27, 7.2], angle: 180, width: 1, base: 0, rise: SPLIT, going: 0.27, shape: 'straight', turn: 'left' },
]

const furniture: Furniture[] = [
  piece('f_car', LIVING, 'car', [12.85, 3.2], 0),
  piece('f_sofa', LIVING, 'sofa-3', [8.19, 10.2], 90),
  piece('f_coffee', LIVING, 'coffee-table', [9.5, 10.2], 90),
  piece('f_dining', LIVING, 'dining-6', [12.2, 10.1], 0),
  piece('f_bench', LIVING, 'bench', [15.565, 10.2], 270),
  piece('f_fridge', LIVING, 'fridge', [15.49, 11.85], 270),
  piece('f_washer', LIVING, 'washer', [15.565, 7.6], 270),
  piece('f_bed_main', BEDROOMS, 'bed-queen', [2.44, 11.65], 0),
  piece('f_bed2', BEDROOMS, 'bed-double', [3.005, 4.3], 270),
  piece('f_bed3', BEDROOMS, 'bed-king-single', [6.45, 4.0], 270),
  piece('f_vanity', BEDROOMS, 'vanity', [6.0, 12.415], 0),
  piece('f_shower', BEDROOMS, 'shower', [7.015, 12.215], 0),
  piece('f_toilet', BEDROOMS, 'toilet', [4.805, 9.0], 90),
]

/** Sensible facts for the checks: a CDC on an ordinary lot, the street to the south. */
export function exampleChecks(frontEdge: number): CheckSettings {
  return { pathway: 'cdc', councils: {}, battleAxe: false, frontEdge, lotWidth: 23.4 }
}

/**
 * The example plan. `frontEdge` is the index of the block's street (south) boundary in the
 * survey as read, which the checks and the 3D view's street side both use.
 */
export function examplePlan(frontEdge: number): Plan {
  return {
    version: 1,
    name: EXAMPLE_NAME,
    levels: levels.map(l => ({ ...l })),
    walls: walls.map(w => ({ ...w })),
    openings: openings.map(o => ({ ...o })),
    rooms: rooms.map(r => ({ ...r })),
    areas: areas.map(a => ({ ...a })),
    roofs: roofs.map(r => ({ ...r })),
    stairs: stairs.map(s => ({ ...s })),
    furniture: furniture.map(f => ({ ...f })),
    placement: { e: SAMPLE_E0 + 3.2, n: SAMPLE_N0 + 6, rotation: 0, ffl: EXAMPLE_FFL },
    earthworks: { margin: 0.5, cutBatter: 2, fillBatter: 2, subfloor: 0.4 },
    checks: exampleChecks(frontEdge),
  }
}
