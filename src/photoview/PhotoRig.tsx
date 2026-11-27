// Looking from a photo, inside the 3D view: the camera stands where the photo was taken, at its
// height, faces its way with its lens, and the view is framed to the photo's shape with the photo
// behind it (./PhotoLayer.tsx draws the photo; the canvas is see-through where nothing is drawn).
// Only what was asked for shows over the photo: the new house, the house with its cut and fill, or
// everything but the modelled ground. It does that with a layer of the camera's own, so nothing in
// the rest of the scene (the walk-through, the model download, the 3D print) changes.
//
// Drag turns and tilts (the model follows the finger), a pinch or the wheel changes the lens angle,
// the keys nudge everything in fine steps, and the lining-up helper's clicks land here. Each change
// is one undo step; a drag or a pinch is one when it ends. Leaving (Esc, Leave, another camera
// button, walking through, leaving the view) puts the camera back as it was.

import { useFrame, useThree, type RootState } from '@react-three/fiber'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { announce } from '../a11y/announce'
import { CanvasFrame } from '../components/canvasFrame'
import { House3D } from '../components/House3D'
import { setGrab3d } from '../export/snapshot'
import { CUT_RGB, FILL_RGB } from '../lib/colors'
import { pointInPolygon, type Vec2 } from '../lib/geom'
import type { ViewSettings } from '../lib/storage'
import type { Survey } from '../lib/survey'
import type { Heightfield, Terrain } from '../lib/terrain'
import type { SiteSolid } from '../lib/terrainMesh'
import { overlayOpen, shortcutAllowed, singleKeysOn, tabbingNow } from '../nav/keys'
import { useCamera } from '../phone/cameraStore'
import { useTouchCanvas } from '../phone/device'
import type { Plan } from '../plan/model'
import { useSiteFeatures, useSiteStore } from '../site/store'
import { aimQuaternion, clampFov, project, rayThrough, verticalFov, wrap360, type Shot } from './camera'
import type { PhotoView } from './model'
import { knownPoints, type KnownPoint } from './points'
import { PHOTO_LAYER, photoRect, shotOf, type SceneFrame } from './shot'
import { solveAim, partsFor } from './solve'
import { keyPatch } from './keySteps'
import { dragPhoto, endDrag, leavePhotoView, photoById, updatePhoto, usePhotoView, type PhotoRect } from './store'

interface Props {
  survey: Survey
  terrain: Terrain
  solid: SiteSolid
  view: ViewSettings
  plan: Plan | null
  ground: Heightfield
  cutFill: boolean
  refZ: number
}

/** A click on the model lands on a marked point within this many pixels of it. */
const SNAP_PX = 22
const TAP_SLOP = 6

/** The camera as it was before the photo view took it. */
interface Saved {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  target: THREE.Vector3 | null
  fov: number
  aspect: number
  view: THREE.PerspectiveCamera['view']
  layers: number
  background: THREE.Scene['background']
  opacity: string
}

class Looker {
  private get: () => RootState
  private saved: Saved | null = null
  /** Lights given the photo layer, and the ground meshes hidden for "everything": put back on release. */
  private lit = new Set<THREE.Object3D>()
  private hidden = new Set<THREE.Object3D>()
  /** Leave the camera where it is on release (a camera button is taking it elsewhere). */
  private stay = false
  private photo: HTMLImageElement | null = null
  shot: Shot | null = null
  private view: PhotoView | null = null

  constructor(get: () => RootState) {
    this.get = get
  }

  get owned() {
    return this.saved !== null
  }

  /** The photo as loaded, for the saved picture. */
  setPhoto(img: HTMLImageElement | null) {
    this.photo = img
  }

  setView(v: PhotoView | null) {
    this.view = v
  }

  /** The next release leaves the camera where it is. */
  keepPlace() {
    this.stay = true
  }

  private take() {
    const { camera, controls, scene, gl, setEvents } = this.get()
    const cam = camera as THREE.PerspectiveCamera
    const c = controls as unknown as { enabled: boolean; target: THREE.Vector3 } | null
    this.saved = {
      pos: cam.position.clone(),
      quat: cam.quaternion.clone(),
      target: c ? c.target.clone() : null,
      fov: cam.fov,
      aspect: cam.aspect,
      view: cam.view ? { ...cam.view } : null,
      layers: cam.layers.mask,
      background: scene.background,
      opacity: gl.domElement.style.opacity,
    }
    if (c) c.enabled = false
    // The view's own clicks (reading the ground's level) wait until the photo view ends.
    setEvents({ enabled: false })
    scene.background = null
    // The Picture button saves the photo with the model over it (./montage below).
    setGrab3d(() => this.montage())
    this.stay = false
  }

  release() {
    const saved = this.saved
    if (!saved) return
    this.saved = null
    const { camera, controls, scene, gl, setEvents } = this.get()
    const cam = camera as THREE.PerspectiveCamera
    const c = controls as unknown as { enabled: boolean; target: THREE.Vector3; update(): boolean } | null
    cam.fov = saved.fov
    cam.aspect = saved.aspect
    if (saved.view) cam.setViewOffset(saved.view.fullWidth, saved.view.fullHeight, saved.view.offsetX, saved.view.offsetY, saved.view.width, saved.view.height)
    else cam.clearViewOffset()
    cam.layers.mask = saved.layers
    if (!this.stay) {
      cam.position.copy(saved.pos)
      cam.quaternion.copy(saved.quat)
      if (c && saved.target) c.target.copy(saved.target)
    }
    cam.updateProjectionMatrix()
    if (c) {
      c.enabled = true
      c.update()
    }
    scene.background = saved.background
    gl.domElement.style.opacity = saved.opacity
    setEvents({ enabled: true })
    for (const o of this.lit) o.layers.disable(PHOTO_LAYER)
    this.lit.clear()
    this.showGround()
    // The Picture button reads the canvas again (as src/export/SnapshotGrab.tsx does).
    setGrab3d(() => {
      const s = this.get()
      s.gl.render(s.scene, s.camera)
      return s.gl.domElement.toDataURL('image/png')
    })
    this.stay = false
  }

  private showGround() {
    for (const o of this.hidden) o.visible = true
    this.hidden.clear()
  }

  /** Put the camera at the shot, framed to the photo's place on the canvas. */
  apply(shot: Shot, rect: PhotoRect, all: boolean, seeThrough: number) {
    if (!this.saved) this.take()
    const { camera, controls, scene, size, gl } = this.get()
    const cam = camera as THREE.PerspectiveCamera
    cam.position.copy(shot.eye)
    aimQuaternion(shot, cam.quaternion)
    cam.fov = verticalFov(shot)
    // The photo's frustum, seen through the whole canvas: the canvas is a window round the photo.
    cam.aspect = rect.width / rect.height
    cam.setViewOffset(rect.width, rect.height, -rect.left, -rect.top, size.width, size.height)
    cam.updateProjectionMatrix()
    cam.layers.set(PHOTO_LAYER)
    if (all) cam.layers.enable(0)
    // The compass reads the orbit's target: keep it just ahead.
    const c = controls as unknown as { target: THREE.Vector3 } | null
    if (c) c.target.copy(shot.eye).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), 10)
    // Every light lights the photo layer too; the sun study's lights come and go, so look each frame.
    scene.traverse(o => {
      if ((o as THREE.Light).isLight && !o.layers.isEnabled(PHOTO_LAYER)) {
        o.layers.enable(PHOTO_LAYER)
        this.lit.add(o)
      }
      // Everything, but the photo's own ground in place of the model's.
      if (all && (o.name === 'ground surface' || o.name === 'block sides') && o.visible) {
        o.visible = false
        this.hidden.add(o)
      }
    })
    if (!all) this.showGround()
    gl.domElement.style.opacity = String(1 - seeThrough)
    this.shot = shot
  }

  /** The photo with the model over it, at the photo's own size: what the Picture button saves. */
  montage(): string {
    const { gl, scene, camera } = this.get()
    const shot = this.shot
    const v = this.view
    const img = this.photo
    if (!shot || !v || !img) {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/png')
    }
    const w = v.width
    const h = v.height
    const cam = new THREE.PerspectiveCamera(verticalFov(shot), w / h, (camera as THREE.PerspectiveCamera).near, (camera as THREE.PerspectiveCamera).far)
    cam.position.copy(shot.eye)
    aimQuaternion(shot, cam.quaternion)
    cam.layers.mask = camera.layers.mask
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace })
    const aids = scene.getObjectByName('photo view aids')
    const aidsShown = aids?.visible
    if (aids) aids.visible = false
    const pixels = new Uint8Array(w * h * 4)
    const clear = gl.getClearAlpha()
    try {
      gl.setRenderTarget(rt)
      gl.setClearAlpha(0)
      gl.clear()
      gl.render(scene, cam)
      gl.readRenderTargetPixels(rt, 0, 0, w, h, pixels)
    } finally {
      gl.setRenderTarget(null)
      gl.setClearAlpha(clear)
      rt.dispose()
      if (aids) aids.visible = !!aidsShown
    }
    const model = document.createElement('canvas')
    model.width = w
    model.height = h
    const data = new ImageData(w, h)
    // GL rows run bottom to top.
    for (let y = 0; y < h; y++) data.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
    model.getContext('2d')!.putImageData(data, 0, 0)
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    ctx.globalAlpha = 1 - usePhotoView.getState().seeThrough
    ctx.drawImage(model, 0, 0)
    return out.toDataURL('image/png')
  }
}

/** Where the person pressed, in the photo's own terms (0..1 from its top-left); null outside it. */
function photoPoint(el: HTMLElement, rect: PhotoRect, e: { clientX: number; clientY: number }): [number, number] | null {
  const r = el.getBoundingClientRect()
  const u = (e.clientX - r.left - rect.left) / rect.width
  const v = (e.clientY - r.top - rect.top) / rect.height
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null
}

/** Where a ray meets the ground (by stepping along it): for a click on the model's ground. */
function groundHit(eye: THREE.Vector3, dir: THREE.Vector3, groundY: (x: number, z: number) => number): THREE.Vector3 | null {
  let prev = eye.y - groundY(eye.x, eye.z)
  for (let t = 0.25; t < 400; t += 0.25) {
    const p = eye.clone().addScaledVector(dir, t)
    const d = p.y - groundY(p.x, p.z)
    if (d <= 0 && prev > 0) return eye.clone().addScaledVector(dir, t - 0.25 * (d / (d - prev)))
    prev = d
  }
  return null
}

export function PhotoRig({ survey, terrain, solid, view, plan, ground, cutFill, refZ }: Props) {
  const get = useThree(s => s.get)
  const size = useThree(s => s.size)
  const ready = useThree(s => !!s.controls)
  const [looker] = useState(() => new Looker(get))
  const active = usePhotoView(s => s.active)
  const id = usePhotoView(s => s.id)
  const show = usePhotoView(s => s.show)
  const lines = usePhotoView(s => s.lines)
  const picking = usePhotoView(s => s.picking)
  const photo = useSiteStore(s => (active && id ? (s.data.photos ?? []).find(p => p.id === id) : undefined))
  const image = useSiteStore(s => (id ? s.images[id] : undefined))
  const panel = usePhotoView(s => s.panel)
  const insets = useContext(CanvasFrame)?.insets
  const touch = useTouchCanvas()
  const exag = view.exaggeration
  const features = useSiteFeatures()
  const groupRef = useRef<THREE.Group>(null)

  const frame = useMemo<SceneFrame>(
    () => ({ plan, origin: survey.origin, groundRL: (p: Vec2) => terrain.grid.sample(p[0], p[1]), refZ, exag }),
    [plan, survey.origin, terrain, refZ, exag],
  )
  const frameRef = useRef(frame)
  useEffect(() => void (frameRef.current = frame), [frame])

  // The photo, loaded once, for the saved picture.
  useEffect(() => {
    looker.setPhoto(null)
    if (!image) return
    const img = new Image()
    img.onload = () => looker.setPhoto(img)
    img.src = image
  }, [looker, image])

  // Where the photo goes on the canvas: inside what the tab panel, the photo panel and the bars leave.
  const rect = useMemo(() => {
    if (!photo) return null
    const phone = !!touch?.phone
    const free = {
      l: (phone ? 0 : (insets?.l ?? 0)) + (panel?.l ?? 0),
      r: (phone ? 0 : (insets?.r ?? 0)) + (panel?.r ?? 0),
      t: (insets?.t ?? 0) + (panel?.t ?? 0),
      b: Math.max(insets?.b ?? 0, panel?.b ?? 0),
    }
    return photoRect(size.width, size.height, photo.width / photo.height, free)
  }, [photo, size.width, size.height, insets, panel, touch])
  useEffect(() => {
    const r = usePhotoView.getState().rect
    if (r === rect || (r && rect && Object.keys(r).every(k => Math.abs(r[k as keyof PhotoRect] - rect[k as keyof PhotoRect]) < 0.5))) return
    usePhotoView.getState().set({ rect })
  }, [rect])

  const known = useMemo<KnownPoint[]>(
    () =>
      knownPoints({
        boundary: survey.boundary,
        levels: survey.levels,
        reference: survey.reference,
        features,
        plan,
        origin: survey.origin,
        groundRL: frame.groundRL,
        refZ,
        exag,
      }),
    [survey, features, plan, frame, refZ, exag],
  )
  const knownRef = useRef(known)
  useEffect(() => void (knownRef.current = known), [known])

  // Asks to open (from the bar, Site, search) and to leave; walking or a camera button ends it.
  useEffect(() => {
    if (!ready) return
    const begin = () => {
      const st = usePhotoView.getState()
      st.set({ ask: null, active: true, picking: null })
      const v = photoById(st.id)
      announce(v ? (v.at ? `Looking from the photo ${v.name}. Drag to turn it, Esc leaves.` : `Photo view: ${v.name}. Set where it was taken on the small plan.`) : 'Photo view: add a photo taken on the block.')
    }
    if (usePhotoView.getState().ask) begin()
    const unsub = usePhotoView.subscribe((s, prev) => {
      if (s.ask && s.ask !== prev.ask) begin()
      if (s.leaveN !== prev.leaveN && s.active) {
        s.set({ active: false, picking: null })
        announce('Left the photo view.')
      }
    })
    const unCam = useCamera.subscribe((s, prev) => {
      if ((s.command !== prev.command || s.step !== prev.step) && usePhotoView.getState().active) {
        looker.keepPlace()
        usePhotoView.getState().set({ active: false, picking: null })
      }
    })
    return () => {
      unsub()
      unCam()
    }
  }, [looker, ready])

  // Leaving the 3D view ends the photo view; the camera goes with the view.
  useEffect(
    () => () => {
      looker.keepPlace()
      looker.release()
      if (usePhotoView.getState().active) usePhotoView.getState().set({ active: false, picking: null, rect: null })
    },
    [looker],
  )

  // Each frame: the camera at the photo's spot, or given back once the view ends or has no spot.
  useFrame(() => {
    const st = usePhotoView.getState()
    const v = st.active ? photoById(st.id) : null
    const shot = v ? shotOf(v, frameRef.current) : null
    looker.setView(v)
    if (!shot || !st.rect) {
      if (looker.owned) looker.release()
      return
    }
    const seeThrough = st.picking && !st.picking.photo ? 0.75 : st.seeThrough
    looker.apply(shot, st.rect, st.show === 'all', seeThrough)
    const g = groupRef.current
    if (g) g.traverse(o => o.layers.enable(PHOTO_LAYER))
  }, -1)

  // The keys: under the one rule for shortcuts, and only while looking from a photo.
  useEffect(() => {
    let held: string | null = null
    const down = (e: KeyboardEvent) => {
      const st = usePhotoView.getState()
      if (!st.active || e.ctrlKey || e.metaKey || e.altKey) return
      if (!shortcutAllowed(e, { overlay: overlayOpen(), tabbing: tabbingNow(), singleKeys: singleKeysOn() })) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (st.picking) st.set({ picking: null })
        else leavePhotoView()
        return
      }
      const v = photoById(st.id)
      if (!v?.at) return
      const patch = keyPatch(e.key, v)
      if (!patch) return
      e.preventDefault()
      e.stopPropagation()
      held = e.key
      dragPhoto(v.id, patch)
    }
    const up = (e: KeyboardEvent) => {
      if (held && e.key === held) {
        held = null
        endDrag()
      }
    }
    const blur = () => {
      held = null
      endDrag()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // Drag to turn and tilt, pinch or the wheel for the lens angle, and the lining-up helper's clicks.
  useEffect(() => {
    const el = get().gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let press: { x: number; y: number; moved: boolean; start: PhotoView } | null = null
    let pinch: { d: number; fov: number } | null = null
    let wheelTimer: ReturnType<typeof setTimeout> | undefined
    const current = () => {
      const st = usePhotoView.getState()
      const v = st.active ? photoById(st.id) : null
      return v?.at && st.rect && looker.owned ? { v, rect: st.rect, st } : null
    }
    const onDown = (e: PointerEvent) => {
      const c = current()
      if (!c || e.button > 0) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      try {
        el.setPointerCapture?.(e.pointerId)
      } catch {
        // A pointer the browser no longer knows: the drag still works while it stays over the view.
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: c.v.fov }
        press = null
      } else if (pointers.size === 1) press = { x: e.clientX, y: e.clientY, moved: false, start: c.v }
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const c = current()
      if (!c) return
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < 10) return
        // Fingers apart narrows the lens, as zooming in does.
        const t = Math.tan((pinch.fov * Math.PI) / 360) * (pinch.d / d)
        dragPhoto(c.v.id, { fov: clampFov((Math.atan(t) * 360) / Math.PI), lens: 'set' })
        return
      }
      if (!press) return
      const dx = e.clientX - press.x
      const dy = e.clientY - press.y
      if (!press.moved && Math.hypot(dx, dy) > TAP_SLOP) press.moved = true
      if (!press.moved || c.st.picking) return
      // The model follows the finger: degrees per pixel of the photo on screen.
      const per = press.start.fov / c.rect.width
      dragPhoto(c.v.id, { heading: wrap360(press.start.heading - dx * per), tilt: Math.max(-85, Math.min(85, press.start.tilt + dy * per)) })
    }
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return
      const c = current()
      if (pinch) {
        if (pointers.size < 2) {
          pinch = null
          endDrag()
        }
        return
      }
      const tap = press && !press.moved
      press = null
      endDrag()
      if (tap && c?.st.picking) pick(c.v, c.rect, e)
    }
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      press = null
      pinch = null
      endDrag()
    }
    const onWheel = (e: WheelEvent) => {
      const c = current()
      if (!c) return
      e.preventDefault()
      const t = Math.tan((c.v.fov * Math.PI) / 360) * Math.exp(e.deltaY * 0.0015)
      dragPhoto(c.v.id, { fov: clampFov((Math.atan(t) * 360) / Math.PI), lens: 'set' })
      clearTimeout(wheelTimer)
      wheelTimer = setTimeout(endDrag, 400)
    }
    /** A click while lining up: first a point in the photo, then the same point on the model. */
    const pick = (v: PhotoView, rect: PhotoRect, e: PointerEvent) => {
      const st = usePhotoView.getState()
      const p = st.picking
      const shot = looker.shot
      if (!p || !shot) return
      const at = photoPoint(el, rect, e)
      if (!p.photo) {
        if (!at) return announce('That’s outside the photo. Click a point in the photo.')
        st.set({ picking: { ...p, photo: at } })
        announce('Now click the same point on the model.')
        return
      }
      const hit = modelPoint(e, rect, shot)
      if (!hit) return announce('Nothing on the model there. Click a marked point, the house or the ground.')
      const pairs = [...p.pairs, { photo: p.photo, model: hit.at.toArray() as [number, number, number], label: hit.label }]
      const solved = solveAim(
        shot,
        pairs.map(q => ({ photo: q.photo, model: new THREE.Vector3(...q.model) })),
        partsFor(pairs.length, p.extra),
        v.width,
        v.height,
      )
      st.set({ picking: { ...p, pairs, photo: null, problem: solved.problem } })
      if (solved.problem) return announce(solved.problem)
      updatePhoto(v.id, { ...solved.aim, ...(partsFor(pairs.length, p.extra).includes('fov') ? { lens: 'set' as const } : {}), guessed: false })
      announce(`Lined up by ${pairs.length} point${pairs.length === 1 ? '' : 's'}. ${pairs.length < 3 ? 'Add another point to refine it, or Done.' : 'Done when it looks right.'}`)
    }
    /** The model point clicked: a marked point near the click, else the house, else the ground. */
    const modelPoint = (e: PointerEvent, rect: PhotoRect, shot: Shot): { at: THREE.Vector3; label: string } | null => {
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      let best: KnownPoint | null = null
      let bestD = SNAP_PX
      for (const k of knownRef.current) {
        const uv = project(shot, k.at)
        if (!uv) continue
        const d = Math.hypot(rect.left + uv[0] * rect.width - cx, rect.top + uv[1] * rect.height - cy)
        if (d < bestD) {
          best = k
          bestD = d
        }
      }
      if (best) return { at: best.at.clone(), label: best.label }
      const u = (cx - rect.left) / rect.width
      const v = (cy - rect.top) / rect.height
      const dir = rayThrough(shot, u, v)
      const ray = new THREE.Raycaster(shot.eye, dir)
      ray.layers.set(PHOTO_LAYER)
      const house = groupRef.current?.getObjectByName('photo view house')
      const hits = house ? ray.intersectObject(house, true).filter(i => (i.object as THREE.Mesh).isMesh && i.object.visible) : []
      if (hits[0]) return { at: hits[0].point.clone(), label: 'A point on the house' }
      const f = frameRef.current
      const g = groundHit(shot.eye, dir, (x, z) => (f.groundRL([x, -z]) - f.refZ) * f.exag)
      return g ? { at: g, label: 'A point on the ground' } : null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('wheel', onWheel)
      clearTimeout(wheelTimer)
    }
  }, [get, looker])

  if (!active || !photo?.at) return null
  return (
    <group ref={groupRef} userData={{ helper: true }}>
      {show !== 'all' && (
        <group name="photo view house" scale={[1, exag, 1]}>
          {plan && <House3D plan={plan} origin={survey.origin} refZ={refZ} showLevels={null} showRoof showFurniture={false} ground={ground} />}
          {show === 'earthworks' && cutFill && <Earthworks solid={solid} terrain={terrain} refZ={refZ} />}
        </group>
      )}
      <group name="photo view aids">
        {lines && <GroundLines survey={survey} terrain={terrain} refZ={refZ} exag={exag} />}
        {picking && <PickMarks known={known} pairs={picking.pairs} showKnown={!!picking.photo} />}
      </group>
    </group>
  )
}

const CUT = new THREE.Color().setRGB(...CUT_RGB, THREE.SRGBColorSpace)
const FILL = new THREE.Color().setRGB(...FILL_RGB, THREE.SRGBColorSpace)
const EARTH = new THREE.Color().setRGB(0.62, 0.55, 0.45, THREE.SRGBColorSpace)

/** The finished ground only where it is cut or filled: bare earth, tinted as the 3D view tints it. */
function Earthworks({ solid, terrain, refZ }: { solid: SiteSolid; terrain: Terrain; refZ: number }) {
  const geom = useMemo(() => {
    const p = solid.positions
    const idx = solid.indices
    const pos: number[] = []
    const col: number[] = []
    const c = new THREE.Color()
    const dzAt = (i: number) => p[3 * i + 2] - terrain.grid.sample(p[3 * i], p[3 * i + 1])
    for (let t = 0; t + 2 < solid.surfaceIndexCount; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]]
      if (!tri.some(i => Math.abs(dzAt(i)) > 0.05)) continue
      for (const i of tri) {
        pos.push(p[3 * i], p[3 * i + 2] - refZ, -p[3 * i + 1])
        const dz = dzAt(i)
        c.copy(EARTH)
        if (Math.abs(dz) > 0.02) c.lerp(dz < 0 ? CUT : FILL, Math.min(0.6, 0.2 + Math.abs(dz) * 0.3))
        col.push(c.r, c.g, c.b)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [solid, terrain, refZ])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh name="cut and fill" geometry={geom} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  )
}

/** The block's boundary and the natural ground's contours as lines, to line the photo up by. */
function GroundLines({ survey, terrain, refZ, exag }: { survey: Survey; terrain: Terrain; refZ: number; exag: number }) {
  const { boundary, contours } = useMemo(() => {
    const y = (x: number, n: number) => (terrain.grid.sample(x, n) - refZ) * exag + 0.02
    const b: number[] = []
    const ring = [...survey.boundary, survey.boundary[0]]
    for (let k = 0; k + 1 < ring.length; k++) {
      const [x1, y1] = ring[k]
      const [x2, y2] = ring[k + 1]
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.5))
      for (let s = 0; s < steps; s++) {
        const xa = x1 + ((x2 - x1) * s) / steps
        const ya = y1 + ((y2 - y1) * s) / steps
        const xb = x1 + ((x2 - x1) * (s + 1)) / steps
        const yb = y1 + ((y2 - y1) * (s + 1)) / steps
        b.push(xa, y(xa, ya), -ya, xb, y(xb, yb), -yb)
      }
    }
    const c: number[] = []
    for (const line of survey.contours) {
      for (let k = 0; k + 1 < line.pts.length; k++) {
        const [x1, y1] = line.pts[k]
        const [x2, y2] = line.pts[k + 1]
        if (!pointInPolygon((x1 + x2) / 2, (y1 + y2) / 2, survey.boundary)) continue
        c.push(x1, (line.z - refZ) * exag + 0.02, -y1, x2, (line.z - refZ) * exag + 0.02, -y2)
      }
    }
    const geo = (v: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
      return g
    }
    return { boundary: geo(b), contours: geo(c) }
  }, [survey, terrain, refZ, exag])
  return (
    <>
      <lineSegments geometry={contours}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.75} />
      </lineSegments>
      <lineSegments geometry={boundary}>
        <lineBasicMaterial color="#ffd400" />
      </lineSegments>
    </>
  )
}

/** While lining up: the points that can be picked, and the ones picked. */
function PickMarks({ known, pairs, showKnown }: { known: KnownPoint[]; pairs: { model: [number, number, number] }[]; showKnown: boolean }) {
  const all = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(known.map(k => k.at))
    return g
  }, [known])
  const picked = useMemo(() => new THREE.BufferGeometry().setFromPoints(pairs.map(p => new THREE.Vector3(...p.model))), [pairs])
  return (
    <>
      {showKnown && (
        <points geometry={all}>
          <pointsMaterial color="#00a3ff" size={9} sizeAttenuation={false} depthTest={false} />
        </points>
      )}
      <points geometry={picked}>
        <pointsMaterial color="#ff2d55" size={12} sizeAttenuation={false} depthTest={false} />
      </points>
    </>
  )
}
