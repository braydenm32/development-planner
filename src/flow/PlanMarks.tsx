// What the design flow draws on the plan while picking: a tag beside the pointer, and a retaining
// wall's earth side.

import type { Vec2 } from '../lib/geom'
import { wallDir, type Wall } from '../plan/model'

/** A dark label beside the pointer, like the plan's own drawing tags. */
export function Tag({ x, y, lines, size }: { x: number; y: number; lines: string[]; size: { w: number; h: number } }) {
  const w = Math.max(...lines.map(l => l.length)) * 6.3 + 12
  const h = 6 + lines.length * 14
  const tx = x + 14 + w > size.w ? x - 14 - w + 4 : x + 14
  const ty = y - 28 < 0 ? y + 28 : y - 14
  return (
    <g className="tag" transform={`translate(${tx} ${ty})`}>
      <rect x={-4} y={-14} width={w} height={h} rx={4} />
      {lines.map((l, i) => (
        <text key={i} x={2} y={i * 14}>
          {l}
        </text>
      ))}
    </g>
  )
}

/** While picking a retaining wall's earth side: that side of the wall shaded, an arrow at the wall, and "earth this side". */
export function EarthSide({ wall: w, side, S, k, at, size }: { wall: Wall; side: 'left' | 'right'; S: (p: Vec2) => Vec2; k: number; at: [number, number]; size: { w: number; h: number } }) {
  const d = wallDir(w)
  const s = side === 'left' ? 1 : -1
  const n: Vec2 = [-d[1] * s, d[0] * s]
  const reach = Math.max(1.2, 46 / k)
  const off = (p: Vec2, o: number): Vec2 => [p[0] + n[0] * o, p[1] + n[1] * o]
  const band = [off(w.a, w.thickness / 2), off(w.b, w.thickness / 2), off(w.b, reach), off(w.a, reach)].map(S)
  const mid: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
  const tail = S(off(mid, reach * 0.95))
  const head = S(off(mid, w.thickness / 2 + 4 / k))
  const ux = head[0] - tail[0]
  const uy = head[1] - tail[1]
  const ul = Math.hypot(ux, uy) || 1
  const [hx, hy] = [ux / ul, uy / ul]
  const wing = (t: number): string => `${(head[0] - hx * 9 + -hy * t).toFixed(1)} ${(head[1] - hy * 9 + hx * t).toFixed(1)}`
  return (
    <g className="flow-earth">
      <path className="flow-earth-band" d={`M${band.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L')}Z`} />
      <path className="flow-earth-arrow" d={`M${tail[0].toFixed(1)} ${tail[1].toFixed(1)}L${head[0].toFixed(1)} ${head[1].toFixed(1)}M${wing(6)}L${head[0].toFixed(1)} ${head[1].toFixed(1)}L${wing(-6)}`} />
      <Tag x={at[0]} y={at[1]} size={size} lines={['Earth this side', 'Click to choose it']} />
    </g>
  )
}
