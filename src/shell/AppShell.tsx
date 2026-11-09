// The app's frame (direction B): areas on a rail, the area's tabs and the project's controls
// in the top bar, the key numbers on one line under it, and the canvas filling the rest
// with the tab's panel, the tools and the selection floating on it. Everything it shows
// comes from the menu config (src/nav/menu.ts) and the section components in src/components.

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FoldingContext, foldKey, isUnfolded } from '../components/folding'
import { LocalSaveChip } from '../cloud/LocalSave'
import { saveNow } from '../cloud/saveState'
import { SyncChip } from '../cloud/SyncChip'
import { useCloud } from '../cloud/state'
import { Panel } from '../components/Panel'
import { CanvasFrame, type Insets } from '../components/canvasFrame'
import { useFlow } from '../flow/store'
import { COSTS_ASIDE_W, COSTS_W, INSPECTOR_W, PANEL_W, WIDE_TABS, WIDE_W } from './panelWidth'
import { CostsStrip } from '../costs/CostsTabs'
import { useCosts } from '../costs/store'
import { useWideForAside } from '../costs/useEstimate'
import { importPlanFile } from '../components/planFile'
import { Icon, Logo } from '../nav/icons'
import { shortcutText, typingIn } from '../nav/keys'
import { KeyboardHelp } from './KeyboardHelp'
import { openKeyboardHelp } from './keyboardHelpStore'
import { areaById, HOMES, MORE, tabOf, type ActionId, type Entry, type NumberId, type Place } from '../nav/menu'
import { canvasOf, carriesSelection, tabRoute, type AppRoute } from '../nav/route'
import { navigate, useRouter } from '../nav/router'
import type { SearchItem } from '../nav/search'
import { isRetaining, sortedLevels } from '../plan/model'
import { usePlan } from '../plan/store'
import { useSiteStore } from '../site/store'
import { undoTarget } from './undoTarget'
import { useFileStep } from '../safety/fileUndo'
import { useSections } from '../sections/store'
import { useSiteWarnings } from '../site/sync'
import { SunCard } from '../sun/SunCard'
import { runAction } from './actions'
import { CanvasControls, Inspector, ToolCard, ToolRail } from './CanvasChrome'
import { hasToolCard } from './toolCard'
import { CommandPalette, type Choice } from './CommandPalette'
import { ShellContext, type ShellData } from './context'
import { AreaNav, TabBar } from './Nav'
import { OverviewSheet } from './OverviewSheet'
import { ProjectMenu } from './ProjectMenu'
import { MORE_SECTIONS, TAB_ASIDES, TAB_PANELS, TAB_TOOL } from './sections'
import { useChecks } from '../checks/useChecks'
import { SummaryStrip } from './SummaryStrip'
import { floorDrawn } from './drawn'
import { useKeyNumbers } from './useKeyNumbers'
import { useRouteSync } from './useRouteSync'
import { switchView, type Loaded } from './useSite'
import { forgetPose, projectKey } from '../phone/camera'
import { useCamera } from '../phone/cameraStore'
import { PresetBar, ViewEditSwitch } from '../phone/CanvasBits'
import { canEdit, TouchCanvas, usePhone, usePhoneMode } from '../phone/device'
import { useNativeFeel } from '../phone/native'
import { PeekSheet } from '../phone/PeekSheet'
import { inspectorShows, panelLocked, panelStartsHidden, peekShows } from '../phone/reach'
import { ViewLock } from '../phone/ViewLock'
import { useSheetDrag, useSheetSize } from '../phone/sheetDrag'
import { projectsNow } from '../projects/session'
import { showToast } from '../safety/store'
import { ErrorBoundary } from './ErrorBoundary'
import './fonts.css'
import './shell.css'
import '../phone/phone.css'

const PROJECT_ITEMS = HOMES.find(h => h.id === 'project-menu')!.items

/** Actions that are harmless to run as soon as a feature that lives on them is chosen. */
const SAFE = (a: ActionId) =>
  a.startsWith('tool:') ||
  a.startsWith('term:') ||
  ['guide', 'glossary', 'plan-tips', 'view-plan', 'view-3d', 'overview', 'fit-house', 'fit-block', 'zoom-in', 'zoom-out', 'projects', 'new-project', 'about', 'privacy', 'terms', 'accuracy', 'cloud', 'reset-camera', 'camera-street', 'camera-above', 'camera-rear', 'pick-contour', 'keyboard-help'].includes(a)

/** The 3D presets' actions, by the preset they show. */
const PRESET_OF = { 'camera-street': 'street', 'camera-above': 'above', 'camera-rear': 'rear' } as const

interface Props {
  data: ShellData
  /** The plan, the 3D view or the print preview (App.tsx renders them). */
  canvas: ReactNode
  /** The Projects home (src/projects), shown at #/projects. */
  projectsHome: ReactNode
}

export function AppShell({ data: app, canvas, projectsHome }: Props) {
  const route = useRouter(s => s.route)
  const plan = usePlan(s => s.plan)
  const phone = usePhone()
  const [palette, setPalette] = useState(false)
  const [menu, setMenu] = useState<{ open: boolean; focus: string | null }>({ open: false, focus: null })
  const [overview, setOverview] = useState(false)
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null)
  const [panelHidden, setPanelHidden] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const planInput = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const mode = usePhoneMode(s => s.mode)

  const canvasKind = route.kind === 'app' ? canvasOf(route) : null
  // Full screen 3D, for showing people: it lasts until Done, or until you go somewhere else.
  const where = route.kind === 'app' ? `${route.area}/${route.tab}/${route.view}` : ''
  const [presentingAt, setPresentingAt] = useState<string | null>(null)
  const presenting = phone && canvasKind === '3d' && presentingAt === where
  const setPresenting = (on: boolean) => setPresentingAt(on ? where : null)

  useRouteSync()
  useNativeFeel(phone)
  useSheetDrag(shellRef, phone)

  const say = useCallback((text: string) => setToast(t => ({ text, n: (t?.n ?? 0) + 1 })), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // The 3D camera is remembered per project: by its id in Projects, or by its survey before that.
  // A new survey object comes with every project opened, so the id is current when it changes.
  const key = useMemo(() => projectsNow().opened?.id ?? projectKey(app.project), [app.project])
  // Opening a file says what happened itself, with Undo (src/safety).
  const data: ShellData = {
    ...app,
    // Reset forgets where the camera was left, so the view starts afresh.
    resetCamera: () => {
      forgetPose(key)
      app.resetCamera()
    },
  }

  const run = (a: ActionId) => {
    // The 3D camera: presets, north up and (on a phone) reset move it smoothly instead of starting it again.
    const preset = a === 'reset-camera' ? (phone ? 'street' : null) : a in PRESET_OF ? PRESET_OF[a as keyof typeof PRESET_OF] : null
    if (preset || (a === 'north-up' && canvasKind === '3d')) {
      if (canvasKind === '3d') useCamera.getState().go(preset ?? 'north')
      else {
        // Not in 3D yet: it opens at the preset.
        if (a === 'reset-camera') forgetPose(key)
        useCamera.getState().queue(preset ?? 'street')
        switchView('3d')
      }
      return true
    }
    return runAction(a, {
      shell: data,
      toast: say,
      openOverview: () => setOverview(true),
      pickFile: kind => (kind === 'project' ? projectInput : planInput).current?.click(),
    })
  }

  const openPalette = () => {
    opener.current = document.activeElement as HTMLElement | null
    setMenu({ open: false, focus: null })
    setPalette(true)
  }
  const closePalette = (restore: boolean) => {
    setPalette(false)
    if (restore) opener.current?.focus?.()
  }

  // ⌘K / Ctrl+K from anywhere; undo and redo when the plan (which has its own keys) isn't showing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (palette) closePalette(true)
        else openPalette()
        return
      }
      // ⌘S / Ctrl+S, even while typing: the work saves itself, so say where rather than opening the browser's Save Page.
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!e.repeat) void saveNow().then(text => showToast({ text }))
        return
      }
      // ? lists the keys, wherever you are (not while typing).
      if (e.key === '?' && !mod && !palette && !typingIn(e.target)) {
        e.preventDefault()
        openKeyboardHelp()
        return
      }
      if (canvasKind === 'plan' || palette || typingIn(e.target) || !mod) return
      const k = e.key.toLowerCase()
      if (k === 'z' || k === 'y') {
        e.preventDefault()
        if (k === 'y' || e.shiftKey) undoTarget('redo').redo()
        else undoTarget('undo').undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const loaded: Loaded | null = data.survey && data.terrain && plan ? { ...data, plan, survey: data.survey, terrain: data.terrain } : null

  // ⌘K: go to where an item lives, and run or offer its action.
  const goTo = (at: string, from: AppRoute | null) => {
    const [area, tab, item] = at.split('/')
    const a = areaById(area)
    if (!a) return
    navigate(tabRoute(from ?? route, a.id, tab), item ? { focus: item } : {})
  }
  const goToPlace = (place: Place) => {
    if (place.kind === 'area') navigate(tabRoute(route, place.area.id, place.area.defaultTab))
    else if (place.kind === 'tab') navigate(tabRoute(route, place.area.id, place.tab.id))
    else if (place.kind === 'more') navigate(tabRoute(route, place.area.id, MORE), { focus: place.item.id })
  }
  const openMenuAt = (e: Entry, place: Place) => {
    const id = place.kind === 'home' && place.home.id === 'project-menu' ? e.id : (PROJECT_ITEMS.find(i => i.action && i.action === e.action)?.id ?? null)
    setMenu({ open: true, focus: id })
  }
  const choose = (item: SearchItem, direct: boolean): Choice => {
    const e = item.entry
    const place = item.place
    if (e.action && e.run) {
      let mode = e.run
      if (item.kind === 'feature' && mode === 'now' && !SAFE(e.action)) mode = 'offer'
      if (mode === 'menu') {
        openMenuAt(e, place)
        return 'done'
      }
      if (mode === 'now' || direct) {
        run(e.action)
        // Things on the Projects home's cards: the action goes there, the hint says where on the card.
        if (e.hint) say(e.hint)
        return 'done'
      }
      if (e.at) goTo(e.at, null)
      else goToPlace(place)
      return 'offer'
    }
    if (place.kind === 'home' && place.home.id === 'project-menu') {
      openMenuAt(e, place)
      return 'done'
    }
    if (e.at) goTo(e.at, null)
    else goToPlace(place)
    if (e.hint) say(e.hint)
    else if (e.shortcut) say(`${e.label}: ${shortcutText(e.shortcut)}`)
    return 'done'
  }

  const fileInputs = (
    <>
      <input
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void data.openProject(f)
        }}
      />
      <input
        ref={planInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) await importPlanFile(f)
        }}
      />
    </>
  )

  const topRight = (
    <div className="top-actions">
      {route.kind === 'app' && (
        <div className="view-switch desk-only" role="group" aria-label="Canvas">
          {(['plan', '3d'] as const).map(v => (
            <button key={v} className={canvasKind === v ? 'on' : ''} aria-pressed={canvasKind === v} onClick={() => run(v === 'plan' ? 'view-plan' : 'view-3d')}>
              <Icon name={v === 'plan' ? 'plan' : 'cube'} size={15} />
              {v === 'plan' ? 'Plan' : '3D'}
            </button>
          ))}
        </div>
      )}
      <UndoRedo />
      <button className="search-button" onClick={openPalette} aria-label="Search (⌘K)" aria-keyshortcuts="Meta+K Control+K">
        <Icon name="search" size={16} />
        <span className="desk-only">Search</span>
        <kbd className="desk-only">{shortcutText('mod+K')}</kbd>
      </button>
      <SyncChip />
      {route.kind === 'app' && <LocalSaveChip onDownload={() => run('save-project')} />}
      <ProjectMenu open={menu.open} focusItem={menu.focus} onOpenChange={open => setMenu({ open, focus: null })} run={run} />
    </div>
  )

  return (
    <ShellContext.Provider value={data}>
      <div ref={shellRef} className={`app-shell${phone ? ' phone' : ''}${presenting ? ' presenting' : ''}`}>
        <AreaNav route={route} go={r => navigate(r)} variant="rail" />
        {route.kind === 'projects' ? (
          <>
            <header className="top-bar">
              <div className="top-title">All projects</div>
              {topRight}
            </header>
            <main className="shell-main projects">{projectsHome}</main>
          </>
        ) : route.kind === 'page' ? null /* the pages about the app show alone (src/legal), never in the frame */ : (
          <AreaView
            route={route}
            loaded={loaded}
            canvas={canvas}
            canvasKind={canvasKind!}
            phone={phone}
            editing={canEdit(phone, mode)}
            projectKey={key}
            presenting={presenting}
            setPresenting={setPresenting}
            topRight={topRight}
            overview={overview}
            setOverview={setOverview}
            panelHidden={panelHidden}
            setPanelHidden={setPanelHidden}
            run={run}
          />
        )}
        <AreaNav route={route} go={r => navigate(r)} variant="bottom" />
        {fileInputs}
        <KeyboardHelp />
        {palette && <CommandPalette choose={choose} run={item => item.entry.action && run(item.entry.action)} onClose={closePalette} />}
        {toast && (
          <div key={toast.n} className="toast" role="status">
            {toast.text}
            <button className="icon-button" onClick={() => setToast(null)} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>
    </ShellContext.Provider>
  )
}

function UndoRedo() {
  // Read so the buttons draw again when any history or the open tab changes; undoTarget picks among them.
  useSiteStore(s => s.focus)
  useCosts(s => s.focus)
  usePlan(s => s.past)
  usePlan(s => s.future)
  useSiteStore(s => s.past)
  useSiteStore(s => s.future)
  useCosts(s => s.past)
  useCosts(s => s.future)
  useFileStep(s => s.step)
  const undo = undoTarget('undo')
  const redo = undoTarget('redo')
  return (
    <div className="undo-redo" role="group" aria-label="History">
      <button onClick={() => undoTarget('undo').undo()} disabled={!undo.past.length} aria-label={`Undo (${shortcutText('mod+Z')})`} data-tip={`Undo ${shortcutText('mod+Z')}`}>
        <Icon name="undo" size={17} />
      </button>
      <button onClick={() => undoTarget('redo').redo()} disabled={!redo.future.length} aria-label={`Redo (${shortcutText('mod+shift+Z')})`} data-tip={`Redo ${shortcutText('mod+shift+Z')}`}>
        <Icon name="redo" size={17} />
      </button>
    </div>
  )
}

interface AreaViewProps {
  route: AppRoute
  loaded: Loaded | null
  canvas: ReactNode
  canvasKind: 'plan' | '3d' | 'print'
  phone: boolean
  /** Whether the plan can change: always on a desktop, only in Edit on a phone. */
  editing: boolean
  projectKey: string
  presenting: boolean
  setPresenting: (on: boolean) => void
  topRight: ReactNode
  overview: boolean
  setOverview: (open: boolean) => void
  panelHidden: boolean
  setPanelHidden: (hidden: boolean) => void
  run: (a: ActionId) => void
}

/** An area: its tabs, the strip, and the canvas with what floats on it. */
function AreaView({ route, loaded, canvas, canvasKind, phone, editing, projectKey, presenting, setPresenting, topRight, overview, setOverview, panelHidden, setPanelHidden, run }: AreaViewProps) {
  const area = areaById(route.area)!
  const tab = tabOf(area, route.tab)!
  const tabKey = `${area.id}/${tab.id}`
  const view = loaded?.view
  // Costs reports on the design: the plan is for looking at, and on a phone the panel takes the screen.
  const report = !!area.report
  const selection = usePlan(s => s.selection)
  const tool = usePlan(s => s.tool)
  // On a phone in View, the plan has no tools.
  const rail = area.rail && canvasKind === 'plan' && !!loaded && editing
  const Body = route.tab === MORE ? MorePanel : TAB_PANELS[tabKey]
  // Where the app has no cloud, a tab's line doesn't promise what only the cloud gives (Send's links).
  const noCloud = useCloud(s => s.phase === 'unavailable')
  const subtitle = route.tab === MORE ? area.more.subtitle : noCloud && tab.offlineSubtitle ? tab.offlineSubtitle : tab.subtitle
  const hasPanel = !tab.noPanel && !!Body
  const showPanel = hasPanel && !panelHidden
  // A retaining wall's panel is the Retaining walls tab in Earthworks, and the inspector elsewhere.
  const selRetaining = !!loaded && selection?.type === 'wall' && loaded.plan.walls.some(w => w.id === selection.id && isRetaining(w))
  const inTab = selRetaining && tabKey === 'earthworks/retaining-walls' && showPanel
  // While the tab asks about a wall, the tool's own card steps aside.
  const toolCard = rail && hasToolCard(tool) && TAB_TOOL[tabKey] !== tool && !inTab
  const inspector = !report && inspectorShows(canvasKind, !!loaded, !!selection, inTab)
  // A phone's numbers sit at the bottom of the canvas when nothing else is there; slim while editing or turned sideways.
  const peek = peekShows({ phone, loaded: !!loaded, canvas: canvasKind, inspector, panel: showPanel, toolCard: !!toolCard, overview })
  const slim = canvasKind === 'plan' && editing
  // View on a phone locks the panels that change the plan, with a way to Edit.
  const locked = panelLocked(phone, editing, tabKey)

  // Fitting the plan, and framing the 3D presets, keeps clear of what floats over it.
  const [peekH, setPeekH] = useState(0)
  // The sun study's card at the foot of the 3D view: the picture moves up clear of it.
  const [sunH, setSunH] = useState(0)
  const sunClear = canvasKind === '3d' && sunH > 0 ? sunH + 70 : 0
  const wide = WIDE_TABS.has(tabKey)
  // On a phone, a tab's panel pulled up to full height stays so from tab to tab (src/phone/sheetDrag.ts).
  const tall = useSheetSize(s => s.tall) && phone
  const wideInspector = selRetaining
  // What floats on the right of the plan for this tab (Costs › Estimate's materials), on a window wide enough.
  const Aside = TAB_ASIDES[tabKey]
  const wideWindow = useWideForAside()
  const aside = !!Aside && !phone && showPanel && wideWindow && !!loaded && canvasKind !== 'print'
  const insets: Insets = useMemo(() => {
    if (phone) return { l: rail ? 68 : 0, r: presenting ? 0 : 60, t: 62, b: (peek ? (peekH || (slim ? 52 : 190)) + 12 : 16) + sunClear }
    const col = showPanel || toolCard ? (report ? COSTS_W : wide ? WIDE_W : PANEL_W) + 14 : 0
    return { l: (rail ? 80 : 14) + col, r: inspector ? (wideInspector ? WIDE_W : INSPECTOR_W) + 30 : aside ? COSTS_ASIDE_W + 30 : 16, t: 56, b: Math.max(56, sunClear) }
  }, [phone, presenting, rail, showPanel, toolCard, inspector, wide, wideInspector, peek, slim, peekH, report, aside, sunClear])
  const touch = useMemo(() => ({ phone, viewOnly: (phone && !editing) || report, projectKey }), [phone, editing, projectKey, report])

  // Since the panel can hide, a new tab brings it back. On a phone the 3D view needs the
  // whole screen, so there the panel starts tucked away as a pill.
  useEffect(() => setPanelHidden(panelStartsHidden(phone, canvasKind)), [tabKey, phone, canvasKind, setPanelHidden])
  // A link to something in the panel (the strip's To check, ⌘K's More items) brings it back too.
  const focus = useRouter(s => s.focus)
  useEffect(() => {
    if (focus) setPanelHidden(false)
  }, [focus, setPanelHidden])

  // While Site › Features is open, Site features has the plan: Undo works on its features, and
  // its notices show. Leaving the tab puts its tool down, as a tool card's Back does.
  const siteTab = tabKey === 'site/features'
  useEffect(() => {
    if (siteTab) {
      useSiteStore.setState({ focus: true })
      return
    }
    const s = useSiteStore.getState()
    if (s.tool) s.setTool(null)
    useSiteStore.setState({ focus: false, highlight: null, selected: null })
  }, [siteTab])
  useEffect(() => () => useSiteStore.setState({ focus: false }), [])
  // While Costs is open, Undo works on costs and its lines point things out on the plan.
  const costsArea = area.id === 'costs'
  useEffect(() => {
    useCosts.setState(costsArea ? { focus: true } : { focus: false, hover: null, opened: null })
  }, [costsArea])
  useEffect(() => () => useCosts.setState({ focus: false, hover: null, opened: null }), [])
  // On a phone, lining a drawing up or tracing needs the whole plan: the panel tucks away
  // while Site features has a tool out, and comes back when it's put down.
  const siteTool = useSiteStore(s => s.tool !== null)
  const lastSiteTool = useRef(siteTool)
  useEffect(() => {
    if (lastSiteTool.current === siteTool) return
    lastSiteTool.current = siteTool
    if (phone) setPanelHidden(siteTool)
  }, [siteTool, phone, setPanelHidden])
  // So does picking a contour for a floor from Design › Floors.
  const picking = useFlow(s => s.picking !== null)
  const lastPicking = useRef(picking)
  useEffect(() => {
    if (lastPicking.current === picking) return
    lastPicking.current = picking
    if (phone) setPanelHidden(picking)
  }, [picking, phone, setPanelHidden])
  // And drawing a section line from Design › Sections.
  const drawingSection = useSections(s => s.drawing !== null)
  const lastDrawingSection = useRef(drawingSection)
  useEffect(() => {
    if (lastDrawingSection.current === drawingSection) return
    lastDrawingSection.current = drawingSection
    if (phone) setPanelHidden(drawingSection)
  }, [drawingSection, phone, setPanelHidden])
  // Picking a site feature on the plan elsewhere opens Site › Features, where its details are.
  const siteSel = useSiteStore(s => s.selected)
  useEffect(() => {
    if (!siteSel) return
    const r = useRouter.getState().route
    if (r.kind === 'app' && !(r.area === 'site' && r.tab === 'features')) navigate(tabRoute(r, 'site', 'features'))
  }, [siteSel])

  // Into another area, a selection goes only where it can be worked on; elsewhere it's put down,
  // so its card doesn't stay open beside a panel that has nothing to do with it.
  const lastRoute = useRef(route)
  useEffect(() => {
    const from = lastRoute.current
    lastRoute.current = route
    const st = usePlan.getState()
    const sel = st.selection
    if (!sel || !st.plan || from.area === route.area) return
    const retaining = sel.type === 'wall' && st.plan.walls.some(w => w.id === sel.id && isRetaining(w))
    if (!carriesSelection(from, route, retaining ? 'retaining' : sel.type)) st.select(null)
  }, [route])

  // Drawing or picking a retaining wall in Earthworks opens its tab. Only a new selection does,
  // so Back from the tab, or a reload, stays where it was.
  const selId = selection?.id
  const lastSel = useRef(selId)
  useEffect(() => {
    if (lastSel.current === selId) return
    lastSel.current = selId
    if (!selRetaining || area.id !== 'earthworks') return
    const r = useRouter.getState().route
    if (r.kind === 'app' && r.tab !== 'retaining-walls') navigate(tabRoute(r, 'earthworks', 'retaining-walls'))
    else setPanelHidden(false)
  }, [selId, selRetaining, area.id, setPanelHidden])

  return (
    <>
      <header className="top-bar">
        <a className="phone-logo phone-only" href="#/projects" aria-label="All projects">
          <Logo size={22} />
        </a>
        <TabBar route={route} go={r => navigate(r)} />
        {topRight}
      </header>
      {loaded ? (
        <NumbersHost
          d={loaded}
          route={route}
          canvasKind={canvasKind}
          showPanel={showPanel}
          tabShows={tab.shows}
          overview={overview}
          setOverview={setOverview}
          run={run}
          phone={phone}
          peek={peek ? (slim ? 'slim' : 'full') : null}
          onPeekHeight={setPeekH}
        />
      ) : (
        !phone && <SummaryStrip route={route} numbers={null} shown={{}} onBalance={() => {}} onOverview={() => setOverview(!overview)} overviewOpen={false} />
      )}
      <main
        className={`shell-main viewport canvas-${canvasKind}${rail ? ' has-rail' : ''}${showPanel || toolCard ? ' has-col' : ''}${hasPanel && !showPanel && !toolCard ? ' has-pill' : ''}${inspector ? ' has-inspector' : ''}${peek ? (slim ? ' has-peek slim' : ' has-peek') : ''}${report ? ' report' : ''}`}
        style={{ ['--free-left' as string]: `${insets.l}px` }}
      >
        <TouchCanvas.Provider value={touch}>
          <CanvasFrame.Provider value={{ insets, toolCard: !!toolCard }}>
            <ErrorBoundary key={canvasKind}>{canvas}</ErrorBoundary>
          </CanvasFrame.Provider>
          {phone && canvasKind === 'plan' && loaded && !report && <ViewEditSwitch />}
          {canvasKind === '3d' && loaded && <PresetBar phone={phone} presenting={presenting} setPresenting={setPresenting} />}
          {canvasKind === '3d' && loaded && !presenting && <SunCard plan={loaded.plan} onHeight={setSunH} />}
          {rail && <ToolRail />}
          <div className={`float-col${wide ? ' wide' : ''}${report ? ' report' : ''}${tall ? ' tall' : ''}`}>
            {/* In Earthworks the tab's panel is the subject: a tool's card above it stays one line. */}
            {toolCard && <ToolCard compact={showPanel && route.kind === 'app' && route.area === 'earthworks'} />}
            {hasPanel &&
              (showPanel ? (
                // Keyed by tab, so a new tab's panel starts at its top.
                <section key={tabKey} className={`float-card tab-panel${report ? ' report' : ''}`} aria-label={tab.label}>
                  <div className="sheet-grab" aria-hidden="true" />
                  <header>
                    <div>
                      <h2>{tab.label}</h2>
                      {!inTab && subtitle && <p className="muted">{subtitle}</p>}
                    </div>
                    {!(phone && report) && (
                      <button className="icon-button" onClick={() => setPanelHidden(true)} aria-label={`Hide the ${tab.label} panel`} title="Hide the panel">
                        <Icon name={phone ? 'chevD' : 'chevL'} size={16} />
                      </button>
                    )}
                  </header>
                  <div className="panel-body">
                    <ErrorBoundary variant="inline">
                      {locked ? (
                        <ViewLock>
                          <Body />
                        </ViewLock>
                      ) : (
                        Body && <Body />
                      )}
                    </ErrorBoundary>
                  </div>
                </section>
              ) : (
                <button className="float-card panel-pill" onClick={() => setPanelHidden(false)}>
                  <Icon name={phone ? 'chevU' : 'chevR'} size={15} /> {tab.label}
                </button>
              ))}
          </div>
          {aside && Aside && <Aside />}
          {inspector && loaded && (
            <ErrorBoundary variant="float">
              <Inspector d={loaded} readOnly={phone && !editing} wide={wideInspector} />
            </ErrorBoundary>
          )}
          {view && !presenting && !(phone && report) && <CanvasControls canvas={canvasKind} up={view.up} run={run} />}
        </TouchCanvas.Provider>
      </main>
    </>
  )
}

/** The strip and the Overview, which share the key numbers. */
function NumbersHost({
  d,
  route,
  canvasKind,
  showPanel,
  tabShows,
  overview,
  setOverview,
  run,
  phone,
  peek,
  onPeekHeight,
}: {
  d: Loaded
  route: AppRoute
  canvasKind: 'plan' | '3d' | 'print'
  showPanel: boolean
  tabShows?: NumberId[]
  overview: boolean
  setOverview: (open: boolean) => void
  run: (a: ActionId) => void
  /** A phone: the numbers sit in a sheet at the bottom of the canvas instead of the strip. */
  phone: boolean
  peek: 'full' | 'slim' | null
  onPeekHeight: (h: number) => void
}) {
  const numbers = useKeyNumbers(d.plan, d.survey, d.terrain, d.earth)
  // The strip counts the site checks itself; on a phone the peek sheet says them.
  const siteChecks = useSiteWarnings().filter(w => w.severity === 'attn').length
  const checks = useChecks(d.plan, d.survey, d.terrain, d.earth)
  const level = usePlan(s => s.activeLevel)
  const selection = usePlan(s => s.selection)
  const drawn = floorDrawn(d.plan)
  const shown: Partial<Record<NumberId, string>> = {}
  if (showPanel) for (const id of tabShows ?? []) shown[id] = 'in the panel'
  // The level chip on the plan shows the ground floor's RL while you draw on it.
  // (Site's plan has no level chip: it's the block, before the house.)
  if (!shown.ffl && canvasKind === 'plan' && route.area !== 'site' && sortedLevels(d.plan)[0]?.id === level) shown.ffl = 'on plan'
  if (canvasKind === 'plan' && selection?.type === 'roof' && numbers.roof?.roof.id === selection.id) shown['roof-height'] = 'selected'
  // Costs has a line of its own: the estimate, per m² and quotes, on a phone too.
  if (route.area === 'costs')
    return (
      <>
        <CostsStrip d={d} route={route} shown={shown} onOverview={() => setOverview(!overview)} overviewOpen={overview} />
        {overview && <OverviewSheet numbers={numbers} stats={d.terrain.stats} onBalance={() => run('balance')} onClose={() => setOverview(false)} />}
      </>
    )
  return (
    <>
      {phone ? (
        peek && (
          <PeekSheet
            numbers={numbers}
            stats={d.terrain.stats}
            title="Key numbers"
            slim={peek === 'slim'}
            onOpen={() => setOverview(true)}
            onHeight={onPeekHeight}
            checks={siteChecks}
          />
        )
      ) : (
        <SummaryStrip
          route={route}
          // Nothing to count before a floor is drawn: no floor level of nothing, no checks all "not drawn yet".
          numbers={drawn ? numbers : null}
          emptyText="Key numbers show here once a floor is drawn."
          checks={drawn ? { pathway: checks.pathway, council: checks.council, counts: checks.counts } : undefined}
          shown={shown}
          onBalance={() => run('balance')}
          onOverview={() => setOverview(!overview)}
          overviewOpen={overview}
        />
      )}
      {overview && <OverviewSheet numbers={numbers} stats={d.terrain.stats} onBalance={() => run('balance')} onClose={() => setOverview(false)} />}
    </>
  )
}

/** An area's More: each rare setting under its own heading, which folds. */
function MorePanel() {
  const route = useRouter(s => s.route)
  const focus = useRouter(s => s.focus)
  const ref = useRef<HTMLDivElement>(null)
  const area = route.kind === 'app' ? areaById(route.area) : undefined
  // Site's More starts folded: its layer list alone is taller than the screen.
  const startsOpen = area?.id !== 'site'
  const folding = useContext(FoldingContext)

  // Scroll to the item ⌘K or a link asked for, unfold it, and flash it.
  useEffect(() => {
    if (!focus) return
    if (!isUnfolded(folding.collapsed, `more-${focus}`, startsOpen)) folding.toggle(foldKey(`more-${focus}`, startsOpen))
    const el = ref.current?.querySelector<HTMLElement>(`#more-${focus}`)
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el.classList.remove('flash')
      void el.offsetWidth
      el.classList.add('flash')
    }
    useRouter.setState({ focus: null })
    // Only a new focus unfolds; folding it again by hand stays folded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  if (!area) return null
  return (
    <div ref={ref} className="more-list">
      {area.more.items.map(item => {
        const Section = MORE_SECTIONS[item.id]
        return (
          <div key={item.id} id={`more-${item.id}`} className="more-item">
            <Panel
              id={`more-${item.id}`}
              startsOpen={startsOpen}
              title={
                <>
                  {item.icon && <Icon name={item.icon} size={15} />} {item.label}
                </>
              }
            >
              {Section ? <Section /> : null}
            </Panel>
          </div>
        )
      })}
    </div>
  )
}

