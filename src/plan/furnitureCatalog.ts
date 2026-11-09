import type { Vec2 } from '../lib/geom'

/**
 * Furniture and fixtures in common Australian sizes. Every drawing is in the item's
 * own frame, in metres: x runs across its width (-w/2 to w/2) and y from its front
 * (-d/2) to its back (+d/2), which is the side that goes against a wall.
 */

/** A line of a plan symbol. Closed parts are filled white so they hide the floor under them. */
export interface SymbolPart {
  pts: Vec2[]
  closed: boolean
}

/** A block of the 3D shape: a plan outline extruded between two heights above the floor. */
export interface Solid {
  pts: Vec2[]
  z0: number
  z1: number
}

export type FurnitureGroup = 'bedroom' | 'living' | 'dining' | 'kitchen' | 'laundry' | 'bathroom' | 'study' | 'outdoor'

export const FURNITURE_GROUPS: { id: FurnitureGroup; label: string }[] = [
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'living', label: 'Living' },
  { id: 'dining', label: 'Dining' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'laundry', label: 'Laundry' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'study', label: 'Study' },
  { id: 'outdoor', label: 'Garage and outdoor' },
]

export interface CatalogItem {
  key: string
  name: string
  group: FurnitureGroup
  /** Width, depth and height (m). */
  size: [number, number, number]
  /** Its back goes against a wall: it snaps flush to a wall face and turns to face the room. */
  wall: boolean
  draw: (w: number, d: number) => SymbolPart[]
  /** A short note written on the symbol, as architects do for appliances. */
  code?: string
  /** The 3D shape; one box of the full size when missing. */
  solids?: (w: number, d: number, h: number) => Solid[]
}

// ---- drawing helpers ----

const rectPts = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]
const rect = (x0: number, y0: number, x1: number, y1: number): SymbolPart => ({ pts: rectPts(x0, y0, x1, y1), closed: true })
const line = (...pts: Vec2[]): SymbolPart => ({ pts, closed: false })

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): SymbolPart {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2))
  if (rr < 1e-4) return rect(x0, y0, x1, y1)
  const pts: Vec2[] = []
  const corners: [number, number, number][] = [
    [x1 - rr, y0 + rr, -90],
    [x1 - rr, y1 - rr, 0],
    [x0 + rr, y1 - rr, 90],
    [x0 + rr, y0 + rr, 180],
  ]
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = ((a0 + (i * 90) / 4) * Math.PI) / 180
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
    }
  }
  return { pts, closed: true }
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 24): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * rx, cy + Math.sin((i / n) * 2 * Math.PI) * ry] as Vec2)
const ellipse = (cx: number, cy: number, rx: number, ry: number): SymbolPart => ({ pts: ellipsePts(cx, cy, rx, ry), closed: true })
const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r)
const outline = (w: number, d: number) => rect(-w / 2, -d / 2, w / 2, d / 2)

const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Solid => ({ pts: rectPts(x0, y0, x1, y1), z0, z1 })
const fullBox = (w: number, d: number, h: number, z0 = 0) => box(-w / 2, -d / 2, w / 2, d / 2, z0, h)

// ---- the pieces ----

/** A bed: base, headboard and pillows, with the covers turned down. */
function bed(pillows: 1 | 2): Pick<CatalogItem, 'draw' | 'solids'> {
  const head = 0.06
  const pillowDepth = (d: number) => Math.min(0.35, d * 0.18)
  const pillowRects = (w: number, d: number): [number, number, number, number][] => {
    const top = d / 2 - head - 0.05
    const bottom = top - pillowDepth(d)
    if (pillows === 1) return [[-w / 2 + 0.12, bottom, w / 2 - 0.12, top]]
    const pw = (w - 0.2 - 0.08) / 2
    return [
      [-w / 2 + 0.1, bottom, -w / 2 + 0.1 + pw, top],
      [w / 2 - 0.1 - pw, bottom, w / 2 - 0.1, top],
    ]
  }
  return {
    draw: (w, d) => {
      const fold = d / 2 - head - 0.05 - pillowDepth(d) - 0.15
      const corner = Math.min(0.45, w * 0.3)
      return [
        outline(w, d),
        line([-w / 2, d / 2 - head], [w / 2, d / 2 - head]),
        ...pillowRects(w, d).map(([x0, y0, x1, y1]) => roundRect(x0, y0, x1, y1, 0.06)),
        line([-w / 2, fold], [w / 2, fold]),
        line([w / 2 - corner, fold], [w / 2, fold - corner]),
      ]
    },
    solids: (w, d, h) => {
      const base = Math.min(0.5, h)
      return [
        box(-w / 2, -d / 2, w / 2, d / 2 - head, 0, base),
        box(-w / 2, d / 2 - head, w / 2, d / 2, 0, h),
        ...pillowRects(w, d).map(([x0, y0, x1, y1]) => box(x0, y0, x1, y1, base, Math.min(base + 0.1, h))),
      ]
    },
  }
}

/** A sofa or armchair: back, arms and seat cushions. */
function sofa(seats: number): Pick<CatalogItem, 'draw' | 'solids'> {
  const back = (d: number) => Math.min(0.2, d * 0.25)
  const arm = (w: number) => Math.min(0.2, w * 0.15)
  return {
    draw: (w, d) => {
      const b = back(d)
      const a = arm(w)
      const seat = (w - 2 * a) / seats
      return [
        roundRect(-w / 2, -d / 2, w / 2, d / 2, 0.05),
        rect(-w / 2, d / 2 - b, w / 2, d / 2),
        rect(-w / 2, -d / 2, -w / 2 + a, d / 2 - b),
        rect(w / 2 - a, -d / 2, w / 2, d / 2 - b),
        ...Array.from({ length: seats - 1 }, (_, i) => line([-w / 2 + a + (i + 1) * seat, -d / 2], [-w / 2 + a + (i + 1) * seat, d / 2 - b])),
      ]
    },
    solids: (w, d, h) => {
      const b = back(d)
      const a = arm(w)
      const seat = Math.min(0.42, h)
      const arms = Math.min(0.6, h)
      return [
        box(-w / 2 + a, -d / 2, w / 2 - a, d / 2 - b, 0, seat),
        box(-w / 2, d / 2 - b, w / 2, d / 2, 0, h),
        box(-w / 2, -d / 2, -w / 2 + a, d / 2 - b, 0, arms),
        box(w / 2 - a, -d / 2, w / 2, d / 2 - b, 0, arms),
      ]
    },
  }
}

const CHAIR_ZONE = 0.4 // how far dining chairs stand out from the table edge

/** A seat seen from above with its back towards +y. */
function chairAt(cx: number, cy: number, w: number, d: number, turn: 0 | 90 | 180 | 270): SymbolPart[] {
  const t = (turn * Math.PI) / 180
  const c = Math.round(Math.cos(t))
  const s = Math.round(Math.sin(t))
  const tf = (p: SymbolPart): SymbolPart => ({ pts: p.pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Vec2), closed: p.closed })
  return [roundRect(-w / 2, -d / 2, w / 2, d / 2 - 0.06, 0.04), rect(-w / 2, d / 2 - 0.06, w / 2, d / 2)].map(tf)
}

/** A rectangular dining table with chairs along both long sides. */
function diningTable(perSide: number): Pick<CatalogItem, 'draw' | 'solids'> {
  const chairs = (w: number, d: number) => {
    const edge = d / 2 - CHAIR_ZONE
    const cw = Math.min(0.45, w / perSide - 0.1)
    return Array.from({ length: perSide }, (_, i) => -w / 2 + ((i + 0.5) * w) / perSide).flatMap(x => [
      { x, y: edge + CHAIR_ZONE / 2 + 0.01, w: cw, turn: 0 as const },
      { x, y: -edge - CHAIR_ZONE / 2 - 0.01, w: cw, turn: 180 as const },
    ])
  }
  return {
    draw: (w, d) => [
      ...chairs(w, d).flatMap(c => chairAt(c.x, c.y, c.w, CHAIR_ZONE - 0.04, c.turn)),
      rect(-w / 2, -(d / 2 - CHAIR_ZONE), w / 2, d / 2 - CHAIR_ZONE),
    ],
    solids: (w, d, h) => [
      box(-w / 2, -(d / 2 - CHAIR_ZONE), w / 2, d / 2 - CHAIR_ZONE, 0, h),
      ...chairs(w, d).map(c => box(c.x - c.w / 2, c.y - CHAIR_ZONE / 2 + 0.02, c.x + c.w / 2, c.y + CHAIR_ZONE / 2 - 0.02, 0, Math.min(0.45, h))),
    ],
  }
}

/** A round outdoor table with four chairs around it. */
const roundTable: Pick<CatalogItem, 'draw' | 'solids'> = {
  draw: (w, d) => {
    const r = Math.max(0.2, Math.min(w, d) / 2 - CHAIR_ZONE)
    const cw = Math.min(0.45, r)
    const cd = CHAIR_ZONE - 0.04
    return [
      ...chairAt(0, r + cd / 2 + 0.02, cw, cd, 0),
      ...chairAt(0, -r - cd / 2 - 0.02, cw, cd, 180),
      ...chairAt(r + cd / 2 + 0.02, 0, cw, cd, 270),
      ...chairAt(-r - cd / 2 - 0.02, 0, cw, cd, 90),
      circle(0, 0, r),
      circle(0, 0, 0.03),
    ]
  },
  solids: (w, d, h) => {
    const r = Math.max(0.2, Math.min(w, d) / 2 - CHAIR_ZONE)
    const cw = Math.min(0.45, r)
    const seat = Math.min(0.45, h)
    const c = r + CHAIR_ZONE / 2
    const half = CHAIR_ZONE / 2 - 0.03
    return [
      { pts: ellipsePts(0, 0, r, r, 16), z0: 0, z1: h },
      box(-cw / 2, c - half, cw / 2, c + half, 0, seat),
      box(-cw / 2, -c - half, cw / 2, -c + half, 0, seat),
      box(c - half, -cw / 2, c + half, cw / 2, 0, seat),
      box(-c - half, -cw / 2, -c + half, cw / 2, 0, seat),
    ]
  },
}

/** A cabinet with a round bowl or drum and an optional tap at the back. */
const bowl = (w: number, d: number, tap: boolean): SymbolPart[] => [
  outline(w, d),
  roundRect(-w / 2 + 0.06, -d / 2 + 0.06, w / 2 - 0.06, d / 2 - (tap ? 0.12 : 0.06), 0.08),
  ...(tap ? [circle(0, d / 2 - 0.06, 0.025)] : []),
]

const ITEMS: CatalogItem[] = [
  // Bedroom
  { key: 'bed-single', name: 'Single bed', group: 'bedroom', size: [0.92, 1.88, 1], wall: true, ...bed(1) },
  { key: 'bed-king-single', name: 'King single bed', group: 'bedroom', size: [1.07, 2.03, 1], wall: true, ...bed(1) },
  { key: 'bed-double', name: 'Double bed', group: 'bedroom', size: [1.38, 1.88, 1], wall: true, ...bed(2) },
  { key: 'bed-queen', name: 'Queen bed', group: 'bedroom', size: [1.53, 2.03, 1], wall: true, ...bed(2) },
  { key: 'bed-king', name: 'King bed', group: 'bedroom', size: [1.83, 2.03, 1], wall: true, ...bed(2) },
  {
    key: 'bedside',
    name: 'Bedside table',
    group: 'bedroom',
    size: [0.45, 0.4, 0.55],
    wall: true,
    draw: (w, d) => [outline(w, d), circle(0, 0, Math.min(w, d) * 0.25)],
  },
  {
    key: 'wardrobe',
    name: 'Wardrobe',
    group: 'bedroom',
    size: [1.8, 0.6, 2.1],
    wall: true,
    draw: (w, d) => {
      const hangers = Math.max(1, Math.floor((w - 0.2) / 0.25))
      return [
        outline(w, d),
        line([-w / 2 + 0.05, 0.03], [w / 2 - 0.05, 0.03]),
        ...Array.from({ length: hangers }, (_, i) => {
          const x = -w / 2 + 0.1 + ((i + 0.5) * (w - 0.2)) / hangers
          return line([x - 0.06, 0.03 - d * 0.28], [x + 0.06, 0.03 + d * 0.28])
        }),
        line([-w / 2, -d / 2 + 0.04], [0.05, -d / 2 + 0.04]),
        line([-0.05, -d / 2 + 0.08], [w / 2, -d / 2 + 0.08]),
      ]
    },
  },

  // Living
  { key: 'sofa-2', name: '2-seat sofa', group: 'living', size: [1.6, 0.9, 0.85], wall: true, ...sofa(2) },
  { key: 'sofa-3', name: '3-seat sofa', group: 'living', size: [2.1, 0.9, 0.85], wall: true, ...sofa(3) },
  { key: 'armchair', name: 'Armchair', group: 'living', size: [0.85, 0.85, 0.85], wall: false, ...sofa(1) },
  {
    key: 'coffee-table',
    name: 'Coffee table',
    group: 'living',
    size: [1.2, 0.6, 0.45],
    wall: false,
    draw: (w, d) => [roundRect(-w / 2, -d / 2, w / 2, d / 2, 0.04), roundRect(-w / 2 + 0.06, -d / 2 + 0.06, w / 2 - 0.06, d / 2 - 0.06, 0.02)],
  },
  {
    key: 'tv-unit',
    name: 'TV unit',
    group: 'living',
    size: [1.8, 0.45, 1.2],
    wall: true,
    draw: (w, d) => {
      const tv = Math.min(1.25, w - 0.2) / 2
      return [outline(w, d), rect(-tv, 0.02, tv, 0.08), rect(-0.15, -0.06, 0.15, 0.02)]
    },
    solids: (w, d, h) => {
      const unit = Math.min(0.5, h)
      const tv = Math.min(1.25, w - 0.2) / 2
      return [fullBox(w, d, unit), box(-tv, 0.02, tv, 0.08, unit, h)]
    },
  },

  // Dining
  { key: 'dining-4', name: 'Dining table for 4 (1200 × 800)', group: 'dining', size: [1.2, 0.8 + 2 * CHAIR_ZONE, 0.75], wall: false, ...diningTable(2) },
  { key: 'dining-6', name: 'Dining table for 6 (1800 × 900)', group: 'dining', size: [1.8, 0.9 + 2 * CHAIR_ZONE, 0.75], wall: false, ...diningTable(3) },
  { key: 'dining-8', name: 'Dining table for 8 (2400 × 1000)', group: 'dining', size: [2.4, 1 + 2 * CHAIR_ZONE, 0.75], wall: false, ...diningTable(4) },

  // Kitchen
  {
    key: 'bench',
    name: 'Bench run (600 deep)',
    group: 'kitchen',
    size: [2.4, 0.6, 0.9],
    wall: true,
    draw: (w, d) => {
      const doors = Math.max(1, Math.round(w / 0.6))
      return [
        outline(w, d),
        line([-w / 2, -d / 2 + 0.03], [w / 2, -d / 2 + 0.03]),
        ...Array.from({ length: doors - 1 }, (_, i) => line([-w / 2 + ((i + 1) * w) / doors, -d / 2 + 0.03], [-w / 2 + ((i + 1) * w) / doors, d / 2])),
      ]
    },
  },
  {
    key: 'island',
    name: 'Island bench',
    group: 'kitchen',
    size: [2.4, 1.1, 0.9],
    wall: false,
    draw: (w, d) => [outline(w, d), line([-w / 2, -d / 2 + Math.min(0.3, d * 0.3)], [w / 2, -d / 2 + Math.min(0.3, d * 0.3)])],
  },
  {
    key: 'fridge',
    name: 'Fridge space (900 wide)',
    group: 'kitchen',
    size: [0.9, 0.7, 1.8],
    wall: true,
    code: 'REF',
    draw: (w, d) => [outline(w, d), line([-w / 2, -d / 2 + 0.05], [w / 2, -d / 2 + 0.05]), line([0, -d / 2], [0, -d / 2 + 0.05])],
  },
  {
    key: 'cooktop',
    name: 'Cooktop and oven',
    group: 'kitchen',
    size: [0.9, 0.6, 0.9],
    wall: true,
    draw: (w, d) => {
      const r = Math.min(w, d) * 0.11
      const parts = [outline(w, d)]
      for (const x of [-w * 0.27, w * 0.27]) for (const y of [-d * 0.2, d * 0.2]) parts.push(circle(x, y, r))
      if (w >= 0.85) parts.push(circle(0, 0, r * 1.2))
      return parts
    },
  },
  {
    key: 'sink',
    name: 'Sink',
    group: 'kitchen',
    size: [0.9, 0.6, 0.9],
    wall: true,
    draw: (w, d) => [
      outline(w, d),
      roundRect(-w / 2 + 0.06, -d / 2 + 0.08, -0.03, d / 2 - 0.13, 0.05),
      roundRect(0.03, -d / 2 + 0.08, w / 2 - 0.06, d / 2 - 0.13, 0.05),
      circle(0, d / 2 - 0.07, 0.025),
    ],
  },
  {
    key: 'dishwasher',
    name: 'Dishwasher',
    group: 'kitchen',
    size: [0.6, 0.6, 0.85],
    wall: true,
    code: 'DW',
    draw: (w, d) => [outline(w, d), line([-w / 2, -d / 2 + 0.04], [w / 2, -d / 2 + 0.04])],
  },

  // Laundry
  {
    key: 'washer',
    name: 'Washing machine',
    group: 'laundry',
    size: [0.6, 0.65, 0.85],
    wall: true,
    code: 'WM',
    draw: (w, d) => [outline(w, d), circle(0, 0, Math.min(w, d) * 0.36)],
  },
  {
    key: 'dryer',
    name: 'Dryer',
    group: 'laundry',
    size: [0.6, 0.65, 0.85],
    wall: true,
    code: 'DR',
    draw: (w, d) => [outline(w, d), circle(0, 0, Math.min(w, d) * 0.36)],
  },
  { key: 'tub', name: 'Laundry tub', group: 'laundry', size: [0.6, 0.5, 0.9], wall: true, draw: (w, d) => bowl(w, d, true) },

  // Bathroom
  {
    key: 'toilet',
    name: 'Toilet',
    group: 'bathroom',
    size: [0.4, 0.7, 0.8],
    wall: true,
    draw: (w, d) => {
      const c = Math.min(0.2, d * 0.3)
      const ry = (d - c) / 2
      return [
        ellipse(0, d / 2 - c - ry + 0.02, w * 0.45, ry),
        ellipse(0, d / 2 - c - ry * 1.05 + 0.02, w * 0.3, ry * 0.7),
        roundRect(-w / 2, d / 2 - c, w / 2, d / 2, 0.03),
      ]
    },
    solids: (w, d, h) => {
      const c = Math.min(0.2, d * 0.3)
      return [box(-w / 2, d / 2 - c, w / 2, d / 2, 0, h), { pts: ellipsePts(0, d / 2 - c - (d - c) / 2 + 0.02, w * 0.45, (d - c) / 2, 16), z0: 0, z1: Math.min(0.4, h) }]
    },
  },
  {
    key: 'vanity',
    name: 'Vanity basin',
    group: 'bathroom',
    size: [0.9, 0.46, 0.85],
    wall: true,
    draw: (w, d) => [outline(w, d), ellipse(0, -0.02, Math.min(0.25, w * 0.32), d * 0.3), circle(0, d / 2 - 0.06, 0.025)],
  },
  {
    key: 'shower',
    name: 'Shower (900 × 900)',
    group: 'bathroom',
    size: [0.9, 0.9, 0.1],
    wall: true,
    draw: (w, d) => [outline(w, d), line([-w / 2, -d / 2], [w / 2, d / 2]), line([-w / 2, d / 2], [w / 2, -d / 2]), circle(0, 0, 0.04)],
  },
  {
    key: 'bath',
    name: 'Bath (1700)',
    group: 'bathroom',
    size: [1.7, 0.75, 0.55],
    wall: true,
    draw: (w, d) => [outline(w, d), roundRect(-w / 2 + 0.07, -d / 2 + 0.07, w / 2 - 0.07, d / 2 - 0.07, Math.min(0.22, d * 0.3)), circle(-w / 2 + 0.22, 0, 0.03)],
  },

  // Study
  {
    key: 'desk',
    name: 'Desk',
    group: 'study',
    size: [1.5, 0.75, 0.75],
    wall: true,
    draw: (w, d) => [outline(w, d), rect(-Math.min(0.3, w * 0.25), d / 2 - 0.2, Math.min(0.3, w * 0.25), d / 2 - 0.15), rect(-0.22, -d / 2 + 0.12, 0.22, -d / 2 + 0.27)],
  },
  {
    // Drawn facing +y, so at the same angle as a desk it sits in front of it facing the desk.
    key: 'desk-chair',
    name: 'Desk chair',
    group: 'study',
    size: [0.6, 0.6, 1],
    wall: false,
    draw: (w, d) => [
      roundRect(-w / 2 + 0.04, -d / 2 + 0.12, w / 2 - 0.04, d / 2 - 0.04, 0.1),
      roundRect(-w / 2 + 0.08, -d / 2, w / 2 - 0.08, -d / 2 + 0.1, 0.04),
      line([-w / 2, -d / 2 + 0.2], [-w / 2, d / 2 - 0.15]),
      line([w / 2, -d / 2 + 0.2], [w / 2, d / 2 - 0.15]),
    ],
    solids: (w, d, h) => [box(-w / 2 + 0.04, -d / 2 + 0.12, w / 2 - 0.04, d / 2 - 0.04, 0, Math.min(0.48, h)), box(-w / 2 + 0.08, -d / 2, w / 2 - 0.08, -d / 2 + 0.1, 0, h)],
  },

  // Garage and outdoor
  {
    // The front of the car is at the front of the item (-y).
    key: 'car',
    name: 'Car (4.9 × 1.9 m)',
    group: 'outdoor',
    size: [1.9, 4.9, 1.5],
    wall: false,
    draw: (w, d) => {
      const at = (f: number) => -d / 2 + f * d
      const side = Math.min(0.18, w * 0.1)
      return [
        roundRect(-w / 2, -d / 2, w / 2, d / 2, Math.min(0.35, w * 0.2)),
        line([-w / 2 + side, at(0.27)], [0, at(0.25)], [w / 2 - side, at(0.27)]),
        roundRect(-w / 2 + side, at(0.38), w / 2 - side, at(0.76), 0.12),
        line([-w / 2 + side, at(0.85)], [0, at(0.87)], [w / 2 - side, at(0.85)]),
        line([-w / 2 + side, at(0.27)], [-w / 2 + side, at(0.85)]),
        line([w / 2 - side, at(0.27)], [w / 2 - side, at(0.85)]),
      ]
    },
    solids: (w, d, h) => {
      const body = Math.min(0.8, h)
      return [fullBox(w, d, body), box(-w / 2 + 0.12, -d / 2 + 0.3 * d, w / 2 - 0.12, -d / 2 + 0.82 * d, body, h)]
    },
  },
  { key: 'outdoor-table', name: 'Outdoor table for 4', group: 'outdoor', size: [1.9, 1.9, 0.75], wall: false, ...roundTable },
  {
    key: 'bbq',
    name: 'BBQ',
    group: 'outdoor',
    size: [1.5, 0.6, 1.1],
    wall: true,
    draw: (w, d) => {
      const g = Math.min(0.45, w * 0.3)
      const bars = Math.max(2, Math.round((2 * g) / 0.08))
      return [
        outline(w, d),
        rect(-g, -d / 2 + 0.06, g, d / 2 - 0.06),
        ...Array.from({ length: bars - 1 }, (_, i) => line([-g + ((i + 1) * 2 * g) / bars, -d / 2 + 0.06], [-g + ((i + 1) * 2 * g) / bars, d / 2 - 0.06])),
      ]
    },
  },
]

export const CATALOG: readonly CatalogItem[] = ITEMS

const BY_KEY = new Map(ITEMS.map(i => [i.key, i]))

export function catalogItem(key: string): CatalogItem | undefined {
  return BY_KEY.get(key)
}

/** The item's 3D shape in its own frame. */
export function catalogSolids(item: CatalogItem | undefined, w: number, d: number, h: number): Solid[] {
  return item?.solids ? item.solids(w, d, h) : [fullBox(w, d, h)]
}

/** The item's plan symbol in its own frame; a plain box for an item the catalog no longer has. */
export function catalogSymbol(item: CatalogItem | undefined, w: number, d: number): SymbolPart[] {
  return item ? item.draw(w, d) : [outline(w, d), line([-w / 2, -d / 2], [w / 2, d / 2])]
}
