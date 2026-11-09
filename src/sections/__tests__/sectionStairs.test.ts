// Stairs in sections, and roofs at their own eaves RL, on the made-up sample block
// (samples/sample-block.dxf) with a plain made-up box house.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import type { Vec2 } from '../../lib/geom'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { floorRL, normalizePlan, type Plan, type Stair, type Wall } from '../../plan/model'
import { levelOutlines } from '../../plan/roof'
import { textWidth } from '../../share/pdfWriter'
import type { Pt } from '../common'
import { paintDrawing, type Painter } from '../paint'
import { sectionDrawing, sectionStairs, stepOutlines } from '../section'

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const L0 = 'level_ground'
const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, level: L0, a, b, thickness: 0.3, kind: 'external' })

/** A plain 10 m × 8 m box with a straight stair climbing 3 m along +x from (2, 4), and a hip roof. */
function house(): Plan {
  const walls = [wall('s', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('n', [10, 8], [0, 8]), wall('w', [0, 8], [0, 0])]
  const stair: Stair = { id: 'st', level: L0, at: [2, 4], angle: 0, width: 1, base: 0, rise: 3, toLevel: null, going: 0.25, shape: 'straight', turn: 'left' }
  return normalizePlan({
    version: 1,
    levels: [{ id: L0, name: 'Ground floor', elevation: 0, height: 2.7 }],
    walls,
    openings: [],
    rooms: [],
    areas: [],
    roofs: [{ id: 'roof', level: L0, pts: levelOutlines(walls)[0], type: 'hip', pitch: 22.5, overhang: 0.45, gables: [false, false, false, false], lowEdge: 0 }],
    stairs: [stair],
    furniture: [],
    placement: { e: 5006, n: 8004, rotation: 0, ffl: 45.5 },
  })
}

describe('stairs in sections', () => {
  it('draws the steps seen side on as one stepped outline', () => {
    const boxes = [
      { s0: 0, s1: 1, z0: 0, z1: 1 },
      { s0: 1, s1: 2, z0: 0, z1: 2 },
      { s0: 3, s1: 4, z0: 0, z1: 1 },
    ]
    expect(stepOutlines(boxes, 0)).toEqual([
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 0],
      ],
      [
        [3, 0],
        [3, 1],
        [4, 1],
        [4, 0],
      ],
    ])
  })

  it('cuts a flight the line runs along: every tread and riser, with its risers counted', () => {
    const p = house()
    const [st] = sectionStairs(p, [-1, 4], [11, 4])
    expect(st.cut).toBe(true)
    expect(st.label).toBe('16 risers × 188 mm')
    const pts = st.outlines.flat()
    const bottom = floorRL(p, L0)
    expect(Math.min(...pts.map(q => q[1]))).toBeCloseTo(bottom, 9)
    // 15 treads, the top one 187.5 mm under the 3 m climb, from 3 m to 6.75 m along the line.
    expect(Math.max(...pts.map(q => q[1]))).toBeCloseTo(bottom + 3 - 0.1875, 9)
    expect(Math.min(...pts.map(q => q[0]))).toBeCloseTo(3, 9)
    expect(Math.max(...pts.map(q => q[0]))).toBeCloseTo(6.75, 9)
    // Up the steps: one riser and one tread each.
    const outline = st.outlines[0]
    expect(outline).toHaveLength(2 + 15 * 2)
  })

  it('draws a stair beyond the cut faintly, and none behind it', () => {
    const p = house()
    // Looking north (+y) from y = 2: the stair at y 3.5 to 4.5 is beyond.
    const beyond = sectionStairs(p, [-1, 2], [11, 2])
    expect(beyond).toHaveLength(1)
    expect(beyond[0].cut).toBe(false)
    expect(beyond[0].label).toBeUndefined()
    // From y = 6 looking north it's behind; turned round, looking south, it's beyond again.
    expect(sectionStairs(p, [-1, 6], [11, 6])).toEqual([])
    expect(sectionStairs(p, [11, 6], [-1, 6])).toHaveLength(1)
  })

  it('is part of the section drawing, painted with its label', () => {
    const d = sectionDrawing({ id: 'A', label: 'A', a: [-1, 4], b: [11, 4] }, { plan: house(), survey, terrain })
    expect(d.stairs).toHaveLength(1)
    const shapes: string[] = []
    const texts: string[] = []
    const painter: Painter = {
      size: { title: 14, label: 11, small: 10 },
      unit: 1,
      shape: (_pts: Pt[], style) => shapes.push(style),
      line: () => {},
      text: (_x, _y, s) => texts.push(s),
      measure: (s, size) => textWidth(s, size, 'regular'),
    }
    paintDrawing(painter, d, 0, 0, 60)
    expect(shapes).toContain('stair-cut')
    expect(texts).toContain('16 risers × 188 mm')
  })

  it('puts a roof at its own eaves RL', () => {
    const p = house()
    const raised = { ...p, roofs: p.roofs.map(r => ({ ...r, eaves: { rl: 50 } })) }
    const line = { id: 'A', label: 'A', a: [-1, 4] as Vec2, b: [11, 4] as Vec2 }
    const low = Math.min(...sectionDrawing(line, { plan: raised, survey, terrain }).roofs.flat().map(q => q[1]))
    expect(low).toBeCloseTo(50, 9)
    const own = Math.min(...sectionDrawing(line, { plan: p, survey, terrain }).roofs.flat().map(q => q[1]))
    expect(own).toBeCloseTo(floorRL(p) + 2.7, 9)
  })
})
