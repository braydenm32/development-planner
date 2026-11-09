// Inside the 3D view: moves the camera to the presets, smoothly, remembers where it was
// left for each project, and tames the controls for fingers. Only the new layout adds it.

import { useFrame, useThree, type RootState } from '@react-three/fiber'
import { useContext, useEffect, useState } from 'react'
import type * as THREE from 'three'
import { CanvasFrame } from '../components/canvasFrame'
import { between, levelLens, loadPose, moveDuration, northUp, presetPose, savePose, toSpherical, type CameraCommand, type Frame, type Pose, type Preset, type Vec3 } from './camera'
import { useCamera } from './cameraStore'
import { openArea } from './frame'

/** The parts of OrbitControls the rig uses. */
interface Controls extends THREE.EventDispatcher<{ start: object; change: object; end: object }> {
  target: THREE.Vector3
  enableDamping: boolean
  dampingFactor: number
  rotateSpeed: number
  zoomSpeed: number
  panSpeed: number
  update(): boolean
}

interface Live {
  frame: Frame
  /** The shape of the part of the screen nothing covers. */
  aspect: number
  /** How much of the screen's height that is (1 when nothing covers it). */
  freeHeight: number
  /** Where to remember the camera; null to start fresh each time. */
  storageKey: string | null
  /** The Top of view bearing the view started under: a new one starts the camera afresh. */
  upBearing: number
  /** A phone or a desktop; both open framed on the house now (C18). */
  phone: boolean
}

/** The camera's moves, outside React: it works on the scene's camera and controls directly. */
class Rig {
  private anim: { from: Pose; to: Pose; start: number; dur: number; preset: Preset | null } | null = null
  /** Set while the rig moves the camera itself, so its moves aren't taken as the person's. */
  private moving = false
  private live: Live | null = null
  private get: () => RootState
  /** The view's offset to centre it in the open part of the screen, and the rise looking level added to it (px). */
  private shift = { w: 0, h: 0, dx: 0, dy: 0, rise: 0 }
  /** The view's own field of view, before the lens looking level widens it. */
  private baseFov: number | null = null

  constructor(get: () => RootState) {
    this.get = get
  }

  /** What the view is showing now: the frame, the screen's shape, and where to remember. */
  update(live: Live) {
    this.live = live
  }

  private parts() {
    const s = this.get()
    return { camera: s.camera as THREE.PerspectiveCamera, controls: s.controls as unknown as Controls | null }
  }

  current(): Pose | null {
    const { camera, controls } = this.parts()
    return controls ? { position: camera.position.toArray() as Vec3, target: controls.target.toArray() as Vec3 } : null
  }

  private apply(p: Pose) {
    const { camera, controls } = this.parts()
    if (!controls) return
    this.moving = true
    camera.position.set(...p.position)
    controls.target.set(...p.target)
    controls.update()
    this.moving = false
  }

  remember(p: Pose) {
    if (this.live?.storageKey) savePose(this.live.storageKey, p, this.live.upBearing)
  }

  go(to: CameraCommand, animate: boolean) {
    const { camera, controls } = this.parts()
    const from = this.current()
    if (!from || !controls || !this.live) return
    // Fit the preset to the part of the screen nothing covers.
    const fov = (2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * this.live.freeHeight) * 180) / Math.PI
    const target = to === 'north' ? northUp(from) : presetPose(to, this.live.frame, fov, this.live.aspect)
    const preset = to === 'north' ? null : to
    if (!animate) {
      this.apply(target)
      useCamera.getState().setActive(preset)
      return
    }
    // Damping would carry on the last flick after the move ends; hold it off until then.
    controls.enableDamping = false
    this.anim = { from, to: target, start: performance.now(), dur: moveDuration(from, target), preset }
  }

  /** Start where the camera was left in this project, at a preset asked for on the way here, or framed on the house. */
  start() {
    const live = this.live
    if (!live) return
    const queued = useCamera.getState().queued
    const saved = live.storageKey ? loadPose(live.storageKey) : null
    if (queued) {
      useCamera.getState().queue(null)
      this.go(queued, false)
      const p = this.current()
      if (p) this.remember(p)
    } else if (saved && saved.up !== undefined && Math.abs(saved.up - live.upBearing) > 0.01) {
      // Top of view changed since: keep the view's own start, looking that way.
      useCamera.getState().setActive(null)
    } else if (saved) {
      this.apply(saved)
      useCamera.getState().setActive(null)
    } else this.go('house', false)
  }

  /**
   * Centre the view in the part of the screen nothing covers (between the camera buttons
   * and the peek sheet on a phone, beside the tab panel on a desktop), by moving the picture
   * `dx`, `dy` pixels (see openArea).
   */
  offset(w: number, h: number, dx: number, dy: number) {
    this.shift = { ...this.shift, w, h, dx, dy }
    this.applyShift()
  }

  private applyShift() {
    const { camera } = this.parts()
    const { w, h, dx, rise } = this.shift
    // The rise moves the picture down: a view offset's positive y moves it up.
    const dy = this.shift.dy - rise
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) camera.clearViewOffset()
    else camera.setViewOffset(w, h, dx, dy, w, h)
    camera.updateProjectionMatrix()
  }

  /** Looking level, the lens widens and the picture rises (levelLens) so the house above the eye line shows: checked each frame, as the camera moves. */
  level() {
    const p = this.current()
    if (!p || !this.shift.h) return
    const { camera } = this.parts()
    this.baseFov ??= camera.fov
    const o: Vec3 = [p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]]
    const lens = levelLens(toSpherical(o).phi, this.baseFov, this.shift.h * (this.live?.freeHeight ?? 1))
    if (Math.abs(lens.rise - this.shift.rise) < 0.5 && Math.abs(lens.fov - camera.fov) < 0.05) return
    this.shift.rise = lens.rise
    camera.fov = lens.fov
    this.applyShift()
  }

  /** Fingers: slower turning and pinching, and less glide after letting go. Returns the undo. */
  tune(): () => void {
    const { controls } = this.parts()
    if (!controls) return () => {}
    const before = { rotateSpeed: controls.rotateSpeed, zoomSpeed: controls.zoomSpeed, panSpeed: controls.panSpeed, dampingFactor: controls.dampingFactor }
    Object.assign(controls, { rotateSpeed: 0.55, zoomSpeed: 0.6, panSpeed: 0.7, dampingFactor: 0.16 })
    return () => Object.assign(controls, before)
  }

  /**
   * The person takes over: stop any move, the preset no longer shows, and remember where
   * they leave it: when the finger lifts, again once any glide settles, and before the
   * phone puts the page away.
   */
  listen(): () => void {
    const { controls } = this.parts()
    if (!controls) return () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    const save = () => {
      clearTimeout(timer)
      if (!dirty) return
      dirty = false
      const p = this.current()
      if (p) this.remember(p)
    }
    const onStart = () => {
      if (!this.anim) return
      this.anim = null
      controls.enableDamping = true
    }
    const onChange = () => {
      // The rig's own moves remember themselves when they end.
      if (this.moving) return
      if (!this.anim && useCamera.getState().active) useCamera.getState().setActive(null)
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(save, 400)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('change', onChange)
    controls.addEventListener('end', save)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('change', onChange)
      controls.removeEventListener('end', save)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
      save()
    }
  }

  tick(now: number) {
    const a = this.anim
    const { controls } = this.parts()
    if (!a || !controls) return
    const t = Math.min((now - a.start) / a.dur, 1)
    this.apply(between(a.from, a.to, t))
    if (t < 1) return
    this.anim = null
    controls.enableDamping = true
    useCamera.getState().setActive(a.preset)
    this.remember(a.to)
  }
}

interface Props extends Omit<Live, 'aspect' | 'freeHeight'> {
  /** The plan has loaded. A project opens its survey first and its plan a moment later. */
  hasPlan: boolean
}

export function CameraRig({ frame, storageKey, upBearing, phone, hasPlan }: Props) {
  const get = useThree(s => s.get)
  const ready = useThree(s => !!s.controls)
  const size = useThree(s => s.size)
  const [rig] = useState(() => new Rig(get))
  // What floats over the view: on a phone the camera buttons and the peek sheet, top and
  // bottom; on a desktop the tab panel, the selection and the view bars.
  const insets = useContext(CanvasFrame)?.insets
  const open = openArea(size.width, size.height, insets, phone)

  useEffect(() => rig.update({ frame, aspect: open.aspect, freeHeight: open.freeHeight, storageKey, upBearing, phone }))

  useEffect(() => rig.offset(size.width, size.height, open.dx, open.dy), [rig, size.width, size.height, open.dx, open.dy])

  useEffect(() => (ready && phone ? rig.tune() : undefined), [rig, ready, phone])

  // Once the controls exist: where to start, then listen for the person and for the buttons.
  // The start is worked out again when the plan arrives, as it brings the house's bearing
  // (for Top of view) and the house to frame.
  useEffect(() => {
    if (!ready) return
    rig.start()
    let seen = useCamera.getState().command?.n ?? 0
    const unsub = useCamera.subscribe(s => {
      const c = s.command
      if (!c || c.n === seen) return
      seen = c.n
      rig.go(c.to, c.animate)
    })
    const unlisten = rig.listen()
    return () => {
      unsub()
      unlisten()
    }
  }, [rig, ready, hasPlan, upBearing])

  useFrame(() => {
    rig.tick(performance.now())
    rig.level()
  })

  return null
}
