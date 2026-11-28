// Press, drag and release to draw (build phase): which tools draw by a drag, when a press is a
// drag, and when it carries on the run under way.

import { describe, expect, it } from 'vitest'
import { continuesRun, DRAW_SLOP, dragDraws, pastSlop } from '../dragDraw'

const scene = { tool: 'select' as const, wallMode: 'line' as const, sketchMode: 'line' as const, sectionLine: false }

describe('drawing with a press, a drag and a release', () => {
  it('draws with the tools that go point to point, and pans with the rest', () => {
    for (const tool of ['wall', 'retaining', 'measure', 'stair', 'sketch'] as const) expect(dragDraws({ ...scene, tool }), tool).toBe(true)
    for (const tool of ['select', 'area', 'roof', 'door', 'room', 'furniture', 'note', 'move'] as const) expect(dragDraws({ ...scene, tool }), tool).toBe(false)
    // A rectangle room drags its own way, and an arc takes three points.
    expect(dragDraws({ ...scene, tool: 'wall', wallMode: 'rect' })).toBe(false)
    expect(dragDraws({ ...scene, tool: 'sketch', sketchMode: 'arc' })).toBe(false)
    expect(dragDraws({ ...scene, tool: 'sketch', sketchMode: 'circle' })).toBe(true)
    // A section line draws by a drag whichever tool is out.
    expect(dragDraws({ ...scene, sectionLine: true })).toBe(true)
  })

  it('is a click until it moves past the slop', () => {
    expect(pastSlop({ x: 10, y: 10 }, { x: 10 + DRAW_SLOP, y: 10 })).toBe(false)
    expect(pastSlop({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(true)
    // A finger's slop is larger.
    expect(pastSlop({ x: 10, y: 10 }, { x: 18, y: 10 }, 10)).toBe(false)
  })

  it('carries on the run from its last point, and starts afresh away from it', () => {
    expect(continuesRun({ x: 100, y: 100 }, { x: 106, y: 104 })).toBe(true)
    expect(continuesRun({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(false)
    expect(continuesRun({ x: 100, y: 100 }, null)).toBe(false)
  })
})
