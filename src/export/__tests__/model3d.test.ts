// The whole-model export (CB-26, LF-32) on a made-up house on the sample block: the .glb is a real
// glTF binary with named groups and meshes in metres, and the OBJ has the same parts as objects.

import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseDxf } from '../../lib/dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../../lib/survey'
import { buildTerrain } from '../../lib/terrain'
import { garageFloor } from '../../plan/__tests__/fixtures'
import { normalizePlan } from '../../plan/model'
import { buildModel, modelGlb, modelObj, modelParts } from '../model3d'
import { newFurniture } from '../../plan/furniture'
import { levelsOf } from '../../plan/groundPieces'
import { earthFrom, earthInputs } from '../../plan/useEarthworks'
import { editWallFinishes, withFinishes } from '../../finishes/model'

// GLTFExporter reads its Blob with FileReader, which the browser has and node doesn't.
beforeAll(() => {
  if (typeof globalThis.FileReader !== 'undefined') return
  class Reader {
    result: ArrayBuffer | null = null
    onloadend: (() => void) | null = null
    readAsArrayBuffer(b: Blob) {
      void b.arrayBuffer().then(r => {
        this.result = r
        this.onloadend?.()
      })
    }
  }
  ;(globalThis as { FileReader?: unknown }).FileReader = Reader
})

const doc = parseDxf(readFileSync(new URL('../../../samples/sample-block.dxf', import.meta.url), 'utf8'))
const survey = buildSurvey(doc, guessRoles(analyzeLayers(doc)))
const terrain = buildTerrain(survey)
// The garage floor with a box of furniture, so the furniture switch has something to leave out.
const base = garageFloor()
const plan = normalizePlan({
  ...base,
  furniture: [{ id: 'f1', level: base.levels[0].id, kind: 'bed-queen', at: [3, 7], rotation: 0, width: 1.5, depth: 2, height: 0.5 }],
})
const level = plan.levels[0].name

const parseGlb = (bytes: Uint8Array) => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const jsonLength = dv.getUint32(12, true)
  return {
    magic: new TextDecoder().decode(bytes.slice(0, 4)),
    version: dv.getUint32(4, true),
    length: dv.getUint32(8, true),
    chunkType: dv.getUint32(16, true),
    json: JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) as {
      nodes: { name?: string; mesh?: number }[]
      meshes: unknown[]
      materials: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] }; alphaMode?: string }[]
      scenes: { extras?: { units?: string; origin?: { rl: number } } }[]
    },
  }
}

describe('the 3D model as glTF binary', () => {
  let bytes: Uint8Array
  let loaded: THREE.Object3D
  beforeAll(async () => {
    bytes = await modelGlb({ plan, survey, terrain, earth: null })
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    loaded = (await new GLTFLoader().parseAsync(buf, '')).scene
    loaded.updateMatrixWorld(true)
  })

  it('is a glTF 2 binary with its JSON chunk first', () => {
    const g = parseGlb(bytes)
    expect(g.magic).toBe('glTF')
    expect(g.version).toBe(2)
    expect(g.length).toBe(bytes.length)
    expect(g.chunkType).toBe(0x4e4f534a) // "JSON"
  })

  it('has the ground, the level and its parts as named nodes, and says its units and origin', () => {
    const { json } = parseGlb(bytes)
    const names = json.nodes.map(n => n.name)
    expect(names).toEqual(expect.arrayContaining(['Ground', 'Ground surface', 'Block sides', level, `${level} outside walls`, `${level} inside walls`, `${level} floor structure`, `${level} window glass`, `${level} concrete slabs`, `${level} furniture`]))
    // One mesh per named part: nothing from the screen (lines, labels, lights, survey marks).
    expect(json.meshes.length).toBe(json.nodes.filter(n => n.mesh !== undefined).length)
    expect(names.filter(n => n !== 'Contour & Gable model').some(n => /contour|boundary|light|camera|marker/i.test(n ?? ''))).toBe(false)
    expect(json.scenes[0].extras?.units).toBe('metres')
    expect(json.scenes[0].extras?.origin?.rl).toBe(Math.floor(terrain.stats.minRL) - 1)
  })

  it('carries each part’s colour, and the glass as see-through', () => {
    const { json } = parseGlb(bytes)
    const walls = json.materials.find(m => m.name?.startsWith('Ground_floor_outside_walls'))!
    // #f1ede6 in linear light.
    const c = new THREE.Color('#f1ede6')
    expect(walls.pbrMetallicRoughness?.baseColorFactor?.slice(0, 3).map(v => +v.toFixed(3))).toEqual([c.r, c.g, c.b].map(v => +v.toFixed(3)))
    expect(json.materials.find(m => m.name?.startsWith('Ground_floor_window_glass'))?.alphaMode).toBe('BLEND')
  })

  it('is in real metres: the outside walls are as wide and deep as the plan, and as tall as the level', () => {
    const walls = loaded.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(`${level} outside walls`))!
    const box = new THREE.Box3().setFromObject(walls)
    const size = box.getSize(new THREE.Vector3())
    // The walls' outer faces: 0 to 10.1 m across, 0 to 14 m deep (garageFloor, rotation 0: x is east).
    expect(size.x).toBeCloseTo(10.1, 2)
    expect(size.z).toBeCloseTo(14.0, 2)
    expect(size.y).toBeCloseTo(2.7, 2)
    // Y is up from the block's base: the floor sits at its FFL above it.
    expect(box.min.y).toBeCloseTo(plan.placement.ffl - (Math.floor(terrain.stats.minRL) - 1), 2)
  })

  it('sits round the origin, not kilometres off', () => {
    const box = new THREE.Box3().setFromObject(loaded.getObjectByName('Ground')!)
    const c = box.getCenter(new THREE.Vector3())
    expect(Math.abs(c.x)).toBeLessThan(1)
    expect(Math.abs(c.z)).toBeLessThan(1)
    expect(box.min.y).toBeCloseTo(0, 3)
  })

  it('leaves out the ground and the furniture when asked', async () => {
    const g = parseGlb(await modelGlb({ plan, survey, terrain, earth: null, ground: false, furniture: false }))
    const names = g.json.nodes.map(n => n.name)
    expect(names).not.toContain('Ground')
    expect(names).not.toContain(`${level} furniture`)
    expect(names).toContain(`${level} outside walls`)
  })
})

describe('the 3D model as OBJ', () => {
  it('has each part as an object with its material, and as many vertices as the meshes', async () => {
    const f = await modelObj({ plan, survey, terrain, earth: null }, 'my-house')
    const objects = [...f.obj.matchAll(/^o (.+)$/gm)].map(m => m[1])
    expect(objects).toEqual(expect.arrayContaining(['Ground surface', 'Block sides', `${level} outside walls`, `${level} window glass`, `${level} furniture`]))
    expect(f.obj).toMatch(/^# Sizes are in metres\. Y is up/m)
    expect(f.obj).toContain('mtllib my-house.mtl')
    // Each usemtl has its newmtl in the .mtl.
    for (const [, name] of f.obj.matchAll(/^usemtl (.+)$/gm)) expect(f.mtl).toContain(`newmtl ${name}`)
    const vertices = (f.obj.match(/^v /gm) ?? []).length
    const m = await buildModel({ plan, survey, terrain, earth: null })
    let expected = 0
    m.root.traverse(o => {
      if ((o as THREE.Mesh).isMesh) expected += (o as THREE.Mesh).geometry.getAttribute('position').count
    })
    m.dispose()
    expect(vertices).toBe(expected)
    expect(f.mtl).toMatch(/newmtl Ground_floor_window_glass_\d+\nKd [\d. ]+\nKa 0 0 0\nKs [\d. ]+\nNs \d+\nd 0\.550/)
  })
})

describe('a pool in the ground', () => {
  it('comes through in its hole, with its water, at its own levels', async () => {
    const pool = { ...newFurniture('pool', plan.levels[0].id, [-3.5, 6], 90)!, ground: { sits: 'in' as const } }
    const withPool = { ...plan, furniture: [...plan.furniture, pool] }
    const earth = earthFrom(terrain.grid, survey.boundary, earthInputs(withPool, survey))
    const m = await buildModel({ plan: withPool, survey, terrain, earth })
    const names: string[] = []
    m.root.traverse(o => names.push(o.name))
    expect(names).toContain(`${level} pool water`)
    const lv = levelsOf(withPool, pool, survey.origin, terrain.grid)!
    const water = m.root.getObjectByName(`${level} pool water`) as THREE.Mesh
    const box = new THREE.Box3().setFromObject(water)
    // The lowest furniture is the pool's floor, 1.5 m under its coping; the water is 150 mm under the coping.
    const furn = new THREE.Box3().setFromObject(m.root.getObjectByName(`${level} furniture`)!)
    expect(lv.sits).toBe('in')
    expect(box.max.y - furn.min.y).toBeCloseTo(1.5 - 0.15, 2)
    m.dispose()
  })
})

describe('the 3D model with a wall’s own finish', () => {
  it('has a part for each finish in use, in its colour, with the brick base under weatherboard', async () => {
    const own = editWallFinishes(withFinishes(plan, { walls: 'weatherboard' }), ['south', 'east'], () => ({ upper: { walls: 'weatherboard' }, lower: { walls: 'brick' }, at: 1 }))
    const m = await buildModel({ plan: own, survey, terrain, earth: null })
    const meshes: Record<string, THREE.Mesh> = {}
    m.root.traverse(o => {
      if ((o as THREE.Mesh).isMesh) meshes[o.name] = o as THREE.Mesh
    })
    expect(Object.keys(meshes)).toEqual(expect.arrayContaining([`${level} outside walls`, `${level} outside walls, brick, brick red`]))
    const brick = meshes[`${level} outside walls, brick, brick red`]
    const box = new THREE.Box3().setFromObject(brick)
    // The brick part goes up 1 m from the floor, and its outside face is brick red.
    expect(box.max.y - box.min.y).toBeCloseTo(1, 3)
    const mat = (brick.material as THREE.MeshStandardMaterial[])[0]
    expect(mat.color.getHexString()).toBe(new THREE.Color('#a0583f').getHexString())
    expect(mat.map).not.toBeNull()
    // From inside (the walk-through), the same walls keep the inside wall colour.
    expect(brick.geometry.groups[1].count).toBeGreaterThan(0)
    expect((brick.material as THREE.MeshStandardMaterial[])[1].color.getHexString()).toBe(new THREE.Color('#f1ede6').getHexString())
    // The whole house's walls are just as big as without the base.
    const all = new THREE.Box3()
    for (const [name, mesh] of Object.entries(meshes)) if (name.startsWith(`${level} outside walls`)) all.expandByObject(mesh)
    expect(all.getSize(new THREE.Vector3()).y).toBeCloseTo(2.7, 2)
    m.dispose()
  })
})

describe('what a model file leaves out', () => {
  it('skips anything marked userData.helper, lines, sprites, lights and hidden things, and keeps materials as they are', () => {
    const scene = new THREE.Scene()
    const level = new THREE.Group()
    level.name = 'Upper floor'
    scene.add(level)
    const box = new THREE.BoxGeometry(1, 1, 1)
    const glass = new THREE.MeshStandardMaterial({ color: '#8fb7d6', transparent: true, opacity: 0.4, roughness: 0.1 })
    const door = new THREE.Mesh(box, glass)
    door.name = 'door-sliding'
    door.position.set(2, 0, 0)
    level.add(door)
    const helpers = new THREE.Group()
    helpers.userData.helper = true
    helpers.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial()))
    level.add(helpers)
    const handle = new THREE.Mesh(box, new THREE.MeshBasicMaterial())
    handle.userData.helper = true
    level.add(handle)
    const hidden = new THREE.Mesh(box, new THREE.MeshBasicMaterial())
    hidden.visible = false
    level.add(hidden)
    level.add(new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()))
    level.add(new THREE.Sprite(), new THREE.DirectionalLight(), new THREE.AmbientLight())
    // An unnamed group's mesh takes the nearest name above it.
    const window = new THREE.Group()
    window.name = 'window-frame'
    window.add(new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#ffffff' })))
    level.add(window)

    const out = modelParts(scene)
    const names: string[] = []
    out.traverse(o => (o as THREE.Mesh).isMesh && names.push(o.name))
    expect(names).toEqual(['Upper floor door-sliding', 'Upper floor window-frame'])
    const copy = out.getObjectByName('Upper floor door-sliding') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    expect(copy.material.opacity).toBe(0.4)
    expect(copy.material.transparent).toBe(true)
    expect(copy.material.color.getHexString()).toBe('8fb7d6')
    expect(copy.position.x).toBe(2)
    // The scene's own material is left alone.
    expect(glass.name).toBe('')
  })
})
