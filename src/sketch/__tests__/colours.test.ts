import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../../lib/geom'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { copySelection, pasteClip } from '../../plan/editing'
import { normalizePlan, SKETCH_COLOURS, type Plan } from '../../plan/model'
import { colourOf, coloursUsed, sketchLegend, SKETCH_PAINT } from '../colours'
import { addSketch, newSketch, setSketchColour, setSketchName, sketchOf } from '../ops'

const L = 'level_ground'
const base = (): Plan => normalizePlan(garageFloor())
const pts: Vec2[] = [[0, 0], [4, 0]]

describe('sketch line colours', () => {
  it('draws new lines in the colour picked, leaves blue unsaid, and never colours a measurement', () => {
    expect(newSketch(L, 'line', pts, 'red').colour).toBe('red')
    expect('colour' in newSketch(L, 'line', pts, 'blue')).toBe(false)
    expect('colour' in newSketch(L, 'measure', pts, 'red')).toBe(false)
    expect(colourOf(newSketch(L, 'circle', pts))).toBe('blue')
  })

  it('recolours the chosen lines in one change, back to blue too, and leaves measurements grey', () => {
    const a = newSketch(L, 'line', pts)
    const b = newSketch(L, 'arc', [[0, 0], [1, 1], [2, 0]], 'green')
    const m = newSketch(L, 'measure', pts)
    let plan = [a, b, m].reduce(addSketch, base())
    plan = setSketchColour(plan, [a.id, m.id], 'purple')
    expect(sketchOf(plan).map(s => s.colour)).toEqual(['purple', 'green', undefined])
    plan = setSketchColour(plan, [a.id, b.id], 'blue')
    expect(sketchOf(plan).every(s => !('colour' in s))).toBe(true)
    // Nothing to change: the same plan, so no empty undo step.
    expect(setSketchColour(plan, [a.id], 'blue')).toBe(plan)
  })

  it('keeps colours and names through saving and loading, and drops ones that are not real', () => {
    const plan = addSketch(addSketch(base(), newSketch(L, 'line', pts, 'amber')), newSketch(L, 'curve', [[0, 0], [1, 2], [3, 1]], 'red'))
    const named = setSketchName(setSketchName(plan, 'amber', '  Old fence  '), 'red', 'Tree reach')
    const loaded = normalizePlan(JSON.parse(JSON.stringify(named)))
    expect(sketchOf(loaded).map(s => s.colour)).toEqual(['amber', 'red'])
    expect(loaded.sketchNames).toEqual({ amber: 'Old fence', red: 'Tree reach' })

    const odd = normalizePlan({
      ...base(),
      sketch: [
        { id: 's1', level: L, kind: 'line', pts, colour: 'pink' },
        { id: 's2', level: L, kind: 'measure', pts, colour: 'red' },
      ],
      sketchNames: { red: 7, green: '', teal: 'x', blue: 'Setback' },
    } as unknown as Plan)
    expect(sketchOf(odd).map(s => 'colour' in s)).toEqual([false, false])
    expect(odd.sketchNames).toEqual({ blue: 'Setback' })
  })

  it('takes a name away when it is cleared', () => {
    const plan = setSketchName(base(), 'green', 'Drain')
    expect(setSketchName(plan, 'green', ' ').sketchNames).toBeUndefined()
    expect(setSketchName(plan, 'green', 'Drain')).toBe(plan)
  })

  it('lists what each colour marks: the named colours in use, or the colours when several and none named', () => {
    let plan = addSketch(base(), newSketch(L, 'line', pts))
    expect(sketchLegend(plan)).toEqual([])
    plan = addSketch(plan, newSketch(L, 'line', pts, 'red'))
    expect(coloursUsed(plan)).toEqual(['blue', 'red'])
    expect(sketchLegend(plan).map(l => l.text)).toEqual(['Blue', 'Red'])
    // A name for a colour no line uses stays out of the list.
    plan = setSketchName(setSketchName(plan, 'red', 'Old fence'), 'purple', 'Unused')
    expect(sketchLegend(plan)).toEqual([{ colour: 'red', text: 'Old fence' }])
  })

  it('copies a line with its colour', () => {
    const a = newSketch(L, 'line', pts, 'green')
    const plan = addSketch(base(), a)
    const clip = copySelection(plan, [{ type: 'sketch', id: a.id }])
    const pasted = pasteClip(plan, clip!, L, [1, 1])
    expect(sketchOf(pasted.plan).map(s => s.colour)).toEqual(['green', 'green'])
  })

  it('has a screen and paper colour for every colour', () => {
    for (const c of SKETCH_COLOURS) {
      expect(SKETCH_PAINT[c].hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(SKETCH_PAINT[c].rgb.every(n => n >= 0 && n <= 1)).toBe(true)
    }
  })
})
