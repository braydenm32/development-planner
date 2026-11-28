// The model for SketchUp (.dae), BIM programs (.ifc) and plain mesh tools (.stl), on a made-up
// house on the sample block: each file is well formed, has the parts, and is the right size.

import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { floorRL, normalizePlan } from '../../plan/model'
import { buildModel, modelDae, modelIfc, modelStl } from '../model3d'
import { flatten, ifcGuid, ifcKind, ifcString, type Part } from '../modelFormats'

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
const plan = normalizePlan(garageFloor())
const level = plan.levels[0].name
const base = Math.floor(terrain.stats.minRL) - 1

let parts: Part[]
beforeAll(async () => {
  const m = await buildModel({ plan, survey, terrain, earth: null })
  parts = flatten(m.root)
  m.dispose()
})

const boxOf = (p: Part) => {
  const b = new THREE.Box3()
  for (const q of p.pieces) for (let k = 0; k < q.positions.length; k += 3) b.expandByPoint(new THREE.Vector3(q.positions[k], q.positions[k + 1], q.positions[k + 2]))
  return b
}

describe('flattening the model', () => {
  it('keeps each part, turned Z up with north +Y, and in metres', () => {
    const walls = parts.find(p => p.name === `${level} outside walls`)!
    expect(walls.group).toBe(level)
    const size = boxOf(walls).getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(10.1, 2)
    expect(size.y).toBeCloseTo(14.0, 2)
    expect(size.z).toBeCloseTo(2.7, 2)
    expect(boxOf(walls).min.z).toBeCloseTo(plan.placement.ffl - base, 2)
  })

  it('merges shared corners, so the block sides are far fewer corners than triangles × 3', () => {
    const sides = parts.find(p => p.name === 'Block sides')!
    const q = sides.pieces[0]
    expect(q.positions.length / 3).toBeLessThan(q.triangles.length / 2)
    for (const t of q.triangles) expect(t).toBeLessThan(q.positions.length / 3)
  })

  it('keeps the glass see-through and the walls solid', () => {
    expect(parts.find(p => p.name === `${level} window glass`)!.pieces[0].opacity).toBeLessThan(1)
    expect(parts.find(p => p.name === `${level} inside walls`)!.pieces[0].opacity).toBe(1)
  })
})

describe('the model for SketchUp (.dae)', () => {
  let text: string
  beforeAll(async () => {
    text = await modelDae({ plan, survey, terrain, earth: null })
  })

  it('is COLLADA 1.4.1 in metres, Z up, with every tag closed', () => {
    expect(text).toContain('<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">')
    expect(text).toContain('<unit name="meter" meter="1"/>')
    expect(text).toContain('<up_axis>Z_UP</up_axis>')
    // Tags open and close in order.
    const stack: string[] = []
    for (const [, close, name, self] of text.matchAll(/<(\/?)([A-Za-z_]+)[^>]*?(\/?)>/g)) {
      if (self) continue
      if (close) expect(stack.pop()).toBe(name)
      else stack.push(name)
    }
    expect(stack).toEqual([])
    expect(text).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/)
  })

  it('has a node per group with its parts, and every material it uses', () => {
    const groups = [...text.matchAll(/<node id="group\d+" name="([^"]+)">/g)].map(m => m[1])
    expect(groups).toEqual(['Ground', level])
    const names = [...text.matchAll(/<node id="part\d+-node" name="([^"]+)">/g)].map(m => m[1])
    expect(names).toEqual(expect.arrayContaining(['Ground surface', 'Block sides', `${level} outside walls`, `${level} window glass`]))
    const ids = new Set([...text.matchAll(/<material id="([^"]+)"/g)].map(m => m[1]))
    for (const [, m] of text.matchAll(/<triangles material="([^"]+)"/g)) expect(ids.has(m)).toBe(true)
  })

  it('has as many indices as its triangles say, all inside the corner list', () => {
    for (const [geo] of text.matchAll(/<geometry [\s\S]*?<\/geometry>/g)) {
      const corners = Number(geo.match(/<accessor [^>]*count="(\d+)"/)![1])
      expect(Number(geo.match(/<float_array [^>]*count="(\d+)"/)![1])).toBe(corners * 3)
      for (const [, count, p] of geo.matchAll(/<triangles material="[^"]+" count="(\d+)">.*?<p>([^<]*)<\/p>/g)) {
        const idx = p.split(' ').map(Number)
        expect(idx.length).toBe(Number(count) * 3)
        expect(Math.max(...idx)).toBeLessThan(corners)
      }
    }
  })
})

describe('the model as IFC', () => {
  let text: string
  beforeAll(async () => {
    text = await modelIfc({ plan, survey, terrain, earth: null, fileName: 'my-house.ifc', projectName: 'My house' })
  })

  it('is an IFC 4 STEP file with every reference defined', () => {
    expect(text.startsWith('ISO-10303-21;\nHEADER;')).toBe(true)
    expect(text).toContain("FILE_SCHEMA(('IFC4'));")
    expect(text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true)
    const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map(m => m[1]))
    const body = text.slice(text.indexOf('DATA;'))
    for (const [, ref] of body.matchAll(/[(,]#(\d+)/g)) expect(defined.has(ref)).toBe(true)
    // Every GlobalId is 22 characters and unique.
    const ids = [...text.matchAll(/^#\d+=IFC\w+\('([0-9A-Za-z_$]{22})'/gm)].map(m => m[1])
    expect(ids.length).toBeGreaterThan(10)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a storey for the level at its floor, and the parts as their own kinds', () => {
    const storey = text.match(/IFCBUILDINGSTOREY\('[^']+',\$,'([^']+)',\$,\$,#\d+,\$,\$,\.ELEMENT\.,([-\d.]+)\)/)!
    expect(storey[1]).toBe(level)
    expect(Number(storey[2])).toBeCloseTo(floorRL(plan) - base, 3)
    expect(text).toMatch(new RegExp(`IFCWALL\\('[^']+',\\$,'${level} outside walls'`))
    expect(text).toMatch(/IFCWINDOW\('[^']+',\$,'[^']+ window glass',\$,\$,#\d+,#\d+,\$,\$,\$,\.NOTDEFINED\.,\$,\$\)/)
    expect(text).toMatch(/IFCDOOR\(/)
    expect(text).toMatch(/IFCSLAB\('[^']+',\$,'[^']+ floor structure',\$,\$,#\d+,#\d+,\$,\.FLOOR\.\)/)
    expect(text).toMatch(/IFCGEOGRAPHICELEMENT\('[^']+',\$,'Ground surface',.*\.TERRAIN\.\)/)
    expect(text).toMatch(/IFCSURFACESTYLESHADING\(#\d+,0\.45\)/) // the glass, 55 % solid
  })

  it('names kinds from part names', () => {
    expect(ifcKind({ group: 'First floor', name: 'First floor roof' }).entity).toBe('IFCROOF')
    expect(ifcKind({ group: 'First floor', name: 'First floor stairs' }).entity).toBe('IFCSTAIR')
    expect(ifcKind({ group: 'First floor', name: 'First floor furniture' }).entity).toBe('IFCFURNITURE')
    expect(ifcKind({ group: 'Ground', name: 'Block sides' }).entity).toBe('IFCBUILDINGELEMENTPROXY')
  })

  it('writes strings and ids the way STEP wants', () => {
    expect(ifcString("Brayden's house")).toBe("'Brayden''s house'")
    expect(ifcString('Contour & Gable – plan')).toBe("'Contour & Gable \\X2\\2013\\X0\\ plan'")
    expect(ifcGuid()).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)
  })
})

describe('the whole model as one STL', () => {
  it('is binary STL in millimetres, Z up, as big as the block', async () => {
    const bytes = await modelStl({ plan, survey, terrain, earth: null })
    const count = new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true)
    expect(bytes.length).toBe(84 + count * 50)
    let expected = 0
    for (const p of parts) for (const q of p.pieces) expected += q.triangles.length / 3
    expect(count).toBe(expected)
    const geo = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    geo.computeBoundingBox()
    const ground = boxOf(parts.find(p => p.name === 'Ground surface')!)
    expect(geo.boundingBox!.min.z).toBeCloseTo(0, 0)
    expect(geo.boundingBox!.max.x - geo.boundingBox!.min.x).toBeGreaterThanOrEqual((ground.max.x - ground.min.x) * 1000 - 1)
  })
})
