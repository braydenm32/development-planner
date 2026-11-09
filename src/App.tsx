import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FoldingContext } from './components/folding'
import { OrientationControl } from './components/OrientationControl'
import { PlanEditor } from './components/PlanEditor'
import { PrintPreview } from './components/PrintPreview'
import { SiteView, type HoverInfo } from './components/SiteView'
import { useBuiltSite } from './lib/builtSite'
import { CUT_RGB, FILL_RGB, RAMP_CSS, REFERENCE_POINT, rgbCss, SPOT_LEVEL } from './lib/colors'
import { MORE } from './nav/menu'
import { canvasOf, formatHash, NEW_PROJECT, PROJECTS, ARCHIVED_PROJECTS, resumeRoute, tabRoute } from './nav/route'
import { navigate, startRouter, useRouter } from './nav/router'
import { upBearing } from './lib/orientation'
import { loadView, saveView, type ViewSettings } from './lib/storage'
import type { LayerRole } from './lib/survey'
import { buildSiteSolid } from './lib/terrainMesh'
import { emptyPlan } from './plan/model'
import { defaultPlacement } from './plan/placement'
import { usePlan } from './plan/store'
import { migrateStoredStreetSide } from './plan/streetSide'
import { startToolDefaults } from './plan/toolDefaults'
import { startCostRecords } from './costs/persist'
import { useEarthworks } from './plan/useEarthworks'
import type { PrintInput } from './print/build'
import { loadPrintPrefs, savePrintPrefs, type PrintPrefs } from './print/prefs'
import { usePrintModel } from './print/usePrintModel'
import { projectActions, ProjectsHome, projectsNow, useProjects, useProjectSite } from './projects'
import { printFor, viewFor, viewToSave } from './projects/prefs'
import { AppShell } from './shell/AppShell'
import { connectHost, openFile, setOpenSite } from './safety/flows'
import { ColumnsSheet } from './formats/ColumnsSheet'
import { SafetyLayer } from './safety/SafetyLayer'
import { sayFileError } from './safety/surveyor'
import { pickFile } from './safety/store'
import { useSiteFeatures } from './site/store'
import { useSiteSource } from './site/sync'
import { SketchChip } from './start/SketchNotice'
import { isSketch } from './start/sketch'
import { StartScreen } from './start/StartScreen'
import { LegalPage } from './legal/LegalPage'
import './App.css'

export default function App() {
  // Everything below works on the current project, read through the project store.
  const projects = useProjects()
  const project = projects.opened?.survey ?? null
  const openedId = projects.opened?.id ?? null
  const [view, setView] = useState<ViewSettings>(loadView)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [cameraKey, setCameraKey] = useState(0)
  const compassRef = useRef<HTMLDivElement>(null)
  const [printPrefs, setPrintPrefs] = useState(loadPrintPrefs)
  // The tools' settings for what they draw next, kept with each project.
  useEffect(() => startToolDefaults(), [])
  // Costs (choices, rates and quotes), kept with each project.
  useEffect(() => startCostRecords(), [])
  // Where you are lives in the address (src/nav): the area, tab, view, level and selection.
  const route = useRouter(s => s.route)
  useEffect(() => {
    // `?projects` is the easy link to the Projects home.
    if (!location.hash && new URLSearchParams(location.search).has('projects')) history.replaceState(history.state, '', formatHash(PROJECTS))
    return startRouter()
  }, [])
  // What the canvas shows: the plan, the 3D view or the print preview, as the route says.
  const mode = route.kind === 'app' ? canvasOf(route) : 'plan'

  // The Projects home and the start screen for a new project have addresses of their own.
  const page: 'app' | 'projects' | 'new' = route.kind === 'projects' ? (route.show === 'new' ? 'new' : 'projects') : 'app'
  const showArchived = route.kind === 'projects' && route.show === 'archived'
  const toProjects = (archived = false, replace = false) => navigate(archived ? ARCHIVED_PROJECTS : PROJECTS, { replace })
  const toNewProject = () => navigate(NEW_PROJECT)
  /** Into the project that is open now, back where it was left (Design › Plan for a new one). */
  const toProject = (replace = false) => navigate(resumeRoute(projectsNow().opened?.prefs.place), { replace })

  // Each project remembers the area, tab, view and level it was last on.
  const place = route.kind === 'app' ? formatHash({ ...route, sel: undefined }) : null
  const placeOwner = useRef(openedId)
  useEffect(() => {
    // The address showing as another project opens is the last one's place, not this one's.
    if (placeOwner.current !== openedId) {
      placeOwner.current = openedId
      return
    }
    if (!place || !openedId || projectsNow().opened?.prefs.place === place) return
    void projectActions.savePrefs({ place })
  }, [place, openedId])

  // Each project opens with its own last view and print settings.
  const [prefsFor, setPrefsFor] = useState<string | null>(null)
  if (openedId && prefsFor !== openedId) {
    setPrefsFor(openedId)
    setView(v => ({ ...viewFor(projects.opened?.prefs, loadView()), collapsed: v.collapsed }))
    setPrintPrefs(printFor(projects.opened?.prefs, loadPrintPrefs()))
  }

  const { layers, site } = useBuiltSite(project)
  const plan = usePlan(s => s.plan)
  const earth = useEarthworks(plan, site?.survey ?? null, site?.terrain ?? null)
  useSiteSource(project, site?.survey ?? null, site?.terrain?.grid, earth && earth.result.cut + earth.result.fill > 0.01 ? earth.result.grid : null)

  // In 3D, show the finished ground once there is any cut or fill.
  const showEarth = mode === '3d' && view.showEarthworks && !!earth && earth.result.cut + earth.result.fill > 0.01
  const earthSolid = useMemo(() => {
    if (!showEarth || !earth || !site?.survey || !site.terrain) return null
    let min = Infinity
    for (const z of earth.result.grid.z) min = Math.min(min, z)
    const base = Math.min(Math.floor(site.terrain.stats.minRL) - 1, Math.floor(min) - 1)
    return buildSiteSolid(earth.result.grid, site.survey.boundary, base, earth.strips)
  }, [showEarth, earth, site])

  // The print parts, made only while Share › 3D print or Share's More (with its STL download) is open.
  const allSiteFeatures = useSiteFeatures()
  const siteFeatures = printPrefs.settings.siteFeatures ? allSiteFeatures : undefined
  const printInput = useMemo<PrintInput | null>(
    () => (plan && site?.survey && site.terrain ? { plan, survey: site.survey, ground: earth?.result.grid ?? site.terrain.grid, features: siteFeatures } : null),
    [plan, site, earth, siteFeatures],
  )
  const sharingMore = route.kind === 'app' && route.area === 'share' && route.tab === 'more'
  const print = usePrintModel(printInput, printPrefs.settings, mode === 'print' || sharingMore)
  const changePrintPrefs = (patch: Partial<PrintPrefs>) => {
    const next = { ...printPrefs, ...patch }
    setPrintPrefs(next)
    savePrintPrefs(next)
    void projects.savePrefs({ print: next })
  }
  // Assembled or Apart in the print preview, remembered with the other print settings.
  const apart = !!printPrefs.apart
  const setApart = (on: boolean) => {
    if (on !== apart) changePrintPrefs({ apart: on })
  }
  // Setbacks on the plan: always in Earthworks › Place, elsewhere when the plan's key switches them on.
  const placing = route.kind === 'app' && route.area === 'earthworks' && route.tab === 'place'

  // A project with no plan yet starts an empty one on its block (saved to that project).
  useEffect(() => {
    if (!openedId || plan || !site?.survey || !site.terrain) return
    usePlan.getState().load(emptyPlan(defaultPlacement(site.survey, site.terrain)))
  }, [openedId, plan, site])

  // An older project's street side, kept by its 3D view on this device, becomes its plan's (once).
  useEffect(() => {
    if (openedId && plan && project && site?.survey && plan.checks?.frontEdge === undefined) migrateStoredStreetSide(openedId, project, site.survey.boundary)
  }, [openedId, plan, project, site])

  // The card on the Projects home shows this site's area and outline.
  const siteSummary = useMemo(
    () => (site?.survey && site.terrain ? { boundary: site.survey.boundary, origin: site.survey.origin, area: site.terrain.stats.area } : null),
    [site],
  )
  useProjectSite(siteSummary)

  const builtSite = useMemo(() => (site?.survey && site.terrain ? { survey: site.survey, terrain: site.terrain } : null), [site])
  useEffect(() => setOpenSite(builtSite), [builtSite])

  /**
   * Open a file from Share › Send: one Open, so a project file opens as a new project after a
   * light review, and a survey or plan goes the way Open takes it.
   */
  const openAnyFile = (file: File) => {
    openFile(file).catch(sayFileError)
  }

  /** Replace survey: choose the new DXF; a review shows how the block and house will line up before anything changes. */
  const replaceSurvey = () => pickFile('survey')

  const changeRole = (layer: string, role: LayerRole) => {
    if (!project) return
    void projects.saveSurvey({ ...project, roles: { ...project.roles, [layer]: role } })
  }

  const changeView = (v: ViewSettings) => {
    setView(v)
    saveView(v)
    void projects.savePrefs({ view: viewToSave(v) })
  }

  const folding = {
    collapsed: view.collapsed,
    toggle: (id: string) =>
      changeView({ ...view, collapsed: view.collapsed.includes(id) ? view.collapsed.filter(x => x !== id) : [...view.collapsed, id] }),
  }
  const changeUp = (up: 'house' | number) => {
    changeView({ ...view, up })
    if (mode === '3d') setCameraKey(k => k + 1)
  }

  /** Check the layers, after an import: Site › More › Survey layers, unfolded. */
  const toLayers = () => {
    const collapsed = view.collapsed.filter(c => c !== 'more-survey-layers')
    if (collapsed.length !== view.collapsed.length) changeView({ ...view, collapsed })
    navigate(tabRoute(useRouter.getState().route, 'site', MORE), { focus: 'survey-layers' })
  }

  // The file actions (src/safety) open projects and read the site the app has built.
  useEffect(() => connectHost({ toProject: replace => toProject(replace ?? page !== 'app'), toLayers }))

  // About, Privacy, Terms and How accurate is this? need no project and no sign-in, so they show first.
  if (route.kind === 'page')
    return (
      <>
        <LegalPage page={route.page} onBack={() => (history.length > 1 ? history.back() : openedId ? toProject() : toProjects())} />
        <SafetyLayer />
      </>
    )
  if (!projects.ready) return null
  const home = (inShell: boolean) => (
    <ProjectsHome inShell={inShell} archived={showArchived} onFilterChange={a => toProjects(a, true)} onOpen={() => toProject()} onNew={toNewProject} />
  )
  // The review sheet, the Undo toast and the one file picker, over every screen.
  const alone = (screen: ReactNode) => (
    <>
      {screen}
      <SafetyLayer />
      <ColumnsSheet />
    </>
  )
  // The start screen shows alone until a site exists, real or sketched. Back and Esc leave it
  // whenever there is anywhere to go; a first visit has nowhere else, and needs nowhere.
  const somewhere = projects.list.length > 0 || !!openedId
  if (page === 'new') return alone(<StartScreen into="new" onCancel={somewhere ? () => toProjects(false, true) : undefined} cancelLabel="All projects" />)
  // Nothing open: pick a project, or (on a first visit) start the first one.
  if (!openedId) return alone(page === 'projects' || projects.list.length ? home(false) : <StartScreen into="new" />)
  // The home shows inside the app's frame, below, once the open project has a site.
  if (page === 'projects' && !project) return alone(home(false))
  // A project with no site yet (never a project with one): its start screen, with the way out.
  if (!project) return alone(<StartScreen into="current" onCancel={() => toProjects()} cancelLabel="All projects" />)

  // The plan, the 3D site or the print preview, in the middle of the frame.
  const canvas = (
    <>
      {isSketch(project) && mode !== 'print' && <SketchChip />}
      {(projects.saveError || projects.memoryOnly) && (
        <p className="bhp-save-problem" role="status">
          {projects.memoryOnly
            ? 'This browser isn’t saving. Download a project file to keep your work.'
            : 'Your last change hasn’t saved yet. It’s kept and will be tried again.'}
        </p>
      )}
      {site?.survey && site.terrain && site.solid && mode === 'plan' ? (
        plan ? (
          <PlanEditor
            survey={site.survey}
            terrain={site.terrain}
            up={view.up}
            onUpChange={changeUp}
            showGround={view.planGround}
            onShowGroundChange={planGround => changeView({ ...view, planGround })}
            earth={earth}
            viewKey={openedId}
            showSetbacks={placing || view.planSetbacks}
            setbacksSwitch={placing ? undefined : { on: view.planSetbacks, onChange: planSetbacks => changeView({ ...view, planSetbacks }) }}
            earthworks={route.kind === 'app' && route.area === 'earthworks'}
          />
        ) : null
      ) : site?.survey && site.terrain && site.solid && mode === 'print' ? (
        // Keyed so React doesn't reuse the 3D view's overlays, which the 3D view turns by hand.
        <Fragment key="print">
          {print.model && print.model.parts.length > 0 ? (
            <PrintPreview model={print.model} apart={apart} />
          ) : (
            <div className="problem">
              <p>{print.error ?? (print.model ? 'There is nothing to print yet.' : 'Building the print parts…')}</p>
            </div>
          )}
          <div className="print-actions">
            <div className="segmented" role="group" aria-label="Show the parts">
              <button className={apart ? '' : 'on'} aria-pressed={!apart} onClick={() => setApart(false)}>
                Assembled
              </button>
              <button className={apart ? 'on' : ''} aria-pressed={apart} onClick={() => setApart(true)}>
                Apart
              </button>
            </div>
          </div>
          <div className="print-key">
            <span>
              <i className="swatch kind-terrain" /> Terrain
            </span>
            <span>
              <i className="swatch kind-floor" /> Floors
            </span>
            <span>
              <i className="swatch kind-roof" /> Roof
            </span>
          </div>
          <div className="readout">
            <span>
              <b>1:{printPrefs.settings.scale}</b>
            </span>
            {print.model && (
              <span>
                {print.model.parts.length} part{print.model.parts.length === 1 ? '' : 's'}
              </span>
            )}
            <span className="muted">
              {print.busy ? 'Updating…' : 'Millimetres as printed.'}
              <span className="controls-hint"> Drag to orbit, scroll to zoom, right-drag to pan.</span>
            </span>
          </div>
        </Fragment>
      ) : site?.survey && site.terrain && site.solid ? (
        <Fragment key="3d">
          <SiteView
            key={cameraKey}
            survey={site.survey}
            terrain={site.terrain}
            solid={earthSolid ?? site.solid}
            ground={earthSolid && earth ? earth.result.grid : site.terrain.grid}
            cutFill={!!earthSolid}
            view={view}
            onHover={setHover}
            compassRef={compassRef}
            plan={plan}
            upBearing={upBearing(view.up, plan?.placement.rotation ?? 0)}
          />
          <div className="compass" aria-label="North arrow">
            <div ref={compassRef} className="needle">
              <span>N</span>
            </div>
          </div>
          <div className="view-actions">
            <OrientationControl value={view.up} onChange={changeUp} />
          </div>
          <div className="legend" aria-label="Key">
            <div className="legend-ramp">
              <div className="ramp" style={{ background: RAMP_CSS }} />
              <div className="ramp-labels">
                <span>RL {site.terrain.stats.maxRL.toFixed(2)}</span>
                <span>RL {site.terrain.stats.minRL.toFixed(2)}</span>
              </div>
            </div>
            <ul className="legend-key">
              {showEarth && (
                <>
                  <li>
                    <i style={{ background: rgbCss(CUT_RGB) }} /> Cut
                  </li>
                  <li>
                    <i style={{ background: rgbCss(FILL_RGB) }} /> Fill
                  </li>
                </>
              )}
              {view.showContours && (
                <li>
                  <i className="line" /> Contour
                </li>
              )}
              {view.showLevels && (
                <li>
                  <i className="dot" style={{ background: SPOT_LEVEL }} /> Spot level
                </li>
              )}
              {view.showReference && (
                <li>
                  <i className="dot" style={{ background: REFERENCE_POINT }} /> Reference point
                </li>
              )}
            </ul>
          </div>
          <div className="readout">
            {hover ? (
              <>
                <span>E {hover.e.toFixed(2)}</span>
                <span>N {hover.n.toFixed(2)}</span>
                <span>
                  <b>RL {hover.rl.toFixed(2)}</b>
                </span>
                {hover.label && <span className="muted">{hover.label}</span>}
              </>
            ) : (
              <span className="muted">
                Point at the ground to read its level.
                <span className="controls-hint"> Drag to orbit, scroll to zoom, right-drag to pan.</span>
              </span>
            )}
          </div>
        </Fragment>
      ) : (
        <div className="problem">
          <p>{site?.error ?? 'This survey could not be read.'}</p>
          <p className="muted">Check the survey layers under Site › More, or replace the survey.</p>
        </div>
      )}
    </>
  )

  return (
    <FoldingContext.Provider value={folding}>
      <SafetyLayer />
      <ColumnsSheet />
      <AppShell
        canvas={canvas}
        projectsHome={home(true)}
        data={{
          project,
          layers,
          onRoleChange: changeRole,
          survey: site?.survey ?? null,
          terrain: site?.terrain ?? null,
          siteError: site?.error ?? null,
          earth,
          view,
          changeView,
          changeUp,
          resetCamera: () => setCameraKey(k => k + 1),
          printPrefs,
          changePrintPrefs,
          print,
          hover,
          openProject: openAnyFile,
          replaceSurvey,
        }}
      />
    </FoldingContext.Provider>
  )
}
