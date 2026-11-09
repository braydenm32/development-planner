// The section marks drawn over the plan: each line with its letters and arrows, and the line
// being drawn with its live length. SectionMarks.tsx decides when they show.

import type { Vec2 } from '../lib/geom'
import type { SectionLine } from '../plan/model'

/** A section line with its letter and an arrow at each end, pointing the way the drawing looks. */
export function Mark({ line, S, on }: { line: SectionLine; S: (p: Vec2) => Vec2; on: boolean }) {
  const a = S(line.a)
  const b = S(line.b)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1) return null
  const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  // The drawing looks to the line's left in the house frame; on screen, measure it from S itself.
  const l0 = S(line.a)
  const lw: Vec2 = [line.a[0] - (line.b[1] - line.a[1]), line.a[1] + (line.b[0] - line.a[0])]
  const lp = S(lw)
  const ll = Math.hypot(lp[0] - l0[0], lp[1] - l0[1]) || 1
  const look: Vec2 = [(lp[0] - l0[0]) / ll, (lp[1] - l0[1]) / ll]
  const end = (p: Vec2, out: number) => {
    // The letter sits past the end of the line; the arrow beside it, on the side the drawing looks.
    const c: Vec2 = [p[0] + d[0] * out * 16, p[1] + d[1] * out * 16]
    const tip: Vec2 = [p[0] + look[0] * 15, p[1] + look[1] * 15]
    const w: Vec2 = [d[0] * 5, d[1] * 5]
    const base: Vec2 = [p[0] + look[0] * 6, p[1] + look[1] * 6]
    return (
      <>
        <path className="sec-arrow" d={`M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${base[0].toFixed(1)} ${base[1].toFixed(1)}M${(base[0] - w[0]).toFixed(1)} ${(base[1] - w[1]).toFixed(1)}L${tip[0].toFixed(1)} ${tip[1].toFixed(1)}L${(base[0] + w[0]).toFixed(1)} ${(base[1] + w[1]).toFixed(1)}Z`} />
        <circle className="sec-tag" cx={c[0]} cy={c[1]} r={9} />
        <text className="sec-tag-text" x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central">
          {line.label}
        </text>
      </>
    )
  }
  return (
    <g className={`sec-mark${on ? ' on' : ''}`}>
      <path className="sec-hit" d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} />
      <path className="sec-line" d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} />
      {end(a, -1)}
      {end(b, 1)}
    </g>
  )
}

/** The line being drawn, with its length. */
export function Preview({ a, b, S, k }: { a: Vec2; b: Vec2; S: (p: Vec2) => Vec2; k: number }) {
  const pa = S(a)
  const pb = S(b)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const mx = (pa[0] + pb[0]) / 2
  const my = (pa[1] + pb[1]) / 2
  return (
    <>
      <path className="sec-line preview" d={`M${pa[0]} ${pa[1]}L${pb[0]} ${pb[1]}`} />
      <circle className="sec-start" cx={pa[0]} cy={pa[1]} r={4} />
      {len * k > 40 && (
        <text className="live-dim" x={mx} y={my - 10} textAnchor="middle">
          {len.toFixed(2)} m
        </text>
      )}
    </>
  )
}
