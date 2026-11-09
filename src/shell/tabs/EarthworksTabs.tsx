// Earthworks › Place, Cut & fill and Driveway, from the plan's position and cut and fill sections.

import {
  BatterFields,
  BoundaryDistances,
  DrivewayGrade,
  EarthworksIntro,
  EarthworksResults,
  FloorLevelField,
  GroundUnderHouse,
} from '../../components/PlanSections'
import { DrivewayLevels } from '../../components/DrivewayLevels'
import { usePlacementInfo, useRetainingWalls } from '../../components/planNumbers'
import { areaKind } from '../../plan/model'
import { usePlan } from '../../plan/store'
import { Caveat } from '../../legal/Caveat'
import { navigate } from '../../nav/router'
import { pickTool, selectOnPlan, useLoaded, type Loaded } from '../useSite'
import { Waiting } from './Waiting'

export function PlaceTab() {
  const d = useLoaded()
  return d ? <Place d={d} /> : <Waiting />
}

function Place({ d }: { d: Loaded }) {
  const info = usePlacementInfo(d.plan, d.survey, d.terrain)
  return (
    <>
      <FloorLevelField plan={d.plan} />
      {info ? (
        <>
          <GroundUnderHouse plan={d.plan} info={info} />
          <BoundaryDistances plan={d.plan} survey={d.survey} info={info} />
        </>
      ) : (
        <p className="muted small">Draw some walls to see ground levels and boundary distances.</p>
      )}
    </>
  )
}

export function CutFillTab() {
  const d = useLoaded()
  return d ? <CutFill d={d} /> : <Waiting />
}

function CutFill({ d }: { d: Loaded }) {
  const walls = useRetainingWalls(d.plan, d.survey, d.terrain, d.earth)
  return (
    <>
      <EarthworksIntro />
      <BatterFields plan={d.plan} />
      <EarthworksResults plan={d.plan} survey={d.survey} earth={d.earth} terrain={d.terrain} retaining={false} />
      {walls.length > 0 && (
        <p className="muted small">
          {walls.length} retaining wall{walls.length > 1 ? 's' : ''} hold back the batters.{' '}
          <button className="link" onClick={() => navigate({ kind: 'app', area: 'earthworks', tab: 'retaining-walls', view: 'plan' })}>
            See retaining walls
          </button>
        </p>
      )}
      <Caveat />
    </>
  )
}

export function DrivewayTab() {
  const d = useLoaded()
  const selection = usePlan(s => s.selection)
  if (!d) return <Waiting />
  const drives = d.plan.areas.filter(a => areaKind(a) === 'driveway')
  const draw = () => {
    usePlan.getState().setAreaDefault('driveway')
    pickTool('area')
  }
  return drives.length ? (
    <>
      {drives.map(a => {
        const on = selection?.type === 'area' && selection.id === a.id
        return (
          <div key={a.id} className={`drive${on ? ' on' : ''}`}>
            <h3>
              <button className="link" onClick={() => selectOnPlan(a.level, { type: 'area', id: a.id })}>
                {a.name}
              </button>
            </h3>
            <DrivewayLevels plan={d.plan} area={a} survey={d.survey} terrain={d.terrain} earth={d.earth} />
            <DrivewayGrade plan={d.plan} area={a} survey={d.survey} terrain={d.terrain} earth={d.earth} />
          </div>
        )
      })}
      <div className="row">
        <button className="secondary" onClick={draw}>
          Draw another driveway
        </button>
      </div>
    </>
  ) : (
    <>
      <p className="muted">No driveway yet. Draw one with the Area tool, kind Driveway, and its grade shows here.</p>
      <div className="row">
        <button className="secondary" onClick={draw}>
          Draw a driveway
        </button>
      </div>
    </>
  )
}
