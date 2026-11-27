import type { Tool } from '../plan/store'

export interface ToolDef {
  id: Tool
  label: string
  /** Keyboard shortcut. */
  key: string
  /** Icon on the tool rail (see src/nav/icons.tsx); the first letter shows when it has none. */
  icon?: string
  /** Lives under an area's More instead of on the tool rail (rarely used). */
  more?: boolean
  /** Its name under the icon on the rail, when `label` is too long to fit. */
  short?: string
  /** Only on a computer: a phone shows what it drew, but has no way to draw it. */
  desk?: boolean
  /** What it's for, in a few words, for the rail's tip: "Area: a driveway, deck, slab or lawn outside the house" (HO-32). */
  tip: string
  /** Its group on the rail; a line divides one group from the next. */
  group: ToolGroup
}

/** The rail's groups, top to bottom: pick, the house's shell, its openings, inside it, outside it, and notes on the drawing. */
export const TOOL_GROUPS = ['select', 'build', 'openings', 'rooms', 'outside', 'notes'] as const
export type ToolGroup = (typeof TOOL_GROUPS)[number]

/** Every plan tool, in order. The tool rail renders from this list. */
export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', key: 'V', icon: 'select', group: 'select', tip: 'pick, move or change what is drawn' },
  { id: 'wall', label: 'Wall', key: 'W', icon: 'wall', group: 'build', tip: 'the house’s outside and inside walls, corner by corner' },
  { id: 'retaining', label: 'Retaining wall', key: 'T', icon: 'retain', short: 'Retaining', group: 'outside', tip: 'a wall in the yard that holds back earth' },
  { id: 'door', label: 'Door', key: 'D', icon: 'door', group: 'openings', tip: 'click a wall to put a door in it' },
  { id: 'window', label: 'Window', key: 'N', icon: 'window', group: 'openings', tip: 'click a wall to put a window in it' },
  { id: 'opening', label: 'Wall opening', key: 'O', icon: 'opening', short: 'Opening', group: 'openings', tip: 'a gap in a wall with no door, such as an archway' },
  { id: 'garage', label: 'Garage door', key: 'G', icon: 'garage', short: 'Garage', group: 'openings', tip: 'click a wall to put a garage door in it' },
  { id: 'room', label: 'Room', key: 'R', icon: 'room', group: 'rooms', tip: 'click inside walls to name a room and get its area' },
  { id: 'area', label: 'Outdoor area', key: 'A', icon: 'area', short: 'Outdoor', group: 'outside', tip: 'a driveway, deck, slab or lawn outside the house' },
  { id: 'roof', label: 'Roof', key: 'F', icon: 'roof', group: 'build', tip: 'click inside the walls to roof them, or draw its outline' },
  { id: 'stair', label: 'Stair', key: 'S', icon: 'stair', group: 'build', tip: 'steps from this level up to the next' },
  { id: 'furniture', label: 'Furniture', key: 'U', icon: 'furniture', group: 'rooms', tip: 'beds, sofas, benches and fittings, to check things fit' },
  { id: 'move', label: 'Move on site', key: 'M', icon: 'move', more: true, short: 'Move house', group: 'outside', tip: 'drag the whole house to another spot on the block' },
  // Measure and Note use the keys L (length) and E (edit a label); every other plan key is taken.
  { id: 'measure', label: 'Measure', key: 'L', icon: 'ruler', group: 'notes', tip: 'a length between two points, which stays on the plan' },
  { id: 'note', label: 'Note', key: 'E', icon: 'note', group: 'notes', tip: 'words on the plan, with an arrow if you like' },
  // K for sKetch: construction lines that change nothing, to draw over and snap to.
  { id: 'sketch', label: 'Sketch', key: 'K', icon: 'sketch', desk: true, group: 'notes', tip: 'guide lines that change nothing, to draw over and snap to' },
]

/**
 * The rail in Design: every tool but Move, a group at a time (the list above is in the order the
 * tools were added, which the keyboard help and search keep).
 */
export const DESIGN_RAIL: ToolDef[] = TOOL_GROUPS.flatMap(g => TOOLS.filter(t => t.group === g && !t.more))

/**
 * The rail in Earthworks: the ground's own tools (LF-30). Doors, windows, stairs and furniture are
 * Design's; their keys still work here. The driveway is the Area tool set to Driveway, and the
 * grading brush isn't a plan tool at all (src/grading), so the rail gives each a button of its own.
 */
export const EARTHWORKS_RAIL = ['select', 'move', 'retaining', 'driveway', 'brush', 'measure'] as const

/** Tools whose options show next to the rail. */
export const TOOLS_WITH_OPTIONS: Tool[] = ['wall', 'retaining', 'door', 'window', 'opening', 'garage', 'room', 'area', 'roof', 'stair', 'furniture', 'sketch']
