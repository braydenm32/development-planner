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
      { keys: ['T'], what: 'Retaining wall' },
      { keys: ['D'], what: 'Door' },
      { keys: ['N'], what: 'Window' },
      { keys: ['O'], what: 'Opening' },
      { keys: ['G'], what: 'Garage door' },
      { keys: ['R'], what: 'Room' },
      { keys: ['A'], what: 'Area' },
      { keys: ['F'], what: 'Roof' },
      { keys: ['S'], what: 'Stair' },
      { keys: ['U'], what: 'Furniture' },
      { keys: ['L'], what: 'Measure: distance and height between two points' },
      { keys: ['E'], what: 'Note: a text label on the plan' },
      { keys: ['X'], what: 'Section line: two clicks across the plan (Design › Sections)' },
      { keys: ['B'], what: 'Grading brush: paint ground to cut or fill to a level (Earthworks › Cut & fill); [ and ] change its size' },
      { keys: ['M'], what: 'Move the house on the block' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: ['+'], what: 'Zoom in' },
      { keys: ['-'], what: 'Zoom out' },
      { keys: ['0'], what: 'Fit the house' },
      { keys: ['shift+0'], what: 'Fit the block' },
      { keys: ['mod+K'], what: 'Search everything' },
      { keys: ['?'], what: 'This list' },
    ],
  },
  {
    title: 'Pick',
    rows: [
      { keys: ['mod+click'], what: 'Add to or take from the selection' },
      { keys: ['shift+drag'], what: 'Box around empty ground: pick what is inside' },
      { keys: ['mod+A'], what: 'Pick everything on this floor' },
      { keys: ['Esc'], what: 'Clear the selection, or finish what you are drawing' },
    ],
  },
  {
    title: 'Change',
    rows: [
      { keys: ['arrows'], what: 'Nudge the selection 10 mm' },
      { keys: ['shift+arrows'], what: 'Nudge it 100 mm' },
      { keys: ['Q'], what: 'Turn furniture a quarter turn (Shift+Q the other way)' },
      { keys: ['mod+C'], what: 'Copy' },
      { keys: ['mod+V'], what: 'Paste' },
      { keys: ['mod+D'], what: 'Duplicate' },
      { keys: ['Delete'], what: 'Delete the selection (the toast has Undo)' },
      { keys: ['mod+Z'], what: 'Undo' },
      { keys: ['mod+shift+Z'], what: 'Redo (Ctrl+Y works too)' },
      { keys: ['mod+S'], what: 'Save now, and say where' },
    ],
  },
  {
    title: 'Drawing and typing',
    rows: [
      { keys: ['0–9'], what: 'Type a wall or outline side’s length in mm, then Enter' },
      { keys: ['Enter'], what: 'Close an area or roof outline' },
      { keys: ['shift+drag'], what: 'While dragging an item, turn snapping off' },
      { keys: ['Enter'], what: 'In a number box, keep the value (0.9 or 0.9m means 900 mm)' },
      { keys: ['Esc'], what: 'In a number box, put the old value back' },
    ],
  },
]
