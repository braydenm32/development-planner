import type { Vec2 } from '../lib/geom'
import { applyAffine, compose, type Affine } from './align'

/**
 * What a vector PDF page holds, in a plain form the feature reader can work on: its words
 * with their positions, and its line work with colour, width and dash style.
 *
 * Coordinates are PDF points from the bottom-left corner of the page, y up.
 */
export interface VText {
  str: string
  /** Start of the baseline. */
  x: number
  y: number
  /** Height of the letters (points). */
  size: number
  /** Degrees anticlockwise from the page's x axis. */
  angle: number
  /** Length along the baseline (points). */
  width: number
}

export interface VPath {
  pts: Vec2[]
  closed: boolean
  /** '#rrggbb', or null when not stroked. */
  stroke: string | null
  fill: string | null
  /** Stroke width (points). */
  width: number
  /** Dash pattern (points); empty for solid. */
  dash: number[]
  /** Drawn with curves (circles, clouds), not only straight lines. */
  curved: boolean
}

export interface VectorPage {
  width: number
  height: number
  texts: VText[]
  paths: VPath[]
  /** How much of the page pictures cover (0 to 1): near 1 for a scanned drawing. */
  imageCover: number
}

/** Points a click on a drawing snaps to: the ends of every stroke and the corners of straight ones. */
export function snapPoints(paths: VPath[]): Vec2[] {
  const out: Vec2[] = []
  for (const p of paths) {
    if (!p.pts.length) continue
    if (p.curved) out.push(p.pts[0], p.pts[p.pts.length - 1])
    else out.push(...p.pts)
  }
  return out
}

/** The numbers pdf.js uses for the operators read here (its OPS table). */
export interface OpCodes {
  save: number
  restore: number
  transform: number
  setLineWidth: number
  setDash: number
  setGState: number
  setStrokeRGBColor: number
  setFillRGBColor: number
  constructPath: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  paintImageXObject: number
  paintInlineImageXObject: number
  paintImageMaskXObject: number
  stroke: number
  closeStroke: number
  fill: number
  eoFill: number
  fillStroke: number
  eoFillStroke: number
  closeFillStroke: number
  closeEOFillStroke: number
}

// Path commands inside pdf.js's constructPath data.
const MOVE = 0
const LINE = 1
const CURVE = 2
const QUAD = 3
const CLOSE = 4

/** Most segments read from one page; enough for a busy survey, short of hanging the browser. */
export const MAX_PATHS = 40000

interface GState {
  ctm: Affine
  width: number
  dash: number[]
  stroke: string
  fill: string
}

const scaleOf = (m: Affine) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))

/** Turn pdf.js's operator list for a page into line work in page points. */
export function pathsFromOps(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, OPS: OpCodes, view: number[]): { paths: VPath[]; imageCover: number } {
  const base: Affine = [1, 0, 0, 1, -view[0], -view[1]]
  let st: GState = { ctm: base, width: 1, dash: [], stroke: '#000000', fill: '#000000' }
  const stack: GState[] = []
  const paths: VPath[] = []
  const pageArea = Math.max((view[2] - view[0]) * (view[3] - view[1]), 1)
  let imageArea = 0

  for (let i = 0; i < fnArray.length && paths.length < MAX_PATHS; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[] | null
    switch (fn) {
      case OPS.save:
        stack.push({ ...st, dash: [...st.dash] })
        break
      case OPS.restore:
        st = stack.pop() ?? st
        break
      case OPS.transform:
        st.ctm = compose(st.ctm, (args as number[]).slice(0, 6) as Affine)
        break
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...st, dash: [...st.dash] })
        const m = args?.[0] as number[] | null
        if (m && m.length >= 6) st.ctm = compose(st.ctm, Array.from(m).slice(0, 6) as Affine)
        break
      }
      case OPS.paintFormXObjectEnd:
        st = stack.pop() ?? st
        break
      case OPS.setLineWidth:
        st.width = Number(args?.[0]) || 0
        break
      case OPS.setDash:
        st.dash = Array.isArray(args?.[0]) ? (args[0] as number[]).map(Number) : []
        break
      case OPS.setGState:
        for (const entry of (args?.[0] as [string, unknown][] | undefined) ?? []) {
          if (entry[0] === 'LW') st.width = Number(entry[1]) || 0
          if (entry[0] === 'D' && Array.isArray(entry[1])) st.dash = Array.isArray(entry[1][0]) ? (entry[1][0] as number[]).map(Number) : []
        }
        break
      case OPS.setStrokeRGBColor:
        if (typeof args?.[0] === 'string') st.stroke = args[0]
        break
      case OPS.setFillRGBColor:
        if (typeof args?.[0] === 'string') st.fill = args[0]
        break
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
        // An image fills the unit square of the current transform.
        imageArea += Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2])
        break
      case OPS.constructPath: {
        const op = Number(args?.[0])
        const stroked = op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke
        const filled = op === OPS.fill || op === OPS.eoFill || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke
        if (!stroked && !filled) break
        const raw = args?.[1] as unknown
        const data = (Array.isArray(raw) ? raw[0] : raw) as ArrayLike<number> | null | undefined
        if (!data || typeof data.length !== 'number') break
        const s = scaleOf(st.ctm)
        const forceClose = op === OPS.closeStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke
        for (const sub of subpaths(data, st.ctm)) {
          if (sub.pts.length < 2) continue
          paths.push({
            pts: sub.pts,
            closed: sub.closed || forceClose || filled,
            stroke: stroked ? st.stroke : null,
            fill: filled ? st.fill : null,
            width: st.width * s,
            dash: st.dash.map(d => d * s),
            curved: sub.curved,
          })
        }
        break
      }
    }
  }
  return { paths, imageCover: Math.min(1, imageArea / pageArea) }
}

function subpaths(data: ArrayLike<number>, m: Affine): { pts: Vec2[]; closed: boolean; curved: boolean }[] {
  const out: { pts: Vec2[]; closed: boolean; curved: boolean }[] = []
  let cur: { pts: Vec2[]; closed: boolean; curved: boolean } | null = null
  let last: Vec2 = [0, 0]
  let start: Vec2 = [0, 0]
  const T = (x: number, y: number) => applyAffine(m, [x, y])
  for (let i = 0; i < data.length; ) {
    const cmd = data[i++]
    if (cmd === MOVE) {
      last = [data[i], data[i + 1]]
      start = last
      i += 2
      cur = { pts: [T(last[0], last[1])], closed: false, curved: false }
      out.push(cur)
    } else if (cmd === LINE) {
      last = [data[i], data[i + 1]]
      i += 2
      if (!cur) out.push((cur = { pts: [], closed: false, curved: false }))
      cur.pts.push(T(last[0], last[1]))
    } else if (cmd === CURVE || cmd === QUAD) {
      const n = cmd === CURVE ? 6 : 4
      const c = Array.from({ length: n }, (_, k) => data[i + k])
      i += n
      if (!cur) out.push((cur = { pts: [T(last[0], last[1])], closed: false, curved: false }))
      const [x0, y0] = last
      for (let k = 1; k <= 8; k++) {
        const t = k / 8
        const u = 1 - t
        let x: number
        let y: number
        if (cmd === CURVE) {
          x = u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4]
          y = u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5]
        } else {
          x = u * u * x0 + 2 * u * t * c[0] + t * t * c[2]
          y = u * u * y0 + 2 * u * t * c[1] + t * t * c[3]
        }
        cur.pts.push(T(x, y))
      }
      cur.curved = true
      last = cmd === CURVE ? [c[4], c[5]] : [c[2], c[3]]
    } else if (cmd === CLOSE) {
      if (cur) cur.closed = true
      // The pen goes back to the start of the subpath.
      last = start
    } else {
      break // unknown command: stop rather than misread the rest
    }
  }
  return out
}


/** pdf.js text items (getTextContent) as words with positions, in page points. */
export function textsFromItems(items: unknown[], view: number[]): VText[] {
  const out: VText[] = []
  for (const raw of items) {
    const it = raw as { str?: string; transform?: number[]; width?: number }
    const str = (it.str ?? '').replace(/\s+/g, ' ').trim()
    if (!str || !it.transform) continue
    const [a, b, , , e, f] = it.transform
    out.push({ str, x: e - view[0], y: f - view[1], size: Math.hypot(a, b), angle: (Math.atan2(b, a) * 180) / Math.PI, width: it.width ?? 0 })
  }
  return out
}
