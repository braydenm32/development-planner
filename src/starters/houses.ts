// The starter houses: a few made-up plans covering the usual cases, to put on a block and change,
// instead of starting from an empty one. They were drawn for this app on a plain grid and aren't
// anyone's house or any builder's design. Sizes are ordinary Australian ones: 820 mm doors, a
// 920 mm front door, bedrooms of 10 to 14 m² and a main bedroom of about 16, 1.2 m halls, a
// single garage 3.6 m wide and a double 6 m, 2.7 m ceilings.
//
// Each is written down with the helpers in ./build.ts: wall centrelines in metres, x across the
// front, y back from the street, (0, 0) at the front left corner. The tests in
// src/starters/__tests__/houses.test.ts check every one builds into a sound plan.

import { buildStarter, door, frontDoor, gap, garageDoor, highWin, rect, slider, win, type StarterSpec } from './build'
import type { Plan } from '../plan/model'

const compact: StarterSpec = {
  id: 'compact-2',
  name: 'Compact two-bedroom',
  blurb: 'A small single storey: two bedrooms off a short hall, open living at the back.',
  levels: [
    {
      name: 'Ground floor',
      floor: 'slab',
      outline: rect(8.4, 11.4),
      inside: [
        [[3.6, 0], [3.6, 6.6]],
        [[4.8, 0], [4.8, 6.6]],
        [[0, 6.6], [8.4, 6.6]],
        [[0, 4.2], [3.6, 4.2]],
        [[4.8, 4.2], [8.4, 4.2]],
      ],
      rooms: [
        { type: 'bedroom', at: [1.8, 2.1], name: 'Main bedroom' },
        { type: 'bedroom', at: [6.6, 2.1] },
        { type: 'bathroom', at: [1.8, 5.4] },
        { type: 'laundry', at: [6.6, 5.4] },
        { type: 'hall', at: [4.2, 3.3] },
        { type: 'open', at: [4.2, 9] },
      ],
      openings: [
        frontDoor(4.2, 0),
        door(3.6, 2.6),
        door(3.6, 5.4),
        door(4.8, 2.6, 0.82, { flipSwing: true }),
        door(4.8, 5.4, 0.82, { flipSwing: true }),
        gap(4.2, 6.6, 1),
        win(1.8, 0, 1.8),
        win(6.6, 0, 1.8),
        highWin(0, 5.4),
        highWin(8.4, 5.4),
        slider(5.6, 11.4),
        win(2, 11.4, 1.8),
        win(0, 9, 1.5),
        win(8.4, 9, 1.5),
      ],
      roof: true,
    },
  ],
}

const family3: StarterSpec = {
  id: 'family-3',
  name: 'Three-bedroom family home',
  blurb: 'Single storey with a single garage, a main bedroom with ensuite at the front and living across the back.',
  levels: [
    {
      name: 'Ground floor',
      floor: 'slab',
      outline: rect(9, 18),
      inside: [
        [[3.6, 0], [3.6, 12.8]],
        [[4.8, 0], [4.8, 12.8]],
        [[0, 6], [3.6, 6]],
        [[0, 9.4], [3.6, 9.4]],
        [[0, 12.8], [4.8, 12.8]],
        [[4.8, 4.4], [9, 4.4]],
        [[4.8, 6.6], [9, 6.6]],
        [[4.8, 9], [9, 9]],
        [[4.8, 11], [9, 11]],
      ],
      rooms: [
        { type: 'bedroom', at: [6.9, 2.2], name: 'Main bedroom' },
        { type: 'bedroom', at: [1.8, 7.7] },
        { type: 'bedroom', at: [1.8, 11.1] },
        { type: 'ensuite', at: [6.9, 5.5] },
        { type: 'bathroom', at: [6.9, 7.8] },
        { type: 'laundry', at: [6.9, 10] },
        { type: 'garage', at: [1.8, 3] },
        { type: 'hall', at: [4.2, 6] },
        { type: 'open', at: [4.5, 15.4] },
      ],
      openings: [
        garageDoor(1.8, 0, 2.7),
        frontDoor(4.2, 0),
        door(3.6, 4.8),
        door(4.8, 2.2, 0.82, { flipSwing: true }),
        door(6, 4.4),
        door(4.8, 7.8, 0.82, { flipSwing: true }),
        door(4.8, 10, 0.82, { flipSwing: true }),
        door(9, 10),
        door(3.6, 7.7),
        door(3.6, 11),
        gap(4.2, 12.8, 1),
        win(6.9, 0, 1.8),
        highWin(9, 5.5),
        highWin(9, 7.8),
        win(0, 7.7, 1.5),
        win(0, 11.1, 1.5),
        slider(4.5, 18),
        win(1.6, 18, 1.5),
        win(7.4, 18, 1.5),
        win(9, 14.5, 1.8),
        win(0, 15.4, 1.8),
      ],
      roof: true,
      furniture: [['car', [1.8, 3], 0]],
    },
  ],
}

const family4: StarterSpec = {
  id: 'family-4',
  name: 'Four-bedroom with double garage',
  blurb: 'Single storey: the main suite at the front, three bedrooms down one side and open living at the back.',
  levels: [
    {
      name: 'Ground floor',
      floor: 'slab',
      outline: rect(12, 16.2),
      inside: [
        [[6, 0], [6, 6.6]],
        [[0, 6.6], [6, 6.6]],
        [[3.6, 6.6], [3.6, 16.2]],
        [[4.8, 7.8], [4.8, 16.2]],
        [[4.8, 7.8], [7.2, 7.8], [12, 7.8]],
        [[7.2, 0], [7.2, 7.8], [7.2, 12.6]],
        [[4.8, 10.6], [7.2, 10.6]],
        [[4.8, 12.6], [7.2, 12.6]],
        [[0, 9.8], [3.6, 9.8]],
        [[0, 13], [3.6, 13]],
        [[7.2, 4.8], [12, 4.8]],
      ],
      rooms: [
        { type: 'bedroom', at: [9.6, 2.4], name: 'Main bedroom' },
        { type: 'bedroom', at: [1.8, 8.2] },
        { type: 'bedroom', at: [1.8, 11.4] },
        { type: 'bedroom', at: [1.8, 14.6] },
        { type: 'ensuite', at: [9.6, 6.3] },
        { type: 'bathroom', at: [6, 9.2] },
        { type: 'laundry', at: [6, 11.6] },
        { type: 'garage', at: [3, 3.3] },
        { type: 'hall', at: [6.6, 3] },
        { type: 'open', at: [9.6, 12] },
      ],
      openings: [
        garageDoor(3, 0),
        frontDoor(6.6, 0),
        door(5, 6.6),
        door(7.2, 2, 0.82, { flipSwing: true }),
        door(8.4, 4.8),
        door(3.6, 8.6),
        door(3.6, 12),
        door(3.6, 14.2),
        door(4.8, 9.2, 0.82, { flipSwing: true }),
        door(4.8, 11.6, 0.82, { flipSwing: true }),
        gap(4.8, 14.4),
        win(9.6, 0, 2.1),
        highWin(12, 6.3),
        win(0, 8.2, 1.5),
        win(0, 11.4, 1.5),
        win(0, 14.6, 1.5),
        slider(9.6, 16.2, 3),
        win(6, 16.2, 1.5),
        win(12, 12, 1.8),
      ],
      roof: true,
      furniture: [
        ['car', [1.6, 3.3], 0],
        ['car', [4.4, 3.3], 0],
      ],
    },
  ],
}

/** The first floor sits a ceiling and a floor's depth above the ground floor: 2.7 + 0.3 m. */
const UPSTAIRS = 3

const twoStorey: StarterSpec = {
  id: 'two-storey-4',
  name: 'Four-bedroom two-storey',
  blurb: 'Living, study and a double garage downstairs; four bedrooms and a rumpus room upstairs.',
  levels: [
    {
      name: 'Ground floor',
      floor: 'slab',
      outline: rect(11.4, 13.2),
      inside: [
        [[6, 0], [6, 6.6]],
        [[0, 6.6], [11.4, 6.6]],
        [[8.4, 0], [8.4, 6.6]],
        [[8.4, 3.4], [11.4, 3.4]],
        [[10, 3.4], [10, 6.6]],
      ],
      rooms: [
        { type: 'study', at: [9.9, 1.7] },
        { type: 'laundry', at: [9.2, 5] },
        { type: 'toilet', at: [10.7, 5] },
        { type: 'garage', at: [3, 3.3] },
        { type: 'hall', at: [6.6, 1] },
        { type: 'open', at: [5.7, 9.9] },
      ],
      openings: [
        garageDoor(3, 0),
        frontDoor(6.9, 0),
        door(6, 4),
        door(8.4, 1.7, 0.82, { flipSwing: true }),
        door(9.2, 6.6, 0.82, { flipSwing: true }),
        door(10.7, 6.6, 0.72, { flipSwing: true }),
        gap(6.7, 6.6),
        win(9.9, 0, 1.5),
        highWin(11.4, 5, 0.6),
        slider(5.7, 13.2, 3),
        win(2, 13.2, 1.8),
        win(9.6, 13.2, 1.8),
        win(0, 9.9, 1.8),
        win(11.4, 9.9, 1.8),
      ],
      furniture: [
        ['car', [1.6, 3.3], 0],
        ['car', [4.4, 3.3], 0],
      ],
    },
    {
      name: 'First floor',
      elevation: UPSTAIRS,
      floor: 'framed',
      outline: rect(11.4, 13.2),
      inside: [
        [[6, 0], [6, 9.6]],
        [[8.4, 0], [8.4, 9.6]],
        [[0, 9.6], [11.4, 9.6]],
        [[0, 4], [6, 4]],
        [[0, 6.6], [3.2, 6.6], [6, 6.6]],
        [[3.2, 4], [3.2, 6.6], [3.2, 9.6]],
        [[8.4, 4], [11.4, 4]],
      ],
      rooms: [
        { type: 'bedroom', at: [3, 2], name: 'Main bedroom' },
        { type: 'bedroom', at: [9.9, 2] },
        { type: 'bedroom', at: [9.9, 6.8] },
        { type: 'bedroom', at: [1.6, 8.1] },
        { type: 'ensuite', at: [1.6, 5.3] },
        { type: 'other', at: [4.6, 5.3], name: 'Walk-in robe' },
        { type: 'bathroom', at: [4.6, 8.1] },
        { type: 'hall', at: [6.6, 8] },
        { type: 'living', at: [5.7, 11.4], name: 'Rumpus' },
      ],
      openings: [
        door(6, 2),
        door(1.6, 4),
        door(4.6, 4, 0.72),
        door(6, 8.1),
        door(1.6, 9.6, 0.82, { flipSwing: true }),
        door(8.4, 1.4, 0.82, { flipSwing: true }),
        door(8.4, 7, 0.82, { flipSwing: true }),
        gap(7.2, 9.6),
        win(3, 0, 2.1),
        win(7.2, 0, 0.9),
        win(9.9, 0, 1.5),
        win(11.4, 6.8, 1.5),
        win(0, 8.1, 1.5),
        highWin(0, 5.3, 0.6),
        win(5.7, 13.2, 2.4),
        win(0, 11.4, 1.5),
        win(11.4, 11.4, 1.5),
      ],
      roof: true,
    },
  ],
  // Up beside the hall's right wall, towards the front, onto the landing at the top.
  stairs: [{ from: 0, to: 1, at: [7.8, 6.2], angle: 270 }],
}

const narrow: StarterSpec = {
  id: 'narrow-3',
  name: 'Narrow-block home',
  blurb: 'About 7.5 m wide for a block of 10 m or so: a single garage, three bedrooms down a long hall, living at the back.',
  levels: [
    {
      name: 'Ground floor',
      floor: 'slab',
      outline: rect(7.5, 19.8),
      inside: [
        [[3.4, 0], [3.4, 13.2]],
        [[4.6, 0], [4.6, 13.2]],
        [[0, 13.2], [7.5, 13.2]],
        [[0, 6], [3.4, 6]],
        [[0, 10.2], [3.4, 10.2]],
        [[4.6, 3.4], [7.5, 3.4]],
        [[4.6, 5.4], [7.5, 5.4]],
        [[4.6, 8.2], [7.5, 8.2]],
        [[4.6, 11.6], [7.5, 11.6]],
      ],
      rooms: [
        { type: 'bedroom', at: [1.7, 8.1], name: 'Main bedroom' },
        { type: 'bedroom', at: [6.05, 9.9] },
        { type: 'bedroom', at: [6.05, 1.7] },
        { type: 'ensuite', at: [1.7, 11.7] },
        { type: 'bathroom', at: [6.05, 6.8] },
        { type: 'laundry', at: [6.05, 4.4] },
        { type: 'toilet', at: [6.05, 12.4] },
        { type: 'garage', at: [1.7, 3] },
        { type: 'hall', at: [4, 7] },
        { type: 'open', at: [3.75, 16.5] },
      ],
      openings: [
        garageDoor(1.7, 0, 2.7),
        frontDoor(4, 0),
        door(3.4, 4.6),
        door(3.4, 8),
        door(1.7, 10.2),
        door(4.6, 1.8, 0.82, { flipSwing: true }),
        door(4.6, 4.4, 0.82, { flipSwing: true }),
        door(4.6, 6.8, 0.82, { flipSwing: true }),
        door(4.6, 9.9, 0.82, { flipSwing: true }),
        door(4.6, 12.4, 0.72, { flipSwing: true }),
        gap(4, 13.2, 1),
        win(6.05, 0, 1.5),
        highWin(7.5, 4.4),
        highWin(7.5, 6.8),
        win(7.5, 9.9, 1.5),
        highWin(7.5, 12.4, 0.6),
        win(0, 8.1, 1.5),
        highWin(0, 11.7, 0.6),
        slider(3.75, 19.8),
        win(0, 16.5, 1.8),
        win(7.5, 16.5, 1.8),
      ],
      roof: true,
      furniture: [['car', [1.7, 3], 0]],
    },
  ],
}

/** How far the bedroom level sits above the entry level (m): seven risers of about 171 mm. */
const HALF_FLIGHT = 1.2
const SPLIT_GOING = 0.27

const split: StarterSpec = {
  id: 'split-3',
  name: 'Split-level for a sloping block',
  blurb: 'For a block that rises from the street: garage and living in front, three bedrooms a half flight up at the back.',
  levels: [
    {
      name: 'Entry level',
      floor: 'slab',
      outline: rect(12, 9.6),
      inside: [
        [[6, 0], [6, 6.6]],
        [[0, 6.6], [6, 6.6]],
        [[3, 6.6], [3, 9.6]],
        [[4.4, 6.6], [4.4, 9.6]],
        [[7.6, 0], [7.6, 3], [6, 3]],
      ],
      rooms: [
        { type: 'laundry', at: [1.5, 8.1] },
        { type: 'toilet', at: [3.7, 8.1] },
        { type: 'garage', at: [3, 3.3] },
        { type: 'hall', at: [6.8, 1.5], name: 'Entry' },
        { type: 'open', at: [9, 6] },
      ],
      openings: [
        garageDoor(3, 0),
        frontDoor(6.8, 0),
        gap(6.8, 3, 1),
        door(6, 5, 0.82, { flipSwing: true }),
        door(1.5, 6.6),
        door(4.4, 8.1, 0.72),
        door(0, 8.1),
        // The half flight goes up through the wall between the levels: full height on this side.
        gap(10.2, 9.6, 1),
        win(9.3, 0, 2.4),
        win(12, 3.2, 1.8),
        slider(12, 7),
      ],
      roof: true,
      furniture: [
        ['car', [1.6, 3.3], 0],
        ['car', [4.4, 3.3], 0],
      ],
    },
    {
      name: 'Bedroom level',
      elevation: HALF_FLIGHT,
      floor: 'framed',
      outline: rect(12, 5.4, 0, 9.6),
      inside: [
        [[0, 10.8], [12, 10.8]],
        [[4.2, 10.8], [4.2, 15]],
        [[6.6, 10.8], [6.6, 15]],
        [[9.3, 10.8], [9.3, 15]],
      ],
      rooms: [
        { type: 'bedroom', at: [2.1, 12.9], name: 'Main bedroom' },
        { type: 'bedroom', at: [7.95, 12.9] },
        { type: 'bedroom', at: [10.65, 12.9] },
        { type: 'bathroom', at: [5.4, 12.9] },
        { type: 'hall', at: [6, 10.2] },
      ],
      openings: [
        gap(10.2, 9.6, 1),
        door(2.1, 10.8),
        door(5.4, 10.8),
        door(7.95, 10.8),
        door(11.2, 10.8),
        win(2.1, 15, 1.8),
        win(0, 12.9, 1.5),
        highWin(5.4, 15),
        win(7.95, 15, 1.5),
        win(10.65, 15, 1.5),
        win(12, 12.9, 1.2),
      ],
      roof: true,
    },
  ],
  // Six treads from the living room up to the bedroom level's hall, the top one at the wall between.
  stairs: [{ from: 0, to: 1, at: [10.2, 9.6 - 0.135 - 6 * SPLIT_GOING], angle: 90, going: SPLIT_GOING }],
}

const studio: StarterSpec = {
  id: 'studio-1',
  name: 'Studio or granny flat',
  blurb: 'One bedroom in under 60 m², the most a secondary dwelling can usually be in NSW.',
  levels: [
    {
      name: 'Ground floor',
      floor: 'slab',
      outline: rect(8.4, 6.6),
      inside: [
        [[4.8, 0], [4.8, 6.6]],
        [[4.8, 3.6], [8.4, 3.6]],
      ],
      rooms: [
        { type: 'bedroom', at: [6.6, 1.8] },
        { type: 'bathroom', at: [6.6, 5.1], name: 'Bathroom and laundry' },
        { type: 'open', at: [2.4, 3.3] },
      ],
      openings: [frontDoor(2.4, 0), door(4.8, 1.8, 0.82, { flipSwing: true }), door(4.8, 5.1, 0.82, { flipSwing: true }), win(6.6, 0, 1.5), win(8.4, 1.8), highWin(8.4, 5.1), slider(2.4, 6.6, 2.1), win(0, 3.3, 1.5), win(3.9, 0, 0.9)],
      roof: true,
    },
  ],
}

/** Every starter, smallest first. */
export const STARTER_SPECS: StarterSpec[] = [studio, compact, narrow, family3, split, family4, twoStorey]

export interface Starter {
  id: string
  name: string
  blurb: string
  /** The house as an ordinary plan, at the origin (see buildStarter). */
  plan: Plan
}

let built: Starter[] | null = null

/** The starters, built once. */
export function starters(): Starter[] {
  built ??= STARTER_SPECS.map(s => ({ id: s.id, name: s.name, blurb: s.blurb, plan: buildStarter(s) }))
  return built
}

export const starterById = (id: string): Starter | undefined => starters().find(s => s.id === id)
