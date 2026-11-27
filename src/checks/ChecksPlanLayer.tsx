// Approvals › Checks on the plan: a numbered red pin where a check fails (amber where one needs
// confirming), and, for the row under the pointer or tapped, what it measures drawn in red: the
// boundary and the setback's distance, the tree's protection zone, the walls over the limit (the
// Costs highlight, in red). Clicking a pin brings its row into view in the panel.

import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { fromSite, type Plan } from '../plan/model'
import type { Earth } from '../plan/useEarthworks'
import { Highlight } from '../costs/PlanHighlight'
import { pointedRow, revealCheck, useChecksPointing, type Pin } from './pointStore'
import type { CheckTarget } from './targets'

interface Props {
  plan: Plan
  level: string
  survey: Survey
  terrain: Terrain
  earth: Earth | null
  /** Plan frame to screen pixels. */
  S: (p: Vec2) => Vec2
  /** Pixels per metre. */
  k: number
}

/** Pins this close on screen (px) sit side by side instead of on top of each other. */
const NEAR = 18
const STEP = 24

export function ChecksPlanLayer(props: Props) {
  const pins = useChecksPointing(s => s.pins)
  const targets = useChecksPointing(s => s.targets)
  const shown = useChecksPointing(pointedRow)
  return <ChecksMarks {...props} pins={pins} targets={targets} shown={shown} />
}

/** The pins and the pointed row's marks, from what the panel gave (src/checks/pointStore.ts). */
export function ChecksMarks(props: Props & { pins: Pin[]; targets: Record<string, CheckTarget>; shown: string | null }) {
  const { plan, survey, S, k, pins, targets, shown } = props
  const t = shown ? targets[shown] : null
  if (!pins.length && !t) return null
  const site = (p: Vec2) => S(fromSite(p, plan.placement, survey.origin))

  // Several checks about the house share its middle: line their pins up.
  const placed: { id: string; n: number; word: string; title: string; base: Vec2; at: Vec2 }[] = []
  for (const p of pins) {
    const target = targets[p.id]
    if (!target) continue
    const base = site(target.at)
    const here = placed.filter(q => Math.abs(q.base[0] - base[0]) < NEAR && Math.abs(q.base[1] - base[1]) < NEAR).length
    placed.push({ ...p, base, at: [base[0] + here * STEP, base[1]] })
  }

  return (
    <g className="checks-layer">
      {t?.plan && (
        <g className="checks-highlight">
          <Highlight {...props} target={t.plan} />
        </g>
      )}
      {t && (
        <g className="checks-target" aria-hidden="true">
          {t.circles.map((c, i) => {
            const [x, y] = site(c.at)
            return <circle key={`c${i}`} className={`ck-${c.kind}`} cx={x} cy={y} r={c.r * k} />
          })}
          {t.lines.map(([a, b], i) => {
            const [x1, y1] = site(a)
            const [x2, y2] = site(b)
            return <line key={`l${i}`} className="ck-line" x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
          {t.gaps.map(([a, b], i) => {
            const [x1, y1] = site(a)
            const [x2, y2] = site(b)
            return <line key={`g${i}`} className="ck-gap" x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
        </g>
      )}
      {placed.map(p => (
        <g
          key={p.id}
          className={`ck-pin ${p.word}${p.id === shown ? ' on' : ''}`}
          transform={`translate(${p.at[0].toFixed(1)} ${p.at[1].toFixed(1)})`}
          // A picture of where the check is, for the pointer; the keyboard's and a screen reader's way to it is its row in the list, which carries the same number.
          role="img"
          aria-label={`Check ${p.n} on the plan: ${p.title}`}
          onPointerDown={e => {
            // The plan's own tools never see a click on a pin.
            e.stopPropagation()
            revealCheck(p.id)
          }}
        >
          <title>{`${p.n}. ${p.title}`}</title>
          {/* A thumb-sized target round the pin on a touch screen (PH-26): a rect, so the pin's circle styles leave it alone. */}
          <rect className="ck-touch" x={-22} y={-22} width={44} height={44} />
          {/* 24 px across: the least a pointer target should be (WCAG 2.5.8). */}
          <circle r={12} />
          <text dy="0.35em">{p.n}</text>
        </g>
      ))}
    </g>
  )
}
