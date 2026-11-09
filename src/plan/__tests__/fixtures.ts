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
