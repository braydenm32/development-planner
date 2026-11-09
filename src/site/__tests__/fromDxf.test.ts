import { describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, featureRoleFromName, guessRoles } from '../../lib/survey'
import { lwpolyline, point, text } from '../../lib/__tests__/fixtures'
import { cleanText, featuresFromDxf, parseTreeText } from '../fromDxf'

// A synthetic block with tree symbols, an easement and a fence. Nothing here is from a real survey.
const pairs = (...items: (string | number)[]) => items.map(String).join('\n')

function insert(layer: string, block: string, [x, y]: [number, number], scale: number, attribs: Record<string, string>): string {
  const tags = Object.entries(attribs)
  return [
    pairs(0, 'INSERT', 8, layer, 2, block, 10, x, 20, y, 30, 0, 41, scale, 42, scale, ...(tags.length ? [66, 1] : [])),
    ...tags.map(([tag, value]) => pairs(0, 'ATTRIB', 8, layer, 10, x, 20, y, 30, 0, 40, 0.25, 1, value, 2, tag, 70, 0)),
    ...(tags.length ? [pairs(0, 'SEQEND', 8, layer)] : []),
  ].join('\n')
}

const circle = (layer: string, [x, y]: [number, number], r: number) => pairs(0, 'CIRCLE', 8, layer, 10, x, 20, y, 30, 0, 40, r)

function drawing(entities: string[]): string {
  return [
    pairs(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC'),
    // The tree block: a circle of radius 0.5 round its base point.
    pairs(0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 8, '0', 2, 'TREE_SYM', 70, 2, 10, 0, 20, 0, 30, 0),
    circle('0', [0, 0], 0.5),
    pairs(0, 'ENDBLK', 8, '0', 0, 'ENDSEC'),
    pairs(0, 'SECTION', 2, 'ENTITIES'),
    ...entities,
    pairs(0, 'ENDSEC', 0, 'EOF'),
  ].join('\n')
}

const survey = drawing([
  lwpolyline('LOT_BOUNDARY', [
    [100, 100],
    [120, 100],
    [120, 130],
    [100, 130],
    [100, 100],
  ]),
  point('SPOTS', [110, 110, 50]),
  // A tree block scaled to its 6 m canopy, with its number and sizes as attributes.
  insert('TREES', 'TREE_SYM', [104, 126], 6, { TREE_NO: '3', TRUNK: '300', HEIGHT: '8' }),
  // One whose label attribute says it all.
  insert('TREES', 'TREE_SYM', [116, 126], 1, { LABEL: 'T4 Ø0.45 H12 S7' }),
  // A tree drawn as trunk and canopy circles, labelled on a text layer.
  circle('TREES', [110, 104], 0.2),
  circle('TREES', [110, 104], 3),
  text('NOTES', [111, 105, 0], 'T5 H10'),
  // A 2 m drainage easement along the east side.
  lwpolyline(
    'EASEMENT_DRAINAGE',
    [
      [118, 100],
      [120, 100],
      [120, 130],
      [118, 130],
    ],
    0,
    true,
  ),
  text('EASEMENT_DRAINAGE', [119, 115, 0], 'EASEMENT FOR DRAINAGE 2 WIDE'),
  // A fence along the south.
  lwpolyline('FENCE_COLORBOND', [
    [100, 100.2],
    [118, 100.2],
  ]),
])

describe('site features from a DXF', () => {
  const doc = parseDxf(survey)
  const roles = guessRoles(analyzeLayers(doc))

  it('reads block inserts with their attributes and reach', () => {
    const inserts = doc.entities.filter(e => e.kind === 'insert')
    expect(inserts).toHaveLength(2)
    const first = inserts[0]
    expect(first.kind === 'insert' && first.attribs).toEqual({ TREE_NO: '3', TRUNK: '300', HEIGHT: '8' })
    expect(first.kind === 'insert' && first.radius).toBeCloseTo(3)
    expect(doc.entities.filter(e => e.kind === 'circle')).toHaveLength(2)
  })

  it('guesses feature layers from their names and keeps the survey layers as they were', () => {
    expect(roles.TREES).toBe('tree')
    expect(roles.EASEMENT_DRAINAGE).toBe('easement')
    expect(roles.FENCE_COLORBOND).toBe('fence')
    expect(roles.LOT_BOUNDARY).toBe('boundary')
    expect(roles.SPOTS).toBe('levels')
    expect(roles.NOTES).toBe('ignore')
    expect(featureRoleFromName('SW_PIT')).toBe('service-stormwater')
    expect(featureRoleFromName('SWALE_LEVELS')).toBeNull()
    expect(featureRoleFromName('NBN')).toBe('service-telecom')
    expect(featureRoleFromName('K&G')).toBe('kerb')
    expect(featureRoleFromName('DW_CONC')).toBe('paving')
  })

  const features = featuresFromDxf(doc, roles)
  const trees = features.filter(f => f.type === 'tree')

  it('makes trees from blocks, attributes, circles and nearby labels', () => {
    expect(trees).toHaveLength(3)
    const t3 = trees.find(t => t.label === 'T3')!
    expect(t3.geom).toEqual({ kind: 'point', at: [104, 126] })
    expect(t3.trunk).toBeCloseTo(0.3)
    expect(t3.height).toBe(8)
    expect(t3.canopy).toBe(6)
    const t4 = trees.find(t => t.label === 'T4')!
    expect(t4.trunk).toBeCloseTo(0.45)
    expect(t4.height).toBe(12)
    expect(t4.canopy).toBe(7)
    const t5 = trees.find(t => t.label === 'T5')!
    expect(t5.trunk).toBeCloseTo(0.4)
    expect(t5.canopy).toBe(6)
    expect(t5.height).toBe(10)
  })

  it('makes the easement an area with its width and purpose, and the fence a line', () => {
    const e = features.find(f => f.type === 'easement')!
    expect(e.geom.kind).toBe('area')
    expect(e.width).toBe(2)
    expect(e.purpose).toMatch(/drainage/i)
    const fence = features.find(f => f.type === 'fence')!
    expect(fence.geom).toEqual({
      kind: 'line',
      pts: [
        [100, 100.2],
        [118, 100.2],
      ],
    })
    expect(fence.height).toBe(1.8)
  })

  it('gives the same ids for the same file, so edits stay with their features', () => {
    expect(featuresFromDxf(parseDxf(survey), roles).map(f => f.id)).toEqual(features.map(f => f.id))
    expect(featuresFromDxf(doc, roles, 'dxf2')[0].id.startsWith('dxf2:')).toBe(true)
  })

  it('reads nothing when no layer is set to a feature', () => {
    const none = Object.fromEntries(Object.keys(roles).map(k => [k, 'ignore' as const]))
    expect(featuresFromDxf(doc, none)).toEqual([])
  })
})

describe('tree labels', () => {
  it('reads the usual ways of writing a tree', () => {
    expect(parseTreeText('T3 Ø0.3 H8 S6')).toEqual({ ref: 'T3', trunk: 0.3, height: 8, canopy: 6 })
    expect(parseTreeText('TREE 12 DIA 450mm HT 9 SPREAD 5')).toEqual({ ref: 'T12', trunk: 0.45, height: 9, canopy: 5 })
    expect(parseTreeText('Ø0.6 H14')).toEqual({ trunk: 0.6, height: 14 })
  })

  it('clears MTEXT formatting and diameter codes', () => {
    expect(cleanText('{\\fArial|b0;T7 %%c0.25\\PH6 S4}')).toBe('T7 Ø0.25 H6 S4')
  })
})
