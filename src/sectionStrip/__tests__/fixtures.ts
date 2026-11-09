import type { Opening, Plan, Roof, Wall } from '../../plan/model'

/** Four outside walls round a box, on a level: south, east, north, west. */
const box = (level: string, x0: number, x1: number, y0: number, y1: number): Wall[] =>
  (
    [
      [[x0, y0], [x1, y0]],
      [[x1, y0], [x1, y1]],
      [[x1, y1], [x0, y1]],
      [[x0, y1], [x0, y0]],
    ] as [[number, number], [number, number]][]
  ).map(([a, b], i) => ({ id: `${level}_${i}`, level, a, b, thickness: 0.27, kind: 'external' }))

const gap = (id: string, wall: string, offset: number): Opening => ({ id, wall, kind: 'opening', offset, width: 1.2, height: 2.1, sill: 0, flipHinge: false, flipSwing: false })

/** A skillion over a wing, falling to the east (its low edge is the east one). */
const skillion = (id: string, level: string, x0: number, x1: number): Roof => ({
  id,
  level,
  pts: [
    [x0, 0],
    [x1, 0],
    [x1, 9],
    [x0, 9],
  ],
  type: 'skillion',
  pitch: 4,
  overhang: 0.45,
  gables: [false, false, false, false],
  lowEdge: 1,
})

/**
 * A made-up three-level split house for the sample block, stepping up its slope to the west: a
 * Living wing at the bottom (x 12..20), an Entry wing a half level up (x 6..12), and a Bedrooms wing
 * another half level up (x 0..6), each 9 m deep with its own skillion roof. A stair climbs from
 * Living to Entry and another from Entry to Bedrooms, both on the house's long axis (y 4.5), and a
 * retaining wall holds back the slope behind Bedrooms. It isn't anyone's house.
 */
export function steppedHouse(): Plan {
  return {
    version: 1,
    name: 'Split level sample',
    levels: [
      { id: 'living', name: 'Living', elevation: 0, height: 2.7 },
      { id: 'entry', name: 'Entry', elevation: 1.5, height: 2.7 },
      { id: 'bedrooms', name: 'Bedrooms', elevation: 3, height: 2.7 },
    ],
    walls: [
      ...box('living', 12, 20, 0, 9),
      ...box('entry', 6, 12, 0, 9),
      ...box('bedrooms', 0, 6, 0, 9),
      { id: 'rw_back', level: 'bedrooms', a: [-1.5, -1], b: [-1.5, 10], thickness: 0.2, kind: 'retaining' },
    ],
    openings: [gap('g_living', 'living_3', 4.5), gap('g_entry_e', 'entry_1', 4.5), gap('g_entry_w', 'entry_3', 4.5), gap('g_bed', 'bedrooms_1', 4.5)],
    rooms: [
      { id: 'r_living', level: 'living', name: 'Kitchen, dining & living', at: [16, 6.5] },
      { id: 'r_entry', level: 'entry', name: 'Entry', at: [9, 6.5] },
      { id: 'r_bed', level: 'bedrooms', name: 'Bedroom 1', at: [3, 6.5] },
    ],
    areas: [],
    roofs: [skillion('roof_living', 'living', 12, 20), skillion('roof_entry', 'entry', 6, 12), skillion('roof_bed', 'bedrooms', 0, 6)],
    stairs: [
      { id: 'stair_1', level: 'living', at: [14.6, 4.5], angle: 180, width: 1, base: 0, rise: 1.5, going: 0.25, shape: 'straight', turn: 'left', toLevel: 'entry' },
      { id: 'stair_2', level: 'entry', at: [8.6, 4.5], angle: 180, width: 1, base: 0, rise: 1.5, going: 0.25, shape: 'straight', turn: 'left', toLevel: 'bedrooms' },
    ],
    furniture: [],
    placement: { e: 5002, n: 8012, rotation: 0, ffl: 43.8 },
  } as Plan
}
