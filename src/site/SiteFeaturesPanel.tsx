import { useMemo, useRef, useState } from 'react'
import { parseDxf } from '../lib/dxf'
import { signedArea, type Vec2 } from '../lib/geom'
import { analyzeLayers, FEATURE_ROLES, guessRoles, isFeatureRole, ROLE_LABELS, type LayerRole, type Survey } from '../lib/survey'
import { Num, Select, TextField } from '../components/fields'
import { applyAffine, firstPlacement, impliedScale, invert, scaleOf } from './align'
import {
  EDGES,
  FEATURE_TYPES,
  featureId,
  featureName,
  mapGeom,
  PAVING,
  retype,
  SERVICES,
  serviceInfo,
  typeInfo,
  type FeatureType,
  type GeometryKind,
  type SiteFeature,
} from './model'
import { isPdf, isPicture, loadDrawing, pdfPageCount } from './pdfLoad'
import { readDrawing, type FoundGroup } from './pdfRead'
import type { VectorPage } from './pdfVector'
import { allFeatures, removeFeature, storeExtraDxf, storeOverlayFiles, updateFeature, updateOverlay, useSiteFeatures, useSiteStore, type Overlay, type SiteTool } from './store'
import { TO_CHECK_ID, useSiteWarnings } from './sync'
import { srzRadius, tpzRadius } from './warnings'
import { TreeRemoval } from '../checks/TreeRemoval'
import './site.css'

/**
 * The Site features panel: the drawings laid over the plan and what was found on them,
 * tools to trace features, and the features themselves with their details.
 */
interface PanelProps {
  survey: Survey | null
  /** Bring up the floor plan, where drawings are lined up and features traced. */
  onShowPlan: () => void
  /**
   * A phone in View: only what can be read shows (what to check, what's on the site, the one
   * picked), under the one line that says Edit changes it, rather than a column of greyed-out
   * buttons that read like a fault.
   */
  viewOnly?: boolean
}

const st = useSiteStore.getState

/** Give the plan to Site features, and show it. */
function takePlan(onShowPlan: () => void) {
  useSiteStore.setState({ focus: true })
  onShowPlan()
  // On a phone the plan sits above this panel: bring it into view for the taps that follow.
  if (window.matchMedia?.('(max-width: 760px)').matches) requestAnimationFrame(() => document.querySelector('.viewport')?.scrollIntoView({ block: 'start' }))
}

export function SiteFeaturesPanel({ survey, onShowPlan, viewOnly = false }: PanelProps) {
  const loaded = useSiteStore(s => s.loaded)
  if (!survey) return <p className="muted">Site features need a survey that reads.</p>
  if (!loaded) return <p className="muted">Loading…</p>
  if (viewOnly)
    return (
      <div className="sf">
        <Warnings />
        <Inspector readOnly />
        <FeatureList />
        <NothingYet />
      </div>
    )
  return (
    <div className="sf">
      <Warnings />
      {/* The trace buttons first, and staying put as you scroll, so picking a feature doesn't push them down. */}
      <Trace onShowPlan={onShowPlan} />
      <Inspector />
      <Drawings survey={survey} onShowPlan={onShowPlan} />
      <FeatureList />
      <ExtraDxf />
    </div>
  )
}

/** In View, with nothing on the site yet: say so, rather than leave the panel empty. */
function NothingYet() {
  const features = useSiteFeatures({ includeHidden: true })
  const drawings = useSiteStore(s => s.data.overlays.length)
  if (features.length) return null
  return <p className="muted small">{drawings ? `Nothing traced yet on the ${drawings === 1 ? 'drawing' : `${drawings} drawings`} laid over the plan.` : 'Nothing traced or read onto the block yet.'}</p>
}

function Warnings() {
  const warnings = useSiteWarnings()
  const [open, setOpen] = useState<string | null>(null)
  if (!warnings.length) return null
  return (
    <div className="sf-section" id={TO_CHECK_ID}>
      <h3>To check</h3>
      <ul className="sf-warnings">
        {warnings.map(w => (
          <li key={w.id}>
            <button
              type="button"
              className={`site-chip ${w.severity}`}
              aria-expanded={open === w.id}
              onClick={() => {
                setOpen(open === w.id ? null : w.id)
                st().select(w.feature)
              }}
            >
              {w.text}
            </button>
            {open === w.id && <p>{w.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drawings

const newId = () => `ov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Enough words or line work to be worth reading; a scan is a picture inside a PDF. */
const readable = (v: VectorPage | null) => !!v && (v.texts.length >= 5 || v.paths.length >= 50) && !(v.imageCover > 0.8 && v.texts.length < 5)

function startAlign(o: Overlay, onShowPlan: () => void) {
  if (o.locked) updateOverlay(o.id, { locked: false }, false)
  takePlan(onShowPlan)
  st().setTool({ kind: 'align', overlay: o.id, pairs: [], start: o.transform, keepScale: !!o.scale })
}

function Drawings({ survey, onShowPlan }: { survey: Survey; onShowPlan: () => void }) {
  const overlays = useSiteStore(s => s.data.overlays)
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ file: File; pages: number; page: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const open = async (file: File, page: number) => {
    setBusy('Reading the drawing…')
    setError(null)
    try {
      const d = await loadDrawing(file, page)
      const vector = readable(d.vector) ? d.vector : null
      const boundaryWorld = survey.boundary.map((p): Vec2 => [p[0] + survey.origin[0], p[1] + survey.origin[1]])
      const o: Overlay = {
        id: newId(),
        name: file.name,
        kind: d.kind,
        page: d.page,
        width: d.width,
        height: d.height,
        pxPerUnit: d.pxPerUnit,
        scale: d.scale,
        transform: firstPlacement(d, boundaryWorld),
        aligned: false,
        opacity: 0.6,
        visible: true,
        locked: false,
        include: false,
        vector: !!vector,
        added: [],
      }
      await storeOverlayFiles(o.id, d.image, vector)
      st().commit(x => ({ ...x, overlays: [...x.overlays, o] }))
      setPending(null)
      startAlign(o, onShowPlan)
    } catch (e) {
      setError((e as Error).message || 'The drawing could not be read.')
    } finally {
      setBusy(null)
    }
  }

  const pick = async (file: File) => {
    setError(null)
    if (!isPdf(file) && !isPicture(file)) {
      setError('Please choose a PDF, PNG or JPG drawing.')
      return
    }
    if (isPdf(file)) {
      try {
        setBusy('Opening the PDF…')
        const pages = await pdfPageCount(file)
        setBusy(null)
        if (pages > 1) {
          setPending({ file, pages, page: 1 })
          return
        }
      } catch {
        setBusy(null)
        setError('This PDF could not be opened.')
        return
      }
    }
    await open(file, 1)
  }

  return (
    <div className="sf-section">
      <h3>Drawings</h3>
      {!overlays.length && (
        <p className="muted small">
          Lay a detail survey or site plan over the plan (PDF, PNG or JPG), line it up by two points, then add the trees, easements and
          fences it shows. It stays in this browser.
        </p>
      )}
      <div className="sf-drawings" style={{ display: 'grid', gap: 8 }}>
        {overlays.map(o => (
          <DrawingCard key={o.id} o={o} survey={survey} onShowPlan={onShowPlan} />
        ))}
      </div>
      {pending && (
        <div className="sf-pages" style={{ marginTop: 8 }}>
          <Select
            label={`${pending.file.name} has ${pending.pages} pages. Use page`}
            value={pending.page}
            options={Array.from({ length: pending.pages }, (_, i) => ({ id: i + 1, label: String(i + 1) }))}
            onChange={page => setPending({ ...pending, page })}
          />
          <button type="button" className="sf-btn primary" disabled={!!busy} onClick={() => void open(pending.file, pending.page)}>
            Open
          </button>
          <button type="button" className="sf-btn" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="sf-row" style={{ marginTop: 8 }}>
        <button type="button" className="sf-btn" disabled={!!busy} onClick={() => input.current?.click()}>
          {busy ?? 'Add a drawing…'}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void pick(f)
          }}
        />
      </div>
      {error && <p className="sf-error">{error}</p>}
    </div>
  )
}

function DrawingCard({ o, survey, onShowPlan }: { o: Overlay; survey: Survey; onShowPlan: () => void }) {
  const image = useSiteStore(s => s.images[o.id])
  const vector = useSiteStore(s => s.vectors[o.id])
  const tool = useSiteStore(s => s.tool)
  const aligning = tool?.kind === 'align' && tool.overlay === o.id
  const scale = o.aligned && o.kind === 'pdf' ? impliedScale(o.transform) : null
  return (
    <div className="sf-drawing">
      <div className="sf-drawing-head">
        <b title={o.name}>
          {o.name}
          {o.page > 1 ? ` · page ${o.page}` : ''}
        </b>
        <span className={`sf-status${o.aligned ? ' ok' : ''}`}>
          {aligning ? 'Lining up…' : o.aligned ? `Lined up${scale ? ` · 1:${scale.toFixed(0)}` : ''}` : 'Placed roughly'}
        </span>
      </div>
      {!image && <p className="muted small">The picture isn't in this browser. Its line-up is kept; add the drawing again to see it.</p>}
      <label className="sf-opacity">
        <span>Fade</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={o.opacity}
          aria-label="How strongly the drawing shows"
          onChange={e => updateOverlay(o.id, { opacity: Number(e.target.value) }, false)}
        />
      </label>
      <div className="sf-checks">
        <label className="check">
          <input type="checkbox" checked={o.visible} onChange={e => updateOverlay(o.id, { visible: e.target.checked })} />
          Show
        </label>
        <label className="check">
          <input type="checkbox" checked={o.locked} onChange={e => updateOverlay(o.id, { locked: e.target.checked })} />
          Lock
        </label>
        <label className="check" title="The project file is private to whoever you send it to; by default it carries what was read off the drawing, not the drawing">
          <input type="checkbox" checked={o.include} onChange={e => updateOverlay(o.id, { include: e.target.checked })} />
          Put the drawing in the project file
        </label>
      </div>
      <div className="sf-row">
        <button type="button" className="sf-btn" disabled={aligning} onClick={() => startAlign(o, onShowPlan)}>
          {o.aligned ? 'Line up again' : 'Line up by two points'}
        </button>
        <button
          type="button"
          className="sf-btn"
          onClick={() => {
            if (aligning) st().setTool(null)
            st().commit(d => ({ ...d, overlays: d.overlays.filter(x => x.id !== o.id) }))
            useSiteStore.setState({ highlight: null })
            st().notify('Drawing removed. Undo brings it back.')
          }}
        >
          Remove
        </button>
      </div>
      {o.vector && vector && o.aligned && !aligning && <Found o={o} vector={vector} survey={survey} onShowPlan={onShowPlan} />}
      {o.vector && !o.aligned && !aligning && <p className="muted small">Line it up to see what can be read off it.</p>}
      {!o.vector && (
        <p className="muted small">
          {o.kind === 'pdf' ? 'This PDF is a scan, so' : 'This is a picture, so'} nothing can be read off it. Trace what you need over it.
        </p>
      )}
    </div>
  )
}

/** Names short enough for a button or a narrow list. */
const SHORT: Record<FeatureType, string> = {
  tree: 'Tree',
  easement: 'Easement',
  fence: 'Fence',
  paving: 'Paving',
  building: 'Building',
  service: 'Service',
  kerb: 'Kerb or edge',
  other: 'Other',
}

/** The groups read off a lined-up drawing, each added with one tap. */
function Found({ o, vector, survey, onShowPlan }: { o: Overlay; vector: VectorPage; survey: Survey; onShowPlan: () => void }) {
  const highlight = useSiteStore(s => s.highlight)
  const [types, setTypes] = useState<Record<string, FeatureType>>({})
  const groups = useMemo(() => {
    const inv = invert(o.transform)
    const boundary = inv ? survey.boundary.map(p => applyAffine(inv, [p[0] + survey.origin[0], p[1] + survey.origin[1]])) : undefined
    try {
      return readDrawing(vector, { metresPerPoint: scaleOf(o.transform), boundary })
    } catch {
      return []
    }
  }, [vector, o.transform, survey])

  const asTyped = (g: FoundGroup): SiteFeature[] => {
    const t = types[g.id]
    return g.features.flatMap(f => {
      const r = t && t !== f.type ? retype(f, t) : f
      return r ? [r] : []
    })
  }

  const add = (list: FoundGroup[]) => {
    const features = list.flatMap(g =>
      asTyped(g).map(f => ({ ...f, id: featureId(), source: 'pdf' as const, geom: mapGeom(f.geom, p => applyAffine(o.transform, p)) })),
    )
    const ids = list.map(g => g.id)
    st().commit(d => ({
      ...d,
      features: [...d.features, ...features],
      overlays: d.overlays.map(x => (x.id === o.id ? { ...x, added: [...new Set([...x.added, ...ids])] } : x)),
    }))
    useSiteStore.setState({ highlight: null })
    st().notify(`${features.length} feature${features.length === 1 ? '' : 's'} added from ${o.name}. Undo takes them off again.`)
  }

  const show = (g: FoundGroup) => {
    const on = highlight?.overlay === o.id && highlight.marks === g.marks
    if (on) {
      useSiteStore.setState({ highlight: null })
      return
    }
    useSiteStore.setState({ highlight: { overlay: o.id, marks: g.marks, features: asTyped(g) } })
    takePlan(onShowPlan)
  }

  if (!groups.length) return <p className="muted small">Nothing on this drawing could be read as a site feature. Trace what you need over it.</p>
  const ready = groups.filter(g => g.features.length && !o.added.includes(g.id))
  return (
    <div>
      <div className="sf-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Found on this drawing</h3>
        {ready.length > 1 && (
          <button type="button" className="sf-btn primary" onClick={() => add(ready)}>
            Add all ({ready.reduce((n, g) => n + g.features.length, 0)})
          </button>
        )}
      </div>
      <ul className="sf-found">
        {groups.map(g => {
          const added = o.added.includes(g.id)
          const on = highlight?.overlay === o.id && highlight.marks === g.marks
          const n = g.features.length
          return (
            <li key={g.id} className={added ? 'added' : ''}>
              <div className="sf-found-title">
                <span>{g.title}</span>
                {added && <span className="sf-tick">Added</span>}
              </div>
              {g.detail.length > 0 && (
                <ul>
                  {g.detail.slice(0, 5).map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                  {g.detail.length > 5 && <li>and {g.detail.length - 5} more</li>}
                </ul>
              )}
              {g.traceHint && !added && <p className="sf-hint">{g.traceHint}</p>}
              {!added && (
                <div className="sf-row">
                  {n > 0 && (
                    <select
                      aria-label={`Add ${g.title} as`}
                      value={types[g.id] ?? g.type}
                      onChange={e => {
                        const t = e.target.value as FeatureType
                        setTypes({ ...types, [g.id]: t })
                        if (on) useSiteStore.setState({ highlight: { overlay: o.id, marks: g.marks, features: g.features.map(f => (t !== f.type ? retype(f, t) : f) ?? f) } })
                      }}
                    >
                      {FEATURE_TYPES.map(t => (
                        <option key={t.type} value={t.type}>
                          {SHORT[t.type]}
                        </option>
                      ))}
                    </select>
                  )}
                  <button type="button" className={`sf-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => show(g)}>
                    {on ? 'Showing' : 'Show'}
                  </button>
                  {n > 0 && (
                    <button type="button" className="sf-btn primary" onClick={() => add([g])}>
                      Add {n > 1 ? n : ''}
                    </button>
                  )}
                  {g.traceHint && (
                    <button
                      type="button"
                      className="sf-btn"
                      onClick={() => {
                        useSiteStore.setState({ highlight: { overlay: o.id, marks: g.marks, features: [] } })
                        startTrace(types[g.id] ?? g.type, onShowPlan, g.features[0])
                      }}
                    >
                      Trace
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tracing

function startTrace(type: FeatureType, onShowPlan: () => void, like?: SiteFeature) {
  const info = typeInfo(type)
  takePlan(onShowPlan)
  st().setTool({
    kind: 'trace',
    type,
    geom: info.geoms[0],
    service: type === 'service' ? (like?.service ?? 'sewer') : undefined,
    paving: type === 'paving' ? (like?.paving ?? 'driveway') : undefined,
    edge: type === 'kerb' ? (like?.edge ?? 'kerb') : undefined,
  })
}

const GEOM_LABELS: Record<GeometryKind, string> = { point: 'Point', line: 'Line', area: 'Outline' }

function Trace({ onShowPlan }: { onShowPlan: () => void }) {
  const tool = useSiteStore(s => s.tool)
  const trace = tool?.kind === 'trace' ? tool : null
  const set = (patch: Partial<Extract<SiteTool, { kind: 'trace' }>>) => trace && st().setTool({ ...trace, ...patch })
  return (
    <div className="sf-section sf-trace">
      <h3>Trace</h3>
      <div className="sf-tools">
        {FEATURE_TYPES.map(t => (
          <button
            key={t.type}
            type="button"
            className={`sf-btn${trace?.type === t.type ? ' on' : ''}`}
            aria-pressed={trace?.type === t.type}
            onClick={() => (trace?.type === t.type ? st().setTool(null) : startTrace(t.type, onShowPlan))}
            title={t.label}
          >
            <Swatch type={t.type} />
            <span>{SHORT[t.type]}</span>
          </button>
        ))}
      </div>
      {trace?.type === 'easement' && (
        <p className="muted small sf-guide">
          An easement is a strip of the block someone else has a right over, such as a sewer or drainage line, shown on your title plan with its width. Trace
          its outline as the title shows it: corners along the boundary snap onto it.
        </p>
      )}
      {trace && (
        <div className="sf-tool-options">
          {trace.type === 'service' && (
            <select aria-label="Which service" value={trace.service} onChange={e => set({ service: e.target.value as typeof trace.service })}>
              {SERVICES.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {trace.type === 'paving' && (
            <select aria-label="What kind of paving" value={trace.paving} onChange={e => set({ paving: e.target.value as typeof trace.paving })}>
              {PAVING.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {trace.type === 'kerb' && (
            <select aria-label="What kind of edge" value={trace.edge} onChange={e => set({ edge: e.target.value as typeof trace.edge })}>
              {EDGES.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {typeInfo(trace.type).geoms.length > 1 && (
            <select aria-label="Draw it as" value={trace.geom} onChange={e => set({ geom: e.target.value as GeometryKind })}>
              {typeInfo(trace.type).geoms.map(g => (
                <option key={g} value={g}>
                  {trace.type === 'service' && g === 'point' ? 'Pit or point' : GEOM_LABELS[g]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The features

function Swatch({ type }: { type: FeatureType }) {
  const common = { className: 'sf-key', viewBox: '0 0 18 12', 'aria-hidden': true }
  switch (type) {
    case 'tree':
      return (
        <svg {...common}>
          <circle cx="9" cy="6" r="5.2" fill="rgba(93,138,85,0.12)" stroke="#5d8a55" />
          <circle cx="9" cy="6" r="1.4" fill="#fff" stroke="#4d6b3c" />
        </svg>
      )
    case 'easement':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="16" height="8" fill="rgba(184,98,47,0.12)" stroke="#b8622f" strokeDasharray="3 1.5" />
          <path d="M4 10 10 2M9 10 15 2" stroke="rgba(184,98,47,0.5)" />
        </svg>
      )
    case 'fence':
      return (
        <svg {...common}>
          <path d="M1 7H17M4 7V3.5M9 7V3.5M14 7V3.5" stroke="#3f4650" fill="none" />
        </svg>
      )
    case 'paving':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="16" height="8" fill="rgba(130,136,144,0.2)" stroke="#8d949c" />
        </svg>
      )
    case 'building':
      return (
        <svg {...common}>
          <rect x="2" y="1.5" width="14" height="9" fill="rgba(70,76,84,0.14)" stroke="#59606a" />
        </svg>
      )
    case 'service':
      return (
        <svg {...common}>
          <path d="M1 6H17" stroke={serviceInfo('sewer').color} strokeWidth="1.6" strokeDasharray="5 2" fill="none" />
        </svg>
      )
    case 'kerb':
      return (
        <svg {...common}>
          <path d="M1 6H17" stroke="#5b6068" strokeWidth="2" fill="none" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M1 6H17" stroke="#7a7f87" strokeDasharray="3 2" fill="none" />
        </svg>
      )
  }
}

function FeatureList() {
  const features = useSiteFeatures({ includeHidden: true })
  const hidden = useSiteStore(s => s.data.hidden)
  const selected = useSiteStore(s => s.selected)
  const warnings = useSiteWarnings()
  const [open, setOpen] = useState<FeatureType[]>([])
  const warned = new Set(warnings.filter(w => w.severity === 'attn').map(w => w.feature))
  const byType = FEATURE_TYPES.map(t => ({ ...t, items: features.filter(f => f.type === t.type) })).filter(t => t.items.length)
  if (!byType.length) return null
  const toggleHidden = (t: FeatureType, show: boolean) =>
    st().preview(d => ({ ...d, hidden: show ? d.hidden.filter(x => x !== t) : [...d.hidden, t] }))
  return (
    <div className="sf-section">
      <h3>On the site</h3>
      <ul className="sf-types">
        {byType.map(t => {
          const isOpen = open.includes(t.type)
          return (
            <li key={t.type}>
              <div className="sf-type-row">
                <Swatch type={t.type} />
                <label className="check">
                  <input type="checkbox" checked={!hidden.includes(t.type)} onChange={e => toggleHidden(t.type, e.target.checked)} />
                  {t.plural}
                </label>
                <button type="button" className="sf-link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? open.filter(x => x !== t.type) : [...open, t.type])}>
                  {t.items.length} {isOpen ? '▴' : '▾'}
                </button>
              </div>
              {isOpen && (
                <ul className="sf-items">
                  {t.items.map(f => (
                    <li key={f.id}>
                      <button type="button" className={f.id === selected ? 'on' : ''} onClick={() => st().select(f.id === selected ? null : f.id)}>
                        <span>{featureName(f)}</span>
                        {warned.has(f.id) && <span className="attn-dot" title="Something to check">!</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const lengthOf = (pts: Vec2[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)

function Inspector({ readOnly = false }: { readOnly?: boolean }) {
  const selected = useSiteStore(s => s.selected)
  const data = useSiteStore(s => s.data)
  const main = useSiteStore(s => s.main)
  const extraDxfText = useSiteStore(s => s.extraDxfText)
  const f = useMemo(() => (selected ? allFeatures({ data, main, extraDxfText }).find(x => x.id === selected) : undefined), [selected, data, main, extraDxfText])
  if (!f) return null
  const set = (patch: Partial<SiteFeature>) => updateFeature(f.id, patch)
  const g = f.geom
  const measure =
    g.kind === 'area'
      ? `${Math.abs(signedArea(g.pts)).toFixed(1)} m², ${lengthOf([...g.pts, g.pts[0]]).toFixed(1)} m round`
      : g.kind === 'line'
        ? `${lengthOf(g.pts).toFixed(1)} m long`
        : `E ${g.at[0].toFixed(2)}, N ${g.at[1].toFixed(2)}`
  const from = f.source === 'dxf' ? `From the DXF layer ${f.layer ?? ''}` : f.source === 'pdf' ? 'Read off a drawing' : 'Traced'
  return (
    <div className="sf-inspector" role="group" aria-label="Selected feature">
      <div className="sf-inspector-head">
        <b>{featureName(f)}</b>
        <button type="button" className="sf-link" onClick={() => st().select(null)}>
          Close
        </button>
      </div>
      <p className="muted small">
        {from} · {measure}
      </p>
      <Select
        label="Type"
        value={f.type}
        options={FEATURE_TYPES.map(t => ({ id: t.type, label: t.label }))}
        onChange={type => {
          const r = retype(f, type)
          if (r) set({ ...r, id: f.id })
        }}
      />
      <TextField label="Label" value={f.label ?? ''} onCommit={label => set({ label })} />
      {f.type === 'tree' && (
        <>
          <Num label="Trunk Ø" unit="mm" value={f.trunk ?? 0.3} min={0.02} max={4} onCommit={trunk => set({ trunk })} />
          <Num label="Canopy Ø" unit="mm" value={f.canopy ?? 6} min={0.2} max={60} onCommit={canopy => set({ canopy })} />
          <Num label="Height" unit="m" value={f.height ?? 8} min={0.5} max={80} onCommit={height => set({ height })} />
          {/* The same toggle as the tree's row in Design › Checks. */}
          <TreeRemoval remove={!!f.remove} onChange={remove => set({ remove })} />
          {!f.remove && f.trunk ? (
            <p className="muted small">
              Tree protection zone {tpzRadius(f.trunk).toFixed(1)} m round the trunk (12 × trunk Ø), structural root zone {srzRadius(f.trunk).toFixed(1)} m: AS 4970
              rules of thumb. Keep building, digging, paving and services out of them.
              {(f.height ?? 0) >= 5 ? ' Trees 5 m or taller are usually protected.' : ''} Check with an arborist and council.
            </p>
          ) : null}
        </>
      )}
      {f.type === 'easement' && (
        <>
          <TextField label="Purpose" value={f.purpose ?? ''} onCommit={purpose => set({ purpose })} />
          {f.width !== undefined && <Num label="Width" unit="mm" value={f.width} min={0} max={100} onCommit={width => set({ width })} />}
        </>
      )}
      {f.type === 'fence' && <Num label="Height" unit="mm" value={f.height ?? 1.8} min={0.2} max={6} onCommit={height => set({ height })} />}
      {f.type === 'building' && (
        <>
          <Num label="Height" unit="m" value={f.height ?? 3} min={0.5} max={60} onCommit={height => set({ height })} />
          <Select
            label="Whose"
            value={f.neighbour ? 'neighbour' : 'ours'}
            options={[
              { id: 'ours', label: 'On this block' },
              { id: 'neighbour', label: "The neighbour's" },
            ]}
            onChange={v => set({ neighbour: v === 'neighbour' })}
          />
          {!f.neighbour && (
            <Select
              label="Plan"
              value={f.remove ? 'remove' : 'keep'}
              options={[
                { id: 'keep', label: 'Keep' },
                { id: 'remove', label: 'Demolish' },
              ]}
              onChange={v => set({ remove: v === 'remove' })}
            />
          )}
          {f.levels && f.levels.length > 0 && (
            <dl className="sf-levels">
              {f.levels.map(l => (
                <FragmentRow key={l.name} name={l.name} rl={l.rl} />
              ))}
            </dl>
          )}
        </>
      )}
      {f.type === 'service' && (
        <Select label="Service" value={f.service ?? 'sewer'} options={SERVICES.map(s => ({ id: s.id, label: s.label }))} onChange={service => set({ service })} />
      )}
      {f.type === 'paving' && (
        <Select label="Kind" value={f.paving ?? 'driveway'} options={PAVING.map(s => ({ id: s.id, label: s.label }))} onChange={paving => set({ paving })} />
      )}
      {f.type === 'kerb' && <Select label="Kind" value={f.edge ?? 'kerb'} options={EDGES.map(s => ({ id: s.id, label: s.label }))} onChange={edge => set({ edge })} />}
      {f.purpose && f.type !== 'easement' && <p className="muted small">{f.purpose}</p>}
      {!readOnly && <div className="sf-row">
        <button
          type="button"
          className="sf-btn"
          onClick={() => {
            removeFeature(f.id)
            st().notify('Removed. Undo brings it back.')
          }}
        >
          Remove
        </button>
        {f.source !== 'trace' && <span className="muted small">{f.source === 'dxf' ? 'Changes are kept beside the DXF, not in it.' : ''}</span>}
      </div>}
    </div>
  )
}

function FragmentRow({ name, rl }: { name: string; rl: number }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>RL {rl.toFixed(2)}</dd>
    </>
  )
}

// ---------------------------------------------------------------------------
// A second DXF with more features

function ExtraDxf() {
  const extra = useSiteStore(s => s.data.extraDxf)
  const text = useSiteStore(s => s.extraDxfText)
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const layers = useMemo(() => {
    if (!text) return []
    try {
      return analyzeLayers(parseDxf(text))
    } catch {
      return []
    }
  }, [text])

  const add = async (file: File) => {
    setError(null)
    try {
      const t = await file.text()
      const info = analyzeLayers(parseDxf(t))
      const guessed = guessRoles(info)
      const roles: Record<string, LayerRole> = {}
      for (const l of info) roles[l.name] = isFeatureRole(guessed[l.name]) ? guessed[l.name] : 'ignore'
      await storeExtraDxf(file.name, t, roles)
      if (!Object.values(roles).some(isFeatureRole)) setError('No layer name says what it holds. Pick what each layer is below.')
    } catch (e) {
      setError((e as Error).message || 'This DXF could not be read.')
    }
  }

  const setRole = (layer: string, role: LayerRole) =>
    st().commit(d => (d.extraDxf ? { ...d, extraDxf: { ...d.extraDxf, roles: { ...d.extraDxf.roles, [layer]: role } } } : d))

  return (
    <div className="sf-section">
      <h3>More from a DXF</h3>
      {!extra ? (
        <>
          <p className="muted small">
            Features on the survey's own layers are set under Survey layers. A second DXF on the same grid, such as an arborist's or a services plan, can
            add more.
          </p>
          <div className="sf-row" style={{ marginTop: 6 }}>
            <button type="button" className="sf-btn" onClick={() => input.current?.click()}>
              Add a DXF…
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sf-drawing-head">
            <b title={extra.fileName}>{extra.fileName}</b>
            <button type="button" className="sf-link" onClick={() => st().commit(d => ({ ...d, extraDxf: null }))}>
              Remove
            </button>
          </div>
          {!text && <p className="muted small">The file isn't in this browser any more. Add it again.</p>}
          <ul className="layers">
            {layers.map(l => (
              <li key={l.name}>
                <div>
                  <span className="layer-name">{l.name}</span>
                </div>
                <select value={extra.roles[l.name] ?? 'ignore'} onChange={e => setRole(l.name, e.target.value as LayerRole)} aria-label={`Use of layer ${l.name}`}>
                  <option value="ignore">{ROLE_LABELS.ignore}</option>
                  {FEATURE_ROLES.map(r => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept=".dxf"
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void add(f)
        }}
      />
      {error && <p className="sf-error">{error}</p>}
    </div>
  )
}
