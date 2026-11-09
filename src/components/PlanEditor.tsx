import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { pointInPolygon, signedArea, type Vec2 } from '../lib/geom'
import { planTurn } from '../lib/orientation'
import type { Survey } from '../lib/survey'
import type { Terrain } from '../lib/terrain'
import { buildingOutline, closestOnSegment, planarFaces, roomShape, wallPolygons } from '../plan/geometry'
import { cornerOffsets, groundAtPlan, groundOverlay, isNear, levelFloorRL, NEAR_HOUSE, nearShapes, worksOverlay } from '../plan/groundOverlay'
import { fitFurniture, furnitureContains, furnitureName, furnitureSymbol, furnitureToPlan, newFurniture, normDeg, snapRotation, wallClearances } from '../plan/furniture'
import {
  areaKind,
  fromSite,
  houseWalls,
  isRetaining,
  pointOnWall,
  sortedLevels,
  wallDir,
  wallLength,
  type Area,
  type Furniture,
  type Opening,
  type Plan,
  type Roof,
  type Room,
  type Stair,
  type Wall,
} from '../plan/model'
import {
  addArea,
  addFurniture,
  addOpening,
  addRoof,
  addRoom,
  addStair,
  addWall,
  moveJoint,
  moveWall,
  newStair,
  houseBounds,
  planBounds,
  updateFurniture,
  updateOpening,
  updateRoof,
  updateStair,
} from '../plan/ops'
import { setbackDims } from '../plan/setbacks'
import { useSitePlan } from '../site/SitePlanLayer'
import { outlineAround, roofGeometry } from '../plan/roof'
import { roofAtPoint } from '../plan/roofPick'
import { extendRun, newRetainingWall, placeRetainingWall, useRetaining, waitingForSide } from '../plan/retainingSession'
import { snap, type SnapResult } from '../plan/snap'
import { stairArrivesAt, stairContains, stairLayout, stairMeetsNoFloor } from '../plan/stairs'
import { deleteSelected, copySelected, duplicateSelected, nudgeSelected, pasteCopied, selectAllOnLevel } from '../plan/editActions'
import { itemsWhere, selectedList, translateSelection } from '../plan/editing'
import { modKey } from '../nav/keys'
import { isOpeningTool, usePlan, type RoofMode, type Selection, type Tool } from '../plan/store'
import { CanvasFrame } from './canvasFrame'
import type { Earth } from '../plan/useEarthworks'
import { finishedContours, finishedShown, planContours, readFinishedPref, saveFinishedPref } from '../plan/finishedContours'
import { ContoursKey, FinishedContourLayer } from './FinishedContours'
import { CornerOffsets, GroundKey, GroundOverlay, GroundReadout, WorksTint } from './GroundOverlay'
import { LevelMenu } from './LevelMenu'
import { ghostOpacity, groundedLevels, levelRows, stepLevel, useGhosts } from '../plan/levelMenu'
import { FOCUS_WAIT_MS, usePlanFocus } from '../plan/planFocus'
import { OrientationControl } from './OrientationControl'
import { RetainingMarks } from './RetainingMarks'
import { floorToFirstWalls } from './placeActions'
import { useWallFocus } from '../plan/wallFocus'
import { nextInStack, pickFromStack, stackNotice, wallStackAt } from '../plan/wallStack'
import { garageDoorSymbol } from '../plan/garageDoor'
import { SetbackLines, SetbacksKey } from './SetbackLines'
import { ShadowPlanLayer, ShadowsKey } from '../sun/ShadowPlan'
import { useTouchCanvas } from '../phone/device'
import { boundsOf, clampToBounds, DOUBLE_TAP_ZOOM, isDoubleTap, pinchView, TAP_SLOP, zoomAbout, zoomStep, type Pt, type Tap } from '../phone/gestures'
import { isPlace, loadPlanView, savePlanView, usePlanZoom, wheelZoom, zoomPlan } from '../plan/viewMemory'
import { ZoomButtons } from './ZoomButtons'
import { KeyChip, PhoneLevelChip } from '../phone/PlanChips'
import { usePlanFlow } from '../flow/PlanFlow'
import { undoTarget } from '../shell/undoTarget'
import { useSiteStore } from '../site/store'
import { useSectionMarks } from '../sections/SectionMarks'
import { useGradeBrush } from '../grading/GradeBrush'
import { useMeasureNotes } from '../measure/useMeasure'
import { roomMade, wallsPlaced } from '../flow/store'
import { PlanHints } from '../guide/PlanHints'
import { useRouter } from '../nav/router'
import { StreetAsk } from '../start/StreetAsk'
import { chooseStreetEdge, edgeNear, hoverStreetEdge, streetChoices, useStreetAsk, useStreetAskOpen } from '../start/streetQuestion'
import { onNaturalGround, roomFloorNote } from '../plan/floorTypes'
import { CostsPlanLayer } from '../costs/PlanHighlight'
import { ChecksPlanLayer } from '../checks/ChecksPlanLayer'
import { useCommentsPlan } from '../comments/PlanComments'
import { DrainageLayer } from '../drainage/DrainageLayer'
import { costsUndoKey } from '../costs/store'
import './editing.css'

interface View {
  cx: number
  cy: number
  /** pixels per metre */
  k: number
  /** The fit request this view belongs to; a newer request re-fits. */
  token?: number
}

interface Draft {
  key: string
  chain: Vec2[]
  /** Corners of an area or roof outline being drawn. */
  areaPts: Vec2[]
  typed: string
  /** Bottom of a stair being placed. */
  stairStart: Vec2 | null
}

const emptyDraft = (key: string): Draft => ({ key, chain: [], areaPts: [], typed: '', stairStart: null })

type Drag =
  | { type: 'pan'; sx: number; sy: number; start: View }
  | { type: 'joint'; level: string; from: Vec2; anchor: Vec2 | null; exclude: Set<string> }
  /** `cycle`: the walls under the press, when the wall was already selected, so a click without a drag steps to the next. */
  | { type: 'wall'; id: string; start: Plan; startWorld: Vec2; dir: Vec2; cycle?: Wall[] }
  | { type: 'opening'; id: string; wall: Wall }
  | { type: 'room'; id: string; offset: Vec2 }
  | { type: 'areaVertex'; id: string; index: number }
  | { type: 'move'; startWorld: Vec2; startPlacement: Plan['placement'] }
  | { type: 'roofVertex'; id: string; index: number }
  | { type: 'stair'; id: string; offset: Vec2 }
  | { type: 'furniture'; item: Furniture; offset: Vec2 }
  | { type: 'furnitureTurn'; id: string }
  /** Several items moving together; a click that doesn't move picks just `solo`. */
  | { type: 'group'; start: Plan; startWorld: Vec2; sels: Selection[]; solo: Selection }
  /** A box on empty ground, from a corner, to pick what's inside (Shift or Ctrl/⌘ and drag). */
  | { type: 'box'; from: Vec2; fromPx: Pt; add: boolean }
  | { type: 'brush' }

/**
 * Outside Design and Earthworks the plan is for looking at: a plain drag pans, and nothing moves
 * until it has been selected with a click first. Each area says so in its own words.
 */
const AREA_HINTS: Record<string, string> = {
  site: 'Drag to pan, scroll to zoom. This is the block as surveyed; the house is drawn in Design.',
  share: 'Drag to pan, scroll to zoom. Click a room, wall or roof to read it; the house is changed in Design.',
}
const GUARDED_HINT = 'Drag to pan, scroll to zoom. Click something to select it; once selected, it can be dragged.'

/** Where nothing can be drawn (the phone's View, a shared project): how to look. */
const VIEW_HINT = {
  desk: 'Click a room, wall or roof to read its numbers. Drag to pan, scroll to zoom.',
  phone: 'Tap a room, wall or roof to read its numbers. One finger pans, two zoom.',
}

const HINTS: Record<Tool, string> = {
  select: 'Click to select. Where walls sit on one another, click again for the next. Drag a wall to move it, or its end handles to reshape. Delete removes. Drag empty space to pan.',
  wall: 'Click to start a wall, click again for each corner. Type a length in mm and press Enter. Double-click or Esc to finish. Hold Shift to turn off snapping. For a retaining wall, use the Retaining wall tool (T).',
  retaining: "Click the retaining wall's start, then each corner (or type a length in mm and press Enter). Double-click or Esc to finish. Its panel asks once which side it holds back and how high.",
  door: 'Click on a wall to add a door.',
  window: 'Click on a wall to add a window.',
  opening: 'Click on a wall to add an opening with no door, such as an archway.',
  garage: 'Click on a wall to add a garage door.',
  room: 'Click inside an area enclosed by walls to name it as a room.',
  area: 'Click the corners of a slab, driveway, deck or garden. Type a length in mm and press Enter for an exact side. Click the first point or press Enter to close it.',
  roof: 'Click inside the walls to roof that building. Select a roof to set its type, pitch and gable ends.',
  stair: 'Click where the stair starts, then click the direction it goes up. Hold Shift for any angle.',
  furniture:
    'Pick a piece from the list and click to place it. Its back snaps flush to a nearby wall. Q turns it 90° (Shift+Q the other way), or drag its round handle. Hold Shift to turn off snapping.',
  measure: 'Click a point, then another to read the distance and height. Shift turns off snapping. Esc finishes.',
  note: 'Click the plan to add a note; click a note to change or delete it. Esc finishes.',
  move: 'Drag to move the house on the block. Type exact distances to the boundary, rotation and floor level in Earthworks › Place.',
}

/** What the Roof tool does in each of its two ways. */
const ROOF_HINTS: Record<RoofMode, string> = {
  building: HINTS.roof,
  outline: 'Click the corners of the roof outline (type a length in mm and press Enter for an exact side). Click the first corner or press Enter to close it.',
}

/** Arrow keys as a step on the screen: x to the right, y down. */
const ARROW_KEYS: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

const fmtMm = (m: number) => Math.round(m * 1000).toString()

interface PlanEditorProps {
  survey: Survey
  terrain: Terrain
  /** What sits at the top of the page: square to the house, or a compass bearing. */
  up: 'house' | number
  onUpChange: (up: 'house' | number) => void
  /** Tint the plan where this level's floor is above or below the natural ground. */
  showGround: boolean
  onShowGroundChange: (on: boolean) => void
  /** Cut and fill, for the heights of retaining walls on the finished ground. */
  earth?: Earth | null
  /** The project whose zoom and pan to remember, for each floor (src/plan/viewMemory.ts); none, and it isn't kept. */
  viewKey?: string | null
  /** Draw the house's distance to each side of the block (setbacks). */
  showSetbacks?: boolean
  /** The plan key's Setbacks switch; left out where setbacks always show (Earthworks › Place). */
  setbacksSwitch?: { on: boolean; onChange: (on: boolean) => void }
  /** Shown from Earthworks, where the finished contours draw unless they've been switched off. */
  earthworks?: boolean
}

/** How long after the last wheel notch the view counts as settled, and is remembered (ms). */
const WHEEL_SETTLE_MS = 250

export function PlanEditor({ survey, terrain, up, onUpChange, showGround, onShowGroundChange, earth, viewKey = null, showSetbacks = false, setbacksSwitch, earthworks = false }: PlanEditorProps) {
  const plan = usePlan(s => s.plan)!
  const tool = usePlan(s => s.tool)
  const level = usePlan(s => s.activeLevel)
  const selection = usePlan(s => s.selection)
  const extra = usePlan(s => s.extra)
  // Several items picked: they move and go together, and none shows its own handles.
  const group = extra.length > 0
  const isSel = (type: Selection['type'], id: string) => (selection?.type === type && selection.id === id) || extra.some(x => x.type === type && x.id === id)
  const wallStyle = usePlan(s => s.wallStyle)
  const openingDefaults = usePlan(s => s.openingDefaults)
  const roofDefaults = usePlan(s => s.roofDefaults)
  const roofMode = usePlan(s => s.roofMode)
  const stairDefaults = usePlan(s => s.stairDefaults)
  const areaDefault = usePlan(s => s.areaDefault)
  const furnitureDefaults = usePlan(s => s.furnitureDefaults)
  const notice = usePlan(s => s.notice)
  const fitToken = usePlan(s => s.fitToken)
  const fitTarget = usePlan(s => s.fitTarget)
  const frame = useContext(CanvasFrame)
  // The new layout's touch: pinch and double tap everywhere, and on a phone in View, pan and tap to read only.
  const touch = useTouchCanvas()
  const viewOnly = !!touch?.viewOnly
  const area = useRouter(s => (s.route.kind === 'app' ? s.route.area : null))
  const inDesign = area === 'design'
  // In the app's frame, outside Design and Earthworks: a drag pans, and only a selected thing moves (AREA_HINTS).
  const guarded = !!frame && !viewOnly && area !== null && area !== 'design' && area !== 'earthworks'
  // Site is the block before the house, and tracing a feature is about the block too: no floor to
  // draw on, no ground-meets-floor line and no drawing hints there.
  const siteTool = useSiteStore(s => s.tool !== null)
  const noFloor = area === 'site' || siteTool
  // A drawing tool left out in Design is put down where the plan is only for looking at.
  useEffect(() => {
    if (guarded && tool !== 'select') usePlan.getState().setTool('select')
  }, [guarded, tool])
  // One thing at a time: the next-step tip waits while the street question is up.
  const askingStreet = useStreetAskOpen(plan, survey.boundary)
  // While it's asked, the side picked (the low side to start) and the one pointed at show on the block.
  const streetPicked = useStreetAsk(s => s.chosen)
  const streetHover = useStreetAsk(s => s.hover)
  const streetLow = useMemo(() => {
    if (!askingStreet) return null
    const cs = streetChoices(survey, plan.placement, terrain.stats.fallBearing)
    return (cs.find(c => c.low) ?? cs[0])?.index ?? null
  }, [askingStreet, survey, plan.placement, terrain.stats.fallBearing])
  /** A press on a side of the block while the street question is up: a click (not a drag) picks it. */
  const streetPress = useRef<number | null>(null)
  const newRetaining = useRetaining(s => s.newWall)
  // Earthworks › Retaining walls tags every wall with its height, and its list lights the wall pointed at or zooms to it.
  const onRetainingTab = useRouter(s => s.route.kind === 'app' && s.route.area === 'earthworks' && s.route.tab === 'retaining-walls')
  const onCutFillTab = useRouter(s => s.route.kind === 'app' && s.route.area === 'earthworks' && s.route.tab === 'cut-fill')
  const wallHover = useWallFocus(s => s.hover)
  const wallChanged = useWallFocus(s => s.changed)
  const wallZoom = useWallFocus(s => s.zoom)
  const retainingThickness = useRetaining(s => s.thickness)
  const { commit, preview, beginGesture, endGesture, select, toggleSelect, notify } = usePlan.getState()

  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  // Where the plan was left on this floor of this project, or a fit asked for there; nothing, and it fits as before.
  // Something a list asked to see, just before the plan opened (src/plan/planFocus.ts), wins over where it was left.
  const [focusOnOpen] = useState(() => {
    const f = usePlanFocus.getState()
    return f.n && Date.now() - f.at <= FOCUS_WAIT_MS ? f.pts : null
  })
  const [view, setView] = useState<View | null>(() => {
    const r = viewKey && !focusOnOpen ? loadPlanView(viewKey, level) : null
    return isPlace(r) ? { ...r, token: fitToken } : null
  })
  const [fitAs, setFitAs] = useState<{ target: 'house' | 'block'; token: number } | null>(() => {
    const r = viewKey && !focusOnOpen ? loadPlanView(viewKey, level) : null
    return r && !isPlace(r) ? { target: r.fit, token: fitToken } : null
  })
  /** Points to keep fitted (a drawing being lined up) in place of the plan, until the user moves the view. */
  const [around, setAround] = useState<{ pts: Vec2[]; token: number } | null>(() => (focusOnOpen ? { pts: focusOnOpen, token: fitToken } : null))
  /** When a list last asked for something to be framed. */
  const focusedAt = useRef(0)
  useEffect(() => {
    if (!wallZoom) return
    setAround({ pts: wallZoom.pts, token: fitToken })
    setView(null)
    // Once for each wall asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallZoom?.token])
  const [cursor, setCursor] = useState<SnapResult | null>(null)
  const [pointer, setPointer] = useState<Vec2 | null>(null)
  // In-progress drawing belongs to one tool on one level; switching either drops it.
  const draftKey = `${tool}|${level}`
  const [draftState, setDraft] = useState<Draft>(emptyDraft(draftKey))
  const draft = draftState.key === draftKey ? draftState : emptyDraft(draftKey)
  const { chain, areaPts, typed, stairStart } = draft
  const updateDraft = (fn: (d: Draft) => Partial<Draft>) =>
    setDraft(prev => {
      const cur = prev.key === draftKey ? prev : emptyDraft(draftKey)
      return { ...cur, ...fn(cur) }
    })
  const setChain = (c: Vec2[]) => updateDraft(() => ({ chain: c }))
  const setAreaPts = (a: Vec2[]) => updateDraft(() => ({ areaPts: a, typed: '' }))
  const setTyped = (fn: (t: string) => string) => updateDraft(d => ({ typed: fn(d.typed) }))
  const [hover, setHoverOpening] = useState<{ key: string; wall: Wall; offset: number } | null>(null)
  const hoverOpening = hover && hover.key === draftKey ? hover : null
  const [dragKind, setDragKind] = useState<Drag['type'] | null>(null)
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null)
  const drag = useRef<Drag | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const shift = useRef(false)
  // Fingers on the plan, a pinch in progress, and the last tap (for a double tap).
  const fingers = useRef(new Map<number, Pt>())
  const pinch = useRef<{ start: View; from: [Pt, Pt] } | null>(null)
  const afterPinch = useRef(false)
  const lastTap = useRef<Tap | null>(null)
  const zoomFrame = useRef(0)

  const walls = useMemo(() => plan.walls.filter(w => w.level === level), [plan.walls, level])
  const polys = useMemo(() => wallPolygons(walls), [walls])
  const faces = useMemo(() => planarFaces(walls), [walls])
  // The levels as the level menu lists them, and which of them show faintly under this one.
  const ghostsOff = useGhosts(s => s.off)
  const grounded = useMemo(() => groundedLevels(plan, survey, terrain.grid), [plan, survey, terrain])
  const levelMenu = useMemo(() => levelRows(plan, level, new Set(ghostsOff), grounded), [plan, level, ghostsOff, grounded])
  // Every other level's walls, faint, fainter the further away: to line up with, and to snap to.
  const ghostLevels = useMemo(
    () =>
      levelMenu
        .filter(r => r.ghost)
        .map(r => {
          const ws = houseWalls(plan.walls.filter(w => w.level === r.id))
          return { id: r.id, opacity: ghostOpacity(r.steps), walls: ws, polys: [...wallPolygons(ws).values()] }
        }),
    [plan.walls, levelMenu],
  )
  // Retaining walls, driveways and lawns are on the site, not a floor: those drawn on other levels
  // show on this one too, greyed with their level's name, and a click goes to them there.
  const siteLayer = useMemo(() => {
    const names = new Map(plan.levels.map(l => [l.id, l.name]))
    const ws = plan.walls.filter(w => w.level !== level && isRetaining(w))
    return {
      names,
      walls: ws,
      polys: wallPolygons(ws),
      areas: plan.areas.filter(a => a.level !== level && a.pts.length > 2 && (areaKind(a) === 'driveway' || areaKind(a) === 'garden')),
    }
  }, [plan.walls, plan.areas, plan.levels, level])
  // What drawing snaps to: this level's walls, the ghosts showing, and the site layer's walls.
  const snapWalls = useMemo(() => [...walls, ...ghostLevels.flatMap(g => g.walls), ...siteLayer.walls], [walls, ghostLevels, siteLayer])
  const roofs = useMemo(() => plan.roofs.filter(r => r.level === level), [plan.roofs, level])
  const stairs = useMemo(() => plan.stairs.filter(s => s.level === level), [plan.stairs, level])
  // Stairs that come up through this floor are drawn as the hole they climb into, over the rooms;
  // the level below's other stairs show faintly under them, for lining up.
  const arrivingStairs = useMemo(() => plan.stairs.filter(s => s.level !== level && stairArrivesAt(plan, s, level)), [plan, level])
  const ghostStairs = useMemo(
    () => ghostLevels.map(g => ({ opacity: g.opacity, stairs: plan.stairs.filter(s => s.level === g.id && !arrivingStairs.includes(s)) })),
    [plan.stairs, ghostLevels, arrivingStairs],
  )
  const isLowest = sortedLevels(plan)[0]?.id === level
  // This floor against the natural ground: worked out again only when the floor level or the survey changes.
  const floorRL = levelFloorRL(plan, level)
  const ground = useMemo(() => (showGround && !noFloor ? groundOverlay(terrain.grid, survey.boundary, floorRL) : null), [showGround, noFloor, terrain, survey, floorRL])
  const furniture = useMemo(() => plan.furniture.filter(f => f.level === level), [plan.furniture, level])
  const wallOutlines = useMemo(() => [...polys.values()], [polys])
  const selFurniture = !group && selection?.type === 'furniture' ? furniture.find(f => f.id === selection.id) : undefined

  // Setbacks: how far the ground floor is from each side of the block, while moving the house and wherever they're switched on.
  const setbacks = useMemo(() => {
    const lowest = sortedLevels(plan)[0]
    if ((tool !== 'move' && !showSetbacks) || !lowest) return []
    return setbackDims(buildingOutline(planarFaces(plan.walls.filter(w => w.level === lowest.id))).outlines, plan.placement, survey, { over: true })
  }, [tool, showSetbacks, plan, survey])

  // Site boundary and contours in the house's frame.
  const underlay = useMemo(() => {
    const pl = plan.placement
    const tf = (p: Vec2) => fromSite(p, pl, survey.origin)
    const boundary = survey.boundary.map(tf)
    const minor: [Vec2, Vec2][] = []
    const major: [Vec2, Vec2][] = []
    const labels: { p: Vec2; text: string }[] = []
    for (const c of survey.contours) {
      let labelled = false
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i]
        const b = c.pts[i + 1]
        if (!pointInPolygon((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, survey.boundary)) continue
        const seg: [Vec2, Vec2] = [tf([a[0], a[1]]), tf([b[0], b[1]])]
        ;(c.major ? major : minor).push(seg)
        if (c.major && !labelled && i > c.pts.length / 3) {
          labels.push({ p: seg[0], text: c.z.toFixed(0) })
          labelled = true
        }
      }
    }
    return { boundary, minor, major, labels }
  }, [survey, plan.placement])

  // A finger can pan as far as the block (or the house, if it sits off the block) and no further.
  const panBounds = useMemo(() => {
    const b = planBounds(plan)
    const house: Vec2[] = b
      ? [
          [b.minX, b.minY],
          [b.maxX, b.maxY],
        ]
      : []
    return boundsOf([...underlay.boundary, ...house])
  }, [underlay.boundary, plan])

  // Once the ground is cut or filled: the finished ground's contours, worked out once for each earthworks result.
  const contours = useMemo(
    () => (earth && earth.result.cut + earth.result.fill > 0.01 ? finishedContours(survey, terrain.grid, earth.result.grid, earth.strips) : null),
    [earth, survey, terrain],
  )
  // On Earthworks › Cut & fill the tint is the cut and fill itself, only where the earth is moved,
  // in place of the floor against the ground over the whole block (which reads as cut far past the batters).
  const works = useMemo(
    () => (onCutFillTab && showGround && earth && earth.result.cut + earth.result.fill > 0.01 ? worksOverlay(earth.prep.natural, earth.result.grid, survey.boundary) : null),
    [onCutFillTab, showGround, earth, survey],
  )
  // Drawn as the user last chose; until then only in Earthworks, where the ground is the subject.
  const [finishedPref, setFinishedPref] = useState(readFinishedPref)
  const finishedOn = finishedShown(finishedPref, earthworks)
  const changeFinished = (on: boolean) => {
    setFinishedPref(on)
    saveFinishedPref(on)
  }
  const planContourLines = useMemo(
    () => (finishedOn && contours?.any ? planContours(contours, plan.placement, survey.origin, underlay.labels) : null),
    [finishedOn, contours, plan.placement, survey.origin, underlay.labels],
  )

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The page is turned by `rho` (anticlockwise) from the house's own frame.
  const rho = planTurn(up, plan.placement.rotation)
  const rc = Math.cos(rho)
  const rs = Math.sin(rho)
  const rhoRef = useRef(rho)
  useEffect(() => {
    rhoRef.current = rho
  })

  /** Frame the house (or the block, when there is no house yet), the whole block, or some points (a drawing being lined up). */
  const fitView = (target: 'house' | 'block' | Vec2[] = 'house'): View => {
    const b = target === 'house' ? houseBounds(plan) : null
    const pts: Vec2[] = Array.isArray(target) && target.length
      ? target
      : b
      ? [
          [b.minX, b.minY],
          [b.maxX, b.minY],
          [b.maxX, b.maxY],
          [b.minX, b.maxY],
        ]
      : underlay.boundary
    // Fit in the turned frame, then bring the centre back to the house frame.
    const xs = pts.map(p => p[0] * rc - p[1] * rs)
    const ys = pts.map(p => p[0] * rs + p[1] * rc)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    // Keep clear of anything floating over the canvas's edges.
    const ins = frame?.insets ?? { l: 0, r: 0, t: 0, b: 0 }
    const w = frame ? Math.max(size.w - ins.l - ins.r, 100) : size.w
    const h = frame ? Math.max(size.h - ins.t - ins.b, 100) : size.h
    const k = Math.min(Math.max(Math.min(w / Math.max(maxX - minX, 1), h / Math.max(maxY - minY, 1)) * 0.75, 5), 400)
    const mx = (minX + maxX) / 2 - (ins.l - ins.r) / 2 / k
    const my = (minY + maxY) / 2 + (ins.t - ins.b) / 2 / k
    return { cx: mx * rc + my * rs, cy: -mx * rs + my * rc, k, token: fitToken }
  }

  // Until the user pans or zooms, keep the view fitted to the drawing.
  const v: View = view && view.token === fitToken ? view : fitView(around?.token === fitToken ? around.pts : fitAs?.token === fitToken ? fitAs.target : fitTarget)
  const vRef = useRef(v)
  useEffect(() => {
    vRef.current = v
  })
  // A tool's card opening or closing beside the plan (pressing W, say) leaves the drawing where it
  // is on screen: the fitted view stays put, as if it had been moved by hand, instead of refitting
  // to the room the card leaves. vRef still holds the view last drawn, before the card.
  const toolCard = !!frame?.toolCard
  const cardWas = useRef(toolCard)
  useLayoutEffect(() => {
    if (cardWas.current === toolCard) return
    cardWas.current = toolCard
    if (!view || view.token !== fitToken) setView(vRef.current)
  }, [toolCard, view, fitToken])

  // ---- Remembering the view (src/plan/viewMemory.ts) ----
  // What the handlers outside React need: where to remember, and the view and screen now.
  const live = useRef({ key: viewKey, level, view, fitToken, size, insets: frame?.insets ?? null })
  useLayoutEffect(() => {
    live.current = { key: viewKey, level, view, fitToken, size, insets: frame?.insets ?? null }
  })
  /** Remember the view, when it's one the person moved to (not a fit, which remembers itself). */
  const saveView = () => {
    const m = live.current
    if (m.key && m.view && m.view.token === m.fitToken) savePlanView(m.key, m.level, { cx: m.view.cx, cy: m.view.cy, k: m.view.k })
  }
  // A gesture or the wheel has ended: remember the view once it has drawn, so it's the latest.
  const [settled, setSettled] = useState(0)
  const settle = () => setSettled(n => n + 1)
  useEffect(() => {
    if (settled) saveView()
  }, [settled])
  // Leaving (Back, the 3D view) or the page going away keeps it too, so a wheel that hasn't
  // settled yet isn't lost.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveView()
    }
    window.addEventListener('pagehide', saveView)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', saveView)
      document.removeEventListener('visibilitychange', onHide)
      saveView()
    }
  }, [])
  // Another floor, or another project: back to where it was left there. A floor not looked at
  // yet keeps the view as it is; a project not opened before fits, as it always has.
  const viewFor = `${viewKey ?? ''}|${level}`
  const shownFor = useRef({ key: viewKey, at: viewFor })
  useLayoutEffect(() => {
    const was = shownFor.current
    if (was.at === viewFor) return
    shownFor.current = { key: viewKey, at: viewFor }
    // Just framed for a list's row: that's what to see on this level now.
    if (!viewKey || Date.now() - focusedAt.current < 1000) return
    const r = loadPlanView(viewKey, level, was.key === viewKey)
    if (isPlace(r)) {
      setView({ ...r, token: fitToken })
      setFitAs(null)
    } else if (r) {
      setView(null)
      setFitAs({ target: r.fit, token: fitToken })
    }
  }, [viewFor, viewKey, level, fitToken])
  // A list's row asks for something to be framed (src/plan/planFocus.ts), often on another level:
  // the level's own view (above) gives way to it.
  useEffect(
    () =>
      usePlanFocus.subscribe(f => {
        focusedAt.current = Date.now()
        setView(null)
        setFitAs(null)
        setAround({ pts: f.pts, token: live.current.fitToken })
      }),
    [],
  )

  // The + and − buttons, their keys and ⌘K: zoom about the middle of the part of the plan nothing covers.
  useEffect(() => {
    let seen = usePlanZoom.getState().n
    return usePlanZoom.subscribe(z => {
      if (z.n === seen) return
      seen = z.n
      const { size: sz, insets } = live.current
      const ins = insets ?? { l: 0, r: 0, t: 0, b: 0 }
      const mid: Pt = [(ins.l + sz.w - ins.r) / 2, (ins.t + sz.h - ins.b) / 2]
      cancelAnimationFrame(zoomFrame.current)
      setView(zoomAbout(vRef.current, rhoRef.current, sz, mid, z.factor))
      settle()
    })
  }, [])
  const S = (p: Vec2): Vec2 => {
    const x = p[0] - v.cx
    const y = p[1] - v.cy
    return [(x * rc - y * rs) * v.k + size.w / 2, -(x * rs + y * rc) * v.k + size.h / 2]
  }
  const W = (sx: number, sy: number): Vec2 => {
    const qx = (sx - size.w / 2) / v.k
    const qy = -(sy - size.h / 2) / v.k
    return [qx * rc + qy * rs + v.cx, -qx * rs + qy * rc + v.cy]
  }
  // Site features: drawings under the plan, features on it, and their tools, which take over clicks and keys while picked.
  const site = useSitePlan({
    survey,
    placement: plan.placement,
    S,
    toHouse: (cx, cy) => {
      const r = svgRef.current!.getBoundingClientRect()
      return W(cx - r.left, cy - r.top)
    },
    k: v.k,
    // Fitted afresh as the plan's size settles (it may have only just opened).
    fitTo: pts => {
      setAround({ pts, token: fitToken })
      setView(null)
    },
  })
  // The design flow: hover tooltips, picking a contour or a retaining wall's earth side, and its cards.
  const flow = usePlanFlow({
    plan,
    level,
    tool,
    survey,
    terrain,
    earth,
    S,
    k: v.k,
    size,
    pickAt: (world, sx, sy) => pickAt(world, sx, sy, true),
    finished: planContourLines ? (contours?.finished ?? null) : null,
    siteActive: site.active,
    viewOnly,
  })
  // Comments from share links: their pins, and on a shared view, tapping a spot for a new one.
  const comments = useCommentsPlan({
    plan,
    level,
    S,
    size,
    fitTo: pts => {
      setAround({ pts, token: fitToken })
      setView(null)
    },
  })
  // Section lines: drawing one with two clicks, and their A–A marks while Design › Sections is open.
  const sections = useSectionMarks({ plan, S, k: v.k, viewOnly })
  // The grading brush (Earthworks › Cut & fill): painting ground to a level, and the retaining walls it suggests.
  const brush = useGradeBrush({
    plan,
    survey,
    terrain,
    earth,
    tool,
    S,
    k: v.k,
    finished: planContourLines ? (contours?.finished ?? null) : null,
    viewOnly,
    touch: !!touch?.phone,
  })
  // The Measure and Note tools: the ruler and the plan's text notes.
  const mn = useMeasureNotes({ plan, level, tool, survey, terrain, S, walls, tol: 10 / v.k, viewOnly, size })
  const path = (pts: Vec2[], close = true) =>
    pts.length ? `M${pts.map(p => S(p).map(n => n.toFixed(1)).join(' ')).join('L')}${close ? 'Z' : ''}` : ''
  const tol = 10 / v.k
  // Furniture snaps to a wall when its edge comes within a few pixels, but never from far off.
  const furnTol = Math.min(14 / v.k, 0.25)
  /** The round handle in front of a selected piece of furniture that turns it. */
  const turnHandle = (f: Furniture) => furnitureToPlan(f, [0, -f.depth / 2 - 22 / v.k])

  // The piece the Furniture tool would place, following the pointer (not over the selected piece, which drags instead).
  const ghost = (() => {
    if (tool !== 'furniture' || !cursor || dragKind) return null
    if (selFurniture && furnitureContains(selFurniture, cursor.p)) return null
    const f = newFurniture(furnitureDefaults.kind, level, cursor.p, furnitureDefaults.rotation)
    if (!f) return null
    const fit = fitFurniture(f, cursor.p, walls, { tol: furnTol, free: cursor.kind === 'free' })
    return { item: { ...f, at: fit.at, rotation: fit.rotation }, fit }
  })()

  // The plan before the run of walls being drawn now, so the floor type question waits until the
  // run ends (closed, double-clicked or Esc) rather than popping up over the drawing mid-run.
  const chainStart = useRef<{ plan: Plan; level: string } | null>(null)
  const askAfterChain = () => {
    const c = chainStart.current
    chainStart.current = null
    if (!c) return
    // A house's first walls: its floor starts at the mean ground under them (src/plan/levelGround.ts).
    floorToFirstWalls(c.plan, survey, terrain.grid)
    wallsPlaced(c.plan, c.level)
  }
  // Switching tool or level drops the run, and leaving the plan ends it: ask then.
  useEffect(() => askAfterChain, [draftKey])
  const finishChain = () => {
    updateDraft(() => ({ chain: [], typed: '' }))
    askAfterChain()
  }

  /** Where the side being drawn from `a` ends: at the pointer, or at a typed length towards it. */
  function typedEnd(a: Vec2, toward: Vec2): Vec2 | null {
    const l = Math.hypot(toward[0] - a[0], toward[1] - a[1])
    if (!typed) return l > 1e-6 ? toward : null
    const len = parseFloat(typed) / 1000
    if (!(len > 0) || l < 1e-6) return null
    return [a[0] + ((toward[0] - a[0]) / l) * len, a[1] + ((toward[1] - a[1]) / l) * len]
  }

  const placeWallPoint = (p: Vec2) => {
    if (chain.length === 0) {
      setChain([p])
      return
    }
    const last = chain[chain.length - 1]
    const first = chain[0]
    const closes = chain.length > 1 && Math.hypot(p[0] - first[0], p[1] - first[1]) < 0.002
    const end: Vec2 = closes ? first : p
    chainStart.current ??= { plan: usePlan.getState().plan!, level }
    commit(pl => addWall(pl, level, last, end, wallStyle))
    // Walls that close round a space make a room: its floor type, or a retaining wall, is asked
    // about when the run ends (finishChain).
    if (closes) finishChain()
    else updateDraft(() => ({ chain: [...chain, end], typed: '' }))
  }

  /**
   * The Retaining wall tool, as the Wall tool does: click its start, then each corner; double-click
   * or Esc ends the run. The first piece opens its panel, which asks once (which side, how high) for
   * the whole run; each piece after it carries on from the last, holding back the same side.
   */
  const placeRetainingPoint = (p: Vec2) => {
    // While the wall just drawn asks for its earth side by a click, that click answers it and starts nothing.
    if (waitingForSide()) return
    if (chain.length === 0) {
      setChain([p])
      return
    }
    const a = chain[chain.length - 1]
    if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 0.05) return
    const w = newRetainingWall(plan, level, a, p, retainingThickness, survey.origin, terrain.grid)
    if (chain.length < 2 || !extendRun(w, survey.origin, terrain.grid)) placeRetainingWall(w, { draft: true })
    updateDraft(() => ({ chain: [...chain, p], typed: '' }))
    notify(null)
  }

  const AREA_NAMES = { slab: 'Concrete slab', driveway: 'Driveway', deck: 'Deck', garden: 'Garden' } as const
  const closeArea = (pts: Vec2[]) => {
    if (pts.length >= 3) {
      const ccw = signedArea(pts) < 0 ? [...pts].reverse() : pts
      commit(pl => addArea(pl, level, ccw, AREA_NAMES[areaDefault], areaDefault))
      const created = usePlan.getState().plan!.areas.at(-1)
      if (created) select({ type: 'area', id: created.id })
    }
    setAreaPts([])
  }

  const closeRoof = (pts: Vec2[]) => {
    if (pts.length >= 3) {
      const before = usePlan.getState().plan!.roofs.length
      commit(pl => addRoof(pl, level, pts, roofDefaults))
      const after = usePlan.getState().plan!.roofs
      if (after.length > before) select({ type: 'roof', id: after.at(-1)!.id })
    }
    setAreaPts([])
  }

  /** Direction from the stair's start towards the cursor: square to the house unless Shift is held. */
  const stairAngle = (from: Vec2, to: Vec2, free: boolean): number | null => {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    if (Math.hypot(dx, dy) < 0.05) return null
    const a = (Math.atan2(dy, dx) * 180) / Math.PI
    return free ? Math.round(a) : ((Math.round(a / 90) * 90) % 360 + 360) % 360
  }

  /** Where each roof edge's marker sits: the middle of the edge, out in the overhang. */
  const roofMarkers = (r: Roof): Vec2[] =>
    r.pts.map((p, i) => {
      const q = r.pts[(i + 1) % r.pts.length]
      const d: Vec2 = [q[0] - p[0], q[1] - p[1]]
      const l = Math.hypot(d[0], d[1]) || 1
      const out = Math.max(r.overhang / 2, 14 / v.k)
      return [(p[0] + q[0]) / 2 + (d[1] / l) * out, (p[1] + q[1]) / 2 - (d[0] / l) * out] as Vec2
    })

  const nearestWall = (p: Vec2): { wall: Wall; offset: number } | null => {
    let best: { wall: Wall; offset: number } | null = null
    let bestD = Infinity
    // Doors and windows go in the house's walls, not retaining walls.
    for (const w of houseWalls(walls)) {
      const c = closestOnSegment(p, w.a, w.b)
      if (c.dist < w.thickness / 2 + tol && c.dist < bestD) {
        bestD = c.dist
        best = { wall: w, offset: Math.round(c.t * wallLength(w) * 100) / 100 }
      }
    }
    return best
  }

  const openingHit = (p: Vec2): Opening | null => {
    for (const o of plan.openings) {
      const w = walls.find(x => x.id === o.wall)
      if (!w) continue
      const c = closestOnSegment(p, w.a, w.b)
      const s = c.t * wallLength(w)
      if (c.dist < w.thickness / 2 + 4 / v.k && Math.abs(s - o.offset) < o.width / 2) return o
    }
    return null
  }

  /** Where a pointer is on the plan, in pixels from its top left. */
  const local = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  /** Drop what a finger started (a drag, or a drag's changes) when a second finger turns it into a pinch. */
  const cancelDrag = () => {
    const d = drag.current
    drag.current = null
    downAt.current = null
    setDragKind(null)
    if (d?.type === 'brush') brush.cancel()
    else if (d && d.type !== 'pan') {
      const start = usePlan.getState().gestureStart
      if (start) usePlan.setState({ plan: start, gestureStart: null })
      setCursor(null)
    }
  }

  const stopZoom = () => cancelAnimationFrame(zoomFrame.current)

  /** A double tap: zoom in about the finger, quickly and smoothly. */
  const zoomInAt = (s: Pt) => {
    stopZoom()
    const start = v
    let t0 = -1
    const step = (now: number) => {
      if (t0 < 0) t0 = now
      const t = Math.min((now - t0) / 220, 1)
      setView(clampToBounds(zoomStep(start, rho, size, s, DOUBLE_TAP_ZOOM, t), panBounds))
      if (t < 1) zoomFrame.current = requestAnimationFrame(step)
      else settle()
    }
    zoomFrame.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(zoomFrame.current), [])

  /** A tap that didn't move: true when it was the second of a double tap, and zoomed. */
  const doubleTapped = (e: ReactPointerEvent<SVGSVGElement>, s: Pt): boolean => {
    const tap = { t: e.timeStamp, x: s[0], y: s[1] }
    if (isDoubleTap(lastTap.current, tap)) {
      lastTap.current = null
      zoomInAt(s)
      return true
    }
    lastTap.current = tap
    return false
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    flow.leave()
    if (touch && e.pointerType === 'touch') {
      fingers.current.set(e.pointerId, local(e))
      if (fingers.current.size >= 2) {
        // A second finger: whatever the first one started becomes a pinch.
        svgRef.current!.setPointerCapture(e.pointerId)
        cancelDrag()
        stopZoom()
        const [a, b] = [...fingers.current.values()]
        pinch.current = { start: v, from: [a, b] }
        afterPinch.current = true
        if (!view || view.token !== fitToken) setView(v)
        return
      }
    }
    if (viewOnly) {
      // View: a finger only pans, and a tap reads (on the way up).
      const [sx, sy] = local(e)
      downAt.current = { x: sx, y: sy }
      svgRef.current!.setPointerCapture(e.pointerId)
      stopZoom()
      if (!view || view.token !== fitToken) setView(v)
      drag.current = { type: 'pan', sx, sy, start: v }
      return
    }
    startPointer(e)
    setDragKind(drag.current?.type ?? null)
  }

  // The line about walls on one another stays while the wall it names is selected.
  const stackNote = useRef<{ text: string; id: string } | null>(null)
  const noteStack = (stack: Wall[], id: string) => {
    const text = stackNotice(stack, id)
    stackNote.current = text ? { text, id } : null
    notify(text)
  }
  useEffect(() => {
    const note = stackNote.current
    if (!note || (selection?.type === 'wall' && selection.id === note.id)) return
    stackNote.current = null
    if (usePlan.getState().notice === note.text) notify(null)
  }, [selection, notify])

  type Hit =
    | { type: 'opening'; item: Opening }
    | { type: 'room'; item: Room }
    | { type: 'furniture'; item: Furniture }
    | { type: 'stair'; item: Stair }
    | { type: 'wall'; item: Wall; stack: Wall[] }
    | { type: 'area'; item: Area }
    | { type: 'roof'; item: Roof }

  /**
   * What a click at a point picks, in order: a door or window, a room's name, furniture, a
   * stair, a wall, an area, a roof. `insideRooms` also picks a room by a tap anywhere in it,
   * as a finger on a phone expects. Where walls sit on one another it picks the selected one,
   * else the top one, with the whole stack so a second click can step to the next.
   */
  const pickAt = (world: Vec2, sx: number, sy: number, insideRooms = false): Hit | null => {
    const op = openingHit(world)
    if (op) return { type: 'opening', item: op }
    const room = plan.rooms.find(r => r.level === level && Math.abs(S(r.at)[0] - sx) < 40 && Math.abs(S(r.at)[1] - sy) < 16)
    if (room) return { type: 'room', item: room }
    const piece = [...furniture].reverse().find(f => furnitureContains(f, world))
    if (piece) return { type: 'furniture', item: piece }
    const stair = [...stairs].reverse().find(st => stairContains(st, world))
    if (stair) return { type: 'stair', item: stair }
    const stack = wallStackAt(walls, w => {
      const poly = polys.get(w.id)
      return (poly && pointInPolygon(world[0], world[1], poly)) || closestOnSegment(world, w.a, w.b).dist < w.thickness / 2 + 3 / v.k
    })
    const wall = pickFromStack(stack, selection?.type === 'wall' ? selection.id : undefined)
    if (wall) return { type: 'wall', item: wall, stack }
    const area = plan.areas.find(a => a.level === level && pointInPolygon(world[0], world[1], a.pts))
    if (area) return { type: 'area', item: area }
    if (insideRooms) {
      const shape = roomShape({ id: 'probe', level, name: '', at: world }, faces)
      const inRoom = shape && plan.rooms.find(r => r.level === level && pointInPolygon(r.at[0], r.at[1], shape.centre))
      if (inRoom) return { type: 'room', item: inRoom }
    }
    // Roofs: anywhere inside one (the rest come first, above), or on its edge.
    const roof = roofAtPoint(roofs, world, 6 / v.k)
    if (roof) return { type: 'roof', item: roof }
    return null
  }

  const startPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = W(sx, sy)
    downAt.current = { x: sx, y: sy }
    shift.current = e.shiftKey
    svgRef.current!.setPointerCapture(e.pointerId)
    if (!view || view.token !== fitToken) setView(v) // freeze the fitted view once the user interacts

    // The street question: a side of the block clicked is its answer (on pointer-up); a drag still pans.
    streetPress.current = askingStreet && frame && !viewOnly ? streetEdgeAt(sx, sy) : null
    if (streetPress.current !== null) {
      drag.current = { type: 'pan', sx, sy, start: v }
      return
    }
    if (e.button === 1 || e.button === 2 || site.active || flow.active || sections.active || (brush.active && !brush.painting)) {
      // With a site tool (or picking a contour or an earth side), a click acts on pointer-up and a drag pans.
      drag.current = { type: 'pan', sx, sy, start: v }
      return
    }

    if (brush.down(world)) {
      drag.current = { type: 'brush' }
      return
    }

    if (tool === 'move') {
      beginGesture()
      drag.current = { type: 'move', startWorld: world, startPlacement: plan.placement }
      return
    }

    if (tool === 'furniture' && (grabTurnHandle(sx, sy) || grabFurniture(world, true))) return

    if (tool !== 'select') {
      // Drawing tools act on click (pointer up); dragging pans.
      drag.current = { type: 'pan', sx, sy, start: v }
      return
    }

    // Ctrl/⌘ and a click adds an item to the group, or takes it out.
    const mod = modKey(e)
    if (mod || e.shiftKey) {
      const hit = mod ? pickAt(world, sx, sy) : null
      if (hit) {
        toggleSelect({ type: hit.type, id: hit.item.id })
        drag.current = { type: 'pan', sx, sy, start: v }
        return
      }
      // On empty ground, Shift or Ctrl/⌘ and a drag draws a box (a plain drag still pans).
      if (!pickAt(world, sx, sy)) {
        drag.current = { type: 'box', from: world, fromPx: [sx, sy], add: mod }
        return
      }
    }
    // Outside Design and Earthworks a press only selects (and a drag pans); what is already selected can be dragged.
    if (guarded && !grabsSelection(world, sx, sy)) {
      const hit = pickAt(world, sx, sy)
      if (!hit || !isSel(hit.type, hit.item.id)) select(hit ? { type: hit.type, id: hit.item.id } : null)
      drag.current = { type: 'pan', sx, sy, start: v }
      return
    }
    // Handles on the selected wall or area first.
    if (!group && selection?.type === 'wall') {
      const w = walls.find(x => x.id === selection.id)
      if (w) {
        for (const [end, other] of [
          [w.a, w.b],
          [w.b, w.a],
        ] as [Vec2, Vec2][]) {
          const [hx, hy] = S(end)
          if (Math.hypot(hx - sx, hy - sy) < 9) {
            const attached = walls.filter(x => near(x.a, end) || near(x.b, end))
            beginGesture()
            drag.current = {
              type: 'joint',
              level,
              from: end,
              anchor: attached.length === 1 ? other : null,
              exclude: new Set(attached.map(x => x.id)),
            }
            return
          }
        }
      }
    }
    if (!group && selection?.type === 'area') {
      const a = plan.areas.find(x => x.id === selection.id)
      const i = a ? a.pts.findIndex(p => Math.hypot(S(p)[0] - sx, S(p)[1] - sy) < 9) : -1
      if (a && i >= 0) {
        beginGesture()
        drag.current = { type: 'areaVertex', id: a.id, index: i }
        return
      }
    }
    if (!group && selection?.type === 'roof') {
      const r = plan.roofs.find(x => x.id === selection.id)
      if (r) {
        const i = r.pts.findIndex(p => Math.hypot(S(p)[0] - sx, S(p)[1] - sy) < 9)
        if (i >= 0) {
          beginGesture()
          drag.current = { type: 'roofVertex', id: r.id, index: i }
          return
        }
        const m = r.type === 'gable' || r.type === 'skillion' ? roofMarkers(r).findIndex(p => Math.hypot(S(p)[0] - sx, S(p)[1] - sy) < 11) : -1
        if (m >= 0) {
          if (r.type === 'skillion') commit(p => updateRoof(p, r.id, { lowEdge: m }))
          else {
            const n = r.pts.length
            const gables = r.pts.map((_, i) => !!r.gables[i])
            gables[m] = !gables[m]
            // two gable ends can't share a corner
            if (gables[m]) gables[(m + 1) % n] = gables[(m - 1 + n) % n] = false
            commit(p => updateRoof(p, r.id, { gables }))
          }
          return
        }
      }
    }
    if (grabTurnHandle(sx, sy)) return
    const hit = pickAt(world, sx, sy)
    // A click on one of several picked items moves them all.
    if (group && hit && isSel(hit.type, hit.item.id)) {
      beginGesture()
      drag.current = { type: 'group', start: plan, startWorld: world, sels: selectedList(usePlan.getState()), solo: { type: hit.type, id: hit.item.id } }
      return
    }
    switch (hit?.type) {
      case 'opening': {
        const op = hit.item
        select({ type: 'opening', id: op.id })
        beginGesture()
        drag.current = { type: 'opening', id: op.id, wall: walls.find(x => x.id === op.wall)! }
        return
      }
      case 'room': {
        const room = hit.item
        select({ type: 'room', id: room.id })
        beginGesture()
        drag.current = { type: 'room', id: room.id, offset: [room.at[0] - world[0], room.at[1] - world[1]] }
        return
      }
      case 'furniture':
        grabFurniture(world, false)
        return
      case 'stair': {
        const stair = hit.item
        select({ type: 'stair', id: stair.id })
        beginGesture()
        drag.current = { type: 'stair', id: stair.id, offset: [stair.at[0] - world[0], stair.at[1] - world[1]] }
        return
      }
      case 'wall': {
        const wall = hit.item
        const again = hit.stack.length > 1 && isSel('wall', wall.id)
        select({ type: 'wall', id: wall.id })
        if (!again) noteStack(hit.stack, wall.id)
        beginGesture()
        const d = wallDir(wall)
        drag.current = { type: 'wall', id: wall.id, start: plan, startWorld: world, dir: d, cycle: again ? hit.stack : undefined }
        return
      }
      case 'area':
        select({ type: 'area', id: hit.item.id })
        return
      case 'roof':
        select({ type: 'roof', id: hit.item.id })
        // A drag from inside a roof still pans.
        drag.current = { type: 'pan', sx, sy, start: v }
        return
    }
    drag.current = { type: 'pan', sx, sy, start: v }
    if (pickOtherLevelSite(world)) return
    select(null)
  }

  /** A retaining wall, driveway or lawn drawn on another level, under a point: the site layer. */
  const siteItemAt = (world: Vec2): { level: string; sel: Selection } | null => {
    const w = siteLayer.walls.find(x => {
      const poly = siteLayer.polys.get(x.id)
      return (poly && pointInPolygon(world[0], world[1], poly)) || closestOnSegment(world, x.a, x.b).dist < x.thickness / 2 + 3 / v.k
    })
    if (w) return { level: w.level, sel: { type: 'wall', id: w.id } }
    const a = siteLayer.areas.find(x => pointInPolygon(world[0], world[1], x.pts))
    return a ? { level: a.level, sel: { type: 'area', id: a.id } } : null
  }

  /** Go to the site item under a point on its own level, and pick it there. */
  const pickOtherLevelSite = (world: Vec2): boolean => {
    const hit = siteItemAt(world)
    if (!hit) return false
    const st = usePlan.getState()
    st.setActiveLevel(hit.level)
    st.select(hit.sel)
    return true
  }

  /** The side of the block under a point on the screen (by its boundary index), for the street question. */
  const streetEdgeAt = (sx: number, sy: number): number | null =>
    edgeNear(
      underlay.boundary.map(p => S(p) as [number, number]),
      sx,
      sy,
      touch?.phone ? 22 : 10,
    )

  /** Whether a press is on what's selected now, or one of its handles: the only things a press can move outside Design and Earthworks. */
  const grabsSelection = (world: Vec2, sx: number, sy: number): boolean => {
    if (!selection) return false
    const at = (p: Vec2, r = 9) => Math.hypot(S(p)[0] - sx, S(p)[1] - sy) < r
    if (!group && selection.type === 'wall') {
      const w = walls.find(x => x.id === selection.id)
      if (w && (at(w.a) || at(w.b))) return true
    }
    if (!group && selection.type === 'area' && plan.areas.find(x => x.id === selection.id)?.pts.some(p => at(p))) return true
    if (!group && selection.type === 'roof' && plan.roofs.find(x => x.id === selection.id)?.pts.some(p => at(p, 11))) return true
    if (selFurniture && at(turnHandle(selFurniture))) return true
    const hit = pickAt(world, sx, sy)
    return !!hit && isSel(hit.type, hit.item.id)
  }

  /** The roof under a point on this level: the top one whose outline holds it, or whose edge it's on. */
  const roofAt = (world: Vec2): Roof | undefined => roofAtPoint(roofs, world, 6 / v.k)

  const grabTurnHandle = (sx: number, sy: number): boolean => {
    if (!selFurniture) return false
    const [hx, hy] = S(turnHandle(selFurniture))
    if (Math.hypot(hx - sx, hy - sy) >= 9) return false
    beginGesture()
    drag.current = { type: 'furnitureTurn', id: selFurniture.id }
    return true
  }

  /** Start dragging the piece of furniture under the pointer (or only the selected one). */
  const grabFurniture = (world: Vec2, onlySelected: boolean): boolean => {
    const hit = onlySelected
      ? selFurniture && furnitureContains(selFurniture, world)
        ? selFurniture
        : undefined
      : [...furniture].reverse().find(f => furnitureContains(f, world))
    if (!hit) return false
    select({ type: 'furniture', id: hit.id })
    beginGesture()
    drag.current = { type: 'furniture', item: hit, offset: [hit.at[0] - world[0], hit.at[1] - world[1]] }
    return true
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (touch && e.pointerType === 'touch' && fingers.current.has(e.pointerId)) {
      fingers.current.set(e.pointerId, local(e))
      const p = pinch.current
      if (p) {
        const [a, b] = [...fingers.current.values()]
        if (b) setView(clampToBounds(pinchView(p.start, rho, size, p.from, [a, b]), panBounds))
        return
      }
      // One finger left after a pinch does nothing until it lifts.
      if (afterPinch.current) return
    }
    const rect = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = W(sx, sy)
    setPointer(world)
    const d = drag.current
    const free = e.shiftKey
    if (askingStreet && frame && !viewOnly && !d) hoverStreetEdge(streetEdgeAt(sx, sy))
    flow.move(world, sx, sy, { dragging: !!d || dragKind !== null || brush.active, pointerType: e.pointerType, buttons: e.buttons })
    sections.move(world, e.shiftKey)
    brush.move(world)
    if (d?.type === 'brush') return

    if (d?.type === 'pan') {
      if (Math.hypot(sx - d.sx, sy - d.sy) < (e.pointerType === 'touch' ? TAP_SLOP : 4)) return
      const dx = sx - d.sx
      const dy = sy - d.sy
      const next = { ...d.start, cx: d.start.cx - (dx * rc - dy * rs) / d.start.k, cy: d.start.cy + (dx * rs + dy * rc) / d.start.k }
      // A finger in the new layout stays over the block; the mouse pans as it always has.
      setView(touch && e.pointerType === 'touch' ? clampToBounds(next, panBounds) : next)
      return
    }
    if (viewOnly) return
    if (flow.active || sections.active) return
    if (site.active) {
      site.move(world, free)
      return
    }
    if (mn.active) {
      mn.move(world, free)
      return
    }
    if (d?.type === 'box') {
      if (Math.hypot(sx - d.fromPx[0], sy - d.fromPx[1]) > 4) setBox({ a: d.fromPx, b: [sx, sy] })
      return
    }
    if (d?.type === 'group') {
      // Shift is snapping off here too: free, or in 10 mm steps.
      const raw: Vec2 = [world[0] - d.startWorld[0], world[1] - d.startWorld[1]]
      const delta: Vec2 = free ? raw : [Math.round(raw[0] * 100) / 100, Math.round(raw[1] * 100) / 100]
      preview(() => translateSelection(d.start, d.sels, delta))
      return
    }
    if (d?.type === 'joint') {
      const s = snap(world, { walls: walls.filter(w => !d.exclude.has(w.id)), anchor: d.anchor, tol, free })
      setCursor(s)
      preview(() => moveJoint(usePlan.getState().gestureStart!, d.level, d.from, s.p))
      return
    }
    if (d?.type === 'wall') {
      if (d.cycle) {
        // A press on walls that sit on one another: still a click until it moves past the slop.
        if (downAt.current && Math.hypot(sx - downAt.current.x, sy - downAt.current.y) <= (e.pointerType === 'touch' ? TAP_SLOP : 4)) return
        d.cycle = undefined
      }
      let delta: Vec2 = [world[0] - d.startWorld[0], world[1] - d.startWorld[1]]
      if (!free) {
        // Walls move square to themselves, in 10 mm steps.
        const n: Vec2 = [-d.dir[1], d.dir[0]]
        const along = Math.round((delta[0] * n[0] + delta[1] * n[1]) * 100) / 100
        delta = [n[0] * along, n[1] * along]
      }
      preview(() => moveWall(d.start, d.id, delta, d.start))
      return
    }
    if (d?.type === 'opening') {
      const w = d.wall
      const c = closestOnSegment(world, w.a, w.b)
      const offset = Math.round(c.t * wallLength(w) * 100) / 100
      preview(p => updateOpening(p, d.id, { offset }))
      return
    }
    if (d?.type === 'room') {
      preview(p => ({ ...p, rooms: p.rooms.map(r => (r.id === d.id ? { ...r, at: [world[0] + d.offset[0], world[1] + d.offset[1]] } : r)) }))
      return
    }
    if (d?.type === 'areaVertex') {
      const area = plan.areas.find(a => a.id === d.id)
      const others = area ? area.pts.filter((_, i) => i !== d.index) : []
      const s = snap(world, { walls, points: others, tol, free })
      setCursor(s)
      preview(p => ({
        ...p,
        areas: p.areas.map(a => (a.id === d.id ? { ...a, pts: a.pts.map((q, i) => (i === d.index ? s.p : q)) } : a)),
      }))
      return
    }
    if (d?.type === 'roofVertex') {
      const r = plan.roofs.find(x => x.id === d.id)
      const others = r ? r.pts.filter((_, i) => i !== d.index) : []
      const s = snap(world, { walls, points: others, tol, free })
      setCursor(s)
      preview(p => ({
        ...p,
        roofs: p.roofs.map(x => (x.id === d.id ? { ...x, pts: x.pts.map((q, i) => (i === d.index ? s.p : q)) } : x)),
      }))
      return
    }
    if (d?.type === 'stair') {
      const at: Vec2 = [world[0] + d.offset[0], world[1] + d.offset[1]]
      const snapped: Vec2 = free ? at : [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100]
      preview(p => updateStair(p, d.id, { at: snapped }))
      return
    }
    if (d?.type === 'furniture') {
      const fit = fitFurniture(d.item, [world[0] + d.offset[0], world[1] + d.offset[1]], walls, { tol: furnTol, free })
      setCursor(fit.touch ? { p: fit.touch, kind: 'wall', guides: [] } : null)
      preview(p => updateFurniture(p, d.item.id, { at: fit.at, rotation: fit.rotation }))
      return
    }
    if (d?.type === 'furnitureTurn') {
      const f = plan.furniture.find(x => x.id === d.id)
      if (!f || Math.hypot(world[0] - f.at[0], world[1] - f.at[1]) * v.k < 8) return
      // The handle sits in front of the piece, so point its front at the pointer.
      const rotation = snapRotation((Math.atan2(world[0] - f.at[0], -(world[1] - f.at[1])) * 180) / Math.PI, free)
      setCursor({ p: world, kind: 'free', guides: [] })
      preview(p => updateFurniture(p, d.id, { rotation }))
      return
    }
    if (d?.type === 'move') {
      const pl = d.startPlacement
      const dx = world[0] - d.startWorld[0]
      const dy = world[1] - d.startWorld[1]
      // Dragging moves the site under the house, so the house moves the other way on the site.
      const t = (pl.rotation * Math.PI) / 180
      const de = dx * Math.cos(t) - dy * Math.sin(t)
      const dn = dx * Math.sin(t) + dy * Math.cos(t)
      preview(p => ({ ...p, placement: { ...pl, e: Math.round((pl.e - de) * 100) / 100, n: Math.round((pl.n - dn) * 100) / 100 } }))
      // keep the cursor anchored on the same point of the plan
      return
    }

    // Hover feedback for drawing tools
    if (tool === 'wall' || tool === 'retaining') {
      const anchor = chain.at(-1) ?? null
      setCursor(snap(world, { walls: snapWalls, anchor, points: chain.slice(0, 1), tol, free }))
    } else if (tool === 'area' || tool === 'roof') {
      setCursor(snap(world, { walls: snapWalls, anchor: areaPts.at(-1) ?? null, points: areaPts, tol, free }))
    } else if (tool === 'stair') {
      // once the start is down, 'free' vs 'angle' records whether Shift is held
      setCursor(stairStart ? { p: world, kind: free ? 'free' : 'angle', guides: [] } : snap(world, { walls: snapWalls, tol, free }))
    } else if (isOpeningTool(tool)) {
      const h = nearestWall(world)
      setHoverOpening(h ? { ...h, key: draftKey } : null)
      setCursor(null)
    } else if (tool === 'furniture') {
      // 'free' records that Shift is held
      setCursor({ p: world, kind: free ? 'free' : 'grid', guides: [] })
    } else {
      setCursor({ p: world, kind: 'free', guides: [] })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (touch && e.pointerType === 'touch') {
      fingers.current.delete(e.pointerId)
      if (pinch.current || afterPinch.current) {
        // The end of a pinch is never a tap; wait for the last finger to lift.
        if (fingers.current.size < 2) pinch.current = null
        if (fingers.current.size === 0) {
          afterPinch.current = false
          settle()
        }
        drag.current = null
        downAt.current = null
        return
      }
    }
    if (viewOnly) {
      // View: a tap shows what's there and its numbers; a second tap zooms in.
      drag.current = null
      const s = local(e)
      const moved = downAt.current ? Math.hypot(s[0] - downAt.current.x, s[1] - downAt.current.y) : Infinity
      downAt.current = null
      if (moved > TAP_SLOP) settle()
      if (moved <= TAP_SLOP && comments.click(W(s[0], s[1]))) return
      if (moved > TAP_SLOP || doubleTapped(e, s)) return
      const hit = pickAt(W(s[0], s[1]), s[0], s[1], true)
      if (hit?.type === 'wall' && hit.stack.length > 1) {
        // Walls on one another: a tap on the selected one steps to the next.
        const pick = isSel('wall', hit.item.id) ? (nextInStack(hit.stack, hit.item.id) ?? hit.item) : hit.item
        select({ type: 'wall', id: pick.id })
        noteStack(hit.stack, pick.id)
        return
      }
      if (!hit && pickOtherLevelSite(W(s[0], s[1]))) return
      select(hit ? { type: hit.type, id: hit.item.id } : null)
      return
    }
    // Edit, with a finger and Select: a double tap on empty ground zooms in too.
    if (touch && e.pointerType === 'touch' && tool === 'select' && drag.current?.type === 'pan' && downAt.current) {
      const s = local(e)
      if (Math.hypot(s[0] - downAt.current.x, s[1] - downAt.current.y) <= TAP_SLOP && doubleTapped(e, s)) {
        drag.current = null
        downAt.current = null
        return
      }
    }
    const d = drag.current
    drag.current = null
    setDragKind(null)
    setBox(null)
    const edge = streetPress.current
    streetPress.current = null
    if (edge !== null && d?.type === 'pan') {
      const [sx, sy] = local(e)
      if (Math.hypot(sx - d.sx, sy - d.sy) <= (e.pointerType === 'touch' ? TAP_SLOP : 4)) {
        downAt.current = null
        chooseStreetEdge(edge)
        return
      }
    }
    if (d?.type === 'brush') {
      downAt.current = null
      brush.up()
      return
    }
    if (d?.type === 'box') {
      downAt.current = null
      const [sx, sy] = local(e)
      if (Math.hypot(sx - d.fromPx[0], sy - d.fromPx[1]) <= 4) {
        // No box was drawn: it's a click on empty ground.
        if (!d.add) select(null)
        return
      }
      const x0 = Math.min(sx, d.fromPx[0])
      const x1 = Math.max(sx, d.fromPx[0])
      const y0 = Math.min(sy, d.fromPx[1])
      const y1 = Math.max(sy, d.fromPx[1])
      // The box is on the screen, so it stays square to the picture when the plan is turned.
      const found = itemsWhere(plan, level, p => {
        const [px, py] = S(p)
        return px >= x0 && px <= x1 && py >= y0 && py <= y1
      })
      const st = usePlan.getState()
      const have = d.add ? selectedList(st) : []
      st.selectMany([...have, ...found.filter(f => !have.some(h => h.id === f.id))])
      return
    }
    if (d && d.type !== 'pan') endGesture()
    if (d?.type === 'group') {
      const [gx, gy] = local(e)
      if (downAt.current && Math.hypot(gx - downAt.current.x, gy - downAt.current.y) <= 4) select(d.solo)
    }
    if (d?.type === 'joint' || d?.type === 'areaVertex' || d?.type === 'roofVertex' || d?.type === 'furniture' || d?.type === 'furnitureTurn') setCursor(null)
    const rect = svgRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const moved = downAt.current ? Math.hypot(sx - downAt.current.x, sy - downAt.current.y) : 0
    downAt.current = null
    if (d?.type === 'pan' && moved > 4) settle()
    if (d?.type === 'wall' && d.cycle && e.button === 0) {
      // A click on a selected wall with others under it: the next one in the stack.
      const next = nextInStack(d.cycle, d.id)
      if (next) {
        select({ type: 'wall', id: next.id })
        noteStack(d.cycle, next.id)
      }
      return
    }
    if (e.button !== 0 || moved > 4 || (d && d.type !== 'pan')) return

    const world = W(sx, sy)
    if (flow.click(world)) return
    if (sections.click(world, e.shiftKey)) return
    if (brush.click(world)) return
    if (site.active) {
      site.click(world, e.shiftKey)
      return
    }
    site.deselect()
    if (mn.click(world, e.shiftKey)) return
    if (tool === 'wall') {
      const s = snap(world, { walls: snapWalls, anchor: chain.at(-1) ?? null, points: chain.slice(0, 1), tol, free: e.shiftKey })
      placeWallPoint(s.p)
    } else if (tool === 'retaining') {
      const s = snap(world, { walls: snapWalls, anchor: chain.at(-1) ?? null, points: chain.slice(0, 1), tol, free: e.shiftKey })
      placeRetainingPoint(s.p)
    } else if (tool === 'area') {
      const s = snap(world, { walls: snapWalls, anchor: areaPts.at(-1) ?? null, points: areaPts, tol, free: e.shiftKey })
      if (areaPts.length >= 3 && near(s.p, areaPts[0])) closeArea(areaPts)
      else setAreaPts([...areaPts, s.p])
    } else if (tool === 'roof' && roofMode === 'building') {
      // Roof this building: a click inside the walls roofs them, and nothing else.
      const existing = roofAt(world)
      if (existing) {
        select({ type: 'roof', id: existing.id })
        notify('This part already has a roof, so it is selected. Change it in its settings.')
        return
      }
      const outline = outlineAround(walls, world)
      if (!outline) {
        notify('Click inside a building’s walls to roof it. To draw a roof of any shape, choose Draw roof outline.')
        return
      }
      closeRoof(outline)
      notify(null)
    } else if (tool === 'roof') {
      // Draw roof outline: every click is a corner.
      const s = snap(world, { walls: snapWalls, anchor: areaPts.at(-1) ?? null, points: areaPts, tol, free: e.shiftKey })
      if (areaPts.length >= 3 && near(s.p, areaPts[0])) closeRoof(areaPts)
      else setAreaPts([...areaPts, s.p])
    } else if (tool === 'stair') {
      const s = snap(world, { walls: snapWalls, tol, free: e.shiftKey })
      if (!stairStart) {
        updateDraft(() => ({ stairStart: s.p }))
        return
      }
      const angle = stairAngle(stairStart, world, e.shiftKey)
      if (angle === null) return
      const st = newStair(plan, level, stairStart, angle, stairDefaults)
      commit(p => addStair(p, st))
      select({ type: 'stair', id: st.id })
      updateDraft(() => ({ stairStart: null }))
      notify(null)
    } else if (isOpeningTool(tool)) {
      const h = nearestWall(world)
      if (!h) {
        notify('Click on a wall to place it.')
        return
      }
      commit(p => addOpening(p, h.wall, tool, h.offset, openingDefaults[tool]))
      const created = usePlan.getState().plan!.openings.at(-1)
      if (created && created.wall === h.wall.id) select({ type: 'opening', id: created.id })
      notify(null)
    } else if (tool === 'furniture') {
      const f = newFurniture(furnitureDefaults.kind, level, world, furnitureDefaults.rotation)
      if (!f) return
      const fit = fitFurniture(f, world, walls, { tol: furnTol, free: e.shiftKey })
      const placed = { ...f, at: fit.at, rotation: fit.rotation }
      commit(p => addFurniture(p, placed))
      select({ type: 'furniture', id: placed.id })
      notify(null)
    } else if (tool === 'room') {
      const probe = { id: 'probe', level, name: '', at: world }
      const shape = roomShape(probe, faces)
      if (!shape) {
        notify("That spot isn't enclosed by walls yet. Close the walls around it first, or use Area for outdoor spaces.")
        return
      }
      const existing = plan.rooms.find(r => r.level === level && pointInPolygon(r.at[0], r.at[1], shape.centre))
      if (existing) {
        select({ type: 'room', id: existing.id })
        return
      }
      const n = plan.rooms.filter(r => r.level === level).length + 1
      commit(p => addRoom(p, level, world, `Room ${n}`))
      const created = usePlan.getState().plan!.rooms.at(-1)
      if (created) select({ type: 'room', id: created.id })
      notify(null)
      // A new room asks its level's floor type once, or offers a retaining wall where it cuts or fills.
      if (created) roomMade(created.id)
    }
  }

  const onDoubleClick = () => {
    if (site.active) {
      site.dblclick()
      return
    }
    if (tool === 'wall' || tool === 'retaining') finishChain()
    if (tool === 'area') closeArea(areaPts)
    if (tool === 'roof') closeRoof(areaPts)
  }

  // Wheel zoom about the cursor (non-passive so the page doesn't scroll), at most one 12% step
  // an event however far the wheel says it turned; remembered once the wheel stops.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = wheelZoom(e.deltaY, e.deltaMode, el.clientHeight)
      if (factor === 1) return
      setView(prev => {
        const cur = prev && prev.token === vRef.current.token ? prev : vRef.current
        const rect = el.getBoundingClientRect()
        // The point under the cursor stays still.
        return zoomAbout(cur, rhoRef.current, { w: rect.width, h: rect.height }, [e.clientX - rect.left, e.clientY - rect.top], factor)
      })
      clearTimeout(timer)
      timer = setTimeout(settle, WHEEL_SETTLE_MS)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(timer)
    }
  }, [])

  // Keyboard: shortcuts, typed lengths, undo/redo, delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      // While Costs is open, Undo and Redo work on costs.
      if (costsUndoKey(e)) {
        e.preventDefault()
        return
      }
      if (site.key(e)) {
        e.preventDefault()
        return
      }
      if (flow.key(e)) {
        e.preventDefault()
        return
      }
      if (sections.key(e)) {
        e.preventDefault()
        return
      }
      if (brush.key(e)) {
        e.preventDefault()
        return
      }
      if (mn.key(e)) {
        e.preventDefault()
        return
      }
      const st = usePlan.getState()
      const mod = e.ctrlKey || e.metaKey
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !mod && !e.altKey && st.plan) {
        e.preventDefault()
        const next = stepLevel(st.plan, st.activeLevel, e.key === 'PageUp' ? 1 : -1)
        if (next) st.setActiveLevel(next)
        return
      }
      // The history the top bar's Undo works on (src/shell/undoTarget.ts): a tree marked for removal from Checks is the site's.
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) undoTarget('redo').redo()
        else undoTarget('undo').undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        undoTarget('redo').redo()
        return
      }
      if (mod) {
        // Select all, copy, paste and duplicate; any other Ctrl/⌘ key goes on to the browser or the app (Ctrl+S saves).
        const k = e.key.toLowerCase()
        if (e.altKey || viewOnly) return
        const handled = k === 'a' ? selectAllOnLevel() : k === 'c' ? copySelected() : k === 'v' ? pasteCopied() : k === 'd' ? duplicateSelected() : false
        if (handled) e.preventDefault()
        return
      }
      // + and − zoom, as the buttons do (in View on a phone too: they change nothing).
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomPlan(1)
        return
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomPlan(-1)
        return
      }
      // View on a phone changes nothing; Esc still clears the selection.
      if (viewOnly && e.key !== 'Escape') return
      // A typed length sets the next wall or outline side, in the direction of the pointer.
      const drawnFrom = tool === 'wall' || tool === 'retaining' ? chain.at(-1) : tool === 'area' || tool === 'roof' ? areaPts.at(-1) : undefined
      if (drawnFrom) {
        if (/^[0-9.]$/.test(e.key)) {
          setTyped(s => (s + e.key).slice(0, 7))
          return
        }
        if (e.key === 'Backspace' && typed) {
          setTyped(s => s.slice(0, -1))
          return
        }
        if (e.key === 'Enter' && typed) {
          const end = typedEnd(drawnFrom, cursor?.p ?? drawnFrom)
          if (!end) return
          if (tool === 'wall') placeWallPoint(end)
          else if (tool === 'retaining') placeRetainingPoint(end)
          else setAreaPts([...areaPts, end])
          return
        }
      }
      if (e.key === 'Escape') {
        if (chain.length) finishChain()
        else if (areaPts.length) setAreaPts([])
        else if (stairStart) updateDraft(() => ({ stairStart: null }))
        else st.select(null)
        return
      }
      if (e.key === 'Enter' && (tool === 'area' || tool === 'roof') && areaPts.length >= 3) {
        if (tool === 'area') closeArea(areaPts)
        else closeRoof(areaPts)
        return
      }
      if (e.key.toLowerCase() === 'q') {
        // Turn the piece about to be placed, or the selected one, a quarter turn.
        const turn = e.shiftKey ? -90 : 90
        const sel = st.selection
        const f = sel?.type === 'furniture' ? st.plan?.furniture.find(x => x.id === sel.id) : undefined
        if (ghost) st.setFurnitureDefaults({ ...st.furnitureDefaults, rotation: normDeg(st.furnitureDefaults.rotation + turn) })
        else if (f) st.commit(p => updateFurniture(p, f.id, { rotation: normDeg(f.rotation + turn) }))
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection) {
        deleteSelected()
        return
      }
      // Arrows nudge what is selected 10 mm (Shift: 100 mm), the way the screen points. Shift here
      // is "bigger", not "snapping off", since no drag is under way.
      const arrow = ARROW_KEYS[e.key]
      if (arrow && st.selection && !chain.length && !areaPts.length) {
        const o = W(0, 0)
        const t = W(arrow[0] * 100, arrow[1] * 100)
        const len = Math.hypot(t[0] - o[0], t[1] - o[1]) || 1
        const clean = (x: number) => (Math.abs(x) < 1e-9 ? 0 : x)
        e.preventDefault()
        nudgeSelected([clean((t[0] - o[0]) / len), clean((t[1] - o[1]) / len)], e.shiftKey)
        return
      }
      // 0 fits the house, Shift+0 the block (F is the roof tool).
      if (e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault()
        st.requestFit(e.shiftKey ? 'block' : 'house')
        return
      }
      const map: Record<string, Tool> = {
        v: 'select',
        w: 'wall',
        t: 'retaining',
        d: 'door',
        n: 'window',
        o: 'opening',
        g: 'garage',
        r: 'room',
        a: 'area',
        f: 'roof',
        s: 'stair',
        u: 'furniture',
        m: 'move',
        l: 'measure',
        e: 'note',
      }
      const next = map[e.key.toLowerCase()]
      if (next) st.setTool(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- rendering ----
  const k = v.k
  const selWall = !group && selection?.type === 'wall' ? walls.find(w => w.id === selection.id) : undefined
  const roomShapes = plan.rooms.filter(r => r.level === level).map(r => ({ room: r, shape: roomShape(r, faces) }))

  const dimLabel = (a: Vec2, b: Vec2, offset: number, text: string, key: string, cls = 'dim', minPx = 36) => {
    const d: Vec2 = [b[0] - a[0], b[1] - a[1]]
    const len = Math.hypot(d[0], d[1])
    if (len * k < minPx) return null
    const n: Vec2 = [-d[1] / len, d[0] / len]
    const m: Vec2 = [(a[0] + b[0]) / 2 + n[0] * offset, (a[1] + b[1]) / 2 + n[1] * offset]
    const [x, y] = S(m)
    const sa = S(a)
    const sb = S(b)
    let ang = (Math.atan2(sb[1] - sa[1], sb[0] - sa[0]) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180
    return (
      <text key={key} className={cls} x={x} y={y} transform={`rotate(${ang} ${x} ${y})`} textAnchor="middle" dominantBaseline="middle">
        {text}
      </text>
    )
  }

  /** A length written along a line, on a halo so it reads over anything. */
  const liveDim = (a: Vec2, b: Vec2, offset: number, key: string) => dimLabel(a, b, offset, fmtMm(Math.hypot(b[0] - a[0], b[1] - a[1])), key, 'live-dim', 26)

  /** Side lengths of a closed outline, written just outside it. */
  const outlineDims = (pts: Vec2[], key: string) => {
    const out = (signedArea(pts) >= 0 ? -1 : 1) * (11 / k)
    return pts.map((p, i) => liveDim(p, pts[(i + 1) % pts.length], out, `${key}-${i}`))
  }

  /** A dark label beside the pointer, one line per entry. */
  const tag = (at: Vec2, lines: string[]) => {
    const [x, y] = S(at)
    const w = Math.max(...lines.map(l => l.length)) * 6.3 + 12
    const h = 6 + lines.length * 14
    // Beside the pointer, flipped to the other side near the edge of the view.
    const tx = x + 14 + w > size.w ? x - 14 - w + 4 : x + 14
    const ty = y - 14 - 14 < 0 ? y + 28 : y - 14
    return (
      <g className="tag" transform={`translate(${tx} ${ty})`}>
        <rect x={-4} y={-14} width={w} height={h} rx={4} />
        {lines.map((l, i) => (
          <text key={i} x={2} y={i * 14}>
            {l}
          </text>
        ))}
      </g>
    )
  }

  /** Length and bearing of the side being drawn, the typed length, and the running total. */
  const drawingTag = (a: Vec2, b: Vec2, before: Vec2[]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const angle = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360
    const lines = [typed ? `${typed}▌ mm` : `${fmtMm(len)} mm  ${angle.toFixed(0)}°`]
    if (before.length > 1) lines.push(`Total ${fmtMm(polylineLength(before) + len)} mm`)
    return tag(b, lines)
  }

  /** The opening that a click would add, with how far it sits from each end of the wall. */
  const openingHover = (w: Wall, at: number, kind: Opening['kind']) => {
    const { width } = openingDefaults[kind]
    const offset = Math.min(Math.max(at, width / 2), wallLength(w) - width / 2)
    const start = pointOnWall(w, offset - width / 2)
    const end = pointOnWall(w, offset + width / 2)
    return (
      <g>
        {openingSymbol({ id: 'hover', wall: w.id, kind, offset, ...openingDefaults[kind], flipHinge: false, flipSwing: false }, w, true)}
        {liveDim(w.a, start, 0, 'hover-from-a')}
        {liveDim(end, w.b, 0, 'hover-to-b')}
      </g>
    )
  }

  const openingSymbol = (o: Opening, w: Wall, ghost = false) => {
    const d = wallDir(w)
    const n: Vec2 = [-d[1], d[0]]
    const c = pointOnWall(w, o.offset)
    const hw = o.width / 2
    const ht = w.thickness / 2 + 0.005
    const p0: Vec2 = [c[0] - d[0] * hw, c[1] - d[1] * hw]
    const p1: Vec2 = [c[0] + d[0] * hw, c[1] + d[1] * hw]
    const at = (p: Vec2, s: number): Vec2 => [p[0] + n[0] * s, p[1] + n[1] * s]
    const gap = [at(p0, -ht), at(p1, -ht), at(p1, ht), at(p0, ht)]
    const selected = isSel('opening', o.id)
    const cls = `opening${selected ? ' selected' : ''}${ghost ? ' ghost' : ''}`
    const parts = [<path key="gap" className="opening-gap" d={path(gap)} />]
    if (o.kind === 'window') {
      parts.push(
        <path key="glass" className={cls} d={`${path([at(p0, -ht / 3), at(p1, -ht / 3)], false)}${path([at(p0, ht / 3), at(p1, ht / 3)], false)}`} />,
        <path key="jambs" className={cls} d={`${path([at(p0, -ht), at(p0, ht)], false)}${path([at(p1, -ht), at(p1, ht)], false)}`} />,
      )
    } else if (o.kind === 'door') {
      const hinge = o.flipHinge ? p1 : p0
      const other = o.flipHinge ? p0 : p1
      const side = o.flipSwing ? -1 : 1
      const hingeFace = at(hinge, side * ht)
      const leafEnd: Vec2 = [hingeFace[0] + n[0] * side * o.width, hingeFace[1] + n[1] * side * o.width]
      const closed = at(other, side * ht)
      const arc: Vec2[] = []
      const a0 = Math.atan2(leafEnd[1] - hingeFace[1], leafEnd[0] - hingeFace[0])
      let a1 = Math.atan2(closed[1] - hingeFace[1], closed[0] - hingeFace[0])
      while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI
      while (a0 - a1 > Math.PI) a1 += 2 * Math.PI
      for (let i = 0; i <= 16; i++) {
        const t = a0 + ((a1 - a0) * i) / 16
        arc.push([hingeFace[0] + Math.cos(t) * o.width, hingeFace[1] + Math.sin(t) * o.width])
      }
      parts.push(
        <path key="leaf" className={cls} d={path([hingeFace, leafEnd], false)} />,
        <path key="arc" className={`${cls} swing`} d={path(arc, false)} />,
      )
    } else if (o.kind === 'garage') {
      const g = garageDoorSymbol(p0, p1, n, ht)
      parts.push(
        <path key="jambs" className={cls} d={g.jambs.map(l => path(l, false)).join('')} />,
        <path key="panel" className={`${cls} garage-panel`} d={path(g.panel, false)} />,
      )
    } else {
      parts.push(<path key="head" className={`${cls} head`} d={`${path([at(p0, -ht), at(p1, -ht)], false)}${path([at(p0, ht), at(p1, ht)], false)}`} />)
    }
    return <g key={o.id}>{parts}</g>
  }

  /** A piece of furniture as an architectural symbol: white parts with thin outlines, and its note (REF, DW). */
  const furnitureShape = (f: Furniture, cls = '') => {
    const { parts, code } = furnitureSymbol(f)
    const [x, y] = S(f.at)
    const o = S(furnitureToPlan(f, [1, 0]))
    let ang = (Math.atan2(o[1] - y, o[0] - x) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180
    return (
      <g key={f.id} className={`furniture${cls}`}>
        <path className="furniture-fill" d={parts.filter(p => p.closed).map(p => path(p.pts)).join('')} />
        <path className="furniture-lines" d={parts.filter(p => !p.closed).map(p => path(p.pts, false)).join('')} />
        {code && Math.min(f.width, f.depth) * k > 24 && (
          <text className="furniture-code" x={x} y={y} transform={`rotate(${ang} ${x} ${y})`} textAnchor="middle" dominantBaseline="middle">
            {code}
          </text>
        )}
      </g>
    )
  }

  // How far the piece being placed, or the selected piece, is from the walls around it.
  const measured = ghost?.item ?? selFurniture
  const furnitureGaps = measured ? wallClearances(measured, wallOutlines).filter(c => c.dist > 0.005) : []

  const previewWall = (() => {
    if ((tool !== 'wall' && tool !== 'retaining') || !chain.length || !cursor) return null
    const a = chain[chain.length - 1]
    const b = typedEnd(a, cursor.p)
    if (!b) return null
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const d: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const half = (tool === 'retaining' ? retainingThickness : wallStyle.thickness) / 2
    const n: Vec2 = [-d[1] * half, d[0] * half]
    const poly: Vec2[] = [
      [a[0] - n[0], a[1] - n[1]],
      [b[0] - n[0], b[1] - n[1]],
      [b[0] + n[0], b[1] + n[1]],
      [a[0] + n[0], a[1] + n[1]],
    ]
    return (
      <g>
        <path className={`wall preview${tool === 'retaining' ? ' retaining' : ''}`} d={path(poly)} />
        {drawingTag(a, b, chain)}
      </g>
    )
  })()

  // An area or roof outline being drawn: its sides so far, and the side to the pointer.
  const outlinePreview = (() => {
    if ((tool !== 'area' && tool !== 'roof') || !areaPts.length) return null
    const a = areaPts[areaPts.length - 1]
    const b = cursor ? typedEnd(a, cursor.p) : null
    return (
      <g>
        <path className={tool === 'roof' ? 'roof-draft' : 'area drawing'} d={path(b ? [...areaPts, b] : areaPts, false)} />
        {areaPts.slice(1).map((p, i) => liveDim(areaPts[i], p, 0, `draft-${i}`))}
        {b && drawingTag(a, b, areaPts)}
      </g>
    )
  })()

  /**
   * A stair on the plan. On its own level it reads UP from its bottom step; on the floor it
   * arrives at (`arriving`) it's the hole it comes up into, reading DN from its top; `ghost` is
   * the level below's stair, faint, for lining up.
   */
  const stairSymbol = (st: Stair, ghost = false, isPreview = false, arriving = false) => {
    const L = stairLayout(st)
    const sel = !arriving && isSel('stair', st.id)
    const cls = `stair${sel ? ' selected' : ''}${ghost ? ' ghost' : ''}${isPreview ? ' preview' : ''}${arriving ? ' arriving' : ''}`
    // The arrow points the way you walk: up to the top, or down from it to the bottom step.
    const walk = arriving ? [...L.walk].reverse() : L.walk
    const end = walk[walk.length - 1]
    const before = walk[walk.length - 2]
    const ux = (end[0] - before[0]) / (Math.hypot(end[0] - before[0], end[1] - before[1]) || 1)
    const uy = (end[1] - before[1]) / (Math.hypot(end[0] - before[0], end[1] - before[1]) || 1)
    const h = Math.min(0.3, st.width * 0.3)
    const a1: Vec2 = [end[0] - ux * h - uy * h * 0.6, end[1] - uy * h + ux * h * 0.6]
    const a2: Vec2 = [end[0] - ux * h + uy * h * 0.6, end[1] - uy * h - ux * h * 0.6]
    // The label sits just off where you step on: the bottom step going up, the top going down.
    const start = walk[0]
    const sx = walk[1][0] - start[0]
    const sy = walk[1][1] - start[1]
    const sl = Math.hypot(sx, sy) || 1
    const [lx, ly] = S([start[0] - (sx / sl) * 0.22, start[1] - (sy / sl) * 0.22])
    // Shown whenever the stair is wide enough on screen to read it.
    const labelled = !ghost && st.width * k > 24
    const nowhere = !ghost && !arriving && !isPreview && stairMeetsNoFloor(plan, st)
    const [fx, fy] = S(L.walk[L.walk.length - 1])
    return (
      <g key={`${st.id}${ghost ? '-ghost' : ''}${arriving ? '-arriving' : ''}`} className={cls}>
        <path className="stair-body" d={path(L.outline)} />
        {!ghost && <path className="stair-treads" d={L.treadLines.map(l => path(l, false)).join('')} />}
        {!ghost && <path className="stair-walk" d={path(walk, false) + path([a1, end, a2], false)} />}
        {labelled && (
          <text className="stair-label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
            {arriving ? 'DN' : 'UP'}
          </text>
        )}
        {nowhere && (
          <text className="stair-flag" x={fx} y={fy - 10} textAnchor="middle">
            Meets no floor
          </text>
        )}
      </g>
    )
  }

  const stairPreview = (() => {
    if (tool !== 'stair' || !stairStart || !cursor) return null
    const angle = stairAngle(stairStart, cursor.p, cursor.kind === 'free')
    if (angle === null) return null
    const st: Stair = { ...newStair(plan, level, stairStart, angle, stairDefaults), id: 'preview' }
    // How far the stair runs, and how wide it is overall, measured square to its direction.
    const L = stairLayout(st)
    const t = (angle * Math.PI) / 180
    const along = L.outline.map(p => (p[0] - stairStart[0]) * Math.cos(t) + (p[1] - stairStart[1]) * Math.sin(t))
    const across = L.outline.map(p => -(p[0] - stairStart[0]) * Math.sin(t) + (p[1] - stairStart[1]) * Math.cos(t))
    const span = (v: number[]) => Math.max(...v) - Math.min(...v)
    return (
      <g>
        {stairSymbol(st, false, true)}
        {tag(cursor.p, [`${fmtMm(span(along))} × ${fmtMm(span(across))} mm  ${angle.toFixed(0)}°`, `${L.risers} risers`])}
      </g>
    )
  })()

  const northDeg = plan.placement.rotation - (rho * 180) / Math.PI

  // The tint keeps to the house and what's being drawn, fading out NEAR_HOUSE metres past them.
  const drafts: Vec2[][] = tool === 'wall' ? [cursor && chain.length ? [...chain, cursor.p] : chain] : tool === 'area' || tool === 'roof' ? [areaPts] : []
  const nearHouse = ground
    ? nearShapes(plan, level, id => (id === level ? buildingOutline(faces).outlines : buildingOutline(planarFaces(plan.walls.filter(w => w.level === id))).outlines), drafts)
    : null

  // How far the floor is above the ground at the corners being drawn or dragged: walls, and slabs and decks.
  const corners = ((): { pts: Vec2[]; closed: boolean; atPointer: boolean; top: number } | null => {
    if (!ground) return null
    const built = (kind: string) => kind === 'slab' || kind === 'deck'
    const drawn = tool === 'wall' ? chain : tool === 'area' && built(areaDefault) ? areaPts : []
    if (drawn.length) {
      const end = cursor && typedEnd(drawn[drawn.length - 1], cursor.p)
      return { pts: end ? [...drawn, end] : drawn, closed: false, atPointer: !!end, top: 0 }
    }
    if ((dragKind === 'wall' || dragKind === 'joint') && selWall) return { pts: [selWall.a, selWall.b], closed: false, atPointer: false, top: 0 }
    const a = dragKind === 'areaVertex' && !group && selection?.type === 'area' ? plan.areas.find(x => x.id === selection.id) : undefined
    return a && built(areaKind(a)) ? { pts: a.pts, closed: true, atPointer: false, top: a.top ?? 0 } : null
  })()
  const probe = cursor?.p ?? pointer
  const probeGround = probe ? groundAtPlan(probe, plan.placement, survey, terrain.grid) : null
  const fitButton = (
    <button
      className="secondary"
      onClick={() => {
        setAround(null)
        setView(fitView())
        settle()
      }}
    >
      Fit to view
    </button>
  )

  return (
    <div className={`plan-editor${viewOnly ? ' view-only' : ''}`}>
      <svg
        ref={svgRef}
        className={`plan-svg tool-${tool}${site.active ? ' site-tool' : ''}${flow.active || sections.active || (brush.active && !brush.painting) ? ' flow-picking' : ''}${brush.painting ? ' grade-brush' : ''}${askingStreet && streetHover !== null ? ' street-hover' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={
          touch
            ? e => {
                // The system took the touch (a call, a swipe home): drop it without acting on it.
                fingers.current.delete(e.pointerId)
                if (fingers.current.size < 2) pinch.current = null
                if (fingers.current.size === 0) afterPinch.current = false
                cancelDrag()
                settle()
              }
            : undefined
        }
        onPointerLeave={() => {
          flow.leave()
          if (!drag.current) setCursor(null)
          setHoverOpening(null)
          setPointer(null)
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={e => e.preventDefault()}
      >
        <defs>
          <pattern id="piers-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#f4efe4" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#ddd2bd" strokeWidth="2" />
          </pattern>
          <pattern id="retaining-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#cbbfa8" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#8a7a62" strokeWidth="1.6" />
          </pattern>
        </defs>
        {site.backdrop}
        {/* Site */}
        <path className="site-boundary" d={path(underlay.boundary)} />
        {askingStreet &&
          frame &&
          !viewOnly &&
          [streetHover, streetPicked ?? streetLow].map((i, k) => {
            if (i === null || i === undefined || (k === 0 && i === (streetPicked ?? streetLow))) return null
            const a = S(underlay.boundary[i])
            const b = S(underlay.boundary[(i + 1) % underlay.boundary.length])
            return <line key={k} className={`street-edge${k === 1 ? ' picked' : ''}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
          })}
        {planContourLines ? (
          <FinishedContourLayer contours={planContourLines} S={S} viewKey={`${v.cx} ${v.cy} ${v.k} ${rho} ${size.w} ${size.h}`} />
        ) : (
          <>
            <path className="contour-minor" d={underlay.minor.map(s => path(s, false)).join('')} />
            <path className="contour-major" d={underlay.major.map(s => path(s, false)).join('')} />
            {underlay.labels.map((l, i) => {
              const [x, y] = S(l.p)
              return (
                <text key={i} className="contour-label" x={x} y={y}>
                  {l.text}
                </text>
              )
            })}
          </>
        )}

        {site.under}
        {brush.under}

        {/* The house's shadows on 21 June, when the key's switch is on (src/sun) */}
        <ShadowPlanLayer plan={plan} survey={survey} terrain={terrain} earth={earth ?? null} toScreen={p => S(fromSite(p, plan.placement, survey.origin))} />

        {/* Other levels, faint, for lining up and snapping to */}
        {ghostLevels.map(g => (
          <g key={g.id} className="level-ghost" opacity={g.opacity}>
            {g.polys.map((p, i) => (
              <path key={i} className="wall ghost" d={path(p)} />
            ))}
          </g>
        ))}
        {ghostStairs.map((g, i) => (
          <g key={i} opacity={g.opacity}>
            {g.stairs.map(st => stairSymbol(st, true))}
          </g>
        ))}

        {/* The site layer: retaining walls, driveways and lawns drawn on other levels */}
        <g className="site-layer">
          {siteLayer.areas.map(a => {
            const [x, y] = S(centroid(a.pts))
            return (
              <g key={a.id}>
                <path className={`area kind-${areaKind(a)} other-level`} d={path(a.pts)} />
                <text className="other-level-tag" x={x} y={y} textAnchor="middle">
                  {a.name} · on {siteLayer.names.get(a.level)}
                </text>
              </g>
            )
          })}
          {siteLayer.walls.map(w => {
            const p = siteLayer.polys.get(w.id)
            return p ? (
              <path key={w.id} className="wall retaining other-level" d={path(p)}>
                <title>Retaining wall on {siteLayer.names.get(w.level)}: click to change it there</title>
              </path>
            ) : null
          })}
        </g>

        {/* Outdoor areas */}
        {plan.areas
          .filter(a => a.level === level)
          .map(a => {
            const sel = isSel('area', a.id)
            const c = centroid(a.pts)
            const [x, y] = S(c)
            return (
              <g key={a.id}>
                <path className={`area kind-${areaKind(a)}${sel ? ' selected' : ''}`} d={path(a.pts)} />
                <text className="room-name" x={x} y={y - 7} textAnchor="middle">
                  {a.name}
                </text>
                <text className="room-area" x={x} y={y + 9} textAnchor="middle">
                  {Math.abs(signedArea(a.pts)).toFixed(2)} m²
                </text>
                {sel && !group && !viewOnly && tool === 'select' && a.pts.map((p, i) => <circle key={i} className="handle" cx={S(p)[0]} cy={S(p)[1]} r={5} />)}
              </g>
            )
          })}

        {/* Rooms */}
        {roomShapes.map(({ room, shape }) =>
          shape ? (
            <path key={room.id} className={`room-fill${onNaturalGround(plan, room) ? ' piers' : ''}`} d={path(shape.inner)} />
          ) : null,
        )}

        {/* Stairs coming up through this floor: the hole in it, over the rooms' fill */}
        <g className="arriving-stairs">{arrivingStairs.map(st => stairSymbol(st, false, false, true))}</g>

        {works && <WorksTint overlay={works} toScreen={p => S(fromSite(p, plan.placement, survey.origin))} />}
        {ground && !works && (
          <GroundOverlay
            near={
              nearHouse && {
                filled: nearHouse.filled.map(r => path(r)).join(''),
                lines: nearHouse.lines.map(l => path(l, false)).join(''),
                reach: NEAR_HOUSE * k,
              }
            }
            within={p => !nearHouse || isNear(fromSite(p, plan.placement, survey.origin), nearHouse, NEAR_HOUSE * 0.8)}
            overlay={ground}
            toScreen={p => S(fromSite(p, plan.placement, survey.origin))}
            size={size}
            subtle={!isLowest}
            avoid={p => {
              const q = fromSite(p, plan.placement, survey.origin)
              return [...faces.filter(f => f.area > 0), ...plan.areas.filter(a => a.level === level)].some(f => pointInPolygon(q[0], q[1], f.pts))
            }}
          />
        )}

        {/* Stairs */}
        {stairs.map(st => stairSymbol(st))}

        {/* Furniture */}
        {furniture.map(f => furnitureShape(f, isSel('furniture', f.id) ? ' selected' : ''))}
        {ghost && furnitureShape({ ...ghost.item, id: 'ghost' }, ' ghost')}

        {/* Walls */}
        {walls.map(w => {
          const p = polys.get(w.id)
          if (!p) return null
          const sel = isSel('wall', w.id)
          return <path key={w.id} className={`wall ${w.kind}${sel ? ' selected' : ''}`} d={path(p)} />
        })}

        {/* Openings */}
        {plan.openings.map(o => {
          const w = walls.find(x => x.id === o.wall)
          return w ? openingSymbol(o, w) : null
        })}
        {hoverOpening && isOpeningTool(tool) && openingHover(hoverOpening.wall, hoverOpening.offset, tool)}

        {/* Wall lengths */}
        {walls.map(w => {
          // External wall lengths go on the outside of the building, internal ones on their left.
          const off = w.thickness / 2 + 12 / k
          const d = wallDir(w)
          const mid = pointOnWall(w, wallLength(w) / 2)
          const probe: Vec2 = [mid[0] - d[1] * off, mid[1] + d[0] * off]
          const inside = faces.some(f => f.area > 0 && pointInPolygon(probe[0], probe[1], f.pts))
          return dimLabel(w.a, w.b, w.kind === 'external' && inside ? -off : off, fmtMm(wallLength(w)), `dim-${w.id}`)
        })}

        {/* Room labels */}
        {roomShapes.map(({ room, shape }) => {
          const [x, y] = S(room.at)
          const sel = isSel('room', room.id)
          return (
            <g key={`label-${room.id}`} className={`room-label${sel ? ' selected' : ''}`}>
              <text className="room-name" x={x} y={y - 7} textAnchor="middle">
                {room.name}
              </text>
              <text className={`room-area${shape ? '' : ' open'}`} x={x} y={y + 9} textAnchor="middle">
                {shape ? `${shape.area.toFixed(2)} m²` : 'not enclosed'}
              </text>
              {roomFloorNote(plan, room) && (
                <text className="room-area" x={x} y={y + 23} textAnchor="middle">
                  {roomFloorNote(plan, room)}
                </text>
              )}
            </g>
          )
        })}

        {/* Side lengths of outdoor areas, while drawing them or when one is selected */}
        {plan.areas
          .filter(a => a.level === level && (tool === 'area' || (!group && selection?.type === 'area' && selection.id === a.id)))
          .map(a => (
            <g key={`${a.id}-dims`}>{outlineDims(a.pts, `${a.id}-dim`)}</g>
          ))}

        {/* Roofs */}
        {roofs.map(r => {
          const g = roofGeometry(r)
          const sel = isSel('roof', r.id)
          return (
            <g key={r.id} className={`roof${sel ? ' selected' : ''}${g.error ? ' broken' : ''}`}>
              <path className="roof-outline" d={path(g.outline)} />
              <path className="roof-lines" d={g.lines.map(l => path(l, false)).join('')} />
              {sel && g.outline.length > 2 && outlineDims(g.outline, `${r.id}-dim`)}
            </g>
          )
        })}
        {roofs
          .filter(r => !viewOnly && tool === 'select' && !group && selection?.type === 'roof' && selection.id === r.id)
          .map(r => (
            <g key={`${r.id}-handles`}>
              {(r.type === 'gable' || r.type === 'skillion') &&
                roofMarkers(r).map((m, i) => {
                  const [x, y] = S(m)
                  const on = r.type === 'gable' ? !!r.gables[i] : r.lowEdge === i
                  const label = r.type === 'gable' ? (on ? 'G' : 'H') : on ? 'low' : ''
                  return (
                    <g key={i} className={`roof-marker${on ? ' on' : ''}`}>
                      <circle cx={x} cy={y} r={r.type === 'skillion' && on ? 13 : 9} />
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
                        {label}
                      </text>
                    </g>
                  )
                })}
              {r.pts.map((p, i) => (
                <circle key={i} className="handle" cx={S(p)[0]} cy={S(p)[1]} r={5} />
              ))}
            </g>
          ))}

        {/* Setbacks: the house's distance to each side of the block */}
        {setbacks.length > 0 && <SetbackLines dims={setbacks} toScreen={p => S(fromSite(p, plan.placement, survey.origin))} />}

        {/* Distances from furniture to the walls, and the handle that turns it */}
        {furnitureGaps.map(c => (
          <g key={`gap-${c.side}`} className="clearance">
            <path d={path([c.from, c.to], false)} />
            {dimLabel(c.from, c.to, 0, fmtMm(c.dist), `gap-label-${c.side}`, 'clearance-label', 18)}
          </g>
        ))}
        {selFurniture && !ghost && !viewOnly && (tool === 'select' || tool === 'furniture') && (
          <g className="turn-handle">
            <path d={path([furnitureToPlan(selFurniture, [0, -selFurniture.depth / 2]), turnHandle(selFurniture)], false)} />
            <circle cx={S(turnHandle(selFurniture))[0]} cy={S(turnHandle(selFurniture))[1]} r={6} />
          </g>
        )}
        {ghost && cursor && tag(cursor.p, [`${furnitureName(ghost.item)}  ${fmtMm(ghost.item.width)} × ${fmtMm(ghost.item.depth)}`])}
        {ghost?.fit.touch && <SnapMarker p={S(ghost.fit.touch)} kind="wall" />}
        {box && <rect className="marquee" x={Math.min(box.a[0], box.b[0])} y={Math.min(box.a[1], box.b[1])} width={Math.abs(box.a[0] - box.b[0])} height={Math.abs(box.a[1] - box.b[1])} />}
        {dragKind === 'furnitureTurn' && selFurniture && cursor && tag(cursor.p, [`${selFurniture.rotation.toFixed(0)}°`])}

        {/* Retaining walls: how much the selected or new one holds back, and a flag on tall ones */}
        <RetainingMarks
          plan={plan}
          walls={walls}
          origin={survey.origin}
          ground={earth?.result.grid ?? terrain.grid}
          show={selWall?.id ?? newRetaining}
          toScreen={S}
          k={k}
          tags={onRetainingTab}
          hover={wallHover}
          changed={wallChanged}
        />

        {/* Selected wall handles, which only Select drags */}
        {selWall &&
          !viewOnly &&
          tool === 'select' &&
          [selWall.a, selWall.b].map((p, i) => <circle key={i} className="handle" cx={S(p)[0]} cy={S(p)[1]} r={6} />)}

        {site.over}
        {flow.over}
        {sections.over}
        {brush.over}
        {mn.over}
        <CostsPlanLayer plan={plan} level={level} survey={survey} terrain={terrain} earth={earth ?? null} S={S} k={k} />
        <ChecksPlanLayer plan={plan} level={level} survey={survey} terrain={terrain} earth={earth ?? null} S={S} k={k} />
        <DrainageLayer plan={plan} survey={survey} terrain={terrain} S={S} k={k} />

        {/* Drawing in progress */}
        {chain.length > 1 && <path className="chain" d={path(chain, false)} />}
        {previewWall}
        {outlinePreview}
        {stairPreview}
        {corners && (
          <CornerOffsets
            pts={corners.pts}
            offsets={cornerOffsets(corners.pts, floorRL + corners.top, plan.placement, survey, terrain.grid)}
            closed={corners.closed}
            atPointer={corners.atPointer}
            toScreen={S}
          />
        )}
        {cursor?.guides.map((g, i) => <path key={i} className="guide" d={path(g, false)} />)}
        {cursor &&
          cursor.kind !== 'free' &&
          (tool === 'wall' ||
            tool === 'retaining' ||
            tool === 'area' ||
            tool === 'roof' ||
            (tool === 'stair' && !stairStart) ||
            dragKind === 'joint' ||
            dragKind === 'areaVertex' ||
            dragKind === 'roofVertex' ||
            dragKind === 'furniture') && (
          <SnapMarker p={S(cursor.p)} kind={cursor.kind} />
        )}
      </svg>
      {comments.pins}

      <div className="plan-compass" title="North">
        <div className="needle" style={{ ['--az' as string]: `${northDeg}deg` }}>
          <span>N</span>
        </div>
      </div>
      {/* On a phone, and anywhere nothing can be drawn (a shared view), the chip picks the floor to look at. */}
      {noFloor ? null : touch?.phone || viewOnly ? (
        <PhoneLevelChip plan={plan} level={level} rl={floorRL} />
      ) : (
        <LevelMenu rows={levelMenu} action={viewOnly ? undefined : flow.chipAction} />
      )}
      <div className="plan-actions">
        {frame ? (
          // The frame has its own Fit and zoom buttons (src/shell/CanvasChrome.tsx).
          fitButton
        ) : (
          <div className="zoom-row">
            <ZoomButtons />
            {fitButton}
          </div>
        )}
        <KeyChip>
          <GroundKey on={showGround} onChange={onShowGroundChange} lowest={isLowest} floor={!noFloor} works={onCutFillTab && !!earth && earth.result.cut + earth.result.fill > 0.01}>
            {contours?.any && <ContoursKey on={finishedOn} onChange={changeFinished} interval={contours.minor} />}
            {setbacksSwitch && <SetbacksKey on={setbacksSwitch.on} onChange={setbacksSwitch.onChange} />}
            {comments.key}
            <ShadowsKey />
          </GroundKey>
        </KeyChip>
      </div>
      <div className="view-actions">
        <OrientationControl value={up} onChange={onUpChange} />
      </div>
      <ScaleBar k={k} />
      {site.bar}
      {site.chips}
      {flow.html}
      {comments.html}
      {mn.html}
      {/* In the app's Design area, while things can be drawn: the next step, and the street question after an import. */}
      {frame && !viewOnly && !site.active && inDesign && !askingStreet && <PlanHints plan={plan} level={level} phone={!!touch?.phone} />}
      {frame && !viewOnly && <StreetAsk survey={survey} terrain={terrain} phone={!!touch?.phone} />}
      <div className="readout plan-status">
        {probeGround !== null && <GroundReadout ground={probeGround} floor={noFloor ? null : floorRL} lowest={isLowest} />}
        {site.notice || notice ? (
          <span className={`notice${site.notice && site.noticeOk ? ' ok' : ''}`}>{site.notice || notice}</span>
        ) : (
          <span className="muted">
            {viewOnly
              ? VIEW_HINT[touch?.phone ? 'phone' : 'desk']
              : (sections.hint ?? brush.hint ?? (site.active ? site.hint : guarded ? (AREA_HINTS[area!] ?? GUARDED_HINT) : tool === 'roof' ? ROOF_HINTS[roofMode] : HINTS[tool]))}
          </span>
        )}
      </div>
    </div>
  )
}

const polylineLength = (pts: Vec2[]) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)

const near = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3

function centroid(pts: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p[0]
    y += p[1]
  }
  return [x / pts.length, y / pts.length]
}

function SnapMarker({ p, kind }: { p: Vec2; kind: string }) {
  const [x, y] = p
  if (kind === 'end') return <rect className="snap" x={x - 5} y={y - 5} width={10} height={10} />
  if (kind === 'wall') return <path className="snap" d={`M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z`} />
  return <path className="snap cross" d={`M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}`} />
}

function ScaleBar({ k }: { k: number }) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50]
  const m = steps.find(s => s * k >= 60) ?? 50
  return (
    <div className="scalebar">
      <div style={{ width: m * k }} />
      <span>{m} m</span>
    </div>
  )
}
