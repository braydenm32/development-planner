import { useMemo, type ReactNode } from 'react'
import { CUT_RGB, FILL_RGB, rgbCss } from '../lib/colors'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { onNaturalGround, roomFloorType } from '../plan/floorTypes'
import { planarFaces, roomShape } from '../plan/geometry'
import { floorVsGround, formatOffset, groundRange, groundUnder, levelFloorRL, type GroundOverlay as Overlay, type WorksOverlay as Works } from '../plan/groundOverlay'
import type { Plan, Room } from '../plan/model'

const FILL = rgbCss(FILL_RGB)
const CUT = rgbCss(CUT_RGB)

/**
 * How strongly each layer of the tint is painted, so that once they stack the ground is
 * 8% tinted within 0.5 m of the floor and 5% more for each 0.5 m past that. Upper levels
 * get half as much, as their floors are well clear of the ground almost everywhere.
 */
function layerOpacity(k: number, subtle: boolean): number {
  const total = (n: number) => (n < 0 ? 0 : (0.08 + 0.05 * n) * (subtle ? 0.5 : 1))
  return 1 - (1 - total(k)) / (1 - total(k - 1))
}

interface OverlayProps {
  overlay: Overlay
  /** Site frame to screen pixels. */
  toScreen: (p: Vec2) => Vec2
  size: { w: number; h: number }
  /** Upper levels get a lighter tint. */
  subtle: boolean
  /** Inside the house or an outdoor area, in the site frame; the label keeps out of them where it can. */
  avoid: (p: Vec2) => boolean
  /**
   * Keep the tint near the house: screen-space shapes it fades out around, `reach` pixels
   * past them. Null tints the whole block.
   */
  near: { filled: string; lines: string; reach: number } | null
  /** Whether a site point is within the tinted area, so the line's label stays on it. */
  within: (p: Vec2) => boolean
}

/** The natural ground against the floor being drawn: tinted where the floor is above or below it, with the line where they meet. */
export function GroundOverlay({ overlay: o, toScreen, size, subtle, avoid, near, within }: OverlayProps) {
  // Grid units to screen, as one transform, so the paths stay the same while the view moves.
  const at = toScreen([o.x0, o.y0])
  const ex = toScreen([o.x0 + o.cell, o.y0])
  const ey = toScreen([o.x0, o.y0 + o.cell])
  const matrix = [ex[0] - at[0], ex[1] - at[1], ey[0] - at[0], ey[1] - at[1], at[0], at[1]].map(n => n.toFixed(4)).join(' ')
  const label = meetsLabel(o.meets, toScreen, size, avoid, within)
  const box = { x: 0, y: 0, width: size.w, height: size.h }
  // Hatched as well as shaded, so this tint (the floor against the ground, over the whole block)
  // never reads as the cut and fill itself, which Earthworks › Cut & fill shows solid.
  const unit = Math.hypot(ex[0] - at[0], ex[1] - at[1]) || 1
  const gap = 12 / unit
  return (
    <g className="ground-overlay" mask={near ? 'url(#ground-near)' : undefined}>
      {near && (
        <>
          {/* A soft edge, so the tint fades out rather than stopping at a hard line. */}
          <filter id="ground-near-soft" filterUnits="userSpaceOnUse" {...box}>
            <feGaussianBlur stdDeviation={(near.reach * 0.2).toFixed(1)} />
          </filter>
          <mask id="ground-near" maskUnits="userSpaceOnUse" {...box}>
            <g filter="url(#ground-near-soft)" fill="none" stroke="#fff" strokeWidth={(near.reach * 2).toFixed(1)} strokeLinejoin="round" strokeLinecap="round">
              <path d={near.filled} fill="#fff" />
              <path d={near.lines} />
            </g>
          </mask>
        </>
      )}
      <g transform={`matrix(${matrix})`} clipPath="url(#ground-clip)">
        <clipPath id="ground-clip">
          <path d={o.clip} />
        </clipPath>
        <defs>
          {(['above', 'below'] as const).map(side => (
            <pattern key={side} id={`ground-hatch-${side}`} patternUnits="userSpaceOnUse" width={gap} height={gap} patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={gap} stroke={side === 'above' ? FILL : CUT} strokeWidth={1.2 / unit} strokeOpacity={subtle ? 0.18 : 0.32} />
            </pattern>
          ))}
        </defs>
        {o.above.map((d, k) => d && <path key={`above-${k}`} d={d} fill={FILL} fillOpacity={layerOpacity(k, subtle)} fillRule="evenodd" />)}
        {o.below.map((d, k) => d && <path key={`below-${k}`} d={d} fill={CUT} fillOpacity={layerOpacity(k, subtle)} fillRule="evenodd" />)}
        {o.above[0] && <path d={o.above[0]} fill="url(#ground-hatch-above)" fillRule="evenodd" />}
        {o.below[0] && <path d={o.below[0]} fill="url(#ground-hatch-below)" fillRule="evenodd" />}
        <path className="ground-meets-halo" d={o.meetsPath} />
        <path className="ground-meets" d={o.meetsPath} />
      </g>
      {label && (
        <text className="ground-meets-label" x={label.x} y={label.y} transform={`rotate(${label.angle} ${label.x} ${label.y})`} textAnchor="middle">
          Ground meets floor (RL {o.rl.toFixed(2)})
        </text>
      )}
    </g>
  )
}

/** How strongly each layer of the works tint is painted: clearly there from the first 20 mm, a shade more every half metre. */
const worksOpacity = (k: number) => (k === 0 ? 0.22 : 0.12)

/**
 * The cut and fill itself, on Earthworks › Cut & fill: the finished ground against the natural
 * ground, solid and only where the earth is moved, with a line round the edge of the works.
 */
export function WorksTint({ overlay: o, toScreen }: { overlay: Works; toScreen: (p: Vec2) => Vec2 }) {
  const at = toScreen([o.x0, o.y0])
  const ex = toScreen([o.x0 + o.cell, o.y0])
  const ey = toScreen([o.x0, o.y0 + o.cell])
  const matrix = [ex[0] - at[0], ex[1] - at[1], ey[0] - at[0], ey[1] - at[1], at[0], at[1]].map(n => n.toFixed(4)).join(' ')
  return (
    <g className="ground-overlay works-tint">
      <g transform={`matrix(${matrix})`} clipPath="url(#works-clip)">
        <clipPath id="works-clip">
          <path d={o.clip} />
        </clipPath>
        {o.fill.map((d, k) => d && <path key={`fill-${k}`} d={d} fill={FILL} fillOpacity={worksOpacity(k)} fillRule="evenodd" />)}
        {o.cut.map((d, k) => d && <path key={`cut-${k}`} d={d} fill={CUT} fillOpacity={worksOpacity(k)} fillRule="evenodd" />)}
        <path className="works-edge" d={o.edge} />
      </g>
    </g>
  )
}

/** Half the length of the line's label, in pixels. */
const LABEL_HALF = 88

/**
 * Where to write the label on the line: the point nearest the middle of the view with room
 * for the label along the line, clear of the panels round the edge of the plan, and outside
 * the house if it can be.
 */
function meetsLabel(
  meets: Vec2[][],
  toScreen: (p: Vec2) => Vec2,
  size: { w: number; h: number },
  avoid: (p: Vec2) => boolean,
  within: (p: Vec2) => boolean,
) {
  type Spot = { x: number; y: number; angle: number; d: number }
  // Keep off the level chip, the ground key and the status bar.
  const clear = ([x, y]: Vec2) => x > 16 && x < size.w - 16 && y > 100 && y < size.h - 140 && !(x > size.w - 330 && y < 400)
  let best: Spot | null = null
  let fallback: Spot | null = null
  for (const line of meets) {
    const s = line.map(toScreen)
    for (let i = 1; i + 1 < s.length; i++) {
      const [x, y] = s[i]
      const d = Math.hypot(x - size.w / 2, y - size.h / 2)
      if ((best && d >= best.d) || !clear(s[i])) continue
      // The ends of the label, along the line.
      let a = i
      let b = i
      while (a > 0 && Math.hypot(s[a][0] - x, s[a][1] - y) < LABEL_HALF) a--
      while (b < s.length - 1 && Math.hypot(s[b][0] - x, s[b][1] - y) < LABEL_HALF) b++
      if (Math.hypot(s[a][0] - x, s[a][1] - y) < LABEL_HALF || Math.hypot(s[b][0] - x, s[b][1] - y) < LABEL_HALF || !clear(s[a]) || !clear(s[b])) continue
      // Only where the line is showing.
      if (!within(line[i])) continue
      let angle = (Math.atan2(s[b][1] - s[a][1], s[b][0] - s[a][0]) * 180) / Math.PI
      if (angle > 90) angle -= 180
      if (angle < -90) angle += 180
      // Just above the line, square to it.
      const t = ((angle - 90) * Math.PI) / 180
      const spot = { x: x + Math.cos(t) * 8, y: y + Math.sin(t) * 8, angle, d }
      if (!avoid(line[a]) && !avoid(line[i]) && !avoid(line[b])) best = spot
      else if (!fallback || d < fallback.d) fallback = spot
    }
  }
  return best ?? fallback
}

/** Where to put a corner's label: out from the corner, away from the lines meeting there, or past the end of an open line. */
function spot(s: Vec2[], i: number, closed: boolean, atPointer: boolean, dist: number): Vec2 {
  const n = s.length
  const unit = (q: Vec2): Vec2 | null => {
    const dx = q[0] - s[i][0]
    const dy = q[1] - s[i][1]
    const l = Math.hypot(dx, dy)
    return l > 1 ? [dx / l, dy / l] : null
  }
  const prev = i > 0 || closed ? unit(s[(i - 1 + n) % n]) : null
  const next = i < n - 1 || closed ? unit(s[(i + 1) % n]) : null
  let dir: Vec2 = [0, 1]
  let reach = dist
  if (prev && next) {
    const b: Vec2 = [-(prev[0] + next[0]), -(prev[1] + next[1])]
    const l = Math.hypot(b[0], b[1])
    // Square to a straight run, on the lower side.
    dir = l > 0.3 ? [b[0] / l, b[1] / l] : next[0] >= 0 ? [-next[1], next[0]] : [next[1], -next[0]]
  } else if (prev && atPointer) {
    // The end being drawn: below and to the left of the pointer, clear of the length tag above and to the right.
    dir = prev[0] < -0.5 && prev[1] > 0.5 ? [Math.SQRT1_2, Math.SQRT1_2] : [-Math.SQRT1_2, Math.SQRT1_2]
    reach = dist * 1.2
  } else if (prev || next) {
    const u = (prev ?? next)!
    dir = [-u[0], -u[1]]
    reach = dist * 1.6
  }
  return [s[i][0] + dir[0] * reach, s[i][1] + dir[1] * reach]
}

interface CornerProps {
  pts: Vec2[]
  /** How far the floor is above the natural ground at each point; null off the block. */
  offsets: (number | null)[]
  closed: boolean
  /** The last point follows the pointer. */
  atPointer: boolean
  /** Plan to screen pixels. */
  toScreen: (p: Vec2) => Vec2
}

/** How far the floor is above (+) or below (−) the natural ground at each corner being drawn or dragged, in metres. */
export function CornerOffsets({ pts, offsets, closed, atPointer, toScreen }: CornerProps) {
  const s = pts.map(toScreen)
  return (
    <g className="corner-offsets">
      {pts.map((p, i) => {
        const d = offsets[i]
        // Once for each corner, even where a closing side comes back to the start.
        if (d === null || pts.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3) < i) return null
        const [x, y] = spot(s, i, closed, atPointer && i === pts.length - 1, 15)
        return (
          <text key={i} className={`corner-offset ${d >= 0 ? 'above' : 'below'}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle">
            {formatOffset(d)}
          </text>
        )
      })}
    </g>
  )
}

/**
 * Turns the ground tint on and off, with a key to its colours. `works`: the tint is the cut and
 * fill itself (Earthworks › Cut & fill), not the floor against the ground. With no `floor` (Site,
 * where there's no floor to draw on) only the other keys show.
 */
export function GroundKey({
  on,
  onChange,
  lowest,
  works = false,
  children,
  floor = true,
}: {
  on: boolean
  onChange: (on: boolean) => void
  lowest: boolean
  works?: boolean
  children?: ReactNode
  floor?: boolean
}) {
  return (
    <div className="ground-key">
      {floor && (
        <label className="check">
          <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
          {works ? 'Cut and fill' : 'Ground vs this floor'}
        </label>
      )}
      {on && floor && works && (
        <ul>
          <li>
            <i className="solid" style={{ background: CUT }} /> Ground cut down
          </li>
          <li>
            <i className="solid" style={{ background: FILL }} /> Ground filled up
          </li>
          <li>
            <i className="works" /> Edge of the works
          </li>
          <li className="small">A shade darker every 0.5 m</li>
        </ul>
      )}
      {on && floor && !works && (
        <ul>
          <li>
            <i className="hatch" style={{ backgroundColor: FILL }} /> Floor above ground{lowest ? ' (fill or piers)' : ''}
          </li>
          <li>
            <i className="hatch" style={{ backgroundColor: CUT }} /> Floor below ground (cut)
          </li>
          <li>
            <i className="meets" /> Ground meets floor
          </li>
          <li className="small">A shade darker every 0.5 m</li>
        </ul>
      )}
      {children}
    </div>
  )
}

/** The natural ground under the pointer against this floor, for the plan's status bar; the ground alone with no floor (Site). */
export function GroundReadout({ ground, floor, lowest }: { ground: number; floor: number | null; lowest: boolean }) {
  return (
    <span className="ground-readout">
      <b>Ground RL {ground.toFixed(2)}</b>
      {floor !== null && (
        <>
          {' '}
          · floor RL {floor.toFixed(2)} · {floorVsGround(ground, floor, lowest)}
        </>
      )}
    </span>
  )
}

/** One quiet line for the selected room: the natural ground under it, and the cut and fill to its floor. */
export function RoomGround({ plan, room, survey, terrain }: { plan: Plan; room: Room; survey: Survey; terrain: Terrain }) {
  const range = useMemo(() => {
    const shape = roomShape(room, planarFaces(plan.walls.filter(w => w.level === room.level)))
    return shape ? groundRange(shape.inner, plan.placement, survey.origin, terrain.grid) : null
  }, [plan.walls, plan.placement, room, survey, terrain])
  if (!range) return null
  const kind = roomFloorType(plan, room) === 'framed' ? 'upper' : onNaturalGround(plan, room) ? 'piers' : 'slab'
  return <p className="muted small">{groundUnder(range, levelFloorRL(plan, room.level), kind)}</p>
}
