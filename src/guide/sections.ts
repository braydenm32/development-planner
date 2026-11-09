// The getting-started guide's words: one short section for each step of a design, in the order
// people usually go. Kept apart from the sheet so the hints on the plan can link to a section by
// its id, and a test can check every link lands somewhere.

export type Picture = 'block' | 'walls' | 'rooms' | 'openings' | 'levels' | 'roof' | 'earthworks' | 'checks'

export interface Section {
  id: string
  title: string
  picture?: Picture
  /** Short steps, one sentence or two each. */
  steps: string[]
}

export const SECTIONS: Section[] = [
  {
    id: 'block',
    title: 'Your block',
    picture: 'block',
    steps: [
      'Import the survey your surveyor gave you: a DXF file with the boundary, contours and spot levels. Drop it on the start screen, or choose it.',
      'No survey yet? Sketch the block instead: its width, depth and rough fall. Swap in the real survey later under Site › More › Replace survey.',
      'After an import, check the layers under Site › More › Survey layers: which one is the boundary, the contours and the levels.',
      'Say which side faces the street. The checks measure the setbacks from it, and the 3D Street view looks from it.',
    ],
  },
  {
    id: 'walls',
    title: 'Walls',
    picture: 'walls',
    steps: [
      'Press W (or pick Wall on the tool rail), then click each corner of the outside walls.',
      'Click the first corner again to close the outline. Double-click, or press Esc, to stop without closing it.',
      'For an exact wall, type its length in mm and press Enter. Hold Shift to draw without snapping.',
      'With Select (V), drag a wall to move it, or its ends to reshape it. Delete removes what’s selected.',
    ],
  },
  {
    id: 'rooms',
    title: 'Rooms',
    picture: 'rooms',
    steps: [
      'Press R and click inside each space the walls close round, to name it as a room.',
      'Rooms give you the floor areas. Each one can sit on a slab or on piers.',
    ],
  },
  {
    id: 'openings',
    title: 'Doors and windows',
    picture: 'openings',
    steps: [
      'Press D for a door or N for a window, then click on a wall. G adds a garage door, O an opening with no door.',
      'Select one to set its width, height and which way it opens, or drag it along its wall.',
    ],
  },
  {
    id: 'levels',
    title: 'Levels',
    picture: 'levels',
    steps: [
      'Each floor of the house is a level. Add them in Design › Floors, each with its height above the ground floor.',
      'A split level is two levels side by side, one a step up the slope from the other.',
      'Each level is built as a slab on the ground or a framed floor on piers. That changes what’s dug out under it.',
    ],
  },
  {
    id: 'roof',
    title: 'Roof',
    picture: 'roof',
    steps: [
      'Press F and click inside the walls to put a roof on that part of the house.',
      'Select the roof to set its type (hip, gable, skillion or flat), its pitch and the overhang. The Roof number at the top says how high it rises above the ground.',
    ],
  },
  {
    id: 'earthworks',
    title: 'Earthworks and retaining walls',
    picture: 'earthworks',
    steps: [
      'Earthworks › Place moves the house on the block and sets how high its floor is (the FFL).',
      'Earthworks › Cut & fill shows the digging and filling a slab needs. When they’re out of balance, Balance moves the floor to even them up.',
      'Press T for a retaining wall: click its two ends, then say which side the earth is on. It holds the ground back so the batters don’t run to the boundary.',
    ],
  },
  {
    id: 'checks',
    title: 'Checks',
    picture: 'checks',
    steps: [
      'Design › Checks tests the design against the planning rules as you draw: the NSW Housing Code for a CDC, or your council’s rules for a DA.',
      'A rule that needs a fact the survey doesn’t hold, like the street side, says so and asks for it.',
      'It’s a guide, not legal advice. Confirm with your council or a certifier before relying on it.',
    ],
  },
  {
    id: 'costs',
    title: 'Costs',
    steps: [
      'Costs › Estimate prices the design from its own quantities: floors, walls, roof, earthworks and retaining walls.',
      'Costs › Materials changes what it’s built from. Costs › Quotes puts in a price someone has given you, in place of a line’s estimate.',
    ],
  },
  {
    id: 'share',
    title: 'Share and print',
    steps: [
      'Share › Plans (PDF) downloads a plan set for a builder or the council.',
      'Share › Send makes a view-only link, or one project file with the survey and the plan for someone to open in their own copy.',
      'Share › 3D print makes a model of the house on the block.',
      'Keep a copy any time: Download a backup (project file) in the project menu.',
    ],
  },
]

/** The Words section (the glossary) comes last. */
export const WORDS_ID = 'words'
