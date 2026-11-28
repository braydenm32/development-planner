// Which way a sketch block falls, said in plain words (HO-21): to the street, to the back, to the
// left or right, or two ways at once, with how much. Left and right are as you stand on the street
// looking in, which the little picture shows: the block from the street, with arrows downhill.
// The start screen and Site › Block's Change size both ask it this way (src/start/sketch.ts keeps the numbers).

import { downhill, FALL_WAYS } from './fallWords'
import type { FallChoice, StreetSide } from './sketch'

type Box = 'fall' | 'cross'

interface Props {
  value: FallChoice
  onChange: (c: FallChoice) => void
  /** The reason a number can't be used, by its box: `fall` front to back, `cross` side to side. */
  problems?: Partial<Record<Box, string>>
  /** Each number box, for focusing the first bad one. */
  boxRef?: (box: Box, el: HTMLInputElement | null) => void
  /** Ids start with this, so two pickers on one page stay apart. */
  id: string
  /** The start screen's look (`st`), or Site › Block's compact one. */
  look: 'st' | 'compact'
}

/** The way, then the amount (one box), or for two ways each fall with its own way and amount. */
export function FallPicker({ value, onChange, problems = {}, boxRef, id, look }: Props) {
  const set = (patch: Partial<FallChoice>) => onChange({ ...value, ...patch })
  const st = look === 'st'
  const field = (box: Box, v: string, onV: (s: string) => void, label: string) => {
    const input = (
      <input
        ref={el => boxRef?.(box, el)}
        inputMode="decimal"
        placeholder={st ? '0.0' : 'm'}
        aria-label={label}
        aria-invalid={problems[box] ? true : undefined}
        aria-describedby={problems[box] ? `st-err-${box}` : undefined}
        value={v}
        onChange={e => onV(e.target.value)}
      />
    )
    return st ? (
      <label className={`st-field${problems[box] ? ' bad' : ''}`}>
        {input}
        <span>m</span>
      </label>
    ) : (
      input
    )
  }
  const select = <T extends string>(v: T, opts: { id: T; label: string }[], onV: (t: T) => void, label: string, htmlId?: string) => {
    const el = (
      <select id={htmlId} aria-label={htmlId ? undefined : label} value={v} onChange={e => onV(e.target.value as T)}>
        {opts.map(o => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    )
    return st ? <label className="st-field st-select">{el}</label> : el
  }
  const wayId = `${id}-way`
  return (
    <div className={st ? 'st-fall' : 'fall-compact'}>
      <label className={st ? 'st-label' : undefined} htmlFor={wayId}>
        Which way does the ground fall?{st && <span className="st-opt"> (optional)</span>}
      </label>
      {select(value.way, FALL_WAYS, way => set({ way }), 'Which way the ground falls', wayId)}
      {value.way !== 'flat' && value.way !== 'both' && (
        <div className="fall-row">
          <span className={st ? 'st-label' : undefined}>By about</span>
          {field('fall', value.amount, amount => set({ amount }), 'How much lower the low side is, in metres')}
        </div>
      )}
      {value.way === 'both' && (
        <>
          <div className="fall-row">
            {select(value.frontTo, [
              { id: 'front', label: 'Down to the street' },
              { id: 'back', label: 'Down to the back' },
            ], frontTo => set({ frontTo }), 'Front to back: which end is lower')}
            {field('fall', value.front, front => set({ front }), 'How much it falls front to back, in metres')}
          </div>
          <div className="fall-row">
            {select(value.sideTo, [
              { id: 'left', label: 'Down to the left' },
              { id: 'right', label: 'Down to the right' },
            ], sideTo => set({ sideTo }), 'Side to side: which side is lower')}
            {field('cross', value.side, side => set({ side }), 'How much it falls side to side, in metres')}
          </div>
        </>
      )}
    </div>
  )
}

/** Which way north is in the picture, drawn from the street: up when the street is to the south. */
const NORTH: Record<StreetSide, { dx: number; dy: number }> = { S: { dx: 0, dy: -1 }, N: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 }, E: { dx: 1, dy: 0 } }

/**
 * The block as seen from the street (the street along the bottom), with an arrow downhill for
 * each fall and a small north arrow, so "left" and "right" read as they are meant.
 */
export function FallArt({ street, fall }: { street: StreetSide; fall: FallChoice }) {
  const w = 330
  const h = 150
  const bw = 96
  const bh = 96
  const x = w / 2 - bw / 2
  const y = 14
  const cx = w / 2
  const cy = y + bh / 2
  const arrows = downhill(fall)
  const n = NORTH[street]
  const nx = x + bw + 46
  const ny = y + 26
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" aria-hidden="true">
      <defs>
        <marker id="fall-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#2346d0" />
        </marker>
      </defs>
      <rect x={x} y={y} width={bw} height={bh} fill="#ffffff" stroke="#16181b" strokeWidth="1.4" strokeDasharray="5 3" />
      <path d={`M${x - 16} ${y + bh + 8}H${x + bw + 16}`} stroke="#16181b" strokeWidth="6" opacity=".18" />
      <text x={cx} y={y + bh + 24} textAnchor="middle" fontSize="11" fill="#6b7077">
        street
      </text>
      <text x={x - 8} y={cy + 4} textAnchor="end" fontSize="11" fill="#6b7077">
        left
      </text>
      <text x={x + bw + 8} y={cy + 4} textAnchor="start" fontSize="11" fill="#6b7077">
        right
      </text>
      {arrows.length === 0 && (
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="#6b7077">
          flat
        </text>
      )}
      {arrows.map((a, i) => (
        <g key={i}>
          <path d={`M${cx - a.dx * 30} ${cy - a.dy * 30}L${cx + a.dx * 30} ${cy + a.dy * 30}`} stroke="#2346d0" strokeWidth="2" markerEnd="url(#fall-head)" />
          <text x={a.dx ? cx + a.dx * 15 : cx + 6} y={a.dx ? cy - 7 : cy + a.dy * 15 + 4} textAnchor={a.dx ? 'middle' : 'start'} fontSize="10.5" fill="#2346d0">
            down
          </text>
        </g>
      ))}
      <g>
        <path d={`M${nx - n.dx * 10} ${ny - n.dy * 10}L${nx + n.dx * 10} ${ny + n.dy * 10}`} stroke="#6b7077" strokeWidth="1.4" markerEnd="url(#fall-head)" opacity=".7" />
        <text x={nx + n.dx * 20} y={ny + n.dy * 20 + 4} textAnchor="middle" fontSize="10.5" fill="#6b7077">
          N
        </text>
      </g>
    </svg>
  )
}
