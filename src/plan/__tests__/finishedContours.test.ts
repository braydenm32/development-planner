import { describe, expect, it } from 'vitest'
import { evaluateEarthworks, prepareEarthworks, type Platform } from '../../lib/earthworks'
import { parseDxf } from '../../lib/dxf'
import { pointInPolygon, type Vec2 } from '../../lib/geom'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { planeSurvey } from '../../lib/__tests__/fixtures'
import { CHANGED, contourInterval, contourLines, finishedContours, type ContourRun } from '../finishedContours'
import { garageFloor } from './fixtures'
import { planSetPdf } from '../../share/plans'

// The tilted plane z = 80 + 0.1x + 0.2y (x, y from E 1000, N 1000), contours every 0.5 m, with a level
// pad 6 m square cut into it: cut on its uphill sides, filled on its downhill ones, 1 in 2 batters.
const doc = parseDxf(planeSurvey())
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const natural = terrain.grid
const [ox, oy] = [survey.origin[0] - 1000, survey.origin[1] - 1000]
/** The plane in the survey's local frame. */
const plane = (x: number, y: number) => 80 + 0.1 * (x + ox) + 0.2 * (y + oy)
// The pad: 6 m square in the local frame, level with the plane at its middle.
const PAD = { x0: 9, x1: 15, y0: 12, y1: 18 }
const P = plane(12, 15)
const MARGIN = 0.5
const BATTER = 2
const pad: Platform = {
  include: [
    [
      [PAD.x0, PAD.y0],
      [PAD.x1, PAD.y0],
      [PAD.x1, PAD.y1],
      [PAD.x0, PAD.y1],
    ],
  ],
  exclude: [],
  level: P,
  fill: true,
}
const result = evaluateEarthworks(prepareEarthworks(natural, survey.boundary, [pad], { margin: MARGIN, cutBatter: BATTER, fillBatter: BATTER }))
const finished = result.grid
const fc = finishedContours(survey, natural, finished)

/** How far a point is from the pad's square. */
const fromPad = ([x, y]: Vec2) => Math.hypot(Math.max(PAD.x0 - x, 0, x - PAD.x1), Math.max(PAD.y0 - y, 0, y - PAD.y1))
/** How far a point is from the natural contour at z: the plane's slope is 0.2236 m per m. */
const fromNatural = ([x, y]: Vec2, z: number) => Math.abs(plane(x, y) - z) / Math.hypot(0.1, 0.2)
const onLine = (p: Vec2, a: Vec2, b: Vec2) => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1])
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (l * l)
  if (t < -1e-9 || t > 1 + 1e-9) return false
  return Math.hypot(a[0] + (b[0] - a[0]) * t - p[0], a[1] + (b[1] - a[1]) * t - p[1]) < 1e-9
}
/** Points spread along a run, for checking what ground it crosses. */
const along = (r: ContourRun, n = 12): Vec2[] =>
  r.pts.slice(1).flatMap((b, i) => {
    const a = r.pts[i]
    return Array.from({ length: n }, (_, k): Vec2 => [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n])
  })
const diff = ([x, y]: Vec2) => Math.abs(finished.sample(x, y) - natural.sample(x, y))

describe('finished-ground contours', () => {
  it('use the survey’s own interval, labelled every metre', () => {
    expect(contourInterval(survey)).toEqual({ minor: 0.5, major: 1 })
    const quarter = [0, 0.25, 0.5, 0.75, 1].map(z => ({ layer: 'C', z: 80 + z, major: z === 1, pts: [] }))
    expect(contourInterval({ contours: quarter })).toEqual({ minor: 0.25, major: 1 })
    expect(contourInterval({ contours: [] })).toEqual({ minor: 0.25, major: 1 })
    expect(fc.minor).toBe(0.5)
  })

  it('with no cut or fill there is nothing to add, and the natural contours are all there', () => {
    const none = finishedContours(survey, natural, natural)
    expect(none.any).toBe(false)
    expect(none.finished).toEqual([])
    expect(none.existing).toEqual([])
    expect(none.natural.length).toBeGreaterThan(10)
  })

  it('the natural contours are the survey’s own lines: as they are where the ground is, faint only where it’s cut or filled', () => {
    expect(fc.any).toBe(true)
    expect(fc.existing.length).toBeGreaterThan(0)
    for (const r of [...fc.natural, ...fc.existing]) {
      const src = survey.contours.filter(c => c.z === r.z)
      expect(src.length).toBeGreaterThan(0)
      // Every point lies on its contour as surveyed.
      for (const p of r.pts) expect(src.some(c => c.pts.slice(1).some((b, i) => onLine(p, [c.pts[i][0], c.pts[i][1]], [b[0], b[1]])))).toBe(true)
    }
    // Unchanged ground under the plain ones, cut or fill under the faint ones (clear of the 20 mm line itself).
    for (const r of fc.natural) for (const p of along(r)) expect(diff(p)).toBeLessThan(CHANGED + 0.01)
    for (const r of fc.existing) for (const p of along(r)) expect(diff(p)).toBeGreaterThan(CHANGED - 0.01)
  })

  it('each finished contour lies at its RL on the finished ground, at the survey’s interval', () => {
    expect(fc.finished.length).toBeGreaterThan(0)
    for (const r of fc.finished) {
      expect(Math.abs(r.z / 0.5 - Math.round(r.z / 0.5))).toBeLessThan(1e-9)
      expect(r.major).toBe(Math.abs(r.z - Math.round(r.z)) < 1e-9)
      for (const p of r.pts) {
        // Points on a grid line are where the grid's own interpolation is exact.
        const u = (p[0] - finished.x0) / finished.cell
        const v = (p[1] - finished.y0) / finished.cell
        if (Math.abs(u - Math.round(u)) > 1e-6 && Math.abs(v - Math.round(v)) > 1e-6) continue
        expect(finished.sample(p[0], p[1])).toBeCloseTo(r.z, 4)
      }
    }
  })

  it('away from the works they are straight and parallel, and where they leave the works they run into the natural ones', () => {
    // RLs 81.5 and 86.5 are well clear of the works: there the finished ground's contours are the plane's own, straight
    // and parallel, within 20 mm of the natural contour lines.
    for (const z of [81.5, 86.5]) {
      const pts = contourLines(finished, z)
        .flat()
        .filter(p => pointInPolygon(p[0], p[1], survey.boundary) && fromPad(p) > 8)
      expect(pts.length).toBeGreaterThan(10)
      for (const p of pts) expect(fromNatural(p, z)).toBeLessThan(0.02)
    }
    // A finished contour through the works ends on the natural contour of the same RL.
    for (const r of fc.finished) {
      for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) {
        if (diff(end) > CHANGED) continue // runs on to the boundary
        expect(fromNatural(end, r.z)).toBeLessThan(finished.cell)
      }
    }
  })

  it('they bend round the pad, each the batter’s run from its level area for the height above or below the pad', () => {
    // On the batters (clear of the pad and of where they meet the natural ground), RL z is
    // margin + |z − pad| × 2 out from the pad's edge.
    let checked = 0
    for (const r of fc.finished) {
      for (const p of r.pts) {
        const f = finished.sample(p[0], p[1])
        if (Math.abs(f - natural.sample(p[0], p[1])) < 0.1 || fromPad(p) < MARGIN + 0.3) continue
        expect(Math.abs(fromPad(p) - (MARGIN + Math.abs(r.z - P) * BATTER))).toBeLessThan(finished.cell)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
    // RL 84 is cut in on the uphill corner: it runs round the pad's north side and down its east side.
    const r84 = fc.finished.filter(r => r.z === 84).flatMap(r => r.pts)
    expect(r84.some(([x, y]) => y > PAD.y1 + MARGIN && x > PAD.x0 && x < PAD.x1)).toBe(true)
    expect(r84.some(([x, y]) => x > PAD.x1 + MARGIN && y > PAD.y0 && y < PAD.y1)).toBe(true)
    // And none crosses the pad, which is level at the pad's RL.
    for (const r of fc.finished) for (const [x, y] of r.pts) expect(x > PAD.x0 + 0.3 && x < PAD.x1 - 0.3 && y > PAD.y0 + 0.3 && y < PAD.y1 - 0.3).toBe(false)
  })

  it('works them out once for each earthworks result', () => {
    expect(finishedContours(survey, natural, finished)).toBe(fc)
  })

  it('stop at a retaining wall instead of crowding into the step across it', () => {
    // A 200 mm wall across the uphill batter: the contours that crossed it now end a cell and a half short of it.
    const wall = { a: [5, 19.5] as Vec2, b: [19, 19.5] as Vec2, half: 0.1 }
    const crossed = fc.finished.some(r => r.pts.some(([x, y]) => x > 5 && x < 19 && Math.abs(y - 19.5) < finished.cell))
    expect(crossed).toBe(true)
    const stopped = finishedContours(survey, natural, finished, [wall])
    for (const r of stopped.finished) for (const [x, y] of r.pts) expect(x > 5 && x < 19 && Math.abs(y - 19.5) < finished.cell * 1.5 - 1e-9).toBe(false)
  })

  it('the PDF site plan draws them with a key', () => {
    const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
    const plan = { ...garageFloor(), placement: { e: 1006, n: 1006, rotation: 0, ffl: 84 } }
    const base = { plan, survey, siteArea: terrain.stats.area, earthworks: { cut: result.cut, fill: result.fill }, ground: finished, up: 'house' as const, paper: 'A3' as const, title: 'T', date: 'd' }
    const withKey = text(planSetPdf({ ...base, contours: fc }))
    expect(withKey).toContain('(Finished ground, proposed) Tj')
    expect(withKey).toContain('(Natural ground, existing \\(dashed where cut or filled\\)) Tj')
    expect(withKey).toContain('(Contours every 500 mm, labelled every 1 m) Tj')
    const without = text(planSetPdf(base))
    expect(without).not.toContain('Finished ground, proposed')
  })
})
