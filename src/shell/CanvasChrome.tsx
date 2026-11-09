// What floats on the canvas: the tool rail with the current tool's options beside it, the
// selection inspector, and the fit and orientation controls.

import { SelectionPanel, ToolOptions } from '../components/PlanSections'
import { TOOLS } from '../components/tools'
import { ZoomButtons } from '../components/ZoomButtons'
import { Icon, type IconName } from '../nav/icons'
import type { ActionId, CanvasView } from '../nav/menu'
import { usePlan } from '../plan/store'
import { ViewLock } from '../phone/ViewLock'
import { useSun } from '../sun/store'
import { findSelection } from './selection'
import { hasToolCard } from './toolCard'
import type { Loaded } from './useSite'

const RAIL = TOOLS.filter(t => !t.more)

export function ToolRail() {
  const tool = usePlan(s => s.tool)
  const st = usePlan.getState()
  return (
    <div className="tool-rail" role="toolbar" aria-label="Plan tools" aria-orientation="vertical">
      {RAIL.map((t, i) => (
        <span key={t.id} className={i === 1 ? 'tool-gap' : undefined}>
          <button className={tool === t.id ? 'on' : ''} aria-pressed={tool === t.id} onClick={() => st.setTool(t.id)} title={`${t.label} (${t.key})`} aria-label={`${t.label} tool`}>
            <Icon name={(t.icon ?? 'select') as IconName} size={19} />
          </button>
        </span>
      ))}
    </div>
  )
}

/** The current tool's settings for what it draws next, in a small card beside the rail. */
export function ToolCard() {
  const tool = usePlan(s => s.tool)
  const def = TOOLS.find(t => t.id === tool)
  if (!def || !hasToolCard(tool)) return null
  return (
    <section className="float-card tool-card" aria-label={`${def.label} tool`}>
      <header>
        <h2>
          {def.label} <kbd>{def.key}</kbd>
        </h2>
        <button className="plain small" onClick={() => usePlan.getState().setTool('select')} title="Back to Select (V)">
          Done
        </button>
      </header>
      {tool === 'move' ? <p className="muted small">Drag the house on the plan to move it. Its distance to each side of the block shows as you go.</p> : <ToolOptions />}
    </section>
  )
}

/**
 * The selected item's settings and numbers, floating on the right of the plan (a sheet on
 * a phone). On a phone in View they read but can't be changed.
 */
export function Inspector({ d, readOnly = false, wide = false }: { d: Loaded; readOnly?: boolean; wide?: boolean }) {
  const selection = usePlan(s => s.selection)
  if (!selection || !findSelection(d.plan, selection.id)) return null
  const panel = <SelectionPanel plan={d.plan} survey={d.survey} terrain={d.terrain} earth={d.earth} />
  return (
    <aside className={`float-card inspector${wide ? ' wide' : ''}${readOnly ? ' read-only' : ''}`} aria-label="Selection">
      <div className="sheet-grab" aria-hidden="true" />
      <button className="icon-button inspector-close" onClick={() => usePlan.getState().select(null)} aria-label="Close (clear the selection)" title="Close (Esc)">
        <Icon name="x" size={16} />
      </button>
      {readOnly ? <ViewLock after>{panel}</ViewLock> : panel}
    </aside>
  )
}

interface ControlsProps {
  canvas: CanvasView | 'print'
  up: 'house' | number
  run: (a: ActionId) => void
}

function Ctl({ icon, label, onClick, pressed }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={pressed} title={label}>
      <Icon name={icon} size={16} />
      <span>{label}</span>
    </button>
  )
}

/** The sun study's switch: the 3D light follows the real sun, with its card to pick the day and time. */
function SunCtl() {
  const on = useSun(s => s.on)
  return <Ctl icon="sun" label="Sun" pressed={on} onClick={() => useSun.getState().setOn(!on)} />
}

/** Zoom out and in (desktop), Fit block, Fit house and North up on the plan; Reset camera, Sun and North up in 3D. On a phone, the Plan/3D switch too. */
export function CanvasControls({ canvas, up, run }: ControlsProps) {
  if (canvas === 'print') return null
  return (
    <div className="canvas-controls" role="group" aria-label="View">
      <span className="phone-only">
        <Ctl icon={canvas === 'plan' ? 'cube' : 'plan'} label={canvas === 'plan' ? '3D' : 'Plan'} onClick={() => run(canvas === 'plan' ? 'view-3d' : 'view-plan')} />
      </span>
      {canvas === 'plan' ? (
        <>
          <ZoomButtons className="desk-only" />
          <Ctl icon="fitBlock" label="Fit block" onClick={() => run('fit-block')} />
          <Ctl icon="fitHouse" label="Fit house" onClick={() => run('fit-house')} />
        </>
      ) : (
        <>
          <Ctl icon="rotate" label="Reset camera" onClick={() => run('reset-camera')} />
          <SunCtl />
        </>
      )}
      <Ctl icon="north" label="North up" pressed={up === 0} onClick={() => run('north-up')} />
    </div>
  )
}
