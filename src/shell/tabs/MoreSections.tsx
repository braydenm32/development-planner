// What each area's More holds: the rare settings, each from its area's sections.

import { OrientationControl } from '../../components/OrientationControl'
import {
  MarginField,
  SlabBedField,
  PlacementOriginFields,
  PlanFileBody,
  StairOptions,
  SubfloorField,
  WallOptions,
} from '../../components/PlanSections'
import { FineTuningFields, PrintInstructions } from '../../components/ShareSections'
import { ExaggerationSlider, SurveyLayers, SurveyWarnings } from '../../components/SiteSections'
import type { ViewSettings } from '../../lib/storage'
import type { PrintSettings } from '../../print/build'
import { useEffect } from 'react'
import { navigate } from '../../nav/router'
import { useProjects } from '../../projects/session'
import { layersKey, madeBlock, markLayersSeen } from '../../site/layersSeen'
import { DRAWINGS_ID } from '../../site/sync'
import { PreviousSurvey } from '../../safety/PreviousSurvey'
import { isSketch } from '../../start/sketch'
import { useShell } from '../context'
import { ShortcutList, SingleKeysSwitch } from '../KeyboardHelp'
import { pickTool, useLoaded } from '../useSite'
import { Waiting } from './Waiting'

// Site

export function SurveyLayersSection() {
  const { layers, project, onRoleChange, survey } = useShell()
  const id = useProjects().currentId
  // Shown means seen: Site › Block's "guesses" badge goes.
  useEffect(() => markLayersSeen(layersKey(id, project.fileName)), [id, project.fileName])
  // A block the app made has no survey file: its own layers aren't the person's to sort out.
  if (madeBlock(project))
    return (
      <p className="muted small">
        {project.sketch ? 'This block is a sketch' : 'This block’s levels come from the state’s elevation model'}, so there is no survey file and no layers to check. When you add the survey, its layers are listed here.
      </p>
    )
  return <SurveyLayers layers={layers} roles={project.roles} onRoleChange={onRoleChange} survey={survey} />
}

export function ExaggerationSection() {
  const { view, changeView } = useShell()
  return <ExaggerationSlider view={view} onChange={(patch: Partial<ViewSettings>) => changeView({ ...view, ...patch })} />
}

export function BearingSection() {
  const { view, changeUp } = useShell()
  return (
    <>
      <OrientationControl value={view.up} onChange={changeUp} />
      <p className="muted small">What sits at the top of the plan and the 3D view. North up on the canvas switches between north and square to the house.</p>
    </>
  )
}

export function SurveyWarningsSection() {
  const { survey } = useShell()
  return survey?.warnings.length ? <SurveyWarnings survey={survey} /> : <p className="muted small">The survey came in without warnings.</p>
}

export function ReplaceSurveySection() {
  const { project, replaceSurvey } = useShell()
  const sketch = isSketch(project)
  return (
    <>
      <p className="muted small">
        {sketch ? (
          <>Now a sketch block. When the survey comes, add it here: your plan is kept, centred on the surveyed block at the same height above the ground.</>
        ) : project.dem ? (
          <>Now ground levels from the state’s elevation model, about ±{project.dem.accuracy} m. When the survey comes, add it here: it replaces the levels, and your plan is kept.</>
        ) : (
          <>
            Now <b>{project.fileName}</b>. Choose another DXF and a review shows how the block and house will line up before anything changes. Undo puts it back.
          </>
        )}
      </p>
      <div className="row">
        <button className="secondary" onClick={replaceSurvey}>
          {sketch || project.dem ? 'Add the survey…' : 'Replace survey…'}
        </button>
      </div>
      <PreviousSurvey />
    </>
  )
}

// Design

/** Design › More › Trace a plan picture: a way in to Site › Features › Drawings, where tracing lives (CB-27). */
export function TracePlanSection() {
  return (
    <>
      <p className="muted small">Lay a photo, scan or PDF of a floor plan under the plan, line it up by two points, then draw the walls over it here in Design.</p>
      <div className="row">
        <button className="secondary" onClick={() => navigate({ kind: 'app', area: 'site', tab: 'features', view: 'plan' }, { focus: DRAWINGS_ID })}>
          Add a plan picture…
        </button>
      </div>
    </>
  )
}

export function PlanFileSection() {
  const d = useLoaded()
  return d ? <PlanFileBody plan={d.plan} /> : <Waiting />
}

export function WallPresetSection() {
  return (
    <>
      <WallOptions />
      <div className="row">
        <button className="secondary" onClick={() => pickTool('wall')}>
          Draw walls
        </button>
      </div>
    </>
  )
}

export function StairDefaultsSection() {
  return <StairOptions />
}

// Earthworks

export function OriginSection() {
  const d = useLoaded()
  return d ? <PlacementOriginFields plan={d.plan} /> : <Waiting />
}

export function MarginSection() {
  const d = useLoaded()
  return d ? <MarginField plan={d.plan} /> : <Waiting />
}

export function SlabBedSection() {
  const d = useLoaded()
  return d ? <SlabBedField plan={d.plan} /> : <Waiting />
}

export function SubfloorSection() {
  const d = useLoaded()
  return d ? <SubfloorField plan={d.plan} /> : <Waiting />
}

// Share

export function FineTuningSection() {
  const { printPrefs, changePrintPrefs } = useShell()
  const settings = printPrefs.settings
  return <FineTuningFields settings={settings} onChange={(patch: Partial<PrintSettings>) => changePrintPrefs({ settings: { ...settings, ...patch } })} />
}

export function PrintInstructionsSection() {
  return <PrintInstructions />
}

/** Design › More › Keyboard shortcuts: every key, in groups (? opens the same list anywhere). */
export function KeyboardSection() {
  return (
    <>
      <p className="muted small">Press ? anywhere to see this list over whatever you are doing.</p>
      <SingleKeysSwitch />
      <ShortcutList />
    </>
  )
}
