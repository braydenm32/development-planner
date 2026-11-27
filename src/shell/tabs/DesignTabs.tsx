// Design › Floors, Rooms & areas, Roofs and Furniture, from the plan's sections (src/components/PlanSections.tsx).

import { FurniturePicker } from '../../components/FurniturePanel'
import { AreasBody, LevelsBody } from '../../components/LevelsPanel'
import { useMemo } from 'react'
import { FragmentRow, RoofOptions } from '../../components/PlanSections'
import { buildingHeight } from '../../plan/keyNumbers'
import { levelById, type Plan } from '../../plan/model'
import { roofGeometry } from '../../plan/roof'
import { usePlan } from '../../plan/store'
import { pickTool, planShowing, selectOnPlan, showPlan, useLoaded } from '../useSite'
import { Waiting } from './Waiting'

export function FloorsTab() {
  const d = useLoaded()
  return d ? <LevelsBody plan={d.plan} survey={d.survey} terrain={d.terrain} beforePick={() => planShowing() || showPlan()} /> : <Waiting />
}

export function RoomsTab() {
  const d = useLoaded()
  return d ? <AreasBody plan={d.plan} /> : <Waiting />
}

const ROOF_NAMES = { hip: 'Hip roof', gable: 'Gable roof', skillion: 'Skillion roof', flat: 'Flat roof' }

function RoofList({ plan }: { plan: Plan }) {
  const selection = usePlan(s => s.selection)
  if (!plan.roofs.length) return <p className="muted small">No roofs yet. Pick the Roof tool (F) and click inside the walls to roof the building.</p>
  return (
    <ul className="pick-list">
      {plan.roofs.map(r => {
        const g = roofGeometry(r)
        const on = selection?.type === 'roof' && selection.id === r.id
        return (
          <li key={r.id}>
            <button className={on ? 'on' : ''} aria-pressed={on} onClick={() => selectOnPlan(r.level, { type: 'roof', id: r.id })}>
              <span>
                {ROOF_NAMES[r.type]} <span className="muted">· {levelById(plan, r.level)?.name}</span>
              </span>
              <span className="muted">{g.error ? 'won’t build' : r.type === 'flat' ? `${g.area.toFixed(1)} m²` : `${r.pitch.toFixed(1)}° · ${g.area.toFixed(1)} m²`}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Building height, the one figure the strip, the Overview and Approvals › Checks give (buildingHeight). */
function BuildingHeight({ d }: { d: NonNullable<ReturnType<typeof useLoaded>> }) {
  const height = useMemo(() => buildingHeight(d.plan, d.survey, d.terrain), [d.plan, d.survey, d.terrain])
  if (height <= 0) return null
  return (
    <>
      <dl className="stats">
        <FragmentRow label="Building height" value={`${height.toFixed(2)} m`} strong />
      </dl>
      <p className="muted small">The highest point of the roof or walls above the natural ground under it, as Approvals › Checks measures it.</p>
    </>
  )
}

export function RoofsTab() {
  const d = useLoaded()
  if (!d) return <Waiting />
  return (
    <>
      <BuildingHeight d={d} />
      <h3>New roofs</h3>
      <RoofOptions />
      <div className="row">
        <button className="secondary" onClick={() => pickTool('roof')}>
          Draw a roof
        </button>
      </div>
      <h3>Roofs on the plan</h3>
      <RoofList plan={d.plan} />
    </>
  )
}

export function FurnitureTab() {
  const d = useLoaded()
  if (!d) return <Waiting />
  return (
    // Picking a piece picks the Furniture tool, ready to click on the plan.
    <div
      onClickCapture={e => {
        if ((e.target as HTMLElement).closest('.furniture-items button')) pickTool('furniture')
      }}
    >
      <FurniturePicker />
    </div>
  )
}
