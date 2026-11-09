// Rooflines across levels: a roof's eaves RL and what it's matched to (the roof panel), and a
// level's ceiling lined up with another's (Floors). See src/plan/roofline.ts.

import { floorRL, levelById, sortedLevels, type Plan, type Roof } from '../plan/model'
import { updateLevel } from '../plan/ops'
import { ceilingHeightToMatch, ceilingLinedUpWith, ceilingRL, levelsSharingCeiling, matchRoofline, roofEavesRL, roofLineKey, roofName, setEavesRL } from '../plan/roofline'
import { usePlan } from '../plan/store'
import { Num, Select } from './fields'

const rl = (z: number) => z.toFixed(2)

/** The roof panel's Eaves RL and "Match roofline with", and what it's sitting on, in words. */
export function RoofLineFields({ plan, roof }: { plan: Plan; roof: Roof }) {
  const st = usePlan.getState()
  const level = levelById(plan, roof.level)
  const eaves = roofEavesRL(plan, roof)
  const key = roofLineKey(roof)
  const options = [
    { id: '', label: `Its own walls (${level?.name ?? 'this level'}, RL ${rl(ceilingRL(plan, roof.level))})` },
    ...sortedLevels(plan)
      .filter(l => l.id !== roof.level)
      .map(l => ({ id: `level:${l.id}`, label: `${l.name} ceiling (RL ${rl(ceilingRL(plan, l.id))})` })),
    ...plan.roofs
      .filter(r => r.id !== roof.id)
      .map(r => ({ id: `roof:${r.id}`, label: `${roofName(plan, r)} (RL ${rl(roofEavesRL(plan, r))}${r.type === 'flat' ? '' : `, ${r.pitch.toFixed(0)}°`})` })),
    ...(key === 'rl' ? [{ id: 'rl', label: 'An RL typed in (below)' }] : []),
  ]
  // Over every level whose ceiling meets this one's, said so the person knows the roof covers them.
  const shared = levelsSharingCeiling(plan, roof.level).slice(1)
  const gap = Math.round((eaves - ceilingRL(plan, roof.level)) * 1000)
  return (
    <>
      <Select label="Match roofline with" value={key} options={options} onChange={k => k !== 'rl' && st.commit(p => matchRoofline(p, roof.id, k))} />
      <Num label="Eaves" unit="RL" value={eaves} onCommit={z => st.commit(p => setEavesRL(p, roof.id, z))} />
      <p className="muted small">
        {key.startsWith('roof:')
          ? 'It follows that roof’s eaves and pitch, so the two read as one roofline.'
          : gap === 0
            ? `It sits on ${level?.name ?? 'its level'}’s walls${shared.length ? ` and ${shared.map(l => l.name).join(' and ')}’s, whose ceiling lines up` : ''}.`
            : `Its eaves are ${Math.abs(gap)} mm ${gap > 0 ? 'above' : 'below'} ${level?.name ?? 'its level'}’s ceiling.`}
      </p>
    </>
  )
}

/** Floors: "Ceiling lines up with", which sets this level's ceiling height to meet another level's ceiling. */
export function CeilingLineUp({ plan, levelId }: { plan: Plan; levelId: string }) {
  const st = usePlan.getState()
  const others = sortedLevels(plan).filter(l => l.id !== levelId)
  if (!others.length) return null
  const lined = ceilingLinedUpWith(plan, levelId)
  const options = [
    { id: '', label: lined ? 'Its own height' : 'No other level' },
    ...others.map(l => {
      const h = ceilingHeightToMatch(plan, levelId, l.id)
      return { id: l.id, label: h === null ? `${l.name} (too low from here)` : `${l.name} (RL ${rl(ceilingRL(plan, l.id))})` }
    }),
  ]
  return (
    <>
      <Select
        label="Ceiling lines up with"
        value={lined?.id ?? ''}
        options={options}
        onChange={id => {
          if (!id) return
          const height = ceilingHeightToMatch(plan, levelId, id)
          if (height !== null) st.commit(p => updateLevel(p, levelId, { height }))
        }}
      />
      <p className="muted small">
        Ceiling at RL {rl(ceilingRL(plan, levelId))}, {Math.round((ceilingRL(plan, levelId) - floorRL(plan, levelId)) * 1000)} mm above the floor.
        {lined ? ' Roof this building puts one roof over both.' : ' Line it up with another level to put one roof over both.'}
      </p>
    </>
  )
}
