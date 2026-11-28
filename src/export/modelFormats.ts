// The whole model in the formats SketchUp, BIM programs and plain mesh tools read, beside the .glb
// and OBJ in model3d.ts:
//
// - COLLADA (.dae): what SketchUp Pro imports with colours, and 3ds Max, Cinema 4D, Blender.
// - IFC 4 (.ifc): the BIM format Revit, ArchiCAD, SketchUp Pro and free viewers open. Each part is
//   an IFC element of its kind (IfcWall, IfcSlab, IfcRoof, IfcDoor, …) on its storey, shaped as a
//   triangle mesh (IfcTriangulatedFaceSet) with its colour.
// - STL (.stl): the plain mesh every program reads, the free SketchUp for Web among them. One
//   binary file in millimetres, Z up, with no colours (STL has none).
//
// All three are Z up with X east and Y north (three's Y-up, north −Z model turned over), in the
// same place as the .glb: 0, 0, 0 is the middle of the block at the bottom of its base.
//
// Each format takes the model's parts once flattened by `flatten`: per mesh, its triangles in
// world space with shared corners merged, per material.

import * as THREE from 'three'

export interface Piece {
  /** The material's name, unique in the model. */
  material: string
  /** sRGB colour, 0..1. */
  colour: [number, number, number]
  /** 1 is solid. */
  opacity: number
  /** x, y, z per corner, Z up, metres. */
  positions: Float64Array
  /** Three corners per triangle, from 0. */
  triangles: Uint32Array
}

export interface Part {
  /** The group it is in: "Ground", or a level's name. */
  group: string
  /** "Ground floor outside walls". */
  name: string
  pieces: Piece[]
}

/** The material's colour as most programs read one: sRGB, with vertex colours (the ground's) averaged in. */
export function materialColour(mesh: THREE.Mesh, mat: THREE.Material): THREE.Color {
  let colour = (mat as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color(1, 1, 1)
  const cols = mesh.geometry.getAttribute('color')
  if ((mat as THREE.MeshStandardMaterial).vertexColors && cols) {
    const sum = new THREE.Color(0, 0, 0)
    for (let k = 0; k < cols.count; k++) sum.add(new THREE.Color().fromBufferAttribute(cols as THREE.BufferAttribute, k))
    colour = sum.multiplyScalar(1 / Math.max(1, cols.count)).multiply(colour)
  }
  return colour.convertLinearToSRGB()
}

/** Corners closer than this (0.1 mm) are one corner. */
const MERGE = 1e4

/** The parts of a built model (BuiltModel.root), flattened: world space, Z up, corners merged. */
export function flatten(root: THREE.Object3D): Part[] {
  root.updateMatrixWorld(true)
  const parts: Part[] = []
  const v = new THREE.Vector3()
  for (const group of root.children) {
    group.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const pos = mesh.geometry.getAttribute('position')
      if (!pos?.count) return
      const index = mesh.geometry.getIndex()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const total = index ? index.count : pos.count
      const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: total, materialIndex: 0 }]
      const pieces: Piece[] = []
      mats.forEach((mat, mi) => {
        if (!mat || mat.visible === false) return
        const keys = new Map<string, number>()
        const xyz: number[] = []
        const tris: number[] = []
        for (const g of groups) {
          if ((g.materialIndex ?? 0) !== mi) continue
          const end = Math.min(total, g.start + g.count)
          for (let k = g.start; k + 2 < end; k += 3) {
            const corner = [0, 1, 2].map(j => {
              const at = index ? index.getX(k + j) : k + j
              v.fromBufferAttribute(pos, at).applyMatrix4(mesh.matrixWorld)
              // three's x, y (up), z (south) → x east, y north, z up.
              const x = v.x
              const y = -v.z
              const z = v.y
              const key = `${Math.round(x * MERGE)},${Math.round(y * MERGE)},${Math.round(z * MERGE)}`
              let n = keys.get(key)
              if (n === undefined) {
                n = xyz.length / 3
                keys.set(key, n)
                xyz.push(x, y, z)
              }
              return n
            })
            // Triangles that merged down to a line or a point say nothing.
            if (corner[0] === corner[1] || corner[1] === corner[2] || corner[0] === corner[2]) continue
            tris.push(corner[0], corner[1], corner[2])
          }
        }
        if (!tris.length) return
        const c = materialColour(mesh, mat)
        pieces.push({
          material: mat.name || `${mesh.name}_${mi}`,
          colour: [c.r, c.g, c.b],
          opacity: mat.transparent ? Math.max(0, Math.min(1, mat.opacity)) : 1,
          positions: Float64Array.from(xyz),
          triangles: Uint32Array.from(tris),
        })
      })
      if (pieces.length) parts.push({ group: group.name, name: mesh.name || group.name, pieces })
    })
  }
  return parts
}

// ---------------------------------------------------------------------------------------------
// STL

/** One binary STL of every part, in millimetres, Z up. */
export function stlBinary(parts: Part[], header = 'Contour and Gable model. Millimetres, Z up, X east, Y north.'): Uint8Array {
  let count = 0
  for (const p of parts) for (const q of p.pieces) count += q.triangles.length / 3
  const out = new Uint8Array(84 + count * 50)
  const dv = new DataView(out.buffer)
  out.set(new TextEncoder().encode(header.slice(0, 80)), 0)
  dv.setUint32(80, count, true)
  let at = 84
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (const p of parts)
    for (const q of p.pieces) {
      const P = q.positions
      for (let t = 0; t < q.triangles.length; t += 3) {
        const [i, j, k] = [q.triangles[t] * 3, q.triangles[t + 1] * 3, q.triangles[t + 2] * 3]
        a.set(P[i], P[i + 1], P[i + 2]).multiplyScalar(1000)
        b.set(P[j], P[j + 1], P[j + 2]).multiplyScalar(1000)
        c.set(P[k], P[k + 1], P[k + 2]).multiplyScalar(1000)
        n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize()
        for (const w of [n, a, b, c]) {
          dv.setFloat32(at, w.x, true)
          dv.setFloat32(at + 4, w.y, true)
          dv.setFloat32(at + 8, w.z, true)
          at += 12
        }
        at += 2
      }
    }
  return out
}

// ---------------------------------------------------------------------------------------------
// COLLADA

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (x: number) => {
  const s = x.toFixed(5).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

/** COLLADA 1.4.1, the version SketchUp reads: one node per group, one per part, a material per colour. */
export function daeText(parts: Part[], notes: string[], date = new Date()): string {
  const when = date.toISOString().replace(/\.\d+Z$/, 'Z')
  const effects: string[] = []
  const materials: string[] = []
  const geometries: string[] = []
  const matId = new Map<string, string>()
  const groups = new Map<string, string[]>()
  parts.forEach((p, pi) => {
    const id = `part${pi + 1}`
    const tris: string[] = []
    const binds: string[] = []
    // Every piece of a part shares one list of corners.
    const xyz: number[] = []
    let base = 0
    p.pieces.forEach(q => {
      let m = matId.get(q.material)
      if (!m) {
        m = `mat${matId.size + 1}`
        matId.set(q.material, m)
        const [r, g, b] = q.colour.map(num)
        const see = q.opacity < 1 ? `<transparent opaque="A_ONE"><color>1 1 1 ${num(q.opacity)}</color></transparent><transparency><float>1</float></transparency>` : ''
        effects.push(`<effect id="${m}-fx"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${r} ${g} ${b} 1</color></diffuse>${see}</lambert></technique></profile_COMMON></effect>`)
        materials.push(`<material id="${m}" name="${xml(q.material)}"><instance_effect url="#${m}-fx"/></material>`)
      }
      for (const x of q.positions) xyz.push(x)
      const idx: string[] = []
      for (const t of q.triangles) idx.push(String(t + base))
      base += q.positions.length / 3
      tris.push(`<triangles material="${m}" count="${q.triangles.length / 3}"><input semantic="VERTEX" source="#${id}-v" offset="0"/><p>${idx.join(' ')}</p></triangles>`)
      if (!binds.includes(m)) binds.push(m)
    })
    geometries.push(
      `<geometry id="${id}" name="${xml(p.name)}"><mesh>` +
        `<source id="${id}-pos"><float_array id="${id}-pos-a" count="${xyz.length}">${xyz.map(num).join(' ')}</float_array>` +
        `<technique_common><accessor source="#${id}-pos-a" count="${xyz.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>` +
        `<vertices id="${id}-v"><input semantic="POSITION" source="#${id}-pos"/></vertices>${tris.join('')}</mesh></geometry>`,
    )
    const node =
      `<node id="${id}-node" name="${xml(p.name)}"><instance_geometry url="#${id}"><bind_material><technique_common>` +
      binds.map(m => `<instance_material symbol="${m}" target="#${m}"/>`).join('') +
      `</technique_common></bind_material></instance_geometry></node>`
    if (!groups.has(p.group)) groups.set(p.group, [])
    groups.get(p.group)!.push(node)
  })
  let g = 0
  const nodes = [...groups].map(([name, kids]) => `<node id="group${++g}" name="${xml(name)}">${kids.join('')}</node>`)
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
    `<asset><contributor><authoring_tool>Contour and Gable</authoring_tool><comments>${xml(notes.join(' '))}</comments></contributor><created>${when}</created><modified>${when}</modified><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>`,
    `<library_effects>${effects.join('')}</library_effects>`,
    `<library_materials>${materials.join('')}</library_materials>`,
    `<library_geometries>${geometries.join('\n')}</library_geometries>`,
    `<library_visual_scenes><visual_scene id="scene" name="Contour and Gable model">${nodes.join('')}</visual_scene></library_visual_scenes>`,
    '<scene><instance_visual_scene url="#scene"/></scene>',
    '</COLLADA>',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------
// IFC

const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/** A new IFC GlobalId: 128 random bits in IFC's own 22-character base 64. */
export function ifcGuid(rand: () => number = Math.random): string {
  const bytes = new Uint8Array(16)
  if (rand === Math.random && globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(rand() * 256)
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let s = ''
  for (let i = 21; i >= 0; i--) s += IFC_CHARS[Number((n >> BigInt(6 * i)) & 63n)]
  return s
}

/** A STEP string: quotes doubled, backslashes doubled, anything past ASCII as \X2\…\X0\. */
export const ifcString = (s: string): string =>
  `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]+/g, run => `\\X2\\${[...run].map(ch => (ch.codePointAt(0)! > 0xffff ? '003F' : ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'))).join('')}\\X0\\`)}'`

/** A STEP real: always with a point. */
const real = (x: number) => {
  return (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6).replace(/0+$/, '')
}

/** Which IFC element a part is, from its name. */
export function ifcKind(p: Pick<Part, 'group' | 'name'>): { entity: string; type: string; opening?: boolean } {
  // The level's own name ("Ground floor …") says nothing about the part.
  const n = (p.name.startsWith(p.group) ? p.name.slice(p.group.length) : p.name).toLowerCase()
  if (p.group === 'Ground') return /surface/.test(n) ? { entity: 'IFCGEOGRAPHICELEMENT', type: '.TERRAIN.' } : { entity: 'IFCBUILDINGELEMENTPROXY', type: '.NOTDEFINED.' }
  if (/door/.test(n)) return { entity: 'IFCDOOR', type: '.NOTDEFINED.', opening: true }
  if (/window|glass/.test(n)) return { entity: 'IFCWINDOW', type: '.NOTDEFINED.', opening: true }
  if (/roof|gutter|fascia|eave/.test(n)) return { entity: 'IFCROOF', type: '.NOTDEFINED.' }
  if (/stair|step/.test(n)) return { entity: 'IFCSTAIR', type: '.NOTDEFINED.' }
  if (/wall/.test(n)) return { entity: 'IFCWALL', type: '.NOTDEFINED.' }
  if (/furniture|pool|tank|bed|sofa|table/.test(n)) return { entity: 'IFCFURNITURE', type: '.NOTDEFINED.' }
  if (/slab|floor|deck|driveway|path|pad/.test(n)) return { entity: 'IFCSLAB', type: /floor|slab/.test(n) ? '.FLOOR.' : '.NOTDEFINED.' }
  return { entity: 'IFCBUILDINGELEMENTPROXY', type: '.NOTDEFINED.' }
}

export interface IfcOptions {
  fileName: string
  projectName: string
  notes: string[]
  /** Each group's floor level in the file's own heights (metres above the origin), where known. */
  elevations?: Record<string, number>
  date?: Date
}

/** The model as IFC 4: project, site, building, a storey per level, each part an element on it. */
export function ifcText(parts: Part[], o: IfcOptions): string {
  const lines: string[] = []
  let id = 0
  const add = (s: string) => {
    lines.push(`#${++id}=${s};`)
    return `#${id}`
  }
  const g = () => ifcString(ifcGuid())
  const when = (o.date ?? new Date()).toISOString().replace(/\.\d+Z$/, '')

  const units = [
    add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'),
    add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'),
    add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ]
  const unitSet = add(`IFCUNITASSIGNMENT((${units.join(',')}))`)
  const origin = add('IFCCARTESIANPOINT((0.,0.,0.))')
  const zUp = add('IFCDIRECTION((0.,0.,1.))')
  const xEast = add('IFCDIRECTION((1.,0.,0.))')
  const axes = add(`IFCAXIS2PLACEMENT3D(${origin},${zUp},${xEast})`)
  const north = add('IFCDIRECTION((0.,1.))')
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${axes},${north})`)
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`)
  const project = add(`IFCPROJECT(${g()},$,${ifcString(o.projectName)},${ifcString(o.notes.join(' '))},$,$,$,(${context}),${unitSet})`)
  const sitePlace = add(`IFCLOCALPLACEMENT($,${axes})`)
  const site = add(`IFCSITE(${g()},$,'Site',$,$,${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`)
  const housePlace = add(`IFCLOCALPLACEMENT(${sitePlace},${axes})`)
  const building = add(`IFCBUILDING(${g()},$,${ifcString(o.projectName)},$,$,${housePlace},$,$,.ELEMENT.,$,$,$)`)
  add(`IFCRELAGGREGATES(${g()},$,$,$,${project},(${site}))`)
  add(`IFCRELAGGREGATES(${g()},$,$,$,${site},(${building}))`)

  // One storey per level, in the order the model has them (lowest first).
  const storeys = new Map<string, { ref: string; place: string; items: string[] }>()
  for (const p of parts) {
    if (p.group === 'Ground' || storeys.has(p.group)) continue
    let elevation = o.elevations?.[p.group]
    if (elevation === undefined) {
      elevation = Infinity
      for (const q of parts) if (q.group === p.group) for (const piece of q.pieces) for (let k = 2; k < piece.positions.length; k += 3) elevation = Math.min(elevation, piece.positions[k])
    }
    const place = add(`IFCLOCALPLACEMENT(${housePlace},${axes})`)
    const ref = add(`IFCBUILDINGSTOREY(${g()},$,${ifcString(p.group)},$,$,${place},$,$,.ELEMENT.,${real(isFinite(elevation) ? elevation : 0)})`)
    storeys.set(p.group, { ref, place, items: [] })
  }
  if (storeys.size) add(`IFCRELAGGREGATES(${g()},$,$,$,${building},(${[...storeys.values()].map(s => s.ref).join(',')}))`)

  const styles = new Map<string, string>()
  const onSite: string[] = []
  for (const p of parts) {
    const items: string[] = []
    for (const q of p.pieces) {
      const pts: string[] = []
      for (let k = 0; k < q.positions.length; k += 3) pts.push(`(${real(q.positions[k])},${real(q.positions[k + 1])},${real(q.positions[k + 2])})`)
      const list = add(`IFCCARTESIANPOINTLIST3D((${pts.join(',')}))`)
      const tri: string[] = []
      for (let t = 0; t < q.triangles.length; t += 3) tri.push(`(${q.triangles[t] + 1},${q.triangles[t + 1] + 1},${q.triangles[t + 2] + 1})`)
      const faces = add(`IFCTRIANGULATEDFACESET(${list},$,$,(${tri.join(',')}),$)`)
      let style = styles.get(q.material)
      if (!style) {
        const colour = add(`IFCCOLOURRGB($,${q.colour.map(real).join(',')})`)
        const shading = add(`IFCSURFACESTYLESHADING(${colour},${real(1 - q.opacity)})`)
        style = add(`IFCSURFACESTYLE(${ifcString(q.material)},.BOTH.,(${shading}))`)
        styles.set(q.material, style)
      }
      add(`IFCSTYLEDITEM(${faces},(${style}),$)`)
      items.push(faces)
    }
    const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${items.join(',')}))`)
    const shape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`)
    const storey = storeys.get(p.group)
    const place = add(`IFCLOCALPLACEMENT(${storey ? storey.place : sitePlace},${axes})`)
    const kind = ifcKind(p)
    // Doors and windows have OverallHeight and OverallWidth before their type, and two more after it,
    // all left unset: each part is every door (or window) of its level in one mesh.
    const element = kind.opening
      ? add(`${kind.entity}(${g()},$,${ifcString(p.name)},$,$,${place},${shape},$,$,$,${kind.type},$,$)`)
      : add(`${kind.entity}(${g()},$,${ifcString(p.name)},$,$,${place},${shape},$,${kind.type})`)
    if (storey) storey.items.push(element)
    else onSite.push(element)
  }
  if (onSite.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${g()},$,$,$,(${onSite.join(',')}),${site})`)
  for (const s of storeys.values()) if (s.items.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${g()},$,$,$,(${s.items.join(',')}),${s.ref})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${ifcString(o.fileName)},'${when}',(''),(''),'Contour and Gable','Contour and Gable','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
