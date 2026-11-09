import type { DxfDocument, DxfEntity, Vec3 } from '../lib/dxf'
import { centroidOf, type Vec2 } from '../lib/geom'
import { isFeatureRole, type FeatureRole, type LayerRole } from '../lib/survey'
import { withDefaults, type EdgeKind, type FeatureType, type PavingKind, type ServiceKind, type SiteFeature } from './model'

/**
 * Site features from the layers of a DXF that hold them (see the feature roles in
 * lib/survey). Trees come from blocks, circles or points, with their sizes from block
 * attributes or the label written beside them ("T3 Ø0.3 H8 S6"); lines and outlines become
 * fences, easements, paving and the rest. Coordinates stay in the survey's grid.
 *
 * Ids are stable for the same file and roles, so edits made to these features can be kept
 * alongside them.
 */
export function featuresFromDxf(doc: DxfDocument, roles: Record<string, LayerRole>, idPrefix = 'dxf'): SiteFeature[] {
  const out: SiteFeature[] = []
  const texts = doc.entities.filter((e): e is Extract<DxfEntity, { kind: 'text' }> => e.kind === 'text').map(t => ({ ...t, text: cleanText(t.text), used: false }))
  const byLayer = new Map<string, DxfEntity[]>()
  for (const e of doc.entities) {
    if (!isFeatureRole(roles[e.layer])) continue
    const l = byLayer.get(e.layer)
    if (l) l.push(e)
    else byLayer.set(e.layer, [e])
  }
  for (const [layer, ents] of byLayer) {
    const role = roles[layer] as FeatureRole
    const made: SiteFeature[] = []
    const id = () => `${idPrefix}:${layer}:${made.length}`
    const base = (type: FeatureType, extra: Partial<SiteFeature> = {}) => ({ type, source: 'dxf' as const, layer, ...roleExtras(role, layer), ...extra })

    if (role === 'tree') {
      made.push(...treesFromLayer(ents, id, base))
    } else {
      for (const e of ents) {
        const type = roleType(role)
        if (e.kind === 'polyline') {
          if (e.points.length < 2) continue
          const pts = e.points.map(xy)
          const closed = e.closed || (pts.length > 2 && near(pts[0], pts[pts.length - 1]))
          if (closed && pts.length > 2 && near(pts[0], pts[pts.length - 1])) pts.pop()
          if (type === 'easement' || type === 'paving' || type === 'building') {
            if (closed && pts.length >= 3) made.push(withDefaults({ id: id(), ...base(type), geom: { kind: 'area', pts } }))
            else made.push(withDefaults({ id: id(), ...base('other'), label: `${layer} line`, geom: { kind: 'line', pts } }))
          } else if (closed && pts.length >= 3 && type === 'other') {
            made.push(withDefaults({ id: id(), ...base(type), geom: { kind: 'area', pts } }))
          } else {
            made.push(withDefaults({ id: id(), ...base(type), geom: { kind: 'line', pts: closed ? [...pts, pts[0]] : pts } }))
          }
        } else if (e.kind === 'point' || e.kind === 'insert' || e.kind === 'circle') {
          const pointType = type === 'service' || type === 'other' ? type : type === 'building' ? 'building' : 'other'
          made.push(withDefaults({ id: id(), ...base(pointType), geom: { kind: 'point', at: xy(e.p) }, label: e.kind === 'insert' ? blockLabel(e) : undefined }))
        }
      }
    }
    // Words on the layer name the nearest feature to them.
    for (const t of texts) {
      if (t.layer !== layer || !t.text) continue
      const f = nearestFeature(made, xy(t.p), 3)
      if (f && !f.label) {
        f.label = t.text
        t.used = true
      } else if (f && role !== 'tree') {
        t.used = true
      }
      if (f && f.type === 'easement') {
        const w = /(\d+(?:\.\d+)?)\s*(?:m\b)?\s*wide/i.exec(t.text)
        if (w && f.width === undefined) f.width = Number(w[1])
        if (/easement|drain|services|way/i.test(t.text) && !f.purpose) f.purpose = t.text
      }
    }
    out.push(...made)
  }
  // Tree labels written on another layer, e.g. a text layer: "T3 Ø0.3 H8 S6" within 3 m of a tree.
  for (const t of texts) {
    if (t.used || !TREE_TEXT.test(t.text)) continue
    const tree = nearestFeature(
      out.filter(f => f.type === 'tree'),
      xy(t.p),
      3,
    )
    if (!tree) continue
    applyTreeText(tree, t.text)
    t.used = true
  }
  return out
}

type Base = (type: FeatureType, extra?: Partial<SiteFeature>) => Omit<SiteFeature, 'id' | 'geom'>

function treesFromLayer(ents: DxfEntity[], id: () => string, base: Base): SiteFeature[] {
  const trees: SiteFeature[] = []
  const circles: { c: Vec2; r: number }[] = []
  for (const e of ents) {
    if (e.kind === 'insert') {
      const t = withDefaults({ id: id(), ...base('tree'), geom: { kind: 'point', at: xy(e.p) } })
      // A block scaled to the canopy (a circle 1 unit across, drawn at the spread).
      if (e.radius > 0.6) t.canopy = round(e.radius * 2, 1)
      applyAttribs(t, e.attribs)
      trees.push(t)
    } else if (e.kind === 'point') {
      trees.push(withDefaults({ id: id(), ...base('tree'), geom: { kind: 'point', at: xy(e.p) } }))
    } else if (e.kind === 'circle') {
      circles.push({ c: xy(e.p), r: e.r })
    } else if (e.kind === 'polyline' && e.points.length >= 6) {
      // A cloud drawn round the canopy.
      const pts = e.points.map(xy)
      if (!near(pts[0], pts[pts.length - 1]) && !e.closed) continue
      const c = centroidOf(pts)
      const r = pts.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / pts.length
      circles.push({ c, r })
    }
  }
  // Circles: a small one is the trunk, a big one round the same point the canopy.
  circles.sort((a, b) => a.r - b.r)
  const used = new Set<number>()
  for (let i = 0; i < circles.length; i++) {
    if (used.has(i)) continue
    const a = circles[i]
    const existing = trees.find(t => t.geom.kind === 'point' && Math.hypot(t.geom.at[0] - a.c[0], t.geom.at[1] - a.c[1]) < Math.max(0.3, a.r * 0.5))
    if (existing) {
      if (a.r <= 0.6) existing.trunk = round(a.r * 2, 2)
      else existing.canopy = round(a.r * 2, 1)
      continue
    }
    const t = withDefaults({ id: id(), ...base('tree'), geom: { kind: 'point', at: a.c } })
    if (a.r <= 0.6) t.trunk = round(a.r * 2, 2)
    else t.canopy = round(a.r * 2, 1)
    for (let j = i + 1; j < circles.length; j++) {
      const b = circles[j]
      if (used.has(j) || Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) > Math.max(0.3, a.r)) continue
      if (b.r > 0.6) t.canopy = round(b.r * 2, 1)
      used.add(j)
      break
    }
    trees.push(t)
  }
  return trees
}

/** "T3 Ø0.3 H8 S6", "TREE 4 D=300 HT 8 SPREAD 6", "Ø0.45 H12". */
const TREE_TEXT = /(\bT\s?\d+\b|[Øø]\s*\d|\b(?:DIA|DBH|TRUNK|HT|HEIGHT|SPREAD|SP|CANOPY)\b\s*[:=]?\s*\d|\bH\s?\d+(?:\.\d+)?\b.*\bS\s?\d)/i

export function parseTreeText(s: string): { ref?: string; trunk?: number; height?: number; canopy?: number } {
  const out: { ref?: string; trunk?: number; height?: number; canopy?: number } = {}
  const t = s.replace(/,/g, ' ')
  const ref = /\b(?:T|TREE)\s?#?\s?(\d+[A-Z]?)\b/i.exec(t)
  if (ref) out.ref = `T${ref[1]}`
  const trunk = /(?:[Øø]|\bDIA\b|\bDBH\b|\bTRUNK\b|\bTR\b|\bD\b)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|m)?/i.exec(t)
  if (trunk) {
    const v = Number(trunk[1])
    out.trunk = trunk[2]?.toLowerCase() === 'mm' || v > 3 ? v / 1000 : v
  }
  const height = /\b(?:H|HT|HEIGHT|HGT)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m?\b/i.exec(t)
  if (height) out.height = Number(height[1])
  const spread = /\b(?:S|SP|SPREAD|C|CANOPY|CR|CROWN)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m?\b/i.exec(t)
  if (spread) out.canopy = Number(spread[1])
  return out
}

function applyTreeText(t: SiteFeature, s: string) {
  const p = parseTreeText(s)
  if (p.ref && !t.label) t.label = p.ref
  if (p.trunk !== undefined) t.trunk = p.trunk
  if (p.height !== undefined) t.height = p.height
  if (p.canopy !== undefined) t.canopy = p.canopy
}

/** Block attributes such as TRUNK, HEIGHT, SPREAD, or one TEXT/LABEL attribute in the "T3 Ø0.3 H8 S6" style. */
function applyAttribs(t: SiteFeature, a: Record<string, string>) {
  const num = (k: RegExp) => {
    const key = Object.keys(a).find(x => k.test(x))
    const v = key ? parseFloat(a[key]) : NaN
    return Number.isFinite(v) ? v : undefined
  }
  const trunk = num(/^(TRUNK|DIA|DIAMETER|DBH|GIRTH|TR|D)$/)
  if (trunk !== undefined) t.trunk = trunk > 3 ? trunk / 1000 : trunk
  const height = num(/^(HEIGHT|HT|H|HGT)$/)
  if (height !== undefined) t.height = height
  const spread = num(/^(SPREAD|CANOPY|SP|S|CROWN|CR|C)$/)
  if (spread !== undefined) t.canopy = spread
  const id = Object.keys(a).find(x => /^(NO|NUM|NUMBER|ID|TREE|TREE_?NO|REF)$/.test(x))
  if (id && a[id]) t.label = /^\d/.test(a[id]) ? `T${a[id]}` : a[id]
  for (const v of Object.values(a)) if (TREE_TEXT.test(v)) applyTreeText(t, v)
  const species = Object.keys(a).find(x => /^(SPECIES|NAME|TYPE|DESC)$/.test(x))
  if (species && a[species] && !t.label) t.label = a[species]
}

function blockLabel(e: Extract<DxfEntity, { kind: 'insert' }>): string | undefined {
  const v = Object.values(e.attribs).find(x => x.trim())
  return v ?? (e.block && !/^\*/.test(e.block) ? e.block : undefined)
}

function roleType(role: FeatureRole): FeatureType {
  if (role.startsWith('service-')) return 'service'
  if (role === 'feature') return 'other'
  return role as FeatureType
}

function roleExtras(role: FeatureRole, layer: string): Partial<SiteFeature> {
  if (role.startsWith('service-')) return { service: role.slice(8) as ServiceKind }
  const n = layer.toLowerCase()
  if (role === 'paving') return { paving: (/path/.test(n) ? 'path' : /drive|dw/.test(n) ? 'driveway' : 'hardstand') as PavingKind }
  if (role === 'kerb') return { edge: (/foot|fp/.test(n) ? 'footpath' : /road|bitumen|seal/.test(n) && !/kerb|curb/.test(n) ? 'road' : 'kerb') as EdgeKind }
  if (role === 'building') return { neighbour: undefined }
  return {}
}

function nearestFeature(list: SiteFeature[], p: Vec2, reach: number): SiteFeature | null {
  let best: SiteFeature | null = null
  let bestD = reach
  for (const f of list) {
    const pts = f.geom.kind === 'point' ? [f.geom.at] : f.geom.pts
    let d = Infinity
    if (pts.length === 1) d = Math.hypot(pts[0][0] - p[0], pts[0][1] - p[1])
    else
      for (let i = 1; i < pts.length + (f.geom.kind === 'area' ? 1 : 0); i++) {
        const a = pts[i - 1]
        const b = pts[i % pts.length]
        d = Math.min(d, segDist(p, a, b))
      }
    if (d < bestD) {
      bestD = d
      best = f
    }
  }
  return best
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
}

/** MTEXT keeps formatting codes in its text: drop them. */
export function cleanText(s: string): string {
  return s
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/\s+/g, ' ')
    .trim()
}

const xy = (p: Vec3): Vec2 => [p[0], p[1]]
const near = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6
const round = (v: number, d: number) => Number(v.toFixed(d))
