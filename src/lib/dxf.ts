// Minimal DXF reader covering what survey exports use: LWPOLYLINE, POLYLINE (2D and 3D),
// LINE, POINT, TEXT/MTEXT, 3DFACE, CIRCLE, ARC, and block INSERTs with their attributes
// (surveyors draw trees, pits and poles as blocks) in the ENTITIES section.

export type Vec3 = [number, number, number]

export type DxfEntity =
  | { kind: 'polyline'; layer: string; points: Vec3[]; closed: boolean; is3d: boolean }
  | { kind: 'point'; layer: string; p: Vec3 }
  | { kind: 'text'; layer: string; p: Vec3; text: string }
  | { kind: 'face'; layer: string; points: Vec3[] }
  | { kind: 'circle'; layer: string; p: Vec3; r: number }
  | {
      kind: 'insert'
      layer: string
      p: Vec3
      /** Name of the block drawn here, e.g. "TREE". */
      block: string
      /** Attribute values by tag, e.g. { TRUNK: '0.3', HEIGHT: '8' }. */
      attribs: Record<string, string>
      /** X scale of the insert. */
      scale: number
      /** Furthest the block's own drawing reaches from its base point, times the scale (0 if unknown). */
      radius: number
    }

export interface DxfDocument {
  entities: DxfEntity[]
  /** Multiplier that converts drawing units to metres. */
  unitScale: number
  /** Entity types we saw but don't import, with counts. */
  skipped: Record<string, number>
}

/**
 * A DXF the planner can't read, said plainly. The fix is a file from the surveyor in a form it does
 * read, so where this shows, a request to send them is offered beside it (src/safety/files.ts).
 */
export class DxfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DxfError'
  }
}

/** How a binary DXF starts: it holds the same drawing, packed in a form only CAD programs read. */
const BINARY_DXF = 'AutoCAD Binary DXF'

type Pair = [number, string]
type Group = { type: string; pairs: Pair[] }

// $INSUNITS codes -> metres
const UNIT_SCALE: Record<number, number> = {
  1: 0.0254, // inches
  2: 0.3048, // feet
  4: 0.001, // mm
  5: 0.01, // cm
  6: 1, // m
  14: 0.1, // dm
}

function readPairs(text: string): Pair[] {
  if (text.slice(0, 64).includes(BINARY_DXF))
    throw new DxfError('This DXF is saved in binary form, which the planner can’t read. Ask your surveyor for an ASCII DXF, or save it as one from a CAD program.')
  const lines = text.split(/\r\n|\r|\n/)
  const pairs: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (Number.isNaN(code)) {
      // Where it went wrong is no help to the person, but is to whoever looks at the file.
      throw new DxfError(`This file doesn’t read as a DXF (it goes wrong at line ${i + 1}). It may be damaged, or saved in a form the planner can’t read. Ask your surveyor to send it again as an ASCII DXF.`)
    }
    pairs.push([code, lines[i + 1].trim()])
  }
  return pairs
}

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function first(g: Group, code: number): string | undefined {
  return g.pairs.find(p => p[0] === code)?.[1]
}

function firstNum(g: Group, code: number, fallback = 0): number {
  const v = first(g, code)
  return v === undefined ? fallback : num(v)
}

function pointAt(g: Group, xCode: number): Vec3 {
  return [firstNum(g, xCode), firstNum(g, xCode + 10), firstNum(g, xCode + 20)]
}

/** Split a section's pairs into entity groups, each starting at a code-0 pair. */
function groupEntities(pairs: Pair[]): Group[] {
  const groups: Group[] = []
  let cur: Group | null = null
  for (const p of pairs) {
    if (p[0] === 0) {
      cur = { type: p[1], pairs: [] }
      groups.push(cur)
    } else if (cur) {
      cur.pairs.push(p)
    }
  }
  return groups
}

function findSection(pairs: Pair[], name: string): Pair[] | null {
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION' && pairs[i + 1][0] === 2 && pairs[i + 1][1] === name) {
      let j = i + 2
      while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1] === 'ENDSEC')) j++
      return pairs.slice(i + 2, j)
    }
  }
  return null
}

function readUnitScale(pairs: Pair[]): number {
  const header = findSection(pairs, 'HEADER')
  if (!header) return 1
  for (let i = 0; i < header.length - 1; i++) {
    if (header[i][0] === 9 && header[i][1] === '$INSUNITS') {
      const code = parseInt(header[i + 1][1], 10)
      return UNIT_SCALE[code] ?? 1
    }
  }
  return 1
}

function lwpolyline(g: Group): DxfEntity {
  const layer = first(g, 8) ?? '0'
  const elevation = firstNum(g, 38)
  const flags = firstNum(g, 70)
  const points: Vec3[] = []
  let x: number | null = null
  for (const [code, v] of g.pairs) {
    if (code === 10) x = num(v)
    else if (code === 20 && x !== null) {
      points.push([x, num(v), elevation])
      x = null
    }
  }
  return { kind: 'polyline', layer, points, closed: (flags & 1) === 1, is3d: false }
}

/** How far each block's drawing reaches from its base point, from the BLOCKS section. */
function readBlockSizes(pairs: Pair[]): Map<string, number> {
  const out = new Map<string, number>()
  const section = findSection(pairs, 'BLOCKS')
  if (!section) return out
  let name: string | null = null
  let base: Vec3 = [0, 0, 0]
  let reach = 0
  for (const g of groupEntities(section)) {
    if (g.type === 'BLOCK') {
      name = first(g, 2) ?? null
      base = pointAt(g, 10)
      reach = 0
    } else if (g.type === 'ENDBLK') {
      if (name) out.set(name, reach)
      name = null
    } else if (name) {
      const far = (p: Vec3, extra = 0) => {
        reach = Math.max(reach, Math.hypot(p[0] - base[0], p[1] - base[1]) + extra)
      }
      if (g.type === 'CIRCLE' || g.type === 'ARC') far(pointAt(g, 10), firstNum(g, 40))
      else if (g.type === 'LINE') {
        far(pointAt(g, 10))
        far(pointAt(g, 11))
      } else {
        // Polylines and the rest: every coordinate pair in the entity.
        let x: number | null = null
        for (const [code, v] of g.pairs) {
          if (code === 10) x = num(v)
          else if (code === 20 && x !== null) {
            far([x, num(v), 0])
            x = null
          }
        }
      }
    }
  }
  return out
}

export function parseDxf(text: string): DxfDocument {
  const pairs = readPairs(text)
  const unitScale = readUnitScale(pairs)
  const section = findSection(pairs, 'ENTITIES')
  if (!section) throw new DxfError('This DXF has nothing drawn in it (it has no ENTITIES section). Ask your surveyor for the contour survey as an ASCII DXF.')

  const groups = groupEntities(section)
  const entities: DxfEntity[] = []
  const skipped: Record<string, number> = {}
  const blockSizes = readBlockSizes(pairs)

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const layer = first(g, 8) ?? '0'
    switch (g.type) {
      case 'LWPOLYLINE':
        entities.push(lwpolyline(g))
        break
      case 'POLYLINE': {
        const flags = firstNum(g, 70)
        const is3d = (flags & 8) === 8
        if ((flags & (16 | 64)) !== 0) {
          // polygon/polyface meshes: keep their vertices as points
          skipped['POLYLINE mesh'] = (skipped['POLYLINE mesh'] ?? 0) + 1
        }
        const elevation = firstNum(g, 30)
        const points: Vec3[] = []
        while (i + 1 < groups.length && groups[i + 1].type === 'VERTEX') {
          i++
          const v = groups[i]
          const p = pointAt(v, 10)
          points.push(is3d ? p : [p[0], p[1], elevation])
        }
        if (i + 1 < groups.length && groups[i + 1].type === 'SEQEND') i++
        entities.push({ kind: 'polyline', layer, points, closed: (flags & 1) === 1, is3d })
        break
      }
      case 'LINE': {
        const a = pointAt(g, 10)
        const b = pointAt(g, 11)
        entities.push({ kind: 'polyline', layer, points: [a, b], closed: false, is3d: a[2] !== b[2] })
        break
      }
      case 'POINT':
        entities.push({ kind: 'point', layer, p: pointAt(g, 10) })
        break
      case 'TEXT':
      case 'MTEXT':
        entities.push({ kind: 'text', layer, p: pointAt(g, 10), text: first(g, 1) ?? '' })
        break
      case 'CIRCLE':
        entities.push({ kind: 'circle', layer, p: pointAt(g, 10), r: firstNum(g, 40) })
        break
      case 'ARC': {
        // Kept as a polyline along the arc, as drawn.
        const c = pointAt(g, 10)
        const r = firstNum(g, 40)
        const a0 = (firstNum(g, 50) * Math.PI) / 180
        let a1 = (firstNum(g, 51) * Math.PI) / 180
        if (a1 <= a0) a1 += 2 * Math.PI
        const n = Math.max(4, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 32))
        const points: Vec3[] = []
        for (let k = 0; k <= n; k++) {
          const t = a0 + ((a1 - a0) * k) / n
          points.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]])
        }
        entities.push({ kind: 'polyline', layer, points, closed: false, is3d: false })
        break
      }
      case 'INSERT': {
        const attribs: Record<string, string> = {}
        // Attributes follow the insert, up to a SEQEND.
        if (firstNum(g, 66) === 1) {
          while (i + 1 < groups.length && groups[i + 1].type === 'ATTRIB') {
            i++
            const tag = first(groups[i], 2)
            const value = first(groups[i], 1)
            if (tag && value !== undefined) attribs[tag.toUpperCase()] = value
          }
          if (i + 1 < groups.length && groups[i + 1].type === 'SEQEND') i++
        }
        const block = first(g, 2) ?? ''
        const scale = Math.abs(firstNum(g, 41, 1)) || 1
        entities.push({ kind: 'insert', layer, p: pointAt(g, 10), block, attribs, scale, radius: (blockSizes.get(block) ?? 0) * scale })
        break
      }
      case '3DFACE': {
        const pts = [pointAt(g, 10), pointAt(g, 11), pointAt(g, 12), pointAt(g, 13)]
        const last = pts[3]
        const prev = pts[2]
        if (last[0] === prev[0] && last[1] === prev[1] && last[2] === prev[2]) pts.pop()
        entities.push({ kind: 'face', layer, points: pts })
        break
      }
      default:
        skipped[g.type] = (skipped[g.type] ?? 0) + 1
    }
  }

  if (unitScale !== 1) {
    const s = (p: Vec3): Vec3 => [p[0] * unitScale, p[1] * unitScale, p[2] * unitScale]
    for (const e of entities) {
      if (e.kind === 'polyline' || e.kind === 'face') e.points = e.points.map(s)
      else {
        e.p = s(e.p)
        if (e.kind === 'circle') e.r *= unitScale
        if (e.kind === 'insert') e.radius *= unitScale
      }
    }
  }

  return { entities, unitScale, skipped }
}
