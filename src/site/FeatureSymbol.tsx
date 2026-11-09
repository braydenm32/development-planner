import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { centroidOf, type Vec2 } from '../lib/geom'
import { serviceInfo, type SiteFeature } from './model'
import { srzRadius, tpzRadius } from './warnings'

/** Site features as quiet plan symbols, and the small labels used while tracing. */

function pathOf(pts: Vec2[], close = false): string {
  return pts.length ? `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}${close ? 'Z' : ''}` : ''
}

export function Tag({ at, lines }: { at: Vec2; lines: string[] }) {
  const [x, y] = at
  const w = Math.max(...lines.map(l => l.length)) * 6.3 + 12
  return (
    <g className="tag" transform={`translate(${x + 14} ${y - 14})`}>
      <rect x={-4} y={-14} width={w} height={6 + lines.length * 14} rx={4} />
      {lines.map((l, i) => (
        <text key={i} x={2} y={i * 14}>
          {l}
        </text>
      ))}
    </g>
  )
}

export function LiveDim({ a, b, text }: { a: Vec2; b: Vec2; text: string }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 26) return null
  const x = (a[0] + b[0]) / 2
  const y = (a[1] + b[1]) / 2
  let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  return (
    <text className="live-dim" x={x} y={y} transform={`rotate(${ang} ${x} ${y})`} textAnchor="middle" dominantBaseline="middle">
      {text}
    </text>
  )
}

/** Ticks along a fence, every `step` pixels, on its left. */
function ticks(pts: Vec2[], step: number, len: number): string {
  let d = ''
  let carry = step / 2
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-6) continue
    const u: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
    const n: Vec2 = [u[1], -u[0]]
    for (let s = carry; s < L; s += step) {
      const p: Vec2 = [a[0] + u[0] * s, a[1] + u[1] * s]
      d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)}l${(n[0] * len).toFixed(1)} ${(n[1] * len).toFixed(1)}`
      carry = s + step - L
    }
    if (carry < 0) carry = step / 2
  }
  return d
}

/** Code letters along a service line, every `step` pixels: "S", "W", "E". */
function lineLabels(pts: Vec2[], step: number): { p: Vec2; ang: number }[] {
  const out: { p: Vec2; ang: number }[] = []
  let next = step / 2
  let run = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    while (next <= run + L) {
      const t = (next - run) / L
      let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
      if (ang > 90) ang -= 180
      if (ang < -90) ang += 180
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ang })
      next += step
    }
    run += L
  }
  return out
}

/** One feature as a quiet plan symbol. */
export function FeatureSymbol({
  f,
  toScreen,
  k,
  selected,
  warned,
  onPick,
  preview,
  unlabelled,
}: {
  f: SiteFeature
  toScreen: (p: Vec2) => Vec2
  k: number
  selected: boolean
  warned: boolean
  onPick?: (e: ReactPointerEvent) => void
  preview?: boolean
  /** Leave the name off, as a strip beside it already says it. */
  unlabelled?: boolean
}) {
  const cls = `site-f t-${f.type}${selected ? ' selected' : ''}${warned ? ' warned' : ''}${f.remove ? ' removed' : ''}${f.neighbour ? ' neighbour' : ''}${preview ? ' preview' : ''}`
  const pick = onPick ? { onPointerDown: onPick } : {}
  const label = (at: Vec2, text: string | undefined, dy = 0, ang = 0): ReactNode =>
    text && k > 6 ? (
      <text className="site-label" x={at[0]} y={at[1] + dy} textAnchor="middle" transform={ang ? `rotate(${ang} ${at[0]} ${at[1] + dy})` : undefined} {...pick}>
        {text}
      </text>
    ) : null
  const g = f.geom
  if (g.kind === 'point') {
    const [x, y] = toScreen(g.at)
    if (f.type === 'tree') {
      const r = ((f.canopy ?? 6) / 2) * k
      const t = Math.max(((f.trunk ?? 0.3) / 2) * k, 2)
      // The protection zone, soft unless works reach into it, and the structural root zone when it matters.
      const zones = !f.remove && f.trunk && !preview
      return (
        <g className={cls}>
          {zones && <circle className="tpz" cx={x} cy={y} r={tpzRadius(f.trunk!) * k} />}
          {zones && (selected || warned) && <circle className="srz" cx={x} cy={y} r={srzRadius(f.trunk!) * k} />}
          <circle className="canopy" cx={x} cy={y} r={r} />
          <circle className="trunk" cx={x} cy={y} r={t} {...pick} />
          {f.remove && <path className="cross" d={`M${x - t - 4} ${y - t - 4}L${x + t + 4} ${y + t + 4}M${x - t - 4} ${y + t + 4}L${x + t + 4} ${y - t - 4}`} />}
          {label([x, y], f.label, -t - 5)}
        </g>
      )
    }
    if (f.type === 'service') {
      const info = serviceInfo(f.service)
      return (
        <g className={cls} style={{ ['--svc' as string]: info.color }}>
          <circle className="svc-pit" cx={x} cy={y} r={5} {...pick} />
          {label([x, y], f.label ?? info.code, -9)}
        </g>
      )
    }
    if (f.type === 'building') {
      return (
        <g className={cls}>
          <rect className="bldg-mark" x={x - 6} y={y - 6} width={12} height={12} {...pick} />
          {label([x, y], f.label ?? 'Building', -10)}
        </g>
      )
    }
    return (
      <g className={cls}>
        <path className="mark" d={`M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x - 5} ${y + 5}L${x + 5} ${y - 5}`} />
        <circle className="hit" cx={x} cy={y} r={8} {...pick} />
        {label([x, y], f.label, -9)}
      </g>
    )
  }
  const sp = g.pts.map(toScreen)
  if (g.kind === 'area') {
    const d = pathOf(sp, true)
    const c = toScreen(centroidOf(g.pts))
    const text = f.type === 'easement' ? [f.label, f.width !== undefined ? `${f.width} m` : null].filter(Boolean).join(' ') || 'Easement' : f.label
    return (
      <g className={cls}>
        <path className="fill" d={d} />
        <path className="edge" d={d} {...pick} />
        {!unlabelled && label(c, text, 4)}
      </g>
    )
  }
  const d = pathOf(sp)
  if (f.type === 'fence') {
    return (
      <g className={cls}>
        <path className="line" d={d} />
        <path className="ticks" d={ticks(sp, 16, 5)} />
        <path className="hit" d={d} {...pick} />
      </g>
    )
  }
  if (f.type === 'service') {
    const info = serviceInfo(f.service)
    return (
      <g className={cls} style={{ ['--svc' as string]: info.color }}>
        <path className="svc-line" d={d} />
        <path className="hit" d={d} {...pick} />
        {lineLabels(sp, 140).map((l, i) => (
          <text key={i} className="svc-code" x={l.p[0]} y={l.p[1]} textAnchor="middle" dominantBaseline="central" transform={`rotate(${l.ang} ${l.p[0]} ${l.p[1]})`}>
            {info.code}
          </text>
        ))}
      </g>
    )
  }
  return (
    <g className={`${cls}${f.type === 'kerb' ? ` edge-${f.edge ?? 'kerb'}` : ''}`}>
      <path className="line" d={d} />
      <path className="hit" d={d} {...pick} />
    </g>
  )
}
