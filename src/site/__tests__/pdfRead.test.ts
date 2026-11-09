import { describe, expect, it } from 'vitest'
import { signedArea, type Vec2 } from '../../lib/geom'
import { PdfDocument, textWidth } from '../../share/pdfWriter'
import { alignFromPairs, applyAffine, IDENTITY, impliedScale, invert, metresPerPoint, scaleOf, similarity, type Affine } from '../align'
import { mapGeom } from '../model'
import { statedScale } from '../pdfLoad'
import { outsideParts, readDrawing, sentence } from '../pdfRead'
import { pathsFromOps, snapPoints, textsFromItems, type OpCodes, type VectorPage } from '../pdfVector'

/**
 * A made-up detail survey at 1:200, drawn with the app's own PDF writer the way surveyors'
 * CAD exports draw them (dashes as separate strokes, a tree schedule, an easement legend),
 * then read back through pdf.js as the app reads a dropped-in PDF.
 */
const PT = 72 / 25.4
const mm = ([x, y]: Vec2): Vec2 => [x * PT, y * PT]

// Paper millimetres. At 1:200, 5 mm is a metre.
const LOT: Vec2[] = [
  [100, 60],
  [190, 60],
  [190, 210],
  [100, 210],
]
// The lot on the title adds a 1.5 m wide, 16 m long handle along the top, to the west.
const TITLE: Vec2[] = [
  [20, 202.5],
  [100, 202.5],
  [100, 60],
  [190, 60],
  [190, 210],
  [20, 210],
]
const TREES = [
  { at: [120, 100] as Vec2, r: 1, no: '1', height: 9, spread: 7, trunk: 0.4 },
  { at: [170, 180] as Vec2, r: 0.9, no: '2', height: 11, spread: 5, trunk: 0.35 },
]

function syntheticSurvey(): Uint8Array {
  const doc = new PdfDocument('Synthetic survey')
  const pg = doc.addPage(420, 297)
  pg.lineWidth(0.5).stroke([0, 0, 0]).rect(10, 10, 400, 277, 'stroke')
  pg.shape([TITLE], 'stroke')
  pg.text(140, 140, '564.0 m²', { size: 3 })
  pg.text(330, 20, 'SCALE 1:200 @ A3', { size: 3 })

  // Trees: trunk circles numbered beside them, under their canopies.
  pg.lineWidth(0.18)
  for (const t of TREES) {
    pg.circle(t.at[0], t.at[1], t.r, 'stroke')
    pg.circle(t.at[0], t.at[1], t.spread * 2.5, 'stroke')
    pg.text(t.at[0] + 2.2, t.at[1] + 0.8, t.no, { size: 2.5 })
  }
  // The schedule: one header item, then the numbers under each column.
  pg.text(300, 262, 'Tree Schedule', { size: 3.5, font: 'bold' })
  const header = 'No. He. Sp.Ø Tr.Ø'
  const per = textWidth(header, 2.5) / header.length
  pg.text(300, 255, header, { size: 2.5 })
  TREES.forEach((t, i) => {
    const y = 251 - i * 3.5
    ;[
      [0, t.no],
      [4, String(t.height)],
      [8, String(t.spread)],
      [13, String(t.trunk)],
    ].forEach(([col, v]) => pg.text(300 + Number(col) * per, y, String(v), { size: 2.5 }))
  })

  // A 2 m easement inside the east boundary: its inner edge dashed as separate strokes.
  pg.text(300, 215, 'Easements', { size: 3, font: 'bold' })
  pg.text(300, 208, '(B) EASEMENT TO DRAIN WATER 2 WIDE.', { size: 2.5 })
  pg.lineWidth(0.25)
  for (let y = 60; y < 210; y += 5.8) pg.line([180, y], [180, Math.min(y + 4, 210)])
  pg.text(182, 130, '(B)', { size: 2.5 })

  // A fence just outside the south boundary, named beside it.
  pg.lineWidth(0.18).line([100, 58.5], [190, 58.5])
  pg.text(130, 54.8, 'COLORBOND FENCE', { size: 2.5 })
  return doc.output()
}

async function readPage(bytes: Uint8Array): Promise<VectorPage> {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = lib.getDocument({ data: bytes })
  const pdf = await task.promise
  const page = await pdf.getPage(1)
  const view = page.view
  const content = await page.getTextContent()
  const ops = await page.getOperatorList()
  const { paths, imageCover } = pathsFromOps(ops.fnArray, ops.argsArray, lib.OPS as unknown as OpCodes, view)
  const out = { width: view[2] - view[0], height: view[3] - view[1], texts: textsFromItems(content.items as unknown[], view), paths, imageCover }
  await task.destroy()
  return out
}

// Where the drawing truly sits on the survey grid: turned 30°, at 1:200.
const TRUE: Affine = similarity(metresPerPoint(200), 30, [5000, 8000])
const toWorld = (paper: Vec2) => applyAffine(TRUE, mm(paper))
const BOUNDARY = LOT.map(toWorld)

/** What a click near a corner snaps to: the nearest corner of the line work, as on the plan. */
function snap(page: VectorPage, paper: Vec2): Vec2 {
  const p = mm(paper)
  let best: Vec2 = p
  let d = Infinity
  for (const q of snapPoints(page.paths)) {
    const e = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (e < d) {
      d = e
      best = q
    }
  }
  return best
}

describe('reading a vector drawing', async () => {
  const page = await readPage(syntheticSurvey())

  it('reads the words and the line work in page points', () => {
    expect(page.width).toBeCloseTo(420 * PT, 1)
    expect(page.texts.some(t => t.str === '564.0 m²')).toBe(true)
    const lot = page.paths.find(p => p.closed && p.pts.length === 6)!
    expect(lot.width).toBeCloseTo(0.5 * PT, 2)
    expect(lot.pts[2][0]).toBeCloseTo(100 * PT, 1)
    expect(lot.pts[2][1]).toBeCloseTo(60 * PT, 1)
    expect(page.imageCover).toBe(0)
    expect(statedScale(page.texts.map(t => t.str))).toBe(200)
  })

  // Two clicks on the drawing, two on the survey, as a person would line it up.
  const pairs = [
    { from: snap(page, LOT[0]), to: BOUNDARY[0] },
    { from: snap(page, LOT[2]), to: BOUNDARY[2] },
  ]
  const T = alignFromPairs(pairs, IDENTITY, null)

  it('lines up by two points to within 10 mm on the ground', () => {
    // Every corner of the lot, where it is on the drawing, lands on the survey's corner.
    for (const [i, c] of LOT.entries()) {
      const p = applyAffine(T, mm(c))
      expect(Math.hypot(p[0] - BOUNDARY[i][0], p[1] - BOUNDARY[i][1])).toBeLessThan(0.01)
    }
    expect(impliedScale(T)).toBeCloseTo(200, 0)
    // Keeping the stated scale gives the same line-up when the drawing is true to it.
    const kept = alignFromPairs(pairs, IDENTITY, 200)
    const p = applyAffine(kept, mm(LOT[1]))
    expect(Math.hypot(p[0] - BOUNDARY[1][0], p[1] - BOUNDARY[1][1])).toBeLessThan(0.01)
  })

  const inv = invert(T)!
  const groups = readDrawing(page, { metresPerPoint: scaleOf(T), boundary: BOUNDARY.map(p => applyAffine(inv, p)) })
  const group = (id: string) => groups.find(g => g.id === id)!

  it('finds the trees in the schedule at their numbered trunks', () => {
    const g = group('tree-schedule')
    expect(g.features.map(f => f.label)).toEqual(['T1', 'T2'])
    for (const [i, f] of g.features.entries()) {
      const t = TREES[i]
      expect(f.trunk).toBeCloseTo(t.trunk)
      expect(f.canopy).toBe(t.spread)
      expect(f.height).toBe(t.height)
      // Added to the plan, a tree lands on its trunk on the survey grid.
      const world = mapGeom(f.geom, p => applyAffine(T, p))
      const at = world.kind === 'point' ? world.at : [0, 0]
      const truth = toWorld(t.at)
      expect(Math.hypot(at[0] - truth[0], at[1] - truth[1])).toBeLessThan(0.01)
    }
  })

  it('places the easement from the legend in its strip, with its width and purpose', () => {
    const g = group('easements')
    expect(g.features).toHaveLength(1)
    const e = g.features[0]
    expect(e.label).toBe('(B)')
    expect(e.width).toBe(2)
    expect(e.purpose).toBe('Easement to drain water 2 wide')
    const pts = e.geom.kind === 'area' ? e.geom.pts : []
    // 2 m by the lot's 30 m depth.
    expect(Math.abs(signedArea(pts)) * scaleOf(T) ** 2).toBeCloseTo(60, -0.5)
  })

  it('offers the strip of the title outside the survey boundary as an access handle', () => {
    const g = group('lot-outside')
    expect(g.features).toHaveLength(1)
    const f = g.features[0]
    expect(f.label).toBe('Access handle')
    expect(f.type).toBe('other')
    const pts = f.geom.kind === 'area' ? f.geom.pts : []
    expect(Math.abs(signedArea(pts)) * scaleOf(T) ** 2).toBeCloseTo(24, 0)
  })

  it('follows a labelled fence along its line', () => {
    const g = group('fences')
    expect(g.features).toHaveLength(1)
    const f = g.features[0]
    expect(f.label).toBe('Colorbond fence')
    const pts = f.geom.kind === 'line' ? f.geom.pts : []
    const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * scaleOf(T)
    expect(L).toBeGreaterThan(15)
    expect(L).toBeLessThan(19)
  })
})

describe('the parts of a lot past a boundary', () => {
  it('cuts a handle off a lot that shares the rest of its outline', () => {
    const lot: Vec2[] = [
      [0, 9],
      [10, 9],
      [10, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]
    const site: Vec2[] = [
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
    ]
    const parts = outsideParts(lot, site, 0.01)
    expect(parts).toHaveLength(1)
    expect(Math.abs(signedArea(parts[0]))).toBeCloseTo(10)
    expect(outsideParts(site, site, 0.01)).toEqual([])
  })
})

describe('sentence case', () => {
  it('keeps short codes and numbers as written', () => {
    expect(sentence('RIGHT OF CARRIAGEWAY')).toBe('Right of carriageway')
    expect(sentence('EASEMENT FOR SMH ACCESS (VIDE DP123)')).toBe('Easement for SMH access (vide DP123)')
    expect(sentence('Mixed case stays')).toBe('Mixed case stays')
  })
})
