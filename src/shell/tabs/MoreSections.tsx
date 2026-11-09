// What each area's More holds: the rare settings, each from its area's sections.

import { OrientationControl } from '../../components/OrientationControl'
import {
  MarginField,
  OpeningOptions,
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
import { useProjects } from '../../projects/session'
import { layersKey, markLayersSeen } from '../../site/layersSeen'
import { PreviousSurvey } from '../../safety/PreviousSurvey'
import { isSketch } from '../../start/sketch'
import { usePlan } from '../../plan/store'
import { useShell } from '../context'
import { ShortcutList } from '../KeyboardHelp'
import { pickTool, useLoaded } from '../useSite'
import { Waiting } from './Waiting'

// Site

export function SurveyLayersSection() {
  const { layers, project, onRoleChange, survey } = useShell()
  const id = useProjects().currentId
  // Shown means seen: Site › Block's "guesses" badge goes.
  useEffect(() => markLayersSeen(layersKey(id, project.fileName)), [id, project.fileName])
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

function ToolButton({ tool, label, keyName }: { tool: 'opening' | 'garage'; label: string; keyName: string }) {
  const current = usePlan(s => s.tool)
  return (
    <div className="row">
      <button className={`secondary${current === tool ? ' on' : ''}`} aria-pressed={current === tool} onClick={() => pickTool(tool)}>
        {label} <kbd>{keyName}</kbd>
      </button>
    </div>
  )
}

export function OpeningToolSection() {
  return (
    <>
      <p className="muted small">An opening is a gap in a wall with no door: an archway or an open carport side. Click on a wall to place one.</p>
      <ToolButton tool="opening" label="Use the Opening tool" keyName="O" />
      <OpeningOptions kind="opening" />
    </>
  )
}

export function GarageDoorToolSection() {
  return (
    <>
      <p className="muted small">A garage door has no swing: a dashed panel across the opening on the plan, and a closed panel in 3D. Click on a wall to place one.</p>
      <ToolButton tool="garage" label="Use the Garage door tool" keyName="G" />
      <OpeningOptions kind="garage" />
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
      <ShortcutList />
    </>
  )
}
