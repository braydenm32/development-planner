// A small plan of the block for the photo view: the boundary, the house, and where the photo was
// taken with the way it faced and how wide it saw. Press to put the spot there and drag the way you
// faced; drag the spot to move it; press anywhere else to face that way. From the keyboard, the
// arrows move the spot (up is north) and Q and E turn. Each drag or key press is one undo step.

import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { centroidOf, type Vec2 } from '../lib/geom'
import { sortedLevels, toSite, type Plan } from '../plan/model'
import { wrap360, type PhotoView } from './model'
import { STEP_DEG, STEP_M } from './keySteps'
import { dragPhoto, endDrag } from './store'

interface Props {
  photo: PhotoView
  boundary: Vec2[]
  origin: Vec2
  plan: Plan | null
  /** Setting the spot for the first time: bigger, and a press always puts the spot there. */
  placing: boolean
  width: number
  height: number
}

const PAD = 14
const SPOT_HIT = 16

export function InsetPlan({ photo, boundary, origin, plan, placing, width, height }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ mode: 'spot' | 'face' | 'place'; x: number; y: number; moved: boolean } | null>(null)
  const spot: Vec2 | null = photo.at ? [photo.at[0] - origin[0], photo.at[1] - origin[1]] : null

  const walls = useMemo(() => {
    if (!plan) return []
    const ground = sortedLevels(plan)[0]?.id
    return plan.walls.filter(w => w.kind !== 'internal' && w.level === ground).map(w => [toSite(w.a, plan.placement, origin), toSite(w.b, plan.placement, origin)] as [Vec2, Vec2])
  }, [plan, origin])

  // Fit the block (and the spot, once set) with a margin; north up.
  const map = useMemo(() => {
    const pts = [...boundary, ...(spot ? [spot] : [])]
    const xs = pts.map(p => p[0])
    const ys = pts.map(p => p[1])
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const s = Math.min((width - 2 * PAD) / Math.max(1, x1 - x0), (height - 2 * PAD) / Math.max(1, y1 - y0))
    const ox = PAD + (width - 2 * PAD - (x1 - x0) * s) / 2
    const oy = PAD + (height - 2 * PAD - (y1 - y0) * s) / 2
    return {
      s,
      to: (p: Vec2): Vec2 => [ox + (p[0] - x0) * s, oy + (y1 - p[1]) * s],
      from: (q: Vec2): Vec2 => [x0 + (q[0] - ox) / s, y1 - (q[1] - oy) / s],
    }
    // The spot is left out of the key on purpose while it moves: the plan doesn't rescale under the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundary, width, height, !!spot])

  const local = (e: PointerEvent): Vec2 => {
    const r = svg.current!.getBoundingClientRect()
    return map.from([((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height])
  }
  const grid = (p: Vec2): Vec2 => [Math.round((p[0] + origin[0]) * 1000) / 1000, Math.round((p[1] + origin[1]) * 1000) / 1000]
  const bearingTo = (from: Vec2, to: Vec2) => wrap360((Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI)

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button > 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = local(e)
    const near = spot && Math.hypot((p[0] - spot[0]) * map.s, (p[1] - spot[1]) * map.s) < SPOT_HIT
    if (near) drag.current = { mode: 'spot', x: e.clientX, y: e.clientY, moved: false }
    else if (placing || !spot) {
      drag.current = { mode: 'place', x: e.clientX, y: e.clientY, moved: false }
      dragPhoto(photo.id, { at: grid(p), guessed: false })
    } else {
      drag.current = { mode: 'face', x: e.clientX, y: e.clientY, moved: false }
      dragPhoto(photo.id, { heading: bearingTo(spot, p), guessed: false })
    }
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true
    if (!d.moved) return
    const p = local(e)
    if (d.mode === 'spot') dragPhoto(photo.id, { at: grid(p), guessed: false })
    // Placing: the press put the spot down, and the drag from it is the way faced.
    else if (photo.at) dragPhoto(photo.id, { heading: bearingTo([photo.at[0] - origin[0], photo.at[1] - origin[1]], p) })
  }
  const onUp = () => {
    drag.current = null
    endDrag()
  }

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const moves: Record<string, Vec2> = { ArrowUp: [0, STEP_M], ArrowDown: [0, -STEP_M], ArrowLeft: [-STEP_M, 0], ArrowRight: [STEP_M, 0] }
    let patch: Partial<PhotoView> | null = null
    if (moves[k]) {
      // No spot yet: the first press puts it in the middle of the block.
      const at = spot ?? centroidOf(boundary)
      patch = { at: grid(spot ? [at[0] + moves[k][0], at[1] + moves[k][1]] : at), guessed: false }
    } else if (k === 'q' || k === 'e') patch = { heading: wrap360(photo.heading + (k === 'q' ? -STEP_DEG : STEP_DEG)) }
    if (!patch) return
    e.preventDefault()
    dragPhoto(photo.id, patch)
  }

  const ring = boundary.map(p => map.to(p).join(',')).join(' ')
  const wedge = (() => {
    if (!spot) return null
    const c = map.to(spot)
    const r = Math.min(width, height) * 0.38
    const ray = (deg: number): Vec2 => {
      const a = (deg * Math.PI) / 180
      return [c[0] + Math.sin(a) * r, c[1] - Math.cos(a) * r]
    }
    const a = ray(photo.heading - photo.fov / 2)
    const b = ray(photo.heading + photo.fov / 2)
    return { c, d: `M${c[0]},${c[1]} L${a[0]},${a[1]} A${r},${r} 0 0 1 ${b[0]},${b[1]} Z`, ahead: ray(photo.heading) }
  })()

  return (
    <svg
      ref={svg}
      className={`pv-inset${placing ? ' placing' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      tabIndex={0}
      role="application"
      aria-roledescription="small plan"
      aria-label={
        spot
          ? `Where the photo was taken: facing ${Math.round(photo.heading)}°. Drag the dot to move it, press elsewhere to face that way. Arrow keys move it, Q and E turn.`
          : 'Where was the photo taken? Press the spot on this plan of the block, then drag the way you faced. Or press an arrow key to start in the middle.'
      }
      data-owns-keys
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onKeyDown={onKey}
      onKeyUp={endDrag}
      onBlur={endDrag}
    >
      <rect x={0} y={0} width={width} height={height} className="pv-inset-bg" />
      <polygon points={ring} className="pv-inset-block" />
      {walls.map(([a, b], i) => {
        const p = map.to(a)
        const q = map.to(b)
        return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="pv-inset-wall" />
      })}
      {wedge && (
        <>
          <path d={wedge.d} className="pv-inset-wedge" />
          <line x1={wedge.c[0]} y1={wedge.c[1]} x2={wedge.ahead[0]} y2={wedge.ahead[1]} className="pv-inset-ahead" />
          <circle cx={wedge.c[0]} cy={wedge.c[1]} r={6} className={`pv-inset-spot${photo.guessed ? ' guessed' : ''}`} />
        </>
      )}
      <text x={width - 8} y={14} textAnchor="end" className="pv-inset-north">
        N ↑
      </text>
    </svg>
  )
}
