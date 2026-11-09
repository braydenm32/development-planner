import type { Plan, Wall } from '../model'

const L = 'level_ground'
const wall = (id: string, a: [number, number], b: [number, number], thickness: number): Wall => ({
  id,
  level: L,
  a,
  b,
  thickness,
  kind: thickness >= 0.2 ? 'external' : 'internal',
})

/**
 * A made-up ground floor for tests: a double garage, an entry hall, a laundry and a study,
 * with 300 mm external and 110 mm internal walls (the wall between the study and the laundry is a thick one). Dimensions in metres. It isn't anyone's house.
 */
export function garageFloor(): Plan {
  return {
    version: 1,
    levels: [{ id: L, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls: [
      wall('garage_w', [0.15, 4.25], [0.15, 10.55], 0.3),
      wall('garage_s', [0.15, 4.25], [5.45, 4.25], 0.3),
      wall('office_w', [5.45, 4.345], [5.45, 0.15], 0.3),
      wall('south', [5.45, 0.15], [9.95, 0.15], 0.3),
      wall('east', [9.95, 0.15], [9.95, 13.85], 0.3),
      wall('hall_n', [9.95, 13.85], [8.1, 13.85], 0.3),
      wall('hall_w', [8.1, 13.85], [8.1, 4.345], 0.11),
      wall('garage_n', [0.15, 10.55], [8.1, 10.55], 0.11),
      wall('laundry_n', [5.45, 4.345], [9.95, 4.345], 0.11),
      wall('office_n', [5.45, 3.05], [9.95, 3.05], 0.3),
    ],
    openings: [
      { id: 'garage_door', wall: 'garage_n', kind: 'opening', offset: 4.0, width: 6.0, height: 2.4, sill: 0, flipHinge: false, flipSwing: false },
      { id: 'entry', wall: 'hall_n', kind: 'door', offset: 0.9, width: 0.92, height: 2.04, sill: 0, flipHinge: false, flipSwing: false },
      { id: 'stairs_gap', wall: 'east', kind: 'opening', offset: 11.6, width: 2.0, height: 2.1, sill: 0, flipHinge: false, flipSwing: false },
      { id: 'office_window', wall: 'east', kind: 'window', offset: 1.5, width: 1.8, height: 1.2, sill: 0.9, flipHinge: false, flipSwing: false },
      { id: 'office_door', wall: 'office_n', kind: 'door', offset: 3.6, width: 0.82, height: 2.04, sill: 0, flipHinge: false, flipSwing: false },
    ],
    rooms: [
      { id: 'r1', level: L, name: 'Garage', at: [4.0, 7.5] },
      { id: 'r2', level: L, name: 'Entry', at: [9.0, 9.0] },
      { id: 'r3', level: L, name: 'Laundry', at: [7.7, 3.7] },
      { id: 'r4', level: L, name: 'Study', at: [7.7, 1.6] },
    ],
    areas: [
      { id: 'a1', level: L, name: 'Patio', pts: [[0.3, 10.605], [8.0, 10.605], [8.0, 16.6], [0.3, 16.6]] },
    ],
    roofs: [],
    stairs: [],
    furniture: [],
    placement: { e: 1005, n: 1000, rotation: 0, ffl: 84 },
  }
}

/** Four outside walls round a box, on a level. */
const box = (level: string, id: string, x0: number, y0: number, x1: number, y1: number): Wall[] =>
  (
    [
      [[x0, y0], [x1, y0]],
      [[x1, y0], [x1, y1]],
      [[x1, y1], [x0, y1]],
      [[x0, y1], [x0, y0]],
    ] as [[number, number], [number, number]][]
  ).map(([a, b], i) => ({ id: `${id}_${i}`, level, a, b, thickness: 0.27, kind: 'external' }))

/**
 * A made-up split level for tests, stepping up a slope to the north: a lower wing (x 0..8,
 * y 0..6), a middle wing half a level up beside it (y 6..12) whose floor is a slab poured on
 * the ground, and a top level over the lower wing. A stair climbs from the lower level to the
 * middle one. It isn't anyone's house.
 */
export function splitLevels(): Plan {
  return {
    version: 1,
    levels: [
      { id: 'level_low', name: 'Lower level', elevation: 0, height: 2.7 },
      { id: 'level_mid', name: 'Middle level', elevation: 1.2, height: 2.7 },
      { id: 'level_top', name: 'Top level', elevation: 3.0, height: 2.7 },
    ],
    walls: [...box('level_low', 'low', 0, 0, 8, 6), ...box('level_mid', 'mid', 0, 6, 8, 12), ...box('level_top', 'top', 0, 0, 8, 6)],
    openings: [],
    rooms: [
      { id: 'r_low', level: 'level_low', name: 'Rumpus', at: [4, 3] },
      { id: 'r_mid', level: 'level_mid', name: 'Living', at: [4, 9] },
      { id: 'r_top', level: 'level_top', name: 'Bedroom', at: [4, 3] },
    ],
    areas: [{ id: 'mid_slab', level: 'level_mid', name: 'Middle slab', kind: 'slab', top: 0, pts: [[0, 6], [8, 6], [8, 12], [0, 12]] }],
    roofs: [],
    stairs: [
      { id: 'stair_up', level: 'level_low', at: [6, 4], angle: 90, width: 0.9, base: 0, rise: 1.2, going: 0.25, shape: 'straight', turn: 'left', toLevel: 'level_mid' },
    ],
    furniture: [],
    placement: { e: 1006, n: 1004, rotation: 0, ffl: 82 },
  }
}
