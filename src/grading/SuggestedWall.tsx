// A suggested retaining wall on the plan: a dashed line with its number and height, and Add and
// Dismiss beside it (none on a phone in View). An implied wall (a vertical edge of the cut and
// fill) says so, and has Add only: it's in the design already.

import type { Vec2 } from '../lib/geom'
import type { WallSuggestion } from './suggest'
import { tagSize } from './tags'

/** One suggested wall's tag: its number and height, with Add and Dismiss beside it. Its dashed line is drawn under every tag. */
export function Suggested({ n, s, at, readOnly, onAdd, onDismiss }: { n: number; s: WallSuggestion; at: Vec2; readOnly: boolean; onAdd: () => void; onDismiss: () => void }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const implied = s.rule === 'implied'
  const { label, w } = tagSize(s.height, !readOnly, implied)
  return (
    <g className={`grade-suggest ${s.kind}${implied ? ' implied' : ''}`} aria-label={`${implied ? 'Implied' : 'Suggested'} retaining wall ${n}: ${s.why}`}>
      <title>{s.why}</title>
      <g transform={`translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})`}>
        <rect className="grade-suggest-tag" x={-w / 2} y={-10} width={w} height={20} rx={3} />
        <rect className="grade-suggest-n" x={-w / 2 + 3} y={-7} width={14} height={14} rx={2} />
        <text className="grade-suggest-n-text" x={-w / 2 + 10} y={1} textAnchor="middle" dominantBaseline="middle">
          {n}
        </text>
        <text className="grade-suggest-text" x={10} y={1} textAnchor="middle" dominantBaseline="middle">
          {label}
        </text>
        {!readOnly && (
          <>
            <g className="grade-suggest-btn add" role="button" aria-label={implied ? `Add implied wall ${n} as a retaining wall` : `Add suggested wall ${n}`} transform={`translate(${w / 2 + 4} -10)`} onPointerDown={stop} onPointerUp={stop} onClick={onAdd}>
              <rect width={34} height={20} rx={3} />
              <text x={17} y={11} textAnchor="middle" dominantBaseline="middle">
                Add
              </text>
            </g>
            {!implied && (
            <g className="grade-suggest-btn" role="button" aria-label={`Dismiss suggested wall ${n}`} transform={`translate(${w / 2 + 42} -10)`} onPointerDown={stop} onPointerUp={stop} onClick={onDismiss}>
              <rect width={20} height={20} rx={3} />
              <text x={10} y={11} textAnchor="middle" dominantBaseline="middle">
                ×
              </text>
            </g>
            )}
          </>
        )}
      </g>
    </g>
  )
}
