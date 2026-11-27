// What floats on the canvas: the tool rail with the current tool's options beside it, the
// selection inspector, and the fit and orientation controls.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { withKey } from '../phone/words'
import { RoofModeSwitch } from '../components/RoofModeSwitch'
import { WallModeSwitch } from '../components/WallModeSwitch'
import { SelectionPanel, ToolOptions } from '../components/PlanSections'
import { TransformTools } from '../components/TransformTools'
import { DESIGN_RAIL, EARTHWORKS_RAIL, TOOLS, type ToolDef } from '../components/tools'
import { BRUSH_KEY, beginBrush, stopBrush, useBrush } from '../grading/store'
import { ZoomButtons } from '../components/ZoomButtons'
import { Icon, type IconName } from '../nav/icons'
import type { ActionId, CanvasView } from '../nav/menu'
import { isOpeningTool, usePlan, type Selection, type Tool } from '../plan/store'
import { ViewLock } from '../phone/ViewLock'
import { useTouchCanvas } from '../phone/device'
import { useSun } from '../sun/store'
import { TurnButtons } from '../a11y/SceneKeys'
import { focusLost } from '../a11y/rowFocus'
import { PLAN_NAME_ID } from '../a11y/planCanvas'
import { toolbarStep } from '../a11y/toolbar'
import { useCamera } from '../phone/cameraStore'
import { WalkButton } from '../walk/WalkPanel'
import { findSelection } from './selection'
import { hasToolCard } from './toolCard'
import type { Loaded } from './useSite'

/** A button on the rail: a plan tool, or (in Earthworks) the driveway and the grading brush. */
interface RailButton {
  id: string
  label: string
  short?: string
  key: string
  icon?: string
  tip: string
  group: string
  on: boolean
  pick: () => void
}

/** The tool rail's own keys: arrows, Home and End move the focus along it (and never nudge the plan from here). */
function railKeys(e: KeyboardEvent<HTMLDivElement>) {
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
  const to = toolbarStep(e.key, buttons.indexOf(document.activeElement as HTMLButtonElement), buttons.length)
  if (to === null) return
  e.preventDefault()
  e.stopPropagation()
  buttons[to]?.focus()
}

/** Measure and Note put themselves down when their button is pressed again. */
const TOGGLES: Tool[] = ['measure', 'note']

function toolButton(t: ToolDef, tool: Tool): RailButton {
  const on = tool === t.id
  return { ...t, on, pick: () => usePlan.getState().setTool(on && TOGGLES.includes(t.id) ? 'select' : t.id) }
}

/**
 * The rail's buttons for an area. Design has every drawing tool, a group at a time. Earthworks has
 * the ground's own: Move house, Retaining wall, Driveway (the Area tool, set to a driveway), the
 * grading brush and Measure (LF-30, HO-32).
 */
function railButtons(earthworks: boolean, tool: Tool, brushOn: boolean, areaKind: string): RailButton[] {
  if (!earthworks) return DESIGN_RAIL.map(t => toolButton(t, tool))
  const def = (id: Tool) => TOOLS.find(t => t.id === id)!
  return EARTHWORKS_RAIL.map((id): RailButton => {
    if (id === 'driveway')
      return {
        id,
        label: 'Driveway',
        key: def('area').key,
        icon: 'drive',
        tip: 'draw a driveway to see its grade and whether a car gets in',
        group: 'ground',
        on: tool === 'area' && areaKind === 'driveway' && !brushOn,
        pick: () => {
          stopBrush()
          usePlan.getState().setAreaDefault('driveway')
          usePlan.getState().setTool('area')
        },
      }
    if (id === 'brush')
      return {
        id,
        label: 'Grading brush',
        short: 'Brush',
        key: BRUSH_KEY,
        icon: 'shovel',
        tip: 'paint the ground down (cut) or up (fill) to a level',
        group: 'ground',
        on: brushOn,
        pick: () => (brushOn ? stopBrush() : beginBrush()),
      }
    const b = toolButton(def(id), brushOn ? 'select' : tool)
    // Select puts the brush down too; the rest of the ground's tools sit in one group, with Measure after.
    return { ...b, group: id === 'select' || id === 'measure' ? b.group : 'ground', on: id === 'select' ? b.on && !brushOn : b.on, pick: () => (stopBrush(), b.pick()) }
  })
}

export function ToolRail({ earthworks = false }: { earthworks?: boolean }) {
  const tool = usePlan(s => s.tool)
  const areaKind = usePlan(s => s.areaDefault)
  const brushOn = useBrush(s => s.on)
  // A phone shows the sketch, but draws it only on a computer.
  const phone = !!useTouchCanvas()?.phone
  const buttons = railButtons(earthworks, tool, brushOn, areaKind).filter(b => !(phone && (b as Partial<ToolDef>).desk))
  // One Tab stop for the whole rail (the tool in hand); the arrow keys, Home and End move along it.
  const stop = (buttons.find(b => b.on) ?? buttons[0])?.id
  return (
    <div className={`tool-rail${earthworks ? '' : ' full'}`} role="toolbar" aria-label={earthworks ? 'Ground tools' : 'Plan tools'} aria-orientation="vertical" onKeyDown={railKeys}>
      {buttons.map((b, i) => (
        // A line between one group of tools and the next.
        <span key={b.id} className={i > 0 && buttons[i - 1].group !== b.group ? 'tool-gap' : undefined}>
          <button tabIndex={b.id === stop ? 0 : -1} className={b.on ? 'on' : ''} aria-pressed={b.on} onClick={b.pick} data-tip={`${b.label}: ${b.tip} (${b.key})`} aria-label={withKey(`${b.label} tool`, b.key)} aria-description={b.tip}>
            <Icon name={(b.icon ?? 'select') as IconName} size={17} />
            <span className="tool-name">{b.short ?? b.label}</span>
          </button>
        </span>
      ))}
    </div>
  )
}

/** What a tool draws, as the selection names it: the Roof tool draws roofs, the Door tool openings. */
const drawsKind = (tool: Tool): Selection['type'] | null =>
  isOpeningTool(tool) ? 'opening' : tool === 'roof' || tool === 'stair' || tool === 'area' || tool === 'wall' || tool === 'furniture' ? tool : null

/** "roof", "stair": the thing in words, for the card's note. */
const KIND_WORDS: Partial<Record<Selection['type'], string>> = { roof: 'roof', stair: 'stair', area: 'area', wall: 'wall', furniture: 'piece of furniture', opening: 'opening' }

/**
 * The current tool's settings for what it draws next, in a small card beside the rail.
 * `compact`: above a tab's panel, the card is one line with its options folded, so it
 * doesn't push the panel down the screen. While one of the things it draws is selected (the
 * roof just drawn, say), the inspector shows that one's settings, so the card folds its own away
 * rather than show the same fields side by side.
 */
export function ToolCard({ compact = false }: { compact?: boolean }) {
  const tool = usePlan(s => s.tool)
  const selected = usePlan(s => s.selection?.type ?? null)
  const [open, setOpen] = useState(false)
  const [nextOpen, setNextOpen] = useState(false)
  const def = TOOLS.find(t => t.id === tool)
  if (!def || !hasToolCard(tool)) return null
  const shown = !compact || open
  const folded = !nextOpen && selected !== null && selected === drawsKind(tool)
  const word = selected ? (KIND_WORDS[selected] ?? 'item') : 'item'
  return (
    <section className={`float-card tool-card${compact ? ' compact' : ''}`} aria-label={`${def.label} tool`}>
      <header>
        <h2>
          {def.label} <kbd>{def.key}</kbd>
        </h2>
        {compact && (
          <button className="plain small" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide options' : 'Options'}
          </button>
        )}
        <button className="plain small" onClick={() => usePlan.getState().setTool('select')} title="Back to Select (V)">
          Done
        </button>
      </header>
      {shown &&
        (tool === 'move' ? (
          <p className="muted small">Drag the house on the plan to move it. Its distance to each side of the block shows as you go.</p>
        ) : folded ? (
          <div className="tool-options">
            {tool === 'roof' && <RoofModeSwitch />}
            {tool === 'wall' && <WallModeSwitch />}
            <p className="muted small">
              The selected {word}’s settings are on the right.{' '}
              <button className="link" onClick={() => setNextOpen(true)}>
                Settings for the next one
              </button>
            </p>
          </div>
        ) : (
          <ToolOptions />
        ))}
    </section>
  )
}

/**
 * When the panel closes (its thing deleted, the selection put down) with focus in it, focus goes
 * to the plan the thing was on rather than to the page. A list's row that can take it first does
 * (src/a11y/PlanLists.tsx): this looks a frame after that.
 */
function useFocusBackToPlan(shown: boolean) {
  useEffect(() => {
    if (!shown) return
    return () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (focusLost()) document.querySelector<HTMLElement>(`[aria-labelledby="${PLAN_NAME_ID}"]`)?.focus({ preventScroll: true })
        }),
      )
    }
  }, [shown])
}

/**
 * The selected item's settings and numbers, floating on the right of the plan (a sheet on
 * a phone). On a phone in View they read but can't be changed; nor in Approvals and Share
 * (`elsewhere`), which say where the thing is changed and go there with it still selected.
 */
export function Inspector({ d, readOnly = false, wide = false, elsewhere }: { d: Loaded; readOnly?: boolean; wide?: boolean; elsewhere?: { text: string; label: string; go: () => void } }) {
  const selection = usePlan(s => s.selection)
  const shown = !!selection && !!findSelection(d.plan, selection.id)
  useFocusBackToPlan(shown)
  if (!selection || !shown) return null
  const panel = <SelectionPanel plan={d.plan} survey={d.survey} terrain={d.terrain} earth={d.earth} />
  return (
    <aside className={`float-card inspector${wide ? ' wide' : ''}${readOnly ? ' read-only' : ''}`} aria-label="Selection" tabIndex={-1} data-esc-owner>
      <div className="sheet-grab" aria-hidden="true" />
      <button className="icon-button inspector-close" onClick={() => usePlan.getState().select(null)} aria-label="Close (clear the selection)" title="Close (Esc)">
        <Icon name="x" size={16} />
      </button>
      {readOnly ? (
        <ViewLock after why={elsewhere}>
          {panel}
        </ViewLock>
      ) : (
        <>
          {panel}
          <TransformTools plan={d.plan} />
        </>
      )}
    </aside>
  )
}

interface ControlsProps {
  canvas: CanvasView | 'print'
  up: 'house' | number
  run: (a: ActionId) => void
}

/** A view button: its name shows beside the icon on a desktop and is the icon's label on a phone. */
function Ctl({ icon, label, onClick, pressed }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    // The title names the button where a small window shows its icon alone (shell.css).
    <button onClick={onClick} aria-pressed={pressed} aria-label={label} title={label}>
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

/** The name of the CSS variable that holds the view bar's width, which the hint at the foot keeps clear of. */
const CONTROLS_W = '--controls-w'

/**
 * Tells the canvas how wide the view bar is (as `--controls-w`), so the hint beside it wraps
 * before it runs underneath: the bar's width changes with the canvas, the window and the screen.
 */
function useControlsWidth() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const host = el?.parentElement
    if (!el || !host) return
    const set = () => {
      const w = `${Math.ceil(el.getBoundingClientRect().width)}px`
      host.style.setProperty(CONTROLS_W, w)
      // The same width under a name of its own, for the hint's line above the bar on a small window (shell.css).
      host.style.setProperty('--view-bar-w', w)
    }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      host.style.removeProperty(CONTROLS_W)
      host.style.removeProperty('--view-bar-w')
    }
  }, [])
  return ref
}

/** Zoom out and in (desktop), Fit block, Fit house and North up on the plan; Reset camera, Sun and North up in 3D. On a phone, the 2D/3D switch too. */
export function CanvasControls({ canvas, up, run }: ControlsProps) {
  if (canvas === 'print') return null
  return <ViewBar canvas={canvas} up={up} run={run} />
}

function ViewBar({ canvas, up, run }: ControlsProps) {
  const ref = useControlsWidth()
  return (
    <div ref={ref} className="canvas-controls" role="group" aria-label="View">
      <span className="phone-only">
        <Ctl icon={canvas === 'plan' ? 'cube' : 'plan'} label={canvas === 'plan' ? '3D' : '2D'} onClick={() => run(canvas === 'plan' ? 'view-3d' : 'view-plan')} />
      </span>
      {canvas === 'plan' ? (
        <>
          <ZoomButtons className="desk-only" />
          <Ctl icon="fitBlock" label="Fit block" onClick={() => run('fit-block')} />
          <Ctl icon="fitHouse" label="Fit house" onClick={() => run('fit-house')} />
        </>
      ) : (
        <>
          {/* A press each, where a wheel, a drag or a pinch was the only way (the arrow keys and + and − do the same). */}
          <ZoomButtons onZoom={dir => useCamera.getState().nudge({ zoom: dir })} />
          <TurnButtons />
          <Ctl icon="rotate" label="Reset camera" onClick={() => run('reset-camera')} />
          <WalkButton />
          <SunCtl />
        </>
      )}
      <Ctl icon="download" label="Picture" onClick={() => run('save-picture')} />
      <Ctl icon="north" label="North up" pressed={up === 0} onClick={() => run('north-up')} />
    </div>
  )
}
