import { beforeEach, describe, expect, it } from 'vitest'
import { lwpolyline, planeSurvey } from '../../lib/__tests__/fixtures'
import { emptyPlan } from '../../plan/model'
import { parseProjectFile, projectFileText } from '../../share/project'
import { normalizeFeature } from '../model'
import { allFeatures, emptySiteData, normalizeProjectSite, normalizeSiteData, removeFeature, updateFeature, useSiteStore, type Overlay } from '../store'

const pairs = (...items: (string | number)[]) => items.map(String).join('\n')

// Two fences on their own layer, in a synthetic DXF.
const dxfText = [
  pairs(0, 'SECTION', 2, 'ENTITIES'),
  lwpolyline('FENCE', [
    [0, 0],
    [10, 0],
  ]),
  lwpolyline('FENCE', [
    [0, 5],
    [10, 5],
  ]),
  pairs(0, 'ENDSEC', 0, 'EOF'),
].join('\n')
const roles = { FENCE: 'fence' as const }

const overlay = (extra: Partial<Overlay> = {}): Overlay => ({
  id: 'o1',
  name: 'drawing.pdf',
  kind: 'pdf',
  page: 1,
  width: 1190,
  height: 842,
  pxPerUnit: 2,
  scale: 200,
  transform: [0.07, 0, 0, 0.07, 1000, 2000],
  aligned: true,
  opacity: 0.6,
  visible: true,
  locked: false,
  include: false,
  vector: true,
  added: [],
  ...extra,
})

describe('a saved feature', () => {
  it('fills in the sizes its type needs', () => {
    const t = normalizeFeature({ id: 'a', type: 'tree', geom: { kind: 'point', at: [1, 2] } })!
    expect(t).toEqual({ id: 'a', type: 'tree', source: 'trace', geom: { kind: 'point', at: [1, 2] }, trunk: 0.3, canopy: 6, height: 8, remove: false })
    expect(normalizeFeature({ id: 'f', type: 'fence', source: 'pdf', geom: { kind: 'line', pts: [[0, 0], [3, 4]] } })!.height).toBe(1.8)
    expect(normalizeFeature({ id: 's', type: 'service', geom: { kind: 'line', pts: [[0, 0], [3, 4]] } })!.service).toBe('sewer')
  })

  it('keeps what is sound and drops what is not', () => {
    // An unknown type is kept as "other"; junk fields and bad values go.
    const f = normalizeFeature({ id: 'x', type: 'pond', label: 'Pond', width: 'wide', service: 'lava', geom: { kind: 'area', pts: [[0, 0], [1, 0], [null, 1], ['a', 2]] } })
    expect(f).toBeNull() // only two good corners left
    const g = normalizeFeature({ id: 'x', type: 'pond', label: 'Pond', width: 'wide', geom: { kind: 'area', pts: [[0, 0], [1, 0], [1, 1]] } })!
    expect(g.type).toBe('other')
    expect(g.label).toBe('Pond')
    expect('width' in g).toBe(false)
    expect(normalizeFeature({ type: 'tree', geom: { kind: 'point', at: [0, 0] } })).toBeNull()
    expect(normalizeFeature({ id: 'p', type: 'tree', geom: { kind: 'point', at: [NaN, 0] } })).toBeNull()
  })
})

describe('saved site data', () => {
  it('comes back empty from nothing, or from junk', () => {
    expect(normalizeSiteData(undefined)).toEqual(emptySiteData())
    expect(normalizeSiteData('site')).toEqual(emptySiteData())
  })

  it('keeps sound features, drawings and hidden types', () => {
    const d = normalizeSiteData({
      version: 1,
      features: [{ id: 'a', type: 'tree', geom: { kind: 'point', at: [1, 2] } }, { id: 'b' }, null],
      edits: { 'dxf:1': { label: 'Old fence' } },
      overlays: [overlay(), { ...overlay({ id: 'bad' }), transform: [1, 0, 0] }, { ...overlay({ id: 'o2' }), added: undefined, opacity: undefined }],
      hidden: ['tree', 'volcano'],
      extraDxf: { fileName: 'more.dxf' },
    })
    expect(d.features.map(f => f.id)).toEqual(['a'])
    expect(d.edits).toEqual({ 'dxf:1': { label: 'Old fence' } })
    expect(d.overlays.map(o => o.id)).toEqual(['o1', 'o2'])
    expect(d.overlays[1].added).toEqual([])
    expect(d.overlays[1].opacity).toBe(0.6)
    expect(d.hidden).toEqual(['tree'])
    expect(d.extraDxf).toEqual({ fileName: 'more.dxf', roles: {} })
  })
})

describe('site features in the project file', () => {
  const survey = { fileName: 'plane.dxf', dxfText: planeSurvey(), roles: {} }
  const plan = emptyPlan({ e: 1006, n: 1006, rotation: 0, ffl: 84 })
  const data = normalizeSiteData({
    features: [{ id: 'a', type: 'easement', label: '(A)', width: 2, geom: { kind: 'area', pts: [[0, 0], [2, 0], [2, 20], [0, 20]] } }],
    overlays: [overlay({ include: true })],
    extraDxf: { fileName: 'more.dxf', roles },
  })

  it('goes there and back with the plan', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const back = parseProjectFile(projectFileText(survey, plan, { data, extraDxfText: dxfText, drawings: { o1: { image: png } } }))
    expect(back.site!.data).toEqual(data)
    expect(back.site!.extraDxfText).toBe(dxfText)
    expect(back.site!.drawings).toEqual({ o1: { image: png, vector: undefined } })
  })

  it('opens files from before site features with none', () => {
    const back = parseProjectFile(projectFileText(survey, plan))
    expect(back.site).toBeNull()
    expect(JSON.parse(projectFileText(survey, plan)).site).toBeUndefined()
  })

  it('turns away pictures that are not pictures, and a second DXF with no layers set', () => {
    const site = normalizeProjectSite({
      data: { ...data, extraDxf: null },
      extraDxfText: dxfText,
      drawings: { o1: { image: 'javascript:alert(1)' }, o2: { image: 'data:text/html;base64,PGI+' } },
    })!
    expect(site.drawings).toBeUndefined()
    expect(site.extraDxfText).toBeUndefined()
    expect(normalizeProjectSite({ drawings: {} })).toBeNull()
  })
})

describe('features read from a DXF', () => {
  beforeEach(() => {
    useSiteStore.setState({ data: emptySiteData(), past: [], future: [], main: { dxfText, roles }, extraDxfText: null })
  })
  const state = () => useSiteStore.getState()

  it('take edits by id, and hide rather than go when removed', () => {
    const fences = allFeatures(state())
    expect(fences).toHaveLength(2)
    expect(fences.every(f => f.type === 'fence' && f.source === 'dxf')).toBe(true)
    const [first, second] = fences
    updateFeature(first.id, { label: 'Paling fence', height: 1.5 })
    expect(state().data.edits[first.id]).toEqual({ label: 'Paling fence', height: 1.5 })
    const edited = allFeatures(state()).find(f => f.id === first.id)!
    expect(edited.label).toBe('Paling fence')
    expect(edited.height).toBe(1.5)
    expect(edited.geom).toEqual(first.geom)

    removeFeature(second.id)
    expect(allFeatures(state()).map(f => f.id)).toEqual([first.id])
    // Undo brings it back.
    state().undo()
    expect(allFeatures(state())).toHaveLength(2)
  })

  it('stay apart from traced ones, which are changed and removed in place', () => {
    useSiteStore.setState({ data: normalizeSiteData({ features: [{ id: 't', type: 'tree', geom: { kind: 'point', at: [3, 3] } }] }) })
    updateFeature('t', { trunk: 0.5 })
    expect(state().data.features[0].trunk).toBe(0.5)
    expect(state().data.edits).toEqual({})
    removeFeature('t')
    expect(state().data.features).toEqual([])
    expect(allFeatures(state())).toHaveLength(2)
  })
})
