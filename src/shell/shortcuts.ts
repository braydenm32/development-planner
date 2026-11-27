// Every keyboard shortcut, in groups, for the "?" overlay and More › Keyboard shortcuts.
// `mod` is ⌘ on a Mac and Ctrl elsewhere (see shortcutText in src/nav/keys.ts).

export interface ShortcutGroup {
  title: string
  rows: { keys: string[]; what: string }[]
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Tools',
    rows: [
      { keys: ['V'], what: 'Select' },
      { keys: ['W'], what: 'Wall' },
      { keys: ['shift+W'], what: 'Rectangle room: four walls and their room from two corners' },
      { keys: ['T'], what: 'Retaining wall' },
      { keys: ['D'], what: 'Door' },
      { keys: ['N'], what: 'Window' },
      { keys: ['O'], what: 'Opening' },
      { keys: ['G'], what: 'Garage door' },
      { keys: ['R'], what: 'Room' },
      { keys: ['A'], what: 'Outdoor area' },
      { keys: ['F'], what: 'Roof' },
      { keys: ['S'], what: 'Stair' },
      { keys: ['U'], what: 'Furniture' },
      { keys: ['L'], what: 'Measure: distance and height between two points' },
      { keys: ['E'], what: 'Note: a text label on the plan' },
      { keys: ['K'], what: 'Sketch: construction lines, arcs, circles and curves to snap to' },
      { keys: ['X'], what: 'Section line: two clicks across the plan (Design › Sections)' },
      { keys: ['B'], what: 'Grading brush: paint ground to cut or fill to a level (Earthworks › Cut & fill); [ and ] change its size' },
      { keys: ['M'], what: 'Move the house on the block' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: ['+'], what: 'Zoom in (the plan, or the 3D view)' },
      { keys: ['-'], what: 'Zoom out' },
      { keys: ['arrows'], what: 'Move the plan when nothing is picked (Shift: further); in the 3D view, turn and tilt it' },
      { keys: ['0'], what: 'Fit the house' },
      { keys: ['shift+0'], what: 'Fit the block' },
      { keys: ['Space+drag'], what: 'Move the plan, whatever is under the pointer (two fingers on a trackpad move it too)' },
      { keys: ['PageUp', 'PageDown'], what: 'Draw on the level above or below' },
      { keys: ['Tab'], what: 'From the top of the page: skip to the panel, the plan tools, the plan or the selection. The tool rail is one stop; arrows move along it' },
      { keys: ['mod+K'], what: 'Search everything' },
      { keys: ['?'], what: 'This list' },
    ],
  },
  {
    title: 'Pick',
    rows: [
      { keys: ['mod+click'], what: 'Add to or take from the selection' },
      { keys: ['shift+drag'], what: 'Box around empty ground: pick what is inside' },
      { keys: ['right-click'], what: 'A menu of what can be done with what is under the pointer' },
      { keys: ['mod+A'], what: 'Pick everything on this floor' },
      { keys: ['Esc'], what: 'End what you are drawing; press it again to go back to Select, and once more to clear the selection' },
    ],
  },
  {
    title: 'Change',
    rows: [
      { keys: ['arrows'], what: 'Nudge the selection 10 mm' },
      { keys: ['shift+arrows'], what: 'Nudge it 100 mm' },
      { keys: ['Q'], what: 'Turn furniture a quarter turn clockwise (Shift+Q the other way)' },
      { keys: ['H'], what: 'Mirror a corner sofa, L-shaped bench or desk, bath or pool left to right' },
      { keys: ['mod+C'], what: 'Copy' },
      { keys: ['mod+X'], what: 'Cut: copy, then take it away (paste puts it back where it was)' },
      { keys: ['mod+V'], what: 'Paste (in place on another level)' },
      { keys: ['mod+shift+V'], what: 'Paste in place' },
      { keys: ['mod+D'], what: 'Duplicate (a door or window gets a copy beside it in its wall)' },
      { keys: ['Delete'], what: 'Delete the selection (the toast has Undo)' },
      { keys: ['mod+Z'], what: 'Undo' },
      { keys: ['mod+shift+Z'], what: 'Redo (Ctrl+Y works too)' },
      { keys: ['mod+S'], what: 'Save now, and say where' },
    ],
  },
  {
    title: 'Drawing and typing',
    rows: [
      { keys: ['0–9'], what: 'Type a wall or outline side’s length in mm, then Enter (3000<45 sets the angle too; 4.5m is metres)' },
      { keys: ['0–9', 'X'], what: 'Rectangle room: type width x depth in mm (4000x3000), before or after its first corner, then Enter or click' },
      // The plan is drawn with a pointer; the keyboard's way to add things is in the panels (AX-02).
      { keys: ['Tab', 'Enter'], what: 'Without a mouse: add walls, doors and windows by typing in Design › Walls & doors, and furniture in Design › Furniture. The plan itself is drawn with a mouse, pen or finger' },
      { keys: ['Enter'], what: 'Close an outdoor area or roof outline' },
      { keys: ['Shift'], what: 'While drawing, keep the wall or line square to the house' },
      { keys: ['Alt'], what: 'While drawing or dragging, turn snapping off (Option on a Mac)' },
      { keys: ['Enter'], what: 'In a number box, keep the value and stay in the box (a bare number is mm; 0.9 or 9m is metres)' },
      { keys: ['Esc'], what: 'In a number box, put the old value back and leave the box' },
    ],
  },
]
