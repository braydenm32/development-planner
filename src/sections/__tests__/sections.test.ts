// Sections and elevations on the made-up sample block (samples/sample-block.dxf) with the made-up
// garage floor on it, and on a plain box house: the ground matches the terrain, floors sit at
// their RLs, walls and the roof are cut where they should be, the elevations have the outline
// and height they should, and the PDF plan set gets its sheets at 1:100 (or 1:200).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { houseHeight } from '../../checks/measure'
import { parseDxf } from '../../lib/dxf'
import type { Vec2 } from '../../lib/geom'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { FLOOR_STRUCTURE, normalizePlan, toSite, type Level, type Plan, type Roof, type Wall } from '../../plan/model'
import { levelOutlines, ROOF_EDGE, roofGeometry } from '../../plan/roof'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { planSetPdf } from '../../share/plans'
import { spansInside, type Pt } from '../common'
import { elevationDrawing, elevationSides, highestPoint, SIDES } from '../elevation'
import { addSection, flipSection, nextLabel, removeSection, sectionsOf, snapEnd } from '../lines'
import { paintDrawing, spread, type Painter } from '../paint'
import { roofProfile, sectionDrawing } from '../section'
import { textWidth, type PdfPage } from '../../share/pdfWriter'
import { drawSectionMarks } from '../sheets'

const text = readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8')
const doc = parseDxf(text)
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
/** Where the house sits on the sample block, as the numbers audit puts it. */
const PLACEMENT = { e: 5006, n: 8004, rotation: 0, ffl: 45.5 }
const sample = normalizePlan({ ...garageFloor(), name: 'Sample house', placement: PLACEMENT })
const finishedOf = (plan: Plan) => earthFrom(terrain.grid, survey.boundary, earthInputs(plan, survey)).result.grid

/** The ground along a run at s, read straight off its points. */
function along(runs: Pt[][], s: number): number | null {
  for (const r of runs)
    for (let i = 0; i + 1 < r.length; i++)
      if (s >= r[i][0] - 1e-9 && s <= r[i + 1][0] + 1e-9) return r[i][1] + ((r[i + 1][1] - r[i][1]) * (s - r[i][0])) / (r[i + 1][0] - r[i][0])
  return null
}

const L0 = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2, level = L0): Wall => ({ id, level, a, b, thickness: 0.3, kind: 'external' })

/** A plain 10 m × 8 m (centreline) box with 300 mm walls, so 10.3 m × 8.3 m outside, with a hip roof. */
function box(patch: Partial<Plan> = {}): Plan {
  const walls = [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])]
  const roof: Roof = { id: 'roof', level: L0, pts: levelOutlines(walls)[0], type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0 }
  return normalizePlan({
    version: 1,
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls,
    openings: [],
    rooms: [],
    areas: [],
    roofs: [roof],
    stairs: [],
    furniture: [],
    placement: PLACEMENT,
    ...patch,
  })
}

describe('section lines kept with the plan', () => {
  it('leaves a plan saved before sections as it was, and drops broken lines', () => {
    expect('sections' in sample).toBe(false)
    expect(sectionsOf(sample)).toEqual([])
    const broken = normalizePlan({ ...sample, sections: [{ id: 'ok', label: 'A', a: [0, 0], b: [5, 0] }, { id: 'bad', label: 'B', a: [0, 0] } as never] })
    expect(sectionsOf(broken).map(s => s.id)).toEqual(['ok'])
  })

  it('names lines A, B, … without I or O, and flips and removes them', () => {
    let p = sample
    const labels: string[] = []
    for (let i = 0; i < 10; i++) {
      const r = addSection(p, [0, i], [5, i])
      p = r.plan
      labels.push(r.line.label)
    }
    expect(labels).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'])
    const first = sectionsOf(p)[0]
    expect(sectionsOf(flipSection(p, first.id))[0]).toMatchObject({ a: [5, 0], b: [0, 0] })
    p = removeSection(p, first.id)
    expect(nextLabel(p)).toBe('A')
  })

  it('snaps a line square to the house unless Shift is held', () => {
    expect(snapEnd([0, 0], [10, 0.4], false)[1]).toBeCloseTo(0, 9)
    expect(snapEnd([0, 0], [10, 0.4], true)).toEqual([10, 0.4])
    expect(snapEnd([0, 0], [10, 3], false)).toEqual([10, 3])
  })
})

describe('a section across the slope, through the garage floor', () => {
  const finished = finishedOf(sample)
  // West to east along y = 7 (house frame), through the garage and the entry.
  const line = { id: 's', label: 'A', a: [-12, 7] as Vec2, b: [24, 7] as Vec2 }
  const d = sectionDrawing(line, { plan: sample, survey, terrain, finished })
  const siteAt = (s: number) => toSite([line.a[0] + s, 7], sample.placement, survey.origin)

  it('draws the natural ground the terrain has, point for point and between', () => {
    for (const run of d.natural)
      for (const [s, z] of run) {
        const p = siteAt(s)
        expect(z).toBeCloseTo(terrain.grid.sample(p[0], p[1]), 9)
      }
    // Spot reads of the existing ground at a few places along the line.
    for (const s of [7, 9.3, 12.5, 17, 25.25]) {
      const p = siteAt(s)
      expect(along(d.natural, s), `s ${s}`).toBeCloseTo(terrain.grid.sample(p[0], p[1]), 2)
    }
    // It falls west to east, as the block does.
    expect(along(d.natural, 7)!).toBeGreaterThan(along(d.natural, 27)! + 2)
  })

  it('draws the finished ground the cut and fill makes: the pad under the slab', () => {
    for (const s of [13, 17, 21]) expect(along(d.finished, s)!, `s ${s}`).toBeCloseTo(45.5 - FLOOR_STRUCTURE, 2)
    const p = siteAt(26)
    expect(along(d.finished, 26)).toBeCloseTo(finished.sample(p[0], p[1]), 2)
  })

  it('marks the boundary where the line leaves the block, with the natural ground there', () => {
    expect(d.boundaries).toHaveLength(2)
    expect(spansInside(siteAt(0), siteAt(36), [survey.boundary])[0][0]).toBeCloseTo(d.boundaries[0].s, 9)
    for (const b of d.boundaries) {
      const p = siteAt(b.s)
      expect(b.rl).toBeCloseTo(terrain.grid.sample(p[0], p[1]), 9)
    }
    // The ground stops at the boundary.
    expect(d.natural[0][0][0]).toBeCloseTo(d.boundaries[0].s, 9)
  })

  it('puts the floor at its RL, the slab under it and the ceiling above', () => {
    expect(d.floors).toHaveLength(1)
    const f = d.floors[0]
    expect(f.rl).toBe(45.5)
    expect(f.ceiling).toBeCloseTo(48.2, 9)
    // The house is 10.1 m across outside at y = 7: x 0 to 10.1, so 12 to 22.1 along the line.
    expect(f.spans[0][0]).toBeCloseTo(12, 6)
    expect(f.spans[0][1]).toBeCloseTo(22.1, 6)
    expect(d.slabs).toEqual([{ s0: f.spans[0][0], s1: f.spans[0][1], z0: 45.5 - FLOOR_STRUCTURE, z1: 45.5 }])
    expect(d.levels[0]).toMatchObject({ rl: 45.5, text: 'FFL', name: 'Ground floor' })
  })

  it('cuts the walls it crosses, floor to ceiling', () => {
    const cut = d.walls.map(w => [+w.s0.toFixed(3), +w.s1.toFixed(3), w.z0, +w.z1.toFixed(6)]).sort((a, b) => a[0] - b[0])
    expect(cut).toEqual([
      [12, 12.3, 45.5, 48.2], // garage west, 300 mm
      [20.045, 20.155, 45.5, 48.2], // hall west, 110 mm
      [21.8, 22.1, 45.5, 48.2], // east, 300 mm
    ])
  })

  it('leaves the sill and the head where it cuts through a window', () => {
    // The study's window on the east wall is centred 1.65 m up the plan, 900 mm sill, 1200 mm high.
    const w = sectionDrawing({ id: 'w', label: 'B', a: [4, 1.65], b: [14, 1.65] }, { plan: sample, survey, terrain, finished })
    const east = w.walls.filter(x => x.s0 > 5.5).map(x => [+x.z0.toFixed(6), +x.z1.toFixed(6)])
    expect(east).toEqual([
      [45.5, 46.4],
      [47.6, 48.2],
    ])
  })

  it('puts an upper floor at its own RL, on its framing', () => {
    const upper: Level = { id: 'up', name: 'First floor', elevation: 3, height: 2.4 }
    const two = { ...sample, levels: [...sample.levels, upper], walls: [...sample.walls, ...sample.walls.map(x => ({ ...x, id: `${x.id}_up`, level: 'up' }))] }
    const s = sectionDrawing(line, { plan: two, survey, terrain, finished })
    expect(s.floors.map(f => [f.name, f.rl, +f.ceiling.toFixed(6)])).toEqual([
      ['Ground floor', 45.5, 48.2],
      ['First floor', 48.5, 50.9],
    ])
    expect(s.framing.some(b => b.z0 === 48.5 - FLOOR_STRUCTURE && b.z1 === 48.5)).toBe(true)
  })

  it('stands rooms on piers on posts down to the ground', () => {
    const piers = { ...sample, levels: sample.levels.map(l => ({ ...l, floorType: 'piers' as const })) }
    const s = sectionDrawing(line, { plan: piers, survey, terrain, finished: finishedOf(piers) })
    expect(s.piers.length).toBeGreaterThan(3)
    for (const p of s.piers) expect(p.z1).toBeCloseTo(45.5 - FLOOR_STRUCTURE, 9)
  })
})

describe('a section through a roof', () => {
  const plan = box()
  const g = roofGeometry(plan.roofs[0])

  it('follows the roof up to its ridge and down to the eaves', () => {
    // Across the 8 m way, through the middle: eaves 0.6 m past the walls' centrelines each side.
    const runs = roofProfile(g.mesh, [5, -3], [5, 11])
    expect(runs).toHaveLength(1)
    const r = runs[0]
    expect(r[0][0]).toBeCloseTo(3 - 0.6, 6)
    expect(r[r.length - 1][0]).toBeCloseTo(11 + 0.6, 6)
    expect(r[0][1]).toBeCloseTo(ROOF_EDGE, 6)
    expect(Math.max(...r.map(p => p[1]))).toBeCloseTo(g.height, 6)
  })

  it('draws the cut roof from the top of the walls', () => {
    const d = sectionDrawing({ id: 'r', label: 'A', a: [5, -3], b: [5, 11] }, { plan, survey, terrain })
    expect(d.roofs).toHaveLength(1)
    expect(Math.max(...d.roofs[0].map(p => p[1]))).toBeCloseTo(48.2 + g.height, 6)
    expect(Math.min(...d.roofs[0].map(p => p[1]))).toBeCloseTo(48.2, 6)
    expect(d.levels.at(-1)).toMatchObject({ text: 'Roof' })
  })
})

describe('elevations', () => {
  it('names each side by the way it faces, one name each, however the house turns', () => {
    for (const rotation of [0, 12, 30, 45, 90, 135, 200, 315]) {
      const sides = elevationSides({ placement: { ...PLACEMENT, rotation } })
      expect(new Set(sides.map(s => s.side)).size, `${rotation}°`).toBe(4)
    }
    const square = elevationSides({ placement: PLACEMENT })
    expect(square).toEqual([
      { side: 'east', out: [1, 0] },
      { side: 'north', out: [0, 1] },
      { side: 'west', out: [-1, 0] },
      { side: 'south', out: [0, -1] },
    ])
  })

  const plan = box()
  const g = roofGeometry(plan.roofs[0])
  const top = 48.2 + g.height
  const all = SIDES.map(s => elevationDrawing(s, { plan, survey, terrain }))
  const north = all[0]
  const east = all[1]

  it('draws a box house as one wall face per side, floor to wall top, under its roof', () => {
    for (const d of all) {
      const walls = d.shapes.filter(s => s.kind === 'wall')
      expect(walls, d.side).toHaveLength(1)
      const zs = walls[0].pts.map(p => p[1])
      expect(Math.min(...zs)).toBeCloseTo(45.5 - FLOOR_STRUCTURE, 9)
      expect(Math.max(...zs)).toBeCloseTo(48.2, 9)
      const roofZ = d.shapes.flatMap(s => (s.kind === 'roof' ? s.tris.flat().map(p => p[1]) : []))
      expect(Math.max(...roofZ), d.side).toBeCloseTo(top, 6)
      expect(Math.min(...roofZ), d.side).toBeCloseTo(48.2, 6)
    }
    // Seen from the north, east is on the left: the face runs 10.3 m, the roof 0.45 m past it each side.
    const across = (d: typeof north, kind: 'wall' | 'roof') => {
      const us = d.shapes.flatMap(s => (s.kind === 'wall' && kind === 'wall' ? s.pts.map(p => p[0]) : s.kind === 'roof' && kind === 'roof' ? s.tris.flat().map(p => p[0]) : []))
      return [Math.min(...us), Math.max(...us)].map(v => +v.toFixed(6))
    }
    expect(across(north, 'wall')).toEqual([-10.15, 0.15])
    expect(across(north, 'roof')).toEqual([-10.6, 0.6])
    expect(across(east, 'wall')).toEqual([-0.15, 8.15])
    expect(north.ends).toEqual(['east', 'west'])
    expect(east.ends).toEqual(['south', 'north'])
  })

  it('marks the highest point above natural ground with the height the checks measure', () => {
    const h = houseHeight(plan, survey, terrain)
    const hp = highestPoint(plan, survey.origin, terrain.grid)!
    expect(hp.top - hp.ground).toBeCloseTo(h, 9)
    for (const d of all) {
      expect(d.height!.value).toBe(h)
      expect(d.height!.top).toBeCloseTo(top, 6)
      expect(d.height!.top - d.height!.ground).toBeCloseTo(h, 9)
    }
    expect(all.flatMap(d => d.levels.map(l => l.text))).toContain('Roof')
  })

  it('shows a window on the side it faces, and nowhere else', () => {
    const withWindow = box({ openings: [{ id: 'win', wall: 'n', kind: 'window', offset: 5, width: 1.2, height: 1.2, sill: 0.9, flipHinge: false, flipSwing: false }] })
    const ds = SIDES.map(s => elevationDrawing(s, { plan: withWindow, survey, terrain }))
    const ops = (i: number) => ds[i].shapes.flatMap(s => (s.kind === 'wall' ? s.openings : []))
    expect(ops(0)).toHaveLength(1)
    const o = ops(0)[0]
    expect(o.kind).toBe('window')
    expect(o.box.s1 - o.box.s0).toBeCloseTo(1.2, 9)
    expect((o.box.s0 + o.box.s1) / 2).toBeCloseTo(-5, 9)
    expect([o.box.z0, o.box.z1]).toEqual([46.4, 47.6])
    for (const i of [1, 2, 3]) expect(ops(i)).toHaveLength(0)
  })

  it('draws the natural and finished ground along the face', () => {
    const d = elevationDrawing('north', { plan: sample, survey, terrain, finished: finishedOf(sample) })
    expect(d.natural.length).toBeGreaterThan(0)
    // At the garage's north face (y 10.605), 4 m along the house (x 4, so u −4).
    const p = toSite([4, 10.605], sample.placement, survey.origin)
    expect(along(d.natural, -4)).toBeCloseTo(terrain.grid.sample(p[0], p[1]), 2)
  })

  it('has nothing to draw with no walls', () => {
    const empty = elevationDrawing('north', { plan: { ...sample, walls: [], openings: [], rooms: [], areas: [] }, survey, terrain })
    expect(empty.any).toBe(false)
    expect(empty.height).toBeNull()
  })
})

/** A painter that only records the labels it is asked to write, with their boxes. */
function recorder(): Painter & { texts: { s: string; x0: number; x1: number; y0: number; y1: number }[] } {
  const texts: { s: string; x0: number; x1: number; y0: number; y1: number }[] = []
  return {
    texts,
    size: { title: 14, label: 11.5, small: 10.5 },
    unit: 1,
    shape() {},
    line() {},
    text(x, y, s, o) {
      const w = textWidth(s, o.size, o.bold ? 'bold' : 'regular')
      const x0 = o.anchor === 'middle' ? x - w / 2 : o.anchor === 'end' ? x - w : x
      const y1 = o.middle ? y + o.size * 0.4 : y
      texts.push({ s, x0, x1: x0 + w, y0: y1 - o.size * 0.75, y1 })
    },
    measure: (s, size, bold) => textWidth(s, size, bold ? 'bold' : 'regular'),
  }
}

describe('labels', () => {
  it('spreads labels apart in order, and leaves ones with room where they are', () => {
    expect(spread([10, 50, 90], 12)).toEqual([10, 50, 90])
    const s = spread([50, 52, 40], 12)
    expect(s[2]).toBeLessThan(s[0])
    expect(s[0]).toBeLessThan(s[1])
    expect(s[1] - s[0]).toBeCloseTo(12, 9)
    expect(s[0] - s[2]).toBeCloseTo(12, 9)
  })

  it('writes no label over another on a two-storey section and its elevations', () => {
    const upper: Level = { id: 'up', name: 'First floor', elevation: 3, height: 2.4 }
    const two = { ...box(), levels: [...box().levels, upper], walls: [...box().walls, ...box().walls.map(x => ({ ...x, id: `${x.id}_up`, level: 'up' }))] }
    const roof = { ...two.roofs[0], level: 'up' }
    const plan = { ...two, roofs: [roof] }
    const drawings = [
      sectionDrawing({ id: 'a', label: 'A', a: [-4, 4], b: [14, 4] }, { plan, survey, terrain }),
      ...SIDES.map(s => elevationDrawing(s, { plan, survey, terrain })),
    ]
    for (const d of drawings) {
      for (const k of [8, 14, 30]) {
        const p = recorder()
        paintDrawing(p, d, 0, 0, k)
        const t = p.texts
        expect(t.length).toBeGreaterThan(8)
        for (let i = 0; i < t.length; i++)
          for (let j = i + 1; j < t.length; j++) {
            const a = t[i]
            const b = t[j]
            const overlap = a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5
            expect(overlap, `${d.title} at ${k} px/m: "${a.s}" and "${b.s}"`).toBe(false)
          }
      }
    }
  })
})

describe('sections and elevations in the PDF plan set', () => {
  const pdfText = (plan: Plan, withTerrain = true, paper: 'A3' | 'A4' = 'A3') =>
    new TextDecoder('latin1').decode(
      planSetPdf({
        plan,
        survey,
        siteArea: terrain.stats.area,
        earthworks: null,
        ground: finishedOf(plan),
        terrain: withTerrain ? terrain : undefined,
        up: 0,
        paper,
        title: 'Test',
        date: '9 November 2026',
      }),
    )

  it('adds a sheet for each section and two for the elevations, at 1:100 on A3', () => {
    const plan = addSection(sample, [-12, 7], [24, 7]).plan
    const pdf = pdfText(plan)
    // "Section A–A": the en dash is WinAnsi 226 (octal) in the PDF's text.
    expect(pdf).toContain('(Section A\\226A) Tj')
    expect(pdf).toContain('(Elevations: north and south) Tj')
    expect(pdf).toContain('(Elevations: east and west) Tj')
    expect(pdf).toContain('(Sheet 5 of 5) Tj')
    expect(pdf.match(/\(Scale 1:100 at A3\) Tj/g)?.length).toBeGreaterThanOrEqual(3)
    // The section lines show on the floor plan, lettered.
    expect(pdf.match(/\(A\) Tj/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to 1:200 for a section too long for the sheet at 1:100', () => {
    const plan = addSection(sample, [-14, 7], [34, 7]).plan
    const pdf = pdfText(plan)
    expect(pdf).toContain('(Section A\\226A) Tj')
    expect(pdf).toContain('(Scale 1:200 at A3) Tj')
  })

  it('cuts a section line longer than the floor plan sheet short at its edge, letters and all', () => {
    const calls: { name: string; args: unknown[] }[] = []
    const pg: PdfPage = new Proxy({} as PdfPage, {
      get: (_, name) =>
        function (this: unknown, ...args: unknown[]) {
          calls.push({ name: String(name), args })
          return pg
        },
    })
    const area = { x: 10, y: 20, w: 100, h: 60 }
    // 1:100 about the area's middle: the line runs 40 m, four times the area's width.
    const P = (p: Vec2): [number, number] => [60 + p[0] * 10, 50 + p[1] * 10]
    drawSectionMarks(pg, P, [{ id: 's', label: 'A', a: [-20, 0], b: [20, 0] }], area)
    const xs = calls.flatMap(c => (c.name === 'line' ? (c.args as [number, number][]).map(p => p[0]) : c.name === 'circle' ? [(c.args[0] as number) - 2.2, (c.args[0] as number) + 2.2] : []))
    expect(xs.length).toBeGreaterThan(0)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(area.x)
    expect(Math.max(...xs)).toBeLessThanOrEqual(area.x + area.w)
    expect(calls.filter(c => c.name === 'text' && c.args[2] === 'A')).toHaveLength(2)
    // A line wholly off the sheet draws nothing.
    calls.length = 0
    drawSectionMarks(pg, P, [{ id: 's', label: 'B', a: [-20, 9], b: [20, 9] }], area)
    expect(calls).toEqual([])
  })

  it('leaves them out without the natural ground to draw them from', () => {
    const pdf = pdfText(addSection(sample, [-12, 7], [24, 7]).plan, false)
    expect(pdf).not.toContain('Elevations')
    expect(pdf).toContain('(Sheet 2 of 2) Tj')
  })
})
