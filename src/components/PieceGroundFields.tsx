// A pool's or tank's card: Sits above ground or in the ground, and the levels that go with it
// (src/plan/groundPieces.ts). In the ground: its depth and the level of its top edge (the coping or
// the lid), which follows the ground at its highest corner unless an RL is typed. Above ground: the
// level base it stands on, the mean ground under it unless an RL is typed.

import { useMemo } from 'react'
import { volumesWithout } from '../lib/earthworks'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { groundApplies, highestGround, maxDepth, meanGround, pieceDepth, piecePlatformId, pieceRing, sitsInGround } from '../plan/groundPieces'
import { toSite, type Furniture, type PieceGround, type Plan } from '../plan/model'
import { updateFurniture } from '../plan/ops'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { Num } from './fields'
import './finishing.css'

interface Props {
  plan: Plan
  item: Furniture
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

const rl = (v: number) => `RL ${v.toFixed(2)}`
const m3 = (v: number) => `${v.toFixed(1)} m³`
/** How far from the ground under it a typed level may be (m). */
const REACH = 5

export function PieceGroundFields({ plan, item: f, survey, terrain, earth }: Props) {
  const ring = useMemo(() => pieceRing(f).map(p => toSite(p, plan.placement, survey.origin)), [f, plan.placement, survey.origin])
  const pid = piecePlatformId(f.id)
  // Its own cut and fill: what the whole would be without it, taken from the whole (as Cut & fill counts it).
  const own = useMemo(() => {
    if (!earth || !earth.prep.platforms.some(p => p.id === pid)) return null
    const rest = volumesWithout(earth.prep, p => p.id === pid)
    return { cut: Math.max(0, earth.result.cut - rest.cut), fill: Math.max(0, earth.result.fill - rest.fill) }
  }, [earth, pid])
  if (!sitsInGround(f.kind)) return null
  const tank = f.kind === 'tank'
  if (!groundApplies(plan, f))
    return <p className="muted small">Setting it in the ground or on a level base is for a {tank ? 'tank' : 'pool'} outside the house on the lowest level. Here it stands on its floor.</p>

  const g = f.ground
  const set = (next: PieceGround) => usePlan.getState().commit(p => updateFurniture(p, f.id, { ground: next }))
  const patch = (change: Partial<PieceGround>) => {
    const next: PieceGround = { ...(g ?? { sits: 'in' }), ...change }
    for (const k of Object.keys(next) as (keyof PieceGround)[]) if (next[k] === undefined) delete next[k]
    set(next)
  }
  const highest = highestGround(ring, terrain.grid)
  const lowest = Math.min(...ring.map(p => terrain.grid.sample(p[0], p[1])))
  const mean = meanGround(ring, terrain.grid)
  const depth = pieceDepth(f)
  const near = (v: number, at: number) => (Math.abs(v - at) > REACH ? `Keep it within ${REACH} m of the ground under it (${rl(at)})` : null)
  const edge = tank ? 'Top edge (the lid)' : 'Top edge (the coping)'

  const depthBox = (
    <Num
      label={tank ? 'Depth in the ground' : 'Depth'}
      unit="mm"
      value={depth}
      min={tank ? 0.1 : 0.3}
      max={maxDepth(f)}
      range={tank ? `Between 100 mm and its own height, ${Math.round(maxDepth(f) * 1000)} mm` : `Between 300 and ${Math.round(maxDepth(f) * 1000)} mm`}
      onCommit={d => patch({ depth: d })}
    />
  )

  let body = null
  if (g?.sits === 'in') {
    const top = g.top ?? highest
    const proud = top - lowest
    body = (
      <>
        {depthBox}
        <label className="num">
          <span>{edge}</span>
          <select value={g.top === undefined ? 'ground' : 'typed'} onChange={e => patch({ top: e.target.value === 'ground' ? undefined : Math.round(highest * 100) / 100 })}>
            <option value="ground">Follows the ground ({rl(highest)})</option>
            <option value="typed">Type an RL</option>
          </select>
        </label>
        {g.top !== undefined && <Num label={tank ? 'Lid level' : 'Coping level'} unit="RL" value={g.top} check={v => near(v, highest)} onCommit={t => patch({ top: t })} />}
        <p className="muted small">
          Dug straight down to its floor at {rl(top - depth)}
          {own ? `: ${m3(own.cut)} to dig out` : ''}. Its {tank ? 'tank' : 'shell'} holds the sides, so there are no slopes round it.
          {tank && depth < f.height - 1e-6 ? ` Its lid stands ${Math.round((f.height - depth) * 1000)} mm above that.` : ''}
          {proud > 0.05 ? ` On the low side its top edge stands ${Math.round(proud * 1000)} mm above the ground; nothing is filled round it.` : ''}
        </p>
      </>
    )
  } else if (g?.sits === 'above') {
    body = (
      <>
        {!tank && depthBox}
        <label className="num">
          <span>Base level</span>
          <select value={g.base === undefined ? 'ground' : 'typed'} onChange={e => patch({ base: e.target.value === 'ground' ? undefined : Math.round(mean * 100) / 100 })}>
            <option value="ground">The ground under it ({rl(mean)})</option>
            <option value="typed">Type an RL</option>
          </select>
        </label>
        {g.base !== undefined && <Num label="Base level" unit="RL" value={g.base} check={v => near(v, mean)} onCommit={b => patch({ base: b })} />}
        <p className="muted small">
          It stands on a level base at {rl(g.base ?? mean)}, cut and filled like a small slab{own ? `: ${m3(own.cut)} cut, ${m3(own.fill)} fill` : ''}. The ground under it is
          the average, so the high side is cut and the low side filled.
        </p>
      </>
    )
  } else {
    body = <p className="muted small">It stands at its floor level, as drawn, and moves no earth. Pick one to set it on or in the ground.</p>
  }

  return (
    <div className="piece-ground">
      <span className="muted small" id={`sits-${f.id}`}>
        Sits
      </span>
      <div className="segmented mode-switch" role="radiogroup" aria-labelledby={`sits-${f.id}`}>
        {(
          [
            ['above', 'Above ground'],
            ['in', 'In the ground'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={g?.sits === id}
            className={g?.sits === id ? 'on' : ''}
            // The levels typed for one way don't carry over to the other; a depth does.
            onClick={() => g?.sits !== id && set({ sits: id, ...(g?.depth !== undefined ? { depth: g.depth } : {}) })}
          >
            {label}
          </button>
        ))}
      </div>
      {body}
      {g && <p className="muted small">Its cut and fill is in the volumes and costs, but not in the earthworks checks.</p>}
      {!tank && <p className="muted small">A pool needs its own approval and a compliant safety fence. The planner doesn’t check either.</p>}
    </div>
  )
}
