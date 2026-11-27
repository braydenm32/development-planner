// The words people bring to search from other planners and from everyday speech, which the
// menu's own names and keywords (./menu.ts) don't cover: "staircase", "blueprint", "basement",
// "balcony" (HO-33, LD-21, CB-38, CB-27). Kept apart from the menu so its entries stay about what
// the app has. Three lists:
//   MORE_WORDS  extra words an entry is found by, by the entry's id
//   LEADS       for an everyday word, the one result that comes first ("print" means the PDF plans)
//   NOT_HERE    things other planners do that this one doesn't, each with a plain line that says so

/** Extra search words, by menu entry id. */
export const MORE_WORDS: Record<string, string[]> = {
  // Tracing over a picture or a PDF of a floor plan lives with the block's other drawings (CB-27).
  features: ['background', 'background image', 'image', 'blueprint', 'floor plan picture', 'underlay', 'trace a plan', 'tracing', 'scan', 'photo of a plan', 'import image', 'reference drawing'],
  floors: ['level', 'second floor', 'second storey', 'two storey', 'double storey', 'ground floor', 'basement', 'cellar', 'downstairs', 'lower floor', 'undercroft', 'attic', 'loft', 'mezzanine'],
  rooms: ['bedroom', 'bathroom', 'kitchen', 'living room', 'lounge', 'rooms list', 'room names'],
  place: ['rotate', 'rotate the house', 'turn', 'spin', 'swing the house', 'move the house', 'shift the house', 'reposition'],
  plans: ['print the plans', 'printout', 'paper plans', 'hard copy', 'plan set'],
  'tool-room': ['living room', 'lounge', 'toilet', 'study', 'name rooms'],
  'tool-stair': ['staircase', 'stairway', 'stairwell', 'flight of stairs'],
  'stair-defaults': ['staircase'],
  'tool-area': ['balcony', 'verandah', 'veranda', 'porch', 'terrace', 'paving', 'path', 'lawn', 'courtyard', 'alfresco', 'pergola', 'carport'],
  'tool-sketch': ['curved', 'curved wall', 'round', 'rectangle', 'square', 'box', 'shape', 'grid', 'guides'],
  'tool-wall': ['rectangle', 'box', 'partition', 'outside face', 'inside face', 'wall face', 'justification', 'wall alignment', 'set out', 'clear size', 'overall size'],
  'tool-roof': ['roofing', 'ridge', 'skillion roof'],
  'tool-furniture': ['couch', 'lounge', 'bath', 'shower', 'toilet', 'vanity', 'basin', 'sink', 'fridge', 'oven', 'wardrobe', 'desk', 'chair', 'decorate', 'furnish'],
  furniture: ['couch', 'furnish', 'decorate'],
  'open-example': ['template', 'templates', 'starter', 'sample house', 'ready made'],
  'save-state': ['saving', 'where is my work', 'is it saved', 'how do I save'],
  'kbd-copy': ['copy and paste'],
  'kbd-turn': ['rotate furniture', 'flip furniture'],
  'kbd-fields': ['metric', 'mm', 'metres or millimetres'],
  materials: ['colour', 'colours', 'finishes', 'cladding colour'],
  'camera-street': ['walk around', 'look around', 'eye level'],
  'cmd-picture': ['jpg', 'jpeg', 'photo', 'snapshot', 'save image'],
  'plan-overlays': ['grid', 'snapping'],
  sun: ['daylight'],
}

/** An everyday word that means one thing above all here: that result leads (by its search key). */
export const LEADS: Record<string, string> = {
  bedroom: 'command:tool-room',
  bathroom: 'command:tool-room',
  kitchen: 'command:tool-room',
  laundry: 'command:tool-room',
  stairs: 'command:tool-stair',
  stair: 'command:tool-stair',
  staircase: 'command:tool-stair',
  steps: 'command:tool-stair',
  print: 'tab:share/plans',
  printing: 'tab:share/plans',
  rotate: 'tab:earthworks/place',
  turn: 'tab:earthworks/place',
  template: 'command:open-example',
  save: 'command:save-state',
  level: 'tab:design/floors',
  levels: 'tab:design/floors',
  basement: 'tab:design/floors',
  upstairs: 'tab:design/floors',
  'second floor': 'tab:design/floors',
  background: 'tab:site/features',
  'background image': 'tab:site/features',
  blueprint: 'tab:site/features',
  trace: 'tab:site/features',
  balcony: 'command:tool-area',
  curved: 'command:tool-sketch',
  rectangle: 'command:rect-room',
}

export interface NotHere {
  id: string
  /** Any of these words in the search brings the row up. */
  words: string[]
  /** What it is: "Feet and inches". */
  label: string
  /** The plain line that says it isn't here, and what is. */
  says: string
}

/** What other planners do that this one doesn't: search says so, instead of "Nothing matches". */
export const NOT_HERE: NotHere[] = [
  { id: 'imperial', words: ['feet', 'foot', 'inches', 'inch', 'imperial', 'ft', 'yards'], label: 'Feet and inches', says: 'Not in this planner: it works in metres and millimetres only.' },
  { id: 'render', words: ['render', 'rendering', 'photorealistic', 'realistic', 'texture', 'textures', 'wallpaper', 'paint'], label: 'Rendered pictures and textures', says: 'Not in this planner: the 3D view shows shape, levels and shadows in plain colours.' },
  { id: 'walk', words: ['walk', 'walkthrough', 'walk-through', 'first person', 'vr', 'virtual tour', 'fly through'], label: 'Walking through the house', says: 'Not in this planner: the 3D view orbits the outside, with Street view for eye level.' },
  { id: 'mirror', words: ['mirror', 'flip', 'reflect'], label: 'Mirror or flip the plan', says: 'Not in this planner: turn the house under Earthworks › Place, or turn furniture with Q.' },
  { id: 'skylight', words: ['skylight', 'roof window', 'dormer'], label: 'Skylights and dormers', says: 'Not in this planner: roofs are hip, gable or skillion, with no openings in them.' },
  { id: 'beam', words: ['beam', 'beams', 'column', 'columns', 'post', 'structure', 'structural', 'truss', 'rafters'], label: 'Beams, posts and framing', says: 'Not in this planner: it draws walls, floors and roofs, and leaves the structure to your engineer.' },
  { id: 'electrical', words: ['electrical', 'power point', 'powerpoint', 'lighting plan', 'plumbing', 'wiring'], label: 'Electrical and plumbing plans', says: 'Not in this planner: it stops at walls, rooms, roofs and the ground.' },
]
