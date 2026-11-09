// LandXML 1.2 reader: the surface (TIN points), the COGO points and the parcels (lot boundary).
// It only reads text, so it works the same in the browser and in tests. LandXML lists
// coordinates as northing then easting then elevation; this puts them the right way round.
//
// A TIN's own triangles aren't kept: the planner builds its ground from the points, the same
// way it does for a DXF's spot levels.

import { surveyFromPoints, type SurveyPoints } from './pointsToSurvey'
import type { SavedProject } from './storage'

interface XNode {
  name: string
  attrs: Record<string, string>
  text: string
  children: XNode[]
}

const NOT_LANDXML = (name: string) => `${name} isn’t a LandXML survey. Export it from your survey software as LandXML 1.2, or as a DXF.`

/** Whether the text is a LandXML file (by what's inside, not only the name). */
export function isLandXml(text: string): boolean {
  return /<\s*(?:\w+:)?LandXML[\s>]/i.test(text.slice(0, 20000))
}

/** A small XML reader: elements, attributes and text. Comments, CDATA and the prolog are dropped. */
function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, text: '', children: [] }
  const stack = [root]
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!(?!--)[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  let last = 0
  let m: RegExpExecArray | null
  const addText = (t: string) => {
    stack[stack.length - 1].text += t
  }
  while ((m = tag.exec(src))) {
    addText(src.slice(last, m.index))
    last = tag.lastIndex
    if (m[1] !== undefined && m[0].startsWith('<![CDATA[')) {
      addText(m[1])
      continue
    }
    if (m[2] === undefined) continue
    const name = m[3].replace(/^\w+:/, '')
    if (m[2] === '/') {
      // Close back to the matching open tag, tolerating a few unclosed ones.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i
          break
        }
      }
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^\w+:/, '')] = a[2] ?? a[3] ?? ''
    const node: XNode = { name, attrs, text: '', children: [] }
    stack[stack.length - 1].children.push(node)
    if (!m[5]) stack.push(node)
  }
  return root
}

function* walk(n: XNode): Generator<XNode> {
  for (const c of n.children) {
    yield c
    yield* walk(c)
  }
}

const kids = (n: XNode, name: string) => n.children.filter(c => c.name === name)
const nums = (s: string) =>
  s
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)

/** Metres per unit in the file: LandXML says feet or metres under Units. */
function unitScale(root: XNode): number {
  for (const n of walk(root)) {
    if (n.name === 'Imperial') {
      const u = (n.attrs.linearUnit ?? '').toLowerCase()
      return u.includes('ussurvey') ? 1200 / 3937 : 0.3048
    }
    if (n.name === 'Metric') {
      const u = (n.attrs.linearUnit ?? 'meter').toLowerCase()
      if (u.startsWith('milli')) return 0.001
      if (u.startsWith('centi')) return 0.01
      return 1
    }
  }
  return 1
}

/** An arc from start to end about a centre, as short chords. */
function arcPoints(s: [number, number], c: [number, number], e: [number, number], clockwise: boolean): [number, number][] {
  const a0 = Math.atan2(s[1] - c[1], s[0] - c[0])
  const a1 = Math.atan2(e[1] - c[1], e[0] - c[0])
  let sweep = a1 - a0
  if (clockwise) while (sweep > 0) sweep -= 2 * Math.PI
  else while (sweep < 0) sweep += 2 * Math.PI
  const r = Math.hypot(s[0] - c[0], s[1] - c[1])
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36)))
  const out: [number, number][] = []
  for (let i = 1; i < steps; i++) {
    const a = a0 + (sweep * i) / steps
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])
  }
  return out
}

/** The ring a parcel's CoordGeom (lines, curves, irregular lines) draws, as [E, N]. */
function parcelRing(parcel: XNode): [number, number][] {
  const ring: [number, number][] = []
  const add = (p: [number, number] | null) => {
    if (!p) return
    const last = ring[ring.length - 1]
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) ring.push(p)
  }
  // LandXML order is northing, easting.
  const en = (n: XNode | undefined): [number, number] | null => {
    if (!n) return null
    const v = nums(n.text)
    return v.length >= 2 && v.every(Number.isFinite) ? [v[1], v[0]] : null
  }
  for (const geom of walk(parcel)) {
    if (geom.name === 'Line') {
      add(en(kids(geom, 'Start')[0]))
      add(en(kids(geom, 'End')[0]))
    } else if (geom.name === 'Curve') {
      const s = en(kids(geom, 'Start')[0])
      const e = en(kids(geom, 'End')[0])
      const c = en(kids(geom, 'Center')[0])
      add(s)
      if (s && e && c) for (const p of arcPoints(s, c, e, (geom.attrs.rot ?? 'ccw').toLowerCase() === 'cw')) add(p)
      add(e)
    } else if (geom.name === 'IrregularLine') {
      for (const l of kids(geom, 'PntList2D')) {
        const v = nums(l.text)
        for (let i = 0; i + 1 < v.length; i += 2) add([v[i + 1], v[i]])
      }
    }
  }
  return ring
}

/** Points and lot boundaries from LandXML text. Throws a plain message when it isn't one or has nothing usable. */
export function readLandXmlPoints(name: string, text: string): SurveyPoints {
  if (!isLandXml(text)) throw new Error(NOT_LANDXML(name))
  const root = parseXml(text)
  const k = unitScale(root)
  const notes: string[] = []
  const points: [number, number, number][] = []
  let noLevel = 0
  const addPoint = (s: string) => {
    const v = nums(s)
    if (v.length < 3) {
      noLevel++
      return
    }
    const [n, e, z] = v
    if (![n, e, z].every(Number.isFinite)) {
      noLevel++
      return
    }
    points.push([e * k, n * k, z * k])
  }
  let surfaces = 0
  for (const n of walk(root)) {
    if (n.name === 'Surface') {
      const pnts = [...walk(n)].filter(c => c.name === 'P' && !/^(true|1)$/i.test(c.attrs.invisible ?? ''))
      if (pnts.length) surfaces++
      for (const p of pnts) addPoint(p.text)
    } else if (n.name === 'CgPoint') addPoint(n.text)
  }
  if (noLevel) notes.push(`${noLevel} point${noLevel === 1 ? ' has' : 's have'} no level, so ${noLevel === 1 ? 'it was' : 'they were'} left out.`)

  const boundaries: [number, number][][] = []
  for (const n of walk(root)) {
    if (n.name !== 'Parcel') continue
    const ring = parcelRing(n).map(([e, nn]) => [e * k, nn * k] as [number, number])
    if (ring.length >= 3) boundaries.push(ring)
  }
  if (!boundaries.length) notes.push('The file has no parcel, so the site boundary is the outline of the points.')
  if (surfaces === 0 && points.length === 0) {
    throw new Error(`${name} is LandXML, but it has no surface or points with levels (RL) in it. Ask your surveyor for a LandXML with the surface, or a DXF.`)
  }
  return { points, boundaries, notes }
}

/** A survey record from LandXML text. */
export function readLandXml(name: string, text: string): SavedProject {
  return surveyFromPoints(name, readLandXmlPoints(name, text))
}
