// A small plan of the block in Checks' verdict card, for a phone, where the panel covers the plan:
// the boundary, the house, the trees, and the same numbered pins as on the big plan. North is up.
// Tapping a pin points its row out and brings it into view.

import type { Vec2 } from '../lib/geom'
import type { Measures } from './measure'
import { pointedRow, revealCheck, useChecksPointing } from './pointStore'

const W = 300
const H = 170
const PAD = 14

export function MiniPlan({ ms }: { ms: Measures }) {
  const pins = useChecksPointing(s => s.pins)
  const targets = useChecksPointing(s => s.targets)
  const shown = useChecksPointing(pointedRow)
  const ring = ms.edges.map(e => e.a)
  if (ring.length < 3) return null
  const xs = ring.map(p => p[0])
  const ys = ring.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min((W - 2 * PAD) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1))
  const ox = (W - (x1 - x0) * k) / 2
  const oy = (H - (y1 - y0) * k) / 2
  const P = (p: Vec2): Vec2 => [ox + (p[0] - x0) * k, H - oy - (p[1] - y0) * k]
  const d = (pts: Vec2[]) => `M${pts.map(p => P(p).map(n => n.toFixed(1)).join(' ')).join('L')}Z`
  const t = shown ? targets[shown] : null
  return (
    <svg className="checks-mini" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="The block, with a numbered pin for each thing to fix or confirm">
      <path className="cm-lot" d={d(ring)} />
      {ms.outlines.map((r, i) => (
        <path key={i} className="cm-house" d={d(r)} />
      ))}
      {ms.trees.map(tr => {
        const [x, y] = P(tr.at)
        return <circle key={tr.id} className={`cm-tree${tr.remove ? ' removed' : ''}`} cx={x} cy={y} r={Math.max(2.5, tr.trunk * 4 * k)} />
      })}
      {t?.lines.map(([a, b], i) => {
        const [ax, ay] = P(a)
        const [bx, by] = P(b)
        return <line key={`l${i}`} className="ck-line" x1={ax} y1={ay} x2={bx} y2={by} />
      })}
      {t?.circles
        .filter(c => c.kind === 'tpz')
        .map((c, i) => {
          const [x, y] = P(c.at)
          return <circle key={`c${i}`} className="ck-tpz" cx={x} cy={y} r={c.r * k} />
        })}
      {pins.map((p, i) => {
        const target = targets[p.id]
        if (!target) return null
        // Pins on the same spot line up, as on the big plan.
        const same = pins.slice(0, i).filter(q => targets[q.id] && Math.hypot(targets[q.id].at[0] - target.at[0], targets[q.id].at[1] - target.at[1]) * k < 12).length
        const [x, y] = P(target.at)
        return (
          <g key={p.id} className={`ck-pin ${p.word}${p.id === shown ? ' on' : ''}`} transform={`translate(${(x + same * 18).toFixed(1)} ${y.toFixed(1)})`} role="button" tabIndex={0} aria-label={`${p.n}: ${p.title}`} onClick={() => revealCheck(p.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && revealCheck(p.id)}>
            <circle r={9} />
            <text dy="0.35em">{p.n}</text>
          </g>
        )
      })}
    </svg>
  )
}
