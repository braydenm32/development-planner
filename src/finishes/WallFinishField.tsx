// An outside wall's own finish, on its card (one wall, or several selected at once): the house's
// finish, one of its own, or two with a height where they change, from the same choices and
// colours as Design › Finishes. Every change is one undo step for all the walls; a drag round the
// custom colour picker is one too. Only the 3D picture changes.

import { Num, Select } from '../components/fields'
import { usePlan } from '../plan/store'
import { floorRL, type Plan, type Wall } from '../plan/model'
import { wallTopRL } from '../plan/roofline'
import { Kinds, Swatches } from './FinishesPanel'
import {
  band,
  DEFAULT_SPLIT,
  editWallFinishes,
  houseLower,
  houseUpper,
  MIN_BAND,
  repick,
  WALL_COLOURS,
  WALL_FINISHES,
  type FinishPick,
  type WallFinishes,
} from './model'

type Mode = 'house' | 'own' | 'two' | 'mixed'

const modeOf = (w: Wall): Mode => (!w.finish ? 'house' : w.finish.lower ? 'two' : 'own')
const mm = (m: number) => Math.round(m * 1000)

export function WallFinishField({ plan, walls }: { plan: Plan; walls: Wall[] }) {
  const outside = walls.filter(w => w.kind === 'external')
  if (!outside.length) return null
  const ids = outside.map(w => w.id)
  const first = outside[0]
  const mixed = outside.some(w => JSON.stringify(w.finish) !== JSON.stringify(first.finish))
  const mode: Mode = mixed ? 'mixed' : modeOf(first)
  const f = plan.finishes
  const house = houseUpper(f)
  // Every wall picked takes the change; a wall still on the house's finish starts from the first one's.
  const base: WallFinishes = first.finish ?? { upper: house }
  const set = (edit: (own: WallFinishes) => WallFinishes | undefined) => usePlan.getState().commit(p => editWallFinishes(p, ids, own => edit(own ?? base)))
  const drag = (part: 'upper' | 'lower') => ({
    key: `wall-finish-${part}-${ids.join(',')}`,
    apply: (p: Plan, colour: string) => editWallFinishes(p, ids, own => ({ ...(own ?? base), [part]: { walls: (own ?? base)[part]?.walls ?? 'plain', colour } })),
  })
  const pickMode = (m: Mode) => {
    if (m === 'house') set(() => undefined)
    else if (m === 'own') set(own => ({ upper: own.upper }))
    else if (m === 'two') {
      set(own => {
        const lower: FinishPick = own.lower ?? houseLower(f) ?? { walls: own.upper.walls === 'brick' ? 'render' : 'brick' }
        return { upper: own.upper, lower, at: own.at ?? f?.lowerTo ?? DEFAULT_SPLIT }
      })
    }
  }
  // The lowest of them: a change height has to fit every wall it's set on.
  const height = Math.min(...outside.map(w => wallTopRL(plan, w) - floorRL(plan, w.level)))
  const options: { id: Mode; label: string }[] = [
    ...(mixed ? [{ id: 'mixed' as const, label: 'Different on these walls' }] : []),
    { id: 'house', label: 'Same as the house' },
    { id: 'own', label: 'Its own finish' },
    { id: 'two', label: 'Two finishes' },
  ]
  const own = !mixed ? first.finish : undefined
  const part = (which: 'upper' | 'lower', pick: FinishPick, label: string) => {
    const b = band(pick)
    return (
      <div className="wall-finish-part">
        {label && <span className="small">{label}</span>}
        <Kinds label={`${label || 'Wall'} finish`} value={b.walls} options={WALL_FINISHES} onPick={k => set(o => ({ ...o, [which]: repick(o[which] ?? pick, k) }))} />
        <Swatches label={`${label || 'Wall'} colour`} palette={WALL_COLOURS} value={b.colour} onPick={hex => set(o => ({ ...o, [which]: { walls: (o[which] ?? pick).walls, ...(hex ? { colour: hex } : {}) } }))} drag={drag(which)} />
      </div>
    )
  }
  return (
    <div className="wall-finish">
      <Select label={outside.length > 1 ? `Finish of the ${outside.length} outside walls` : 'Finish'} value={mode} options={options} onChange={m => m !== 'mixed' && pickMode(m)} />
      {own && !own.lower && part('upper', own.upper, '')}
      {own?.lower && (
        <>
          {part('upper', own.upper, 'Upper')}
          {part('lower', own.lower, 'Lower')}
          <Num
            label="Change at"
            unit="mm"
            value={own.at ?? DEFAULT_SPLIT}
            min={MIN_BAND}
            check={v => (v > height - MIN_BAND + 1e-9 ? `Max ${mm(height - MIN_BAND)} mm: the wall is ${mm(height)} mm high` : null)}
            onCommit={at => set(o => ({ ...o, at }))}
          />
        </>
      )}
      {mode !== 'house' && <p className="muted small">Shows in 3D only.{mode === 'two' && ' “Change at” is measured up from the floor.'} To change finish part way along, draw it as two walls, each with its own.</p>}
    </div>
  )
}
