import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { centroidOf, signedArea, type Vec2 } from '../lib/geom'
import type { Survey } from '../lib/survey'
import { fromSite, toSite, type Placement } from '../plan/model'
import { usePlan } from '../plan/store'
import { alignFromPairs, applyAffine, compose, impliedScale, invert, scaleOf, type Affine } from './align'
import { featureId, featureName, geomPoints, serviceInfo, typeInfo, withDefaults, type SiteFeature } from './model'
import { addFeatures, removeFeature, updateOverlay, useSiteFeatures, useSiteStore, type Overlay, type SiteTool } from './store'
import { useSiteWarnings } from './sync'
import { FeatureSymbol, LiveDim, Tag } from './FeatureSymbol'
import { snapPoints } from './pdfVector'
import { useAerialLayer } from '../map/aerial'
import './site.css'

/**
 * Site features on the plan: the drawings laid under it, the features drawn as quiet
 * plan symbols, and the tools that trace features and line drawings up. PlanEditor hands
 * over clicks and keys while one of these tools is picked.
 */
export interface SitePlanArgs {
  survey: Survey
  placement: Placement
  /** House frame to screen pixels, and back (from client coordinates). */
  S: (p: Vec2) => Vec2
  toHouse: (clientX: number, clientY: number) => Vec2
  /** Screen pixels per metre. */
  k: number
  /** Bring these house-frame points into view. */
  fitTo: (pts: Vec2[]) => void
}

const fmtMm = (m: number) => Math.round(m * 1000).toString()
const SNAP_PX = 10
/** When a feature was last picked, so the click's pointer-up on the plan doesn't drop it again. */
let pickedAt = 0

/** Where a drawing's picture pixel lands in drawing units (y up). */
const pictureToDrawing = (o: Overlay): Affine => [1 / o.pxPerUnit, 0, 0, -1 / o.pxPerUnit, 0, o.height]

export function useSitePlan({ survey, placement, S, toHouse, k, fitTo }: SitePlanArgs) {
  const tool = useSiteStore(s => s.tool)
  const data = useSiteStore(s => s.data)
  const images = useSiteStore(s => s.images)
  const vectors = useSiteStore(s => s.vectors)
  const selected = useSiteStore(s => s.selected)
  const highlight = useSiteStore(s => s.highlight)
  const notice = useSiteStore(s => s.notice)
  const noticeOk = useSiteStore(s => s.noticeOk)
  const focus = useSiteStore(s => s.focus)
  const features = useSiteFeatures()
  const warnings = useSiteWarnings()
  const origin = survey.origin
  const st = useSiteStore.getState

  // Local survey frame (x = E − origin) to and from the plan's house frame.
  const toScreen = (p: Vec2) => S(fromSite(p, placement, origin))
  const worldToLocal = (p: Vec2): Vec2 => [p[0] - origin[0], p[1] - origin[1]]
  const localToWorld = (p: Vec2): Vec2 => [p[0] + origin[0], p[1] + origin[1]]
  const houseToLocal = (p: Vec2) => toSite(p, placement, origin)

  // Drafting state for the trace tools.
  const toolKey = tool ? JSON.stringify(tool.kind === 'trace' ? tool : { a: tool.overlay }) : ''
  const [draft, setDraft] = useState<{ key: string; pts: Vec2[]; typed: string }>({ key: '', pts: [], typed: '' })
  const pts = draft.key === toolKey ? draft.pts : []
  const drafted = pts
  const typed = draft.key === toolKey ? draft.typed : ''
  const setPts = (p: Vec2[]) => setDraft({ key: toolKey, pts: p, typed: '' })
  const setTyped = (fn: (t: string) => string) => setDraft(d => ({ key: toolKey, pts: d.key === toolKey ? d.pts : [], typed: fn(d.key === toolKey ? d.typed : '') }))
  const [pointer, setPointer] = useState<{ p: Vec2; snapped: boolean } | null>(null)

  // Leave Site features' selection when something of the house is selected.
  const planSelection = usePlan(s => s.selection)
  useEffect(() => {
    if (planSelection) useSiteStore.setState({ selected: null })
  }, [planSelection])
  // Picking a floor plan tool puts the site tool down.
  const planTool = usePlan(s => s.tool)
  const lastPlanTool = useRef(planTool)
  useEffect(() => {
    if (planTool === lastPlanTool.current) return
    lastPlanTool.current = planTool
    if (useSiteStore.getState().tool) useSiteStore.getState().setTool(null)
  }, [planTool])

  const alignOverlay = tool?.kind === 'align' ? data.overlays.find(o => o.id === tool.overlay) : undefined

  // Lining up starts with the whole drawing and the block in view.
  const alignStart = tool?.kind === 'align' ? `${tool.overlay}|${tool.start.join(',')}` : null
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (!alignStart || fitted.current === alignStart) return
    fitted.current = alignStart
    const o = useSiteStore.getState().data.overlays.find(x => alignStart.startsWith(`${x.id}|`))
    if (!o) return
    const corners: Vec2[] = [
      [0, 0],
      [o.width, 0],
      [o.width, o.height],
      [0, o.height],
    ]
    const local = [...corners.map(c => worldToLocal(applyAffine(o.transform, c))), ...survey.boundary]
    fitTo(local.map(p => fromSite(p, placement, origin)))
  })

  // Points worth snapping to, in the local frame: the boundary, features, and the line work of lined-up drawings.
  const surveyPoints = useMemo(() => [...survey.boundary, ...features.flatMap(f => geomPoints(f.geom))], [survey.boundary, features])
  const drawingPoints = useMemo(() => {
    const out: { overlay: string; p: Vec2 }[] = []
    for (const o of data.overlays) {
      const v = vectors[o.id]
      if (!v || !o.visible) continue
      for (const p of snapPoints(v.paths)) out.push({ overlay: o.id, p })
    }
    return out
  }, [data.overlays, vectors])

  const snapLocal = (raw: Vec2, free: boolean, list: Vec2[]): { p: Vec2; snapped: boolean } => {
    if (free) return { p: raw, snapped: false }
    const tol = SNAP_PX / k
    let best: Vec2 | null = null
    let bestD = tol
    for (const q of list) {
      const d = Math.hypot(q[0] - raw[0], q[1] - raw[1])
      if (d < bestD) {
        bestD = d
        best = q
      }
    }
    return best ? { p: best, snapped: true } : { p: raw, snapped: false }
  }

  /** Snap to a lined-up or placed drawing's own line ends; returns local coordinates. */
  const snapDrawing = (raw: Vec2, free: boolean, only?: Overlay): { p: Vec2; snapped: boolean } => {
    if (free) return { p: raw, snapped: false }
    const tol = SNAP_PX / k
    let best: { p: Vec2; d: number } | null = null
    const w = localToWorld(raw)
    for (const o of only ? [only] : data.overlays) {
      if (!o.visible) continue
      const inv = invert(o.transform)
      if (!inv) continue
      const d0 = applyAffine(inv, w)
      const tolD = tol / scaleOf(o.transform)
      for (const q of drawingPoints) {
        if (q.overlay !== o.id) continue
        if (Math.abs(q.p[0] - d0[0]) > tolD || Math.abs(q.p[1] - d0[1]) > tolD) continue
        const d = Math.hypot(q.p[0] - d0[0], q.p[1] - d0[1]) * scaleOf(o.transform)
        if (d < tol && (!best || d < best.d)) best = { p: worldToLocal(applyAffine(o.transform, q.p)), d }
      }
    }
    return best ? { p: best.p, snapped: true } : { p: raw, snapped: false }
  }

  const snapAny = (raw: Vec2, free: boolean) => {
    const a = snapLocal(raw, free, [...surveyPoints, ...pts])
    return a.snapped ? a : snapDrawing(raw, free)
  }

  // ---- Lining a drawing up ----
  const alignPreview = (o: Overlay, t: Extract<SiteTool, { kind: 'align' }>, pointerLocal: Vec2 | null): Affine => {
    const pairs = t.pairs.map(p => ({ ...p }))
    const last = pairs[pairs.length - 1]
    if (last && !last.to && pointerLocal) last.to = localToWorld(pointerLocal)
    return alignFromPairs(pairs, t.start, t.keepScale ? o.scale : null)
  }

  const alignClick = (pLocal: Vec2, free: boolean) => {
    if (tool?.kind !== 'align' || !alignOverlay) return
    const pairs = tool.pairs
    const waitingForSurvey = pairs.length > 0 && !pairs[pairs.length - 1].to
    if (!waitingForSurvey) {
      // A point on the drawing, where the drawing sits now.
      const snapped = snapDrawing(pLocal, free, alignOverlay)
      const inv = invert(alignOverlay.transform)
      if (!inv) return
      const from = applyAffine(inv, localToWorld(snapped.p))
      st().setTool({ ...tool, pairs: [...pairs, { from }] })
      return
    }
    const to = localToWorld(snapLocal(pLocal, free, surveyPoints).p)
    const next = pairs.map((p, i) => (i === pairs.length - 1 ? { ...p, to } : p))
    const transform = alignFromPairs(next, tool.start, tool.keepScale ? alignOverlay.scale : null)
    updateOverlay(alignOverlay.id, { transform }, false)
    if (next.length < 2) {
      st().setTool({ ...tool, pairs: next })
      st().notify('Moved. Now click a second point on the drawing, far from the first.')
      return
    }
    finishAlign(alignOverlay, next, transform)
  }

  const finishAlign = (o: Overlay, pairs: { from: Vec2; to?: Vec2 }[], transform: Affine) => {
    const before = useSiteStore.getState().data
    // One undo step from where the drawing was before lining up.
    const startData = { ...before, overlays: before.overlays.map(x => (x.id === o.id ? { ...x, transform: (tool as Extract<SiteTool, { kind: 'align' }>).start } : x)) }
    useSiteStore.setState({ data: startData })
    useSiteStore.getState().commit(d => ({ ...d, overlays: d.overlays.map(x => (x.id === o.id ? { ...x, transform, aligned: true, locked: true } : x)) }))
    st().setTool(null)
    const scale = o.kind === 'pdf' ? impliedScale(transform) : null
    const miss = pairs.filter(p => p.to).map(p => Math.hypot(applyAffine(transform, p.from)[0] - p.to![0], applyAffine(transform, p.from)[1] - p.to![1]))
    const worst = Math.max(0, ...miss)
    st().notify(
      `Lined up${scale ? ` at 1:${scale.toFixed(scale > 50 ? 0 : 1)}` : ''}${o.scale ? ` (the drawing says 1:${o.scale})` : ''} and locked.` +
        (worst > 0.005 ? ` The points are ${fmtMm(worst)} mm off at most.` : '') +
        (o.vector ? ' What it shows is listed under Site features, to add.' : ''),
    )
  }

  // ---- Tracing ----
  const traceTool = tool?.kind === 'trace' ? tool : null

  /** Where the side being drawn ends: at the pointer, or at a typed length towards it. */
  const typedEnd = (a: Vec2, toward: Vec2): Vec2 | null => {
    const l = Math.hypot(toward[0] - a[0], toward[1] - a[1])
    if (!typed) return l > 1e-6 ? toward : null
    const len = parseFloat(typed) / 1000
    if (!(len > 0) || l < 1e-6) return null
    return [a[0] + ((toward[0] - a[0]) / l) * len, a[1] + ((toward[1] - a[1]) / l) * len]
  }

  const commitFeature = (f: SiteFeature) => {
    addFeatures([f])
    useSiteStore.setState({ selected: f.id })
    setPts([])
    st().notify(`${featureName(f)} added. Its details are in Features, on the left; Esc stops tracing.`, true)
  }

  const newFeature = (geom: SiteFeature['geom'], extra: Partial<SiteFeature> = {}): SiteFeature | null => {
    if (!traceTool) return null
    const world = geom.kind === 'point' ? { kind: 'point' as const, at: localToWorld(geom.at) } : { kind: geom.kind, pts: geom.pts.map(localToWorld) }
    return withDefaults({
      id: featureId(),
      type: traceTool.type,
      source: 'trace',
      geom: world,
      service: traceTool.service,
      paving: traceTool.paving,
      edge: traceTool.edge,
      ...extra,
    })
  }

  const traceClick = (pLocal: Vec2, free: boolean) => {
    if (!traceTool) return
    const s = snapAny(pLocal, free)
    const p = pts.length && typed ? (typedEnd(pts[pts.length - 1], s.p) ?? s.p) : s.p
    if (traceTool.type === 'tree') {
      if (!pts.length) return setPts([p])
      const r = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])
      const f = newFeature({ kind: 'point', at: pts[0] }, r > 0.2 ? { canopy: Math.round(r * 2 * 10) / 10 } : {})
      if (f) commitFeature(f)
      return
    }
    if (traceTool.geom === 'point') {
      const f = newFeature({ kind: 'point', at: p })
      if (f) commitFeature(f)
      return
    }
    if (traceTool.geom === 'area' && pts.length >= 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < SNAP_PX / k) return finishTrace()
    setPts([...pts, p])
  }

  const finishTrace = () => {
    if (!traceTool) return
    // A double-click lands two clicks on one spot first.
    const pts = drafted.filter((p, i) => i === 0 || Math.hypot(p[0] - drafted[i - 1][0], p[1] - drafted[i - 1][1]) > 0.005)
    if (traceTool.geom === 'line' && pts.length >= 2) {
      const f = newFeature({ kind: 'line', pts })
      if (f) commitFeature(f)
    } else if (traceTool.geom === 'area' && pts.length >= 3) {
      const ring = signedArea(pts) < 0 ? [...pts].reverse() : pts
      const f = newFeature({ kind: 'area', pts: ring })
      if (f) commitFeature(f)
    } else if (traceTool.type === 'tree' && pts.length === 1) {
      const canopy = typed ? parseFloat(typed) / 1000 : undefined
      const f = newFeature({ kind: 'point', at: pts[0] }, canopy && canopy > 0 ? { canopy } : {})
      if (f) commitFeature(f)
    }
  }

  // ---- Handed over by PlanEditor ----
  const active = !!tool
  const move = (house: Vec2, free: boolean) => {
    const local = houseToLocal(house)
    if (tool?.kind === 'align' && alignOverlay) {
      const waitingForSurvey = tool.pairs.length > 0 && !tool.pairs[tool.pairs.length - 1].to
      const s = waitingForSurvey ? snapLocal(local, free, surveyPoints) : snapDrawing(local, free, alignOverlay)
      setPointer(s)
      if (waitingForSurvey) updateOverlay(alignOverlay.id, { transform: alignPreview(alignOverlay, tool, s.p) }, false)
      return
    }
    setPointer(snapAny(local, free))
  }
  const click = (house: Vec2, free: boolean) => {
    const local = houseToLocal(house)
    if (tool?.kind === 'align') alignClick(local, free)
    else traceClick(local, free)
  }
  const cancel = () => {
    if (tool?.kind === 'align' && alignOverlay) updateOverlay(alignOverlay.id, { transform: tool.start }, false)
    setPts([])
    st().setTool(null)
  }
  const dblclick = () => finishTrace()
  /** A click on the plan that missed every feature. */
  const deselect = () => {
    if (performance.now() - pickedAt > 400 && st().selected) st().select(null)
  }
  const key = (e: KeyboardEvent): boolean => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z' && (active || focus || selected)) {
      if (pts.length) setPts(pts.slice(0, -1))
      else if (e.shiftKey) st().redo()
      else st().undo()
      return true
    }
    if (mod) return false
    if (!active) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        removeFeature(selected)
        st().notify('Removed. Undo brings it back.')
        return true
      }
      if (e.key === 'Escape' && selected) {
        st().select(null)
        return true
      }
      return false
    }
    if (traceTool && pts.length && /^[0-9.]$/.test(e.key)) {
      setTyped(t => (t + e.key).slice(0, 7))
      return true
    }
    if (e.key === 'Backspace') {
      if (typed) setTyped(t => t.slice(0, -1))
      else if (pts.length) setPts(pts.slice(0, -1))
      return true
    }
    if (e.key === 'Enter') {
      if (traceTool && typed && pts.length && pointer && traceTool.type !== 'tree') {
        const end = typedEnd(pts[pts.length - 1], pointer.p)
        if (end) setPts([...pts, end])
      } else finishTrace()
      return true
    }
    if (e.key === 'Escape') {
      if (pts.length) setPts([])
      else cancel()
      return true
    }
    return true // other keys don't switch plan tools while tracing
  }

  // ---- Drawing ----
  // The aerial photo and the lot's lines from the cadastre, once the block is placed (Site › Map).
  const aerial = useAerialLayer(screenAffine(toScreen, origin), k)
  const overlayImages = data.overlays.map(o => {
    const url = images[o.id]
    if (!url || !o.visible) return null
    const t = o.id === alignOverlay?.id ? o.transform : o.transform
    const m = compose(compose(screenAffine(toScreen, origin), t), pictureToDrawing(o))
    return (
      <image
        key={o.id}
        className="site-overlay"
        href={url}
        x={0}
        y={0}
        width={o.width * o.pxPerUnit}
        height={o.height * o.pxPerUnit}
        preserveAspectRatio="none"
        transform={`matrix(${m.map(n => n.toFixed(5)).join(' ')})`}
        opacity={o.opacity}
      />
    )
  })

  const warned = new Set(warnings.filter(w => w.severity === 'attn').map(w => w.feature))
  const sel = features.find(f => f.id === selected)

  const pick = (f: SiteFeature) => (e: ReactPointerEvent) => {
    if (tool || e.button !== 0) return
    e.stopPropagation()
    pickedAt = performance.now()
    usePlan.getState().select(null)
    st().select(f.id)
  }

  const startVertexDrag = (f: SiteFeature, index: number) => (e: ReactPointerEvent) => {
    if (tool || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const before = useSiteStore.getState().data
    const world = (cx: number, cy: number) => localToWorld(houseToLocal(toHouse(cx, cy)))
    const onMove = (ev: PointerEvent) => {
      const p = world(ev.clientX, ev.clientY)
      const g = f.geom
      const geom = g.kind === 'point' ? { kind: 'point' as const, at: p } : { kind: g.kind, pts: g.pts.map((q, i) => (i === index ? p : localToWorld(q))) }
      useSiteStore.getState().preview(d =>
        d.features.some(x => x.id === f.id)
          ? { ...d, features: d.features.map(x => (x.id === f.id ? { ...x, geom } : x)) }
          : { ...d, edits: { ...d.edits, [f.id]: { ...d.edits[f.id], geom } } },
      )
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      useSiteStore.getState().settle(before)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const shape = (f: SiteFeature, hit: boolean) => (
    <FeatureSymbol
      key={f.id}
      f={merged.has(f.id) ? { ...f, label: merged.get(f.id) } : f}
      toScreen={toScreen}
      k={k}
      selected={f.id === selected}
      warned={warned.has(f.id)}
      onPick={hit ? pick(f) : undefined}
      unlabelled={unlabelled.has(f.id)}
    />
  )
  const areas = features.filter(f => f.geom.kind === 'area')
  const unlabelled = repeatedLabels(features)
  const others = features.filter(f => f.geom.kind !== 'area')
  // Points named alike whose names would sit on top of one another: the name once, with a count.
  const merged = mergeRepeatedLabels(others.flatMap(f => (f.geom.kind === 'point' ? [{ id: f.id, text: pointLabel(f), at: toScreen(f.geom.at) }] : [])))

  // Found features being pointed out, in the drawing's units.
  const hl = highlight && data.overlays.find(o => o.id === highlight.overlay)
  const hlLocal = (p: Vec2) => worldToLocal(applyAffine(hl!.transform, p))

  const backdrop = (
    <g className="site-backdrop">
      {aerial}
      {overlayImages}
    </g>
  )
  const under = (
    <g className="site-under">
      <defs>
        <pattern id="site-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="rgba(184, 98, 47, 0.05)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(184, 98, 47, 0.42)" strokeWidth="1" />
        </pattern>
      </defs>
      {areas.map(f => shape(f, !tool))}
    </g>
  )

  // What is being traced, live.
  const preview = (() => {
    if (!traceTool || !pointer) return null
    const p = pts.length && typed && traceTool.type !== 'tree' ? (typedEnd(pts[pts.length - 1], pointer.p) ?? pointer.p) : pointer.p
    if (traceTool.type === 'tree') {
      if (!pts.length) return <circle className="site-draft-dot" cx={toScreen(p)[0]} cy={toScreen(p)[1]} r={4} />
      const r = typed ? parseFloat(typed) / 2000 : Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1])
      const c = toScreen(pts[0])
      return (
        <g>
          <circle className="site-draft" cx={c[0]} cy={c[1]} r={Math.max(r * k, 2)} />
          <circle className="site-draft-dot" cx={c[0]} cy={c[1]} r={3} />
          <Tag at={toScreen(p)} lines={[typed ? `Canopy Ø ${typed}▌ mm` : `Canopy Ø ${fmtMm(r * 2)} mm`, 'Click, or type mm and Enter']} />
        </g>
      )
    }
    if (traceTool.geom === 'point') return <circle className="site-draft-dot" cx={toScreen(p)[0]} cy={toScreen(p)[1]} r={4} />
    if (!pts.length) return <circle className="site-draft-dot" cx={toScreen(p)[0]} cy={toScreen(p)[1]} r={3} />
    const chain = [...pts, p]
    const a = pts[pts.length - 1]
    const len = Math.hypot(p[0] - a[0], p[1] - a[1])
    const ang = ((Math.atan2(p[1] - a[1], p[0] - a[0]) * 180) / Math.PI + 360) % 360
    const total = chain.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - chain[i][0], q[1] - chain[i][1]), 0)
    const lines = [typed ? `${typed}▌ mm` : `${fmtMm(len)} mm  ${ang.toFixed(0)}°`]
    if (traceTool.geom === 'area' && chain.length >= 3) lines.push(`${Math.abs(signedArea(chain)).toFixed(1)} m²`)
    else if (chain.length > 2) lines.push(`Total ${fmtMm(total)} mm`)
    return (
      <g>
        <path className={`site-draft${traceTool.geom === 'area' ? ' area' : ''}`} d={pathOf(chain.map(toScreen), traceTool.geom === 'area')} />
        {chain.slice(1).map((q, i) => (
          <LiveDim key={i} a={toScreen(chain[i])} b={toScreen(q)} text={fmtMm(Math.hypot(q[0] - chain[i][0], q[1] - chain[i][1]))} />
        ))}
        <Tag at={toScreen(p)} lines={lines} />
      </g>
    )
  })()

  const alignMarks = (() => {
    if (tool?.kind !== 'align' || !alignOverlay) return null
    const t = alignOverlay.transform
    return (
      <g>
        {tool.pairs.map((pr, i) => {
          const a = toScreen(worldToLocal(applyAffine(t, pr.from)))
          const b = pr.to ? toScreen(worldToLocal(pr.to)) : null
          return (
            <g key={i} className="site-align-pair">
              <circle cx={a[0]} cy={a[1]} r={6} />
              <text x={a[0] + 9} y={a[1] - 9}>
                {i + 1}
              </text>
              {b && <path d={`M${b[0] - 7} ${b[1]}H${b[0] + 7}M${b[0]} ${b[1] - 7}V${b[1] + 7}`} />}
            </g>
          )
        })}
        {pointer && (
          <path
            className={`site-align-cursor${pointer.snapped ? ' snapped' : ''}`}
            d={(([x, y]) => `M${x - 9} ${y}H${x + 9}M${x} ${y - 9}V${y + 9}`)(toScreen(pointer.p))}
          />
        )}
      </g>
    )
  })()

  const over = (
    <g className="site-over">
      {others.map(f => shape(f, !tool))}
      {sel && !tool && geomPoints(sel.geom).map((p, i) => <circle key={`h${i}`} className="handle" cx={toScreen(p)[0]} cy={toScreen(p)[1]} r={5} onPointerDown={startVertexDrag(sel, i)} />)}
      {hl &&
        highlight!.features.map(f => (
          <FeatureSymbol key={`hl-${f.id}`} f={{ ...f, geom: f.geom.kind === 'point' ? { kind: 'point', at: hlLocal(f.geom.at) } : { kind: f.geom.kind, pts: f.geom.pts.map(hlLocal) } }} toScreen={toScreen} k={k} selected={false} warned={false} preview />
        ))}
      {hl &&
        highlight!.marks.map((m, i) => {
          const [x, y] = toScreen(hlLocal(m))
          return <circle key={`m${i}`} className="site-mark" cx={x} cy={y} r={11} />
        })}
      {preview}
      {alignMarks}
      {pointer?.snapped && traceTool && <rect className="snap" x={toScreen(pointer.p)[0] - 5} y={toScreen(pointer.p)[1] - 5} width={10} height={10} />}
    </g>
  )

  const hint = (() => {
    if (tool?.kind === 'align') {
      const pairs = tool.pairs
      const waiting = pairs.length > 0 && !pairs[pairs.length - 1].to
      if (pairs.length === 0) return 'Click a point on the drawing that you can also find on the survey, such as a boundary corner. Drag to pan.'
      if (waiting) return `Now click the same point on the survey${pairs.length === 2 ? '; the drawing turns to follow' : ''}. Corners snap.`
      return 'Click a second point on the drawing, as far from the first as you can.'
    }
    if (!traceTool) return ''
    const what = typeInfo(traceTool.type).label.toLowerCase()
    if (traceTool.type === 'tree') return pts.length ? 'Move out to the edge of the canopy and click, or type its spread in mm and press Enter.' : 'Click the middle of the trunk.'
    if (traceTool.geom === 'point') return `Click to place the ${what}.`
    if (traceTool.geom === 'line') return `Click along the ${what}. Type a length in mm and press Enter for an exact side; double-click or Enter to finish. Shift turns off snapping.`
    return `Click the corners of the ${what}. Type a length in mm and press Enter for an exact side; click the first corner or press Enter to close it.`
  })()

  const bar = tool ? (
    <div className="site-toolbar" role="toolbar" aria-label="Site features tool">
      <span className="site-toolbar-hint">{hint}</span>
      <span className="site-toolbar-title">
        {tool.kind === 'align' ? `Lining up · step ${Math.min(4, tool.pairs.length * 2 + (tool.pairs.at(-1)?.to || !tool.pairs.length ? 1 : 0))} of 4` : `Tracing: ${traceTool?.type === 'service' ? `${serviceInfo(traceTool.service).label} ${traceTool.geom}` : typeInfo(traceTool!.type).label.toLowerCase()}`}
      </span>
      {tool.kind === 'align' && alignOverlay?.scale && (
        <label className="site-check">
          <input type="checkbox" checked={tool.keepScale} onChange={e => st().setTool({ ...tool, keepScale: e.target.checked })} />
          Keep 1:{alignOverlay.scale}
        </label>
      )}
      {traceTool && pts.length > 0 && (
        <button type="button" onClick={() => setPts(pts.slice(0, -1))}>
          Undo point
        </button>
      )}
      {traceTool && ((traceTool.geom === 'line' && pts.length >= 2) || (traceTool.geom === 'area' && pts.length >= 3)) && (
        <button type="button" className="primary" onClick={finishTrace}>
          Finish
        </button>
      )}
      <button type="button" onClick={cancel}>
        {tool.kind === 'align' ? 'Cancel' : 'Done'}
      </button>
    </div>
  ) : null

  // On the plan, only what needs checking, easements first; quiet notes stay in the panel.
  const attn = warnings.filter(w => w.severity === 'attn').sort((a, b) => Number(b.kind === 'easement') - Number(a.kind === 'easement'))
  const chips = attn.length ? (
    <div className="site-warnings on-plan" aria-label="Site warnings">
      {attn.slice(0, 2).map((w, i) => (
        <button key={w.id} type="button" className={`site-chip ${w.severity}${i ? ' second' : ''}`} title={w.detail} onClick={() => st().select(w.feature)}>
          {w.text}
        </button>
      ))}
      {/* Two chips on a wide screen, one on a phone, where the plan is short. */}
      {attn.length > 2 && <span className="site-chip more-wide">+{attn.length - 2} more to check in Site features</span>}
      {attn.length > 1 && <span className="site-chip more-narrow">+{attn.length - 1} more to check in Site features</span>}
    </div>
  ) : null

  return { active, hint, notice: active || focus ? notice : null, noticeOk, move, click, dblclick, deselect, key, backdrop, under, over, bar, chips }
}

/** Easements named again by a strip of the same name within a few metres (one easement either side of a line): named once. */
function repeatedLabels(features: SiteFeature[]): Set<string> {
  const out = new Set<string>()
  const named: { label: string; at: Vec2 }[] = []
  for (const f of features) {
    if (f.type !== 'easement' || f.geom.kind !== 'area' || !f.label) continue
    const at = centroidOf(f.geom.pts)
    if (named.some(n => n.label === f.label && Math.hypot(n.at[0] - at[0], n.at[1] - at[1]) < 8)) out.add(f.id)
    else named.push({ label: f.label, at })
  }
  return out
}

/** The name a point feature shows on the plan, as FeatureSymbol writes it. */
function pointLabel(f: SiteFeature): string | undefined {
  if (f.type === 'service') return f.label ?? serviceInfo(f.service).code
  if (f.type === 'building') return f.label ?? 'Building'
  return f.label
}

/** Rough size of a point's name on screen (px), for telling when two would overlap. */
const LABEL_CHAR = 5.8
const LABEL_LINE = 12

/**
 * Point names that repeat where they would overlap on screen (two "Sewer Man Hole Not Located"
 * pits a metre apart): the first keeps the name with a count ("… ×2"), the rest show none.
 * Returns the label to use for each point that changes; `at` is the point on screen.
 */
export function mergeRepeatedLabels(items: { id: string; text: string | undefined; at: Vec2 }[]): Map<string, string> {
  const out = new Map<string, string>()
  const groups: { text: string; at: Vec2; ids: string[] }[] = []
  for (const it of items) {
    if (!it.text) continue
    const w = it.text.length * LABEL_CHAR
    const g = groups.find(x => x.text === it.text && Math.abs(x.at[0] - it.at[0]) < w && Math.abs(x.at[1] - it.at[1]) < LABEL_LINE)
    if (g) g.ids.push(it.id)
    else groups.push({ text: it.text, at: it.at, ids: [it.id] })
  }
  for (const g of groups) {
    if (g.ids.length < 2) continue
    out.set(g.ids[0], `${g.text} ×${g.ids.length}`)
    for (const id of g.ids.slice(1)) out.set(id, '')
  }
  return out
}

/** The affine map from the survey grid (world) to the screen, read off three points. */
function screenAffine(toScreen: (local: Vec2) => Vec2, origin: Vec2): Affine {
  const o = toScreen([0, 0])
  const x = toScreen([1, 0])
  const y = toScreen([0, 1])
  const a = x[0] - o[0]
  const b = x[1] - o[1]
  const c = y[0] - o[0]
  const d = y[1] - o[1]
  // world → local is a shift by −origin
  return [a, b, c, d, o[0] - a * origin[0] - c * origin[1], o[1] - b * origin[0] - d * origin[1]]
}

function pathOf(pts: Vec2[], close = false): string {
  return pts.length ? `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}${close ? 'Z' : ''}` : ''
}
