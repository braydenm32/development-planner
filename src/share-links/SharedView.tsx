// A project opened from its share link: no sign-in, nothing to edit, and nothing kept in this
// browser. The calm view for showing people: the plan, the 3D view (Street view, From above,
// Rear), the key numbers with the Overview, and the PDF plans. It reads the latest saved
// revision from the cloud, and looks again when the page comes back. Where the owner lets people
// comment, Add a comment pins one on the plan (src/comments); sending one is the only thing that
// keeps anything here, a token so this browser can see its own comments again.

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PlanEditor } from '../components/PlanEditor'
import { SelectionPanel } from '../components/PlanSections'
import { plansPdfFile, savePlansPdf } from '../components/printFiles'
import { SiteView, type HoverInfo } from '../components/SiteView'
import { CanvasFrame, type Insets } from '../components/canvasFrame'
import { useChecks } from '../checks/useChecks'
import { useBuiltSite } from '../lib/builtSite'
import { RAMP_CSS } from '../lib/colors'
import { upBearing } from '../lib/orientation'
import { DEFAULT_VIEW, type ViewSettings } from '../lib/storage'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { buildSiteSolid } from '../lib/terrainMesh'
import { useSharedComments } from '../comments/hooks'
import { AddCommentButton } from '../comments/ViewerComments'
import { Caveat } from '../legal/Caveat'
import { Icon, Logo } from '../nav/icons'
import type { ActionId, NumberId } from '../nav/menu'
import type { AppRoute } from '../nav/route'
import { sortedLevels } from '../plan/model'
import { usePlan } from '../plan/store'
import { useEarthworks, type Earth } from '../plan/useEarthworks'
import { PresetBar } from '../phone/CanvasBits'
import { useCamera } from '../phone/cameraStore'
import { TouchCanvas, usePhone } from '../phone/device'
import { useNativeFeel } from '../phone/native'
import { PeekSheet } from '../phone/PeekSheet'
import { inspectorShows, peekShows } from '../phone/reach'
import { canShareFiles, shareOrSave } from '../phone/share'
import { useSheetDrag } from '../phone/sheetDrag'
import { LockedFor } from '../phone/lockedFor'
import { ViewLock } from '../phone/ViewLock'
import { DEFAULT_PRINT } from '../print/build'
import type { PrintPrefs } from '../print/prefs'
import { printFor, viewFor } from '../projects/prefs'
import { CanvasControls } from '../shell/CanvasChrome'
import { OverviewSheet } from '../shell/OverviewSheet'
import { INSPECTOR_W } from '../shell/panelWidth'
import { findSelection } from '../shell/selection'
import { SummaryStrip } from '../shell/SummaryStrip'
import { checksHeadline } from '../shell/headline'
import { useKeyNumbers } from '../shell/useKeyNumbers'
import { projectTitle } from '../share/project'
import { useSiteWarnings, useSiteSource } from '../site/sync'
import { isSketch, sketchName } from '../start/sketch'
import { shareHash, type ShareAddress, type SharedCanvas } from './address'
import { createShareApi, type ShareApi } from './api'
import { loadShared, troubleOf, type SharedProject, type SharedTrouble } from './load'
import { showReadOnly, stopReadOnly } from './readOnly'
import '../App.css'
import '../shell/fonts.css'
import '../shell/shell.css'
import '../phone/phone.css'
import './shared-view.css'

const PRINT_DEFAULTS: PrintPrefs = { settings: DEFAULT_PRINT, paper: 'A3', pdfFurniture: true }
/** Look again for a newer revision when the page comes back after this long away (ms). */
const LOOK_AGAIN_MS = 5000
const LOCKED = { text: 'Shared view: you can look, but nothing here can be changed.' }

type Phase = { kind: 'loading' } | { kind: 'ready'; project: SharedProject } | { kind: 'trouble'; trouble: SharedTrouble }

export function SharedView({ address, api: given }: { address: ShareAddress; api?: ShareApi }) {
  const api = useMemo(() => given ?? createShareApi(), [given])
  const { token } = address
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [view, setView] = useState<SharedCanvas>(address.view)
  const cache = useRef(new Map<string, unknown>())

  const load = useCallback(
    async (quiet: boolean) => {
      try {
        const project = await loadShared(api, token, cache.current)
        setPhase(p => (p.kind === 'ready' && p.project.revision === project.revision && quiet ? p : { kind: 'ready', project }))
      } catch (e) {
        const trouble = troubleOf(e)
        // Looking again in the background: a blip offline keeps what is showing; a link turned off doesn't.
        setPhase(p => (quiet && p.kind === 'ready' && trouble.kind !== 'off' ? p : { kind: 'trouble', trouble }))
      }
    },
    [api, token],
  )

  useEffect(() => void load(false), [load])

  // Back on the page after a while: the newest saved revision, if it changed.
  useEffect(() => {
    let away = 0
    const seen = () => {
      if (document.visibilityState === 'hidden') away = Date.now()
      else if (away && Date.now() - away > LOOK_AGAIN_MS) void load(true)
    }
    document.addEventListener('visibilitychange', seen)
    return () => document.removeEventListener('visibilitychange', seen)
  }, [load])

  // Kept out of search engines, and the page passes nothing on when a link in it is followed.
  useEffect(() => {
    const metas = [meta('robots', 'noindex, nofollow'), meta('referrer', 'no-referrer')]
    return () => metas.forEach(m => m.remove())
  }, [])

  useSharedComments(token, phase.kind === 'ready' ? phase.project : null)

  const name = phase.kind === 'ready' ? phase.project.meta.name : null
  useEffect(() => {
    document.title = name ? `${name} · shared view` : 'Shared house plan'
  }, [name])

  const changeView = (v: SharedCanvas) => {
    setView(v)
    // The address keeps it, so a reload or Back lands on the same view.
    history.replaceState(history.state, '', shareHash({ token, view: v }))
  }

  if (phase.kind === 'loading') return <Skeleton />
  const retry = () => {
    setPhase({ kind: 'loading' })
    void load(false)
  }
  if (phase.kind === 'trouble') return <Trouble trouble={phase.trouble} retry={retry} />
  return <Viewer shared={phase.project} view={view} setView={changeView} />
}

function meta(name: string, content: string): HTMLMetaElement {
  const m = document.createElement('meta')
  m.name = name
  m.content = content
  document.head.appendChild(m)
  return m
}

// ---------------------------------------------------------------------------

export function Viewer({ shared, view: canvas, setView: changeCanvas }: { shared: SharedProject; view: SharedCanvas; setView: (v: SharedCanvas) => void }) {
  const phone = usePhone()
  const shellRef = useRef<HTMLDivElement>(null)
  useNativeFeel(phone)
  useSheetDrag(shellRef, phone)

  // The plan and the site features go in their stores as the shared revision has them, and stay so.
  // In a layout effect, not while drawing: the strip and the numbers read those stores, and a
  // store changed during this render would change them in the middle of it. It still lands
  // before the page paints. The page starts afresh for a share link (main.tsx), so until then
  // there's no plan and nothing shows; a newer revision swaps in under the one showing.
  useLayoutEffect(() => showReadOnly(shared), [shared])
  useEffect(() => () => stopReadOnly(), [])

  const { site } = useBuiltSite(shared.survey)
  const plan = usePlan(s => s.plan)
  const selection = usePlan(s => s.selection)
  const level = usePlan(s => s.activeLevel)
  // The project's own view and print choices; changing the view here changes only this page.
  const [view, setViewSettings] = useState<ViewSettings>(() => viewFor(shared.prefs, DEFAULT_VIEW))
  const print = useMemo(() => printFor(shared.prefs, PRINT_DEFAULTS), [shared.prefs])
  const changeUp = (up: 'house' | number) => setViewSettings(v => ({ ...v, up }))

  const survey = site?.survey ?? null
  const terrain = site?.terrain ?? null
  const earth = useEarthworks(plan, survey, terrain)
  const cutFill = !!earth && earth.result.cut + earth.result.fill > 0.01
  useSiteSource(shared.survey, survey, terrain?.grid, cutFill ? earth!.result.grid : null)

  // In 3D, the finished ground once there is any cut or fill (as the app shows it).
  const showEarth = canvas === '3d' && view.showEarthworks && cutFill
  const earthSolid = useMemo(() => {
    if (!showEarth || !earth || !survey || !terrain) return null
    let min = Infinity
    for (const z of earth.result.grid.z) min = Math.min(min, z)
    const base = Math.min(Math.floor(terrain.stats.minRL) - 1, Math.floor(min) - 1)
    return buildSiteSolid(earth.result.grid, survey.boundary, base, earth.strips)
  }, [showEarth, earth, survey, terrain])

  const [overview, setOverview] = useState(false)
  const [present, setPresenting] = useState(false)
  const presenting = present && canvas === '3d'
  // Full screen is for 3D: leaving it ends it.
  const setView = (v: SharedCanvas) => {
    if (v !== '3d') setPresenting(false)
    changeCanvas(v)
  }
  const [cameraKey, setCameraKey] = useState(0)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [peekH, setPeekH] = useState(0)
  const [note, setNote] = useState<{ text: string; n: number } | null>(null)
  const compassRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(t)
  }, [note])

  const ready = !!(plan && survey && terrain && site?.solid)
  const selected = !!selection && !!plan && !!findSelection(plan, selection.id)
  const inspector = inspectorShows(canvas, ready, selected, false)
  const peek = peekShows({ phone, loaded: ready, canvas, inspector, panel: false, toolCard: false, overview })
  const insets: Insets = useMemo(
    () => (phone ? { l: 0, r: presenting ? 0 : 60, t: 62, b: peek ? (peekH || 190) + 12 : 16 } : { l: 14, r: inspector ? INSPECTOR_W + 30 : 16, t: 56, b: 56 }),
    [phone, presenting, peek, peekH, inspector],
  )
  const touch = useMemo(() => ({ phone, viewOnly: true, projectKey: '' }), [phone])

  const run = (a: ActionId) => {
    const st = usePlan.getState()
    if (a === 'view-plan' || a === 'view-3d') setView(a === 'view-plan' ? 'plan' : '3d')
    else if (a === 'fit-block' || a === 'fit-house') st.requestFit(a === 'fit-block' ? 'block' : 'house')
    else if (a === 'north-up') {
      if (canvas === '3d') useCamera.getState().go('north')
      else changeUp(view.up === 0 ? 'house' : 0)
    } else if (a === 'reset-camera') {
      if (phone) useCamera.getState().go('house')
      else setCameraKey(k => k + 1)
    }
  }

  const pdf = async () => {
    if (!plan || !survey || !terrain) return
    const input = { plan, survey, terrain, earth, up: view.up, paper: print.paper, pdfFurniture: print.pdfFurniture }
    try {
      if (phone) {
        const r = await shareOrSave(plansPdfFile(input), projectTitle(plan))
        if (r === 'saved') setNote(n => ({ text: 'PDF plans saved.', n: (n?.n ?? 0) + 1 }))
      } else {
        savePlansPdf(input)
        setNote(n => ({ text: 'PDF plans downloaded.', n: (n?.n ?? 0) + 1 }))
      }
    } catch (e) {
      setNote(n => ({ text: (e as Error)?.message || 'The plans could not be drawn.', n: (n?.n ?? 0) + 1 }))
    }
  }

  const sketch = shared.survey?.sketch
  const by = (
    <span className="shared-by">
      Shared by {shared.sharedBy} · view only{isSketch(shared.survey) && sketch ? ` · ${sketchName(sketch)}` : ''}
    </span>
  )

  return (
    <LockedFor.Provider value={LOCKED}>
      <div ref={shellRef} className={`app-shell shared-view${phone ? ' phone' : ''}${presenting ? ' presenting' : ''}`}>
        <header className="top-bar">
          <span className="shared-mark" aria-hidden="true">
            <Logo size={phone ? 22 : 24} />
          </span>
          <div className="shared-title">
            <b>{shared.meta.name}</b>
            {by}
          </div>
          <div className="top-actions">
            <div className="view-switch desk-only" role="group" aria-label="Canvas">
              {(['plan', '3d'] as const).map(v => (
                <button key={v} className={canvas === v ? 'on' : ''} aria-pressed={canvas === v} onClick={() => setView(v)}>
                  <Icon name={v === 'plan' ? 'plan' : 'cube'} size={15} />
                  {v === 'plan' ? 'Plan' : '3D'}
                </button>
              ))}
            </div>
            {ready && <AddCommentButton phone={phone} toPlan={() => setView('plan')} />}
            {/* On a phone too, a word under the icon (C38): someone opening a link shouldn't have to guess. */}
            <button className={phone ? 'labelled-icon shared-pdf' : 'secondary shared-pdf'} onClick={() => void pdf()} disabled={!ready} title={canShareFiles() ? 'Send PDF plans' : 'Download PDF plans'}>
              <Icon name={phone && canShareFiles() ? 'phoneShare' : 'download'} size={phone ? 19 : 16} />
              {phone ? <span>PDF plans</span> : 'PDF plans'}
            </button>
          </div>
        </header>
        {ready && (
          <Numbers
            canvas={canvas}
            phone={phone}
            peek={peek}
            overview={overview}
            setOverview={setOverview}
            onPeekHeight={setPeekH}
            level={level}
            selectedRoof={selection?.type === 'roof' ? selection.id : null}
            survey={survey!}
            terrain={terrain!}
            earth={earth}
          />
        )}
        <main className={`shell-main viewport canvas-${canvas}${inspector ? ' has-inspector' : ''}${peek ? ' has-peek' : ''}`} style={{ ['--free-left' as string]: `${insets.l}px` }}>
          <TouchCanvas.Provider value={touch}>
            <CanvasFrame.Provider value={{ insets }}>
              {!ready ? (
                <div className="problem">
                  <p>{site?.error ?? (shared.survey ? 'This survey could not be read.' : 'This project has no block yet.')}</p>
                </div>
              ) : canvas === 'plan' ? (
                <PlanEditor
                  survey={survey!}
                  terrain={terrain!}
                  up={view.up}
                  onUpChange={changeUp}
                  showGround={view.planGround}
                  onShowGroundChange={planGround => setViewSettings(v => ({ ...v, planGround }))}
                  earth={earth}
                  viewKey={null}
                  showSetbacks={view.planSetbacks}
                  setbacksSwitch={{ on: view.planSetbacks, onChange: planSetbacks => setViewSettings(v => ({ ...v, planSetbacks })) }}
                />
              ) : (
                <Fragment key="3d">
                  <SiteView
                    key={cameraKey}
                    survey={survey!}
                    terrain={terrain!}
                    solid={earthSolid ?? site!.solid!}
                    ground={earthSolid && earth ? earth.result.grid : terrain!.grid}
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
                  <div className="legend">
                    <div className="ramp" style={{ background: RAMP_CSS }} />
                    <div className="ramp-labels">
                      <span>RL {terrain!.stats.maxRL.toFixed(2)}</span>
                      <span>RL {terrain!.stats.minRL.toFixed(2)}</span>
                    </div>
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
              )}
            </CanvasFrame.Provider>
            {canvas === '3d' && ready && (
              <PresetBar
                phone={phone}
                presenting={presenting}
                setPresenting={setPresenting}
                show={plan ? { view, set: patch => setViewSettings(v => ({ ...v, ...patch })), levels: sortedLevels(plan) } : undefined}
              />
            )}
            {inspector && plan && survey && terrain && (
              <aside className="float-card inspector read-only" aria-label="Selection">
                <div className="sheet-grab" aria-hidden="true" />
                <button className="icon-button inspector-close" onClick={() => usePlan.getState().select(null)} aria-label="Close (clear the selection)" title="Close (Esc)">
                  <Icon name="x" size={16} />
                </button>
                <ViewLock after>
                  <SelectionPanel plan={plan} survey={survey} terrain={terrain} earth={earth} />
                </ViewLock>
              </aside>
            )}
            {ready && !presenting && <CanvasControls canvas={canvas} up={view.up} run={run} />}
          </TouchCanvas.Provider>
        </main>
        <SharedFooter />
        {note && (
          <div key={note.n} className="toast" role="status">
            {note.text}
            <button className="icon-button" onClick={() => setNote(null)} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>
    </LockedFor.Provider>
  )
}

/**
 * The foot of the page: whose it is, the caveat, and the way in for someone who'd like their own.
 * Links open in tabs of their own, so the shared view stays where it is.
 */
function SharedFooter() {
  return (
    <footer className="shared-foot">
      <p>
        <b>Made with Contour &amp; Gable</b> · <a href={`${import.meta.env?.BASE_URL ?? '/'}#/projects/new`} target="_blank" rel="noopener">Plan your own</a>
      </p>
      <Caveat className="shared-caveat" newTab />
    </footer>
  )
}

/** The strip (desktop) or the peek sheet (phone), and the Overview: the app's own, read-only. */
function Numbers({
  canvas,
  phone,
  peek,
  overview,
  setOverview,
  onPeekHeight,
  level,
  selectedRoof,
  survey,
  terrain,
  earth,
}: {
  canvas: SharedCanvas
  phone: boolean
  peek: boolean
  overview: boolean
  setOverview: (on: boolean) => void
  onPeekHeight: (h: number) => void
  level: string
  selectedRoof: string | null
  survey: Survey
  terrain: Terrain
  earth: Earth | null
}) {
  const plan = usePlan(s => s.plan)!
  const numbers = useKeyNumbers(plan, survey, terrain, earth)
  const checks = useChecks(plan, survey, terrain, earth)
  const verdict = useMemo(() => checksHeadline(checks.pathway, checks.results), [checks.pathway, checks.results])
  const siteChecks = useSiteWarnings().filter(w => w.severity === 'attn').length
  // A number already on the canvas steps back in the strip, as in the app (CALM 5).
  const shown: Partial<Record<NumberId, string>> = {}
  if (canvas === 'plan' && sortedLevels(plan)[0]?.id === level) shown.ffl = 'on plan'
  if (canvas === 'plan' && selectedRoof && numbers.roof?.roof.id === selectedRoof) shown['roof-height'] = 'selected'
  const route: AppRoute = { kind: 'app', area: 'design', tab: 'plan', view: canvas }
  return (
    <>
      {phone ? (
        peek && <PeekSheet numbers={numbers} stats={terrain.stats} title="Key numbers" onOpen={() => setOverview(true)} onHeight={onPeekHeight} checks={siteChecks} verdict={verdict} readOnly />
      ) : (
        <SummaryStrip readOnly route={route} numbers={numbers} checks={{ pathway: checks.pathway, council: checks.council, counts: checks.counts }} shown={shown} onBalance={() => {}} onOverview={() => setOverview(!overview)} overviewOpen={overview} />
      )}
      {overview && <OverviewSheet readOnly numbers={numbers} stats={terrain.stats} verdict={verdict} onBalance={() => {}} onClose={() => setOverview(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------

/** While the shared project loads: the shape of the page, quietly (CALM 5: no spinner). */
function Skeleton() {
  return (
    <div className="app-shell shared-view shared-skeleton" aria-busy="true" aria-label="Opening the shared project">
      <header className="top-bar">
        <span className="shared-mark" aria-hidden="true">
          <Logo size={24} />
        </span>
        <div className="shared-title">
          <i className="sk sk-name" />
          <i className="sk sk-by" />
        </div>
      </header>
      <div className="summary-strip">
        <i className="sk sk-chip" />
        <i className="sk sk-chip" />
        <i className="sk sk-chip" />
      </div>
      <main className="shell-main">
        <div className="sk-plan" />
      </main>
    </div>
  )
}

const TROUBLE_TITLE: Record<SharedTrouble['kind'], string> = {
  off: 'This link isn’t working',
  slow: 'Too many tries',
  offline: 'You’re offline',
  broken: 'This shared project couldn’t open',
}

/** A plain page when the link is off or wrong, or the project can't be read now. */
export function Trouble({ trouble, retry }: { trouble: SharedTrouble; retry: () => void }) {
  return (
    <div className="shared-trouble" role="main">
      <div className="shared-trouble-card">
        <Logo size={32} />
        <h1>{TROUBLE_TITLE[trouble.kind]}</h1>
        <p>{trouble.message || 'This link doesn’t open anything now. It may have been turned off, or copied wrong.'}</p>
        {trouble.kind === 'off' ? (
          <p className="muted">Ask the person who sent it for a new link.</p>
        ) : (
          <button className="shared-retry" onClick={retry}>
            Try again
          </button>
        )}
        <p className="muted small">Contour &amp; Gable · shared view</p>
      </div>
    </div>
  )
}
