// Walk-through, inside the 3D view: the camera at eye height in the house, moved in the render
// loop the view already runs. Drag looks round, the arrows and W A S D walk and step sideways, Q
// and E turn, a click or a tap on the floor walks there, and the wheel changes the pace (never a
// zoom through the walls). Walls stop you and doors let you through (./walk.ts). Esc, Leave, a
// camera button or leaving the view puts the camera back where it was. Nothing here sets React
// state per frame: the panel hears only when the room or level changes.

import { useFrame, useThree, type RootState } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { announce } from '../a11y/announce'
import type { Vec2 } from '../lib/geom'
import type { Heightfield } from '../lib/terrain'
import { overlayOpen, shortcutAllowed, singleKeysOn, tabbingNow } from '../nav/keys'
import { lessMotion } from '../phone/camera'
import { useCamera } from '../phone/cameraStore'
import type { Plan } from '../plan/model'
import { showToast } from '../safety/store'
import { buildWalkMap, changeLevel, eyeRL, moveBy, placeWords, SPEEDS, startSpot, type Spot, type WalkMap } from './walk'
import { held, taps, useWalk, walkMove, type WalkMove } from './walkStore'

interface Props {
  plan: Plan
  origin: Vec2
  /** Scene heights are (RL − refZ) × exag, as the house is drawn. */
  refZ: number
  exag: number
  ground: Heightfield
  /** The block's boundary, in the site frame. */
  boundary: Vec2[]
  /** The bearing towards the street (degrees from north), for the front door. */
  street: number
}

/** The parts of OrbitControls the walk uses. */
interface Controls {
  enabled: boolean
  target: THREE.Vector3
  update(): boolean
}

/** Turning speed with Q and E or the pad (radians a second), and one tap's turn and stride. */
const TURN_RATE = 1.6
const TAP_TURN = Math.PI / 12
const TAP_STRIDE = 0.5
/** A drag of this many pixels turns the view this much (radians). */
const LOOK_PER_PX = 0.005
/** A press that moves less than this (px) is a click or a tap, not a look. */
const TAP_SLOP = 6
/** The walk's lens: wider than the view's, as a room is seen from inside it; and the near clip close enough for a small room. */
const WALK_FOV = 70
const WALK_NEAR = 0.05

class Walker {
  map: WalkMap
  private get: () => RootState
  private saved: { pos: THREE.Vector3; target: THREE.Vector3 | null; fov: number; near: number; focus: HTMLElement | null } | null = null
  spot: Spot = { level: 0, at: [0, 0], heading: 0 }
  private pitch = -0.08
  private eyeY = 0
  private goal: Vec2 | null = null
  private place = ''
  private refZ: number
  private exag: number
  /** The ceiling and the light, which show only while walking. */
  private parts3d: { ceiling: RefObject<THREE.Mesh | null>; light: RefObject<THREE.AmbientLight | null> }

  constructor(get: () => RootState, map: WalkMap, refZ: number, exag: number, parts3d: Walker['parts3d']) {
    this.get = get
    this.parts3d = parts3d
    this.map = map
    this.refZ = refZ
    this.exag = exag
  }

  private get ceiling() {
    return this.parts3d.ceiling.current
  }

  private get light() {
    return this.parts3d.light.current
  }

  get active() {
    return this.saved !== null
  }

  update(map: WalkMap, refZ: number, exag: number) {
    this.map = map
    this.refZ = refZ
    this.exag = exag
    // A change to the plan can take away the level you are on.
    if (this.active && !map.levels[this.spot.level]) this.leave(true)
    else if (this.active) this.report(true)
  }

  private sceneY(rl: number) {
    return (rl - this.refZ) * this.exag
  }

  private parts() {
    const s = this.get()
    return { camera: s.camera as THREE.PerspectiveCamera, controls: s.controls as unknown as Controls | null, s }
  }

  enter(spot: Spot) {
    const { camera, controls, s } = this.parts()
    if (!this.saved) {
      this.saved = { pos: camera.position.clone(), target: controls ? controls.target.clone() : null, fov: camera.fov, near: camera.near, focus: document.activeElement as HTMLElement | null }
      if (controls) controls.enabled = false
      // The view's own clicks (reading the ground's level, pinning it) wait until the walk ends.
      s.setEvents({ enabled: false })
      camera.fov = WALK_FOV
      camera.near = WALK_NEAR
      camera.updateProjectionMatrix()
    }
    this.spot = spot
    this.pitch = -0.08
    this.goal = null
    this.eyeY = this.sceneY(eyeRL(this.map, spot.level, spot.at))
    this.place = ''
    this.apply()
    this.report(false)
    useWalk.getState().set({ active: true })
    announce(`Walking through: ${this.place}. ${useWalk.getState().up || useWalk.getState().down ? 'Go up and Go down change level. ' : ''}Esc leaves.`)
    // The keys walk while the view has the focus.
    ;(s.gl.domElement.closest('.scene-keys') as HTMLElement | null)?.focus({ preventScroll: true })
  }

  /** Stop walking; `restore` puts the camera back where it was (not when a camera button is taking it elsewhere, or the view has gone). */
  leave(restore: boolean, say = true) {
    const saved = this.saved
    if (!saved) return
    this.saved = null
    held.clear()
    taps.length = 0
    this.goal = null
    const { camera, controls, s } = this.parts()
    camera.fov = saved.fov
    camera.near = saved.near
    camera.updateProjectionMatrix()
    if (restore) {
      camera.position.copy(saved.pos)
      if (controls && saved.target) controls.target.copy(saved.target)
    }
    if (controls) {
      controls.enabled = true
      controls.update()
    }
    s.setEvents({ enabled: true })
    if (this.ceiling) this.ceiling.visible = false
    if (this.light) this.light.visible = false
    useWalk.getState().set({ active: false, place: '', up: false, down: false })
    if (say) announce('Left the walk-through.')
    if (restore && saved.focus?.isConnected) saved.focus.focus({ preventScroll: true })
  }

  /** The camera where the walker stands, looking their way; the orbit's target kept just ahead, so a camera button moves on from here. */
  private apply() {
    const { camera, controls } = this.parts()
    const [x, y] = this.spot.at
    const h = this.spot.heading
    const c = Math.cos(this.pitch)
    camera.position.set(x, this.eyeY, -y)
    const ahead = new THREE.Vector3(x + Math.cos(h) * c, this.eyeY + Math.sin(this.pitch), -(y + Math.sin(h) * c))
    camera.lookAt(ahead)
    if (controls) controls.target.copy(ahead)
  }

  /** The room and level, told to the panel (and said) only when they change. */
  private report(quiet: boolean) {
    const words = placeWords(this.map, this.spot.level, this.spot.at)
    if (this.ceiling) this.ceiling.visible = true
    if (this.light) this.light.visible = true
    if (words === this.place) return
    const first = this.place === ''
    this.place = words
    useWalk.getState().set({ place: words, level: this.spot.level, up: !!this.map.levels[this.spot.level + 1], down: this.spot.level > 0 })
    if (!quiet && !first) announce(words)
  }

  look(dx: number, dy: number) {
    this.spot = { ...this.spot, heading: this.spot.heading - dx * LOOK_PER_PX }
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy * LOOK_PER_PX))
    this.apply()
  }

  /** A click or a tap at a point on the canvas: walk to the floor there (or towards the wall). */
  walkTo(ndc: THREE.Vector2) {
    const { camera, s } = this.parts()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(s.scene.children, true).find(i => i.object !== this.ceiling && (i.object as THREE.Mesh).isMesh && i.object.visible)
    if (!hit || hit.distance > 40) return
    this.goal = [hit.point.x, -hit.point.z]
    if (lessMotion()) {
      // Reduced motion: there at once, still stopped by the walls.
      this.spot = { ...this.spot, at: moveBy(this.map, this.spot.level, this.spot.at, [this.goal[0] - this.spot.at[0], this.goal[1] - this.spot.at[1]]) }
      this.goal = null
      this.eyeY = this.sceneY(eyeRL(this.map, this.spot.level, this.spot.at))
      this.apply()
      this.report(false)
    }
  }

  climb(dir: 1 | -1) {
    const to = changeLevel(this.map, this.spot, dir)
    if (!to) return
    this.spot = to
    this.goal = null
    this.eyeY = this.sceneY(eyeRL(this.map, to.level, to.at))
    this.apply()
    this.report(false)
  }

  tick(dt: number) {
    if (!this.active) return
    const speed = SPEEDS[useWalk.getState().speed] ?? SPEEDS[1]
    const keys = new Set<WalkMove>(held)
    let turn = 0
    let fwd = 0
    let side = 0
    if (keys.has('turnLeft')) turn += TURN_RATE * dt
    if (keys.has('turnRight')) turn -= TURN_RATE * dt
    if (keys.has('forward')) fwd += speed * dt
    if (keys.has('back')) fwd -= speed * dt
    if (keys.has('left')) side += speed * dt
    if (keys.has('right')) side -= speed * dt
    for (const t of taps.splice(0)) {
      if (t === 'turnLeft') turn += TAP_TURN
      if (t === 'turnRight') turn -= TAP_TURN
      if (t === 'forward') fwd += TAP_STRIDE
      if (t === 'back') fwd -= TAP_STRIDE
      if (t === 'left') side += TAP_STRIDE
      if (t === 'right') side -= TAP_STRIDE
    }
    const h = this.spot.heading + turn
    let delta: Vec2 = [Math.cos(h) * fwd - Math.sin(h) * side, Math.sin(h) * fwd + Math.cos(h) * side]
    // A key takes over from a walk to a clicked spot.
    if (fwd || side) this.goal = null
    else if (this.goal) {
      const to: Vec2 = [this.goal[0] - this.spot.at[0], this.goal[1] - this.spot.at[1]]
      const d = Math.hypot(to[0], to[1])
      const step = Math.max(speed, 1.4) * dt
      if (d < 0.05) this.goal = null
      else delta = d <= step ? to : [(to[0] / d) * step, (to[1] / d) * step]
    }
    let at = this.spot.at
    if (delta[0] || delta[1]) {
      at = moveBy(this.map, this.spot.level, this.spot.at, delta)
      // Blocked: a walk to a clicked spot ends where the wall stopped it.
      if (this.goal && Math.hypot(at[0] - this.spot.at[0], at[1] - this.spot.at[1]) < 1e-4) this.goal = null
    }
    const moved = at !== this.spot.at || turn !== 0
    const eye = this.sceneY(eyeRL(this.map, this.spot.level, at))
    const settled = Math.abs(eye - this.eyeY) < 1e-3
    if (!moved && settled) return
    this.spot = { level: this.spot.level, at, heading: h }
    this.eyeY = settled || lessMotion() ? eye : this.eyeY + (eye - this.eyeY) * Math.min(1, dt * 8)
    this.apply()
    if (moved) this.report(false)
  }
}

export function WalkRig({ plan, origin, refZ, exag, ground, boundary, street }: Props) {
  const get = useThree(s => s.get)
  const ready = useThree(s => !!s.controls)
  const map = useMemo(() => buildWalkMap(plan, origin, p => ground.sample(p[0], p[1]), boundary), [plan, origin, ground, boundary])
  const ceilingRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.AmbientLight>(null)
  const [walker] = useState(() => new Walker(get, map, refZ, exag, { ceiling: ceilingRef, light: lightRef }))
  const streetRef = useRef(street)
  useEffect(() => void (streetRef.current = street), [street])
  useEffect(() => walker.update(map, refZ, exag), [walker, map, refZ, exag])

  // The house's ceilings, one level at a time: seen from inside, the roof above is open underneath.
  const ceilingGeom = useMemo(() => {
    const shapes = map.levels.map(l => l.outlines.map(o => new THREE.Shape(o.map(p => new THREE.Vector2(p[0], p[1])))))
    return shapes.map(list => {
      const g = new THREE.ShapeGeometry(list)
      // Shape (x, y) to the scene's (x, −z); its face looks up, so the material shows its back, from below.
      g.rotateX(-Math.PI / 2)
      return g
    })
  }, [map])
  useEffect(() => () => ceilingGeom.forEach(g => g.dispose()), [ceilingGeom])
  const active = useWalk(s => s.active)
  // The ceiling follows the level walked on.
  const level = useWalk(s => s.level)

  // Asks from the buttons, the menu and a room's menu; a stop; going up or down; a camera button.
  useEffect(() => {
    if (!ready) return
    const begin = (room: string | null) => {
      useWalk.setState({ ask: null })
      const spot = startSpot(walker.map, { room, street: streetRef.current })
      if (!spot) {
        showToast({ text: 'There’s no house to walk through yet: draw its walls on the plan first.' })
        return
      }
      walker.enter(spot)
    }
    const pending = useWalk.getState().ask
    if (pending) begin(pending.room)
    const unsub = useWalk.subscribe((s, prev) => {
      if (s.ask && s.ask !== prev.ask) begin(s.ask.room)
      if (s.leaveN !== prev.leaveN) walker.leave(true)
      if (s.climb && s.climb !== prev.climb) walker.climb(s.climb.dir)
    })
    const unCam = useCamera.subscribe((s, prev) => {
      // A camera button takes the view somewhere else: the walk ends there, not back where it began.
      if (s.command !== prev.command && walker.active) walker.leave(false)
    })
    return () => {
      unsub()
      unCam()
    }
  }, [walker, ready])

  // Leaving the 3D view (or opening another project, which starts it afresh) ends the walk.
  useEffect(() => () => walker.leave(false, false), [walker])

  // The keys: under the one rule for shortcuts, and only while walking.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!walker.active || e.ctrlKey || e.metaKey || e.altKey) return
      if (!shortcutAllowed(e, { overlay: overlayOpen(), tabbing: tabbingNow(), singleKeys: singleKeysOn() })) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        useWalk.getState().leave()
        return
      }
      const m = walkMove(e.key)
      if (!m) return
      e.preventDefault()
      e.stopPropagation()
      held.add(m)
    }
    const up = (e: KeyboardEvent) => {
      const m = walkMove(e.key)
      if (m) held.delete(m)
    }
    const clear = () => held.clear()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', clear)
    }
  }, [walker])

  // Drag to look, click or tap to walk there, the wheel for the pace.
  useEffect(() => {
    const el = get().gl.domElement
    let press: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null
    const onDown = (e: PointerEvent) => {
      if (!walker.active || press || e.button > 0) return
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false }
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id || !walker.active) return
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press.moved = true
      if (press.moved) walker.look(e.clientX - press.lastX, e.clientY - press.lastY)
      press.lastX = e.clientX
      press.lastY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return
      const tap = !press.moved
      press = null
      if (!tap || !walker.active) return
      const r = el.getBoundingClientRect()
      walker.walkTo(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1))
    }
    const onCancel = () => (press = null)
    const onWheel = (e: WheelEvent) => {
      if (!walker.active) return
      e.preventDefault()
      const s = useWalk.getState()
      const speed = Math.max(0, Math.min(SPEEDS.length - 1, s.speed + (e.deltaY < 0 ? 1 : -1)))
      if (speed !== s.speed) s.set({ speed })
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
    }
  }, [walker, get])

  // A slow frame still walks its distance (moveBy strides it), up to a quarter second.
  useFrame((_, dt) => walker.tick(Math.min(dt, 0.25)))

  return (
    <>
      {ceilingGeom[level] && map.levels[level] && (
        <mesh ref={ceilingRef} geometry={ceilingGeom[level]} visible={active} position-y={(map.levels[level].rl + map.levels[level].height - refZ) * exag - 0.01}>
          <meshStandardMaterial color="#f3f0ea" emissive="#8f8a82" roughness={0.95} side={THREE.BackSide} />
        </mesh>
      )}
      {/* A soft light while walking, so a room in the shade of its own roof isn't dark. Even, with no
          highlight of its own: a light at the eye glints off every window straight ahead. */}
      <ambientLight ref={lightRef} visible={active} intensity={0.6} color="#fff4e6" />
    </>
  )
}
