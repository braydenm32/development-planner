// The whole model as a 3D file for Blender, SketchUp or a renderer: glTF binary (.glb) or OBJ with
// its .mtl (CB-26, LF-32). Built by the very components the 3D view draws with (Site in SiteView,
// House3D), mounted on their own in a react-three-fiber root with no canvas, so the file and the
// view can't drift apart and it works with the 3D view closed. Whatever materials and textures
// those meshes carry at export time go into the file as they are.
//
// What is left out: anything with `userData.helper = true` (and everything under it), lines,
// points, sprites (labels), lights and cameras, and anything hidden. Add `userData={{ helper: true }}`
// to a 3D group or mesh that belongs to the screen (handles, gizmos, markers) to keep it out.
//
// Plain createElement rather than JSX, so the file holds no exported component (fast refresh).
// Loaded only when a model is asked for (src/export/files.ts imports it lazily), so three's
// exporters stay out of the main bundle.

import { createRoot, extend } from '@react-three/fiber'
import { Component, createElement as h, type ReactNode } from 'react'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { House3D } from '../components/House3D'
import { Site } from '../components/SiteView'
import { CAVEAT_LINE } from '../legal/caveat'
import { DEFAULT_VIEW, type ViewSettings } from '../lib/storage'
import type { Survey } from '../lib/survey'
import type { Heightfield, Terrain } from '../lib/terrain'
import { buildSiteSolid } from '../lib/terrainMesh'
import { sortedLevels, type Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { zip } from '../print/export'

export interface ModelInput {
  plan: Plan
  survey: Survey
  terrain: Terrain
  earth: Earth | null
  /** The ground and the block under it, with the site features on it (default true). */
  ground?: boolean
  /** Furniture in the rooms (default true). */
  furniture?: boolean
}

/** Where the file's 0, 0, 0 is: the middle of the block, at the bottom of the block's base. */
export interface ModelOrigin {
  easting: number
  northing: number
  rl: number
}

/** The model ready to write: one group per part of it ("Ground", then each level), in metres, Y up. */
export interface BuiltModel {
  root: THREE.Group
  origin: ModelOrigin
  /** Let go of the meshes once the file is written. */
  dispose: () => void
}

/** The 3D view's settings for a model: real heights, the house drawn level by level below, no marks. */
const MODEL_VIEW: ViewSettings = {
  ...DEFAULT_VIEW,
  exaggeration: 1,
  showContours: false,
  showLevels: false,
  showReference: false,
  showSolid: true,
  showHouse: false,
  showTrees: true,
  hiddenLevels: [],
}

/** The ground shown: finished once anything is cut or filled, as the 3D view and the print show it. */
function groundOf({ survey, terrain, earth }: ModelInput): { ground: Heightfield; base: number; solid: ReturnType<typeof buildSiteSolid> } {
  const natural = Math.floor(terrain.stats.minRL) - 1
  if (earth && earth.result.cut + earth.result.fill > 0.01) {
    let min = Infinity
    for (const z of earth.result.grid.z) min = Math.min(min, z)
    const base = Math.min(natural, Math.floor(min) - 1)
    return { ground: earth.result.grid, base, solid: buildSiteSolid(earth.result.grid, survey.boundary, base, earth.strips) }
  }
  return { ground: terrain.grid, base: natural, solid: buildSiteSolid(terrain.grid, survey.boundary, natural) }
}

class Catch extends Component<{ onError: (e: Error) => void; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: Error) {
    this.props.onError(e)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** A renderer that draws nothing: the root only builds the scene, so no WebGL is needed. */
const noRenderer = () => ({ render() {}, setSize() {}, setPixelRatio() {}, dispose() {}, shadowMap: {} }) as unknown as THREE.WebGLRenderer

const SKIP_TYPES = (o: THREE.Object3D) =>
  (o as THREE.Light).isLight ||
  (o as THREE.Camera).isCamera ||
  (o as THREE.Line).isLine ||
  (o as THREE.Points).isPoints ||
  (o as THREE.Sprite).isSprite

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Copies of the meshes in each named group at the top of `scene` ("Ground", each level), as one
 * group each, leaving out what belongs to the screen. Geometry is shared; materials are copied,
 * with whatever colour, maps and see-through they have, and named after their part.
 */
export function modelParts(scene: THREE.Object3D): THREE.Group {
  scene.updateMatrixWorld(true)
  const out = new THREE.Group()
  let n = 0
  for (const section of scene.children) {
    if (!section.name || section.userData?.helper) continue
    const group = new THREE.Group()
    group.name = section.name
    const walk = (o: THREE.Object3D, label: string) => {
      if (o.userData?.helper || !o.visible || SKIP_TYPES(o)) return
      const here = o.name || label
      const mesh = o as THREE.Mesh
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (mesh.isMesh && mesh.geometry?.getAttribute('position')?.count && mats.some(m => m && m.visible !== false)) {
        const name = section.name === 'Ground' ? cap(here || 'site feature') : `${section.name} ${here || 'part'}`
        const copies = mats.map(m => {
          const c = m.clone()
          // OBJ's .mtl finds each material by name, so each is named after its part.
          c.name = `${name.replace(/[^A-Za-z0-9]+/g, '_')}_${++n}`
          return c
        })
        const m = new THREE.Mesh(mesh.geometry, Array.isArray(mesh.material) ? copies : copies[0])
        m.name = name
        m.applyMatrix4(mesh.matrixWorld)
        group.add(m)
      }
      for (const c of o.children) walk(c, here)
    }
    for (const c of section.children) walk(c, '')
    if (group.children.length) out.add(group)
  }
  return out
}

/** Build the model's meshes from the 3D view's own components. */
export async function buildModel(i: ModelInput): Promise<BuiltModel> {
  extend(THREE as unknown as Parameters<typeof extend>[0])
  const { plan, survey, terrain } = i
  const withGround = i.ground !== false
  const refZ = Math.floor(terrain.stats.minRL) - 1
  const { ground, base, solid } = groundOf(i)
  let failed: Error | null = null

  const key = {} as HTMLCanvasElement
  const root = createRoot(key)
  await root.configure({ gl: noRenderer(), size: { width: 1, height: 1, top: 0, left: 0 }, dpr: 1, frameloop: 'never' })
  const store = root.render(
    h(
      Catch,
      {
        onError: (e: Error) => {
          failed = e
        },
      },
      withGround &&
        h(
          'group',
          { name: 'Ground' },
          h(Site, {
            survey,
            terrain,
            solid,
            ground,
            // The cut and fill tints are a check on screen; the model keeps the ground's own colours.
            cutFill: false,
            view: MODEL_VIEW,
            onHover: () => {},
            compassRef: { current: null },
            plan: null,
            upBearing: 0,
            refZ,
          }),
        ),
      // One House3D per level, so each level is its own group of walls, floors and roof.
      ...sortedLevels(plan).map(l =>
        h(
          'group',
          { key: l.id, name: l.name || 'Level' },
          h(House3D, { plan, origin: survey.origin, refZ, showLevels: new Set([l.id]), showRoof: true, showFurniture: i.furniture !== false, ground }),
        ),
      ),
    ),
  )
  const scene = store.getState().scene
  const done = () => root.unmount()
  if (failed) {
    done()
    throw failed
  }
  scene.updateMatrixWorld(true)

  // The middle of the block, near 0, 0, 0, so programs don't open it far off; y = 0 is the block's base.
  const xs = survey.boundary.map(p => p[0])
  const ys = survey.boundary.map(p => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const out = new THREE.Group()
  out.name = 'Contour & Gable model'
  out.position.set(-cx, refZ - base, cy)

  out.add(...modelParts(scene).children)
  out.updateMatrixWorld(true)
  return {
    root: out,
    origin: { easting: survey.origin[0] + cx, northing: survey.origin[1] + cy, rl: base },
    dispose: done,
  }
}

const fixed = (v: number) => v.toFixed(3)

/** The notes every model carries: units, axes, where the origin is, and the caveat. */
export const modelNotes = (o: ModelOrigin): string[] => [
  'Made with Contour and Gable.',
  'Sizes are in metres. Y is up; north is -Z, east is +X.',
  `The origin (0, 0, 0) is the middle of the block at the bottom of the block's base: easting ${fixed(o.easting)}, northing ${fixed(o.northing)}, RL ${fixed(o.rl)}.`,
  CAVEAT_LINE,
]

/** The model as glTF binary (.glb), its notes in the scene's extras. */
export async function modelGlb(i: ModelInput): Promise<Uint8Array> {
  const m = await buildModel(i)
  try {
    const scene = new THREE.Scene()
    scene.name = 'Contour & Gable model'
    scene.userData = { units: 'metres', origin: m.origin, notes: modelNotes(m.origin).join(' ') }
    scene.add(m.root)
    const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true })) as ArrayBuffer
    return new Uint8Array(glb)
  } finally {
    m.dispose()
  }
}

/** sRGB numbers for the .mtl, as most programs read them. */
const srgb = (c: THREE.Color) => {
  const t = c.clone().convertLinearToSRGB()
  return `${t.r.toFixed(4)} ${t.g.toFixed(4)} ${t.b.toFixed(4)}`
}

/** A texture's picture as PNG bytes, where it is one the browser can draw (a canvas or a bitmap). */
async function texturePng(tex: THREE.Texture): Promise<Uint8Array | null> {
  const img = tex.image as CanvasImageSource & { width?: number; height?: number }
  if (!img || typeof document === 'undefined' || !img.width || !img.height) return null
  try {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    c.getContext('2d')!.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

export interface ObjFiles {
  obj: string
  mtl: string
  textures: { name: string; data: Uint8Array }[]
  origin: ModelOrigin
}

/** The model as OBJ text, its .mtl and any textures, named for `base` (base.obj, base.mtl). */
export async function modelObj(i: ModelInput, base: string): Promise<ObjFiles> {
  const m = await buildModel(i)
  try {
    const notes = modelNotes(m.origin).map(l => `# ${l}`).join('\n')
    const obj = `${notes}\nmtllib ${base}.mtl\n${new OBJExporter().parse(m.root)}`
    const mtl: string[] = [notes, '']
    const textures: ObjFiles['textures'] = []
    const seen = new Map<THREE.Texture, string>()
    const meshes: THREE.Mesh[] = []
    m.root.traverse(o => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh))
    for (const mesh of meshes) {
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        let colour = mat.color ?? new THREE.Color(1, 1, 1)
        // The ground is coloured vertex by vertex: OBJ carries those too, and its material takes their average.
        const cols = mesh.geometry.getAttribute('color')
        if (mat.vertexColors && cols) {
          const sum = new THREE.Color(0, 0, 0)
          for (let k = 0; k < cols.count; k++) sum.add(new THREE.Color().fromBufferAttribute(cols as THREE.BufferAttribute, k))
          colour = sum.multiplyScalar(1 / Math.max(1, cols.count)).multiply(colour)
        }
        mtl.push(`newmtl ${mat.name}`, `Kd ${srgb(colour)}`, 'Ka 0 0 0', 'Ks 0.04 0.04 0.04', `Ns ${Math.round((1 - (mat.roughness ?? 1)) * 200) + 1}`)
        if (mat.transparent && mat.opacity < 1) mtl.push(`d ${mat.opacity.toFixed(3)}`)
        mtl.push('illum 2')
        if (mat.map) {
          let file = seen.get(mat.map)
          if (!file) {
            const png = await texturePng(mat.map)
            if (png) {
              file = `textures/texture-${textures.length + 1}.png`
              textures.push({ name: file, data: png })
              seen.set(mat.map, file)
            }
          }
          if (file) mtl.push(`map_Kd ${file}`)
        }
        mtl.push('')
      }
    }
    return { obj, mtl: mtl.join('\n'), textures, origin: m.origin }
  } finally {
    m.dispose()
  }
}

/** The OBJ, its .mtl, textures and a note of the units and the origin, in one ZIP. */
export async function modelObjZip(i: ModelInput, base: string): Promise<Uint8Array> {
  const f = await modelObj(i, base)
  const enc = new TextEncoder()
  return zip([
    { name: `${base}.obj`, data: enc.encode(f.obj) },
    { name: `${base}.mtl`, data: enc.encode(f.mtl) },
    ...f.textures,
    { name: 'README.txt', data: enc.encode(modelNotes(f.origin).map(l => `${l}\r\n`).join('\r\n')) },
  ])
}
