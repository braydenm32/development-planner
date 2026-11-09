// A driveway's own levels, in Earthworks › Driveway and the driveway's inspector: the street end
// from the kerb, a surveyed spot level or a typed RL, and the garage end from the garage's slab or a
// typed RL. Then its grade between them as 1 in N and %, with an amber chip past the app's limit.

import { useMemo } from 'react'
import { DRIVE_RUN, driveVerdict, gradeText } from '../lib/drape'
import type { Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { driveDesign, driveEndPoints, driveGround, garageSlab, nearestKerbPoint, nearSpotLevels } from '../plan/driveway'
import type { Area, DriveLevels, Plan } from '../plan/model'
import { updateArea } from '../plan/ops'
import { usePlan } from '../plan/store'
import type { Earth } from '../plan/useEarthworks'
import { useSiteFeatures } from '../site/store'
import { Num } from './fields'
import './finishing.css'

interface Props {
  plan: Plan
  area: Area
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}

const rlText = (rl: number) => `RL ${rl.toFixed(2)}`

/** Kerb lines in the survey's local frame, from the site features (hidden ones too: a kerb is a kerb). */
function useKerbs(): Vec2[][] {
  const features = useSiteFeatures({ includeHidden: true })
  return useMemo(() => features.flatMap(f => (f.type === 'kerb' && f.geom.kind === 'line' ? [f.geom.pts] : [])), [features])
}

export function DrivewayLevels({ plan, area, survey, terrain, earth }: Props) {
  const kerbs = useKerbs()
  // The finished ground, with this drive graded into it once it has a level.
  const ground = useMemo(() => driveGround(earth, terrain.grid), [earth, terrain])
  const ends = useMemo(() => driveEndPoints(plan, area, survey.origin, survey.boundary), [plan, area, survey])
  if (!ends) return null
  const levels = area.drive ?? {}
  const set = (patch: Partial<DriveLevels>) => {
    const next: DriveLevels = { ...levels, ...patch }
    for (const k of Object.keys(next) as (keyof DriveLevels)[]) if (next[k] === undefined) delete next[k]
    usePlan.getState().commit(p => updateArea(p, area.id, { drive: Object.keys(next).length ? next : undefined }))
  }

  // Where the street end could take its level from.
  const groundStreet = ground.follow(ends.street)
  const kerb = nearestKerbPoint(kerbs, ends.street)
  const kerbRL = kerb && kerb.dist < 30 ? terrain.grid.sample(kerb.at[0], kerb.at[1]) : null
  const spots = nearSpotLevels(survey.levels, ends.street, 4, 15, ends.garage)
  const street = levels.street
  const streetChoice = !street ? 'ground' : street.from === 'kerb' ? 'kerb' : street.from === 'typed' ? 'typed' : `spot:${street.rl}`
  const streetOptions: { id: string; label: string }[] = [
    { id: 'ground', label: `Follows the ground (${rlText(groundStreet)})` },
    ...(kerbRL !== null ? [{ id: 'kerb', label: `Kerb, ${rlText(street?.from === 'kerb' ? street.rl : kerbRL)}` }] : []),
    ...spots.map(s => ({ id: `spot:${s.rl}`, label: `Spot ${rlText(s.rl)}, ${s.dist.toFixed(1)} m away` })),
    // A spot level chosen before, no longer among the nearest.
    ...(street?.from === 'spot' && !spots.some(s => s.rl === street.rl) ? [{ id: `spot:${street.rl}`, label: `Spot level ${rlText(street.rl)}` }] : []),
    { id: 'typed', label: 'Type an RL' },
  ]
  const chooseStreet = (id: string) => {
    if (id === 'ground') set({ street: undefined })
    else if (id === 'kerb' && kerbRL !== null) set({ street: { rl: Math.round(kerbRL * 1000) / 1000, from: 'kerb' } })
    else if (id === 'typed') set({ street: { rl: Math.round((street?.rl ?? groundStreet) * 100) / 100, from: 'typed' } })
    else if (id.startsWith('spot:')) set({ street: { rl: Number(id.slice(5)), from: 'spot' } })
  }

  const slab = garageSlab(plan)
  const groundGarage = ground.follow(ends.garage)
  const garage = levels.garage
  const garageChoice = garage === undefined ? 'ground' : garage === 'slab' ? 'slab' : 'typed'
  const garageOptions = [
    { id: 'ground', label: `Follows the ground (${rlText(groundGarage)})` },
    { id: 'slab', label: `${slab.name}, ${rlText(slab.rl)}` },
    { id: 'typed', label: 'Type an RL' },
  ]
  const chooseGarage = (id: string) => {
    if (id === 'ground') set({ garage: undefined })
    else if (id === 'slab') set({ garage: 'slab' })
    else set({ garage: Math.round((typeof garage === 'number' ? garage : garage === 'slab' ? slab.rl : groundGarage) * 100) / 100 })
  }

  const design = driveDesign(plan, area, ends, ground)
  return (
    <div className="drive-levels">
      <h4>Levels</h4>
      <Choice label="Street end" value={streetChoice} options={streetOptions} onChange={chooseStreet} />
      {street?.from === 'typed' && <Num label="Street end level" unit="RL" value={street.rl} onCommit={rl => set({ street: { rl, from: 'typed' } })} />}
      <Choice label="Garage end" value={garageChoice} options={garageOptions} onChange={chooseGarage} />
      {typeof garage === 'number' && <Num label="Garage end level" unit="RL" value={garage} onCommit={rl => set({ garage: rl })} />}
      {design ? (
        <>
          <div className="drive-grade">
            <span>
              Grade <b>{gradeText(design.grade.average)}</b>
            </span>
            <span className={`drive-chip ${design.tooSteep ? 'warn' : 'ok'}`} role={design.tooSteep ? 'alert' : undefined}>
              {driveVerdict(design.grade)}
            </span>
          </div>
          <p className={design.tooSteep ? 'notice small' : 'muted small'}>
            {rlText(design.street)} at the street to {rlText(design.garage)} at the garage, over {design.grade.length.toFixed(2)} m.
            {gradeText(design.grade.steepest) !== gradeText(design.grade.average) && ` Steepest ${DRIVE_RUN} m: ${gradeText(design.grade.steepest)}.`}
            {design.tooSteep && ' Steeper than 1 in 4 (25%) is hard to drive on: lower the garage, or lengthen the drive.'}
          </p>
        </>
      ) : (
        <p className="muted small">Give the drive a level at the street or the garage to see the grade it will be built to.</p>
      )}
    </div>
  )
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <label className="num">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
