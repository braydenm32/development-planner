// Share's sections: the 3D print settings and parts, the PDF plans, and sending the project
// file. Share › Plans, Send, 3D print and Share's More render them (src/shell/tabs).

import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { SavedProject } from '../lib/storage'
import type { Plan } from '../plan/model'
import { fitsBed, type PrintSettings } from '../print/build'
import { LITRE, partGroups, plasticOf, scaleThatFits, scaleUnder, type PartGroup } from '../print/fit'
import { pointAtParts, usePrintHover } from '../print/hover'
import { planPages } from '../share/pages'
import type { Paper } from '../share/plans'
import { Num, Select } from './fields'
import { printReady, save3mf, savePlansPdf, saveProjectFile, saveStls, type DownloadProps, type PdfInput, type PrintState } from './printFiles'
import '../share/share.css'

export type { PrintState }

const SCALES = [50, 75, 100, 150, 200, 250].map(s => ({ id: s, label: `1:${s}` }))
const PAPERS: { id: Paper; label: string }[] = [
  { id: 'A3', label: 'A3 landscape' },
  { id: 'A4', label: 'A4 landscape' },
]

/** Part sizes, all to 0.1 mm so the three in a line read alike. */
const size = (v: number) => v.toFixed(1)

type SetPrint = (patch: Partial<PrintSettings>) => void

const TERRAIN_CHOICES: { id: PrintSettings['terrain']; label: string }[] = [
  { id: 'block', label: 'Whole block' },
  { id: 'house', label: 'Around the house' },
]

export function PrintSettingsFields({ settings, onChange: set }: { settings: PrintSettings; onChange: SetPrint }) {
  return (
    <div className="tool-options">
      <Select label="Scale" value={settings.scale} options={SCALES} onChange={scale => set({ scale })} />
      <div className="print-crop">
        <span className="print-crop-label">Terrain</span>
        <div className="segmented" role="group" aria-label="How much terrain">
          {TERRAIN_CHOICES.map(c => (
            <button key={c.id} className={settings.terrain === c.id ? 'on' : ''} aria-pressed={settings.terrain === c.id} onClick={() => set({ terrain: c.id })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {settings.terrain === 'house' && (
        <Num label="Ground around the house" unit="m" decimals={1} min={1} max={50} value={settings.margin} onCommit={margin => set({ margin })} />
      )}
      <Num label="Printer bed width" unit="mm" decimals={0} min={50} max={2000} value={settings.bedX} onCommit={bedX => set({ bedX })} />
      <Num label="Printer bed depth" unit="mm" decimals={0} min={50} max={2000} value={settings.bedY} onCommit={bedY => set({ bedY })} />
      <label className="check">
        <input type="checkbox" checked={settings.tiles} onChange={e => set({ tiles: e.target.checked })} />
        Cut anything bigger than the bed into pieces that fit
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.hollow} onChange={e => set({ hollow: e.target.checked })} />
        Hollow the terrain underneath, to save plastic
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.furniture} onChange={e => set({ furniture: e.target.checked })} />
        Include furniture
      </label>
      <label className="check">
        <input type="checkbox" checked={!!settings.siteFeatures} onChange={e => set({ siteFeatures: e.target.checked })} />
        Include trees, sheds and fences from Site features
      </label>
    </div>
  )
}

export function FineTuningFields({ settings, onChange: set }: { settings: PrintSettings; onChange: SetPrint }) {
  return (
    <>
      <div className="tool-options">
        <Num label="Thinnest wall or post" unit="mm" decimals={2} min={0.4} max={5} value={settings.minFeature} onCommit={minFeature => set({ minFeature })} />
        <Num label="Gap between parts" unit="mm" decimals={2} min={0} max={1} value={settings.clearance} onCommit={clearance => set({ clearance })} />
        <Num label="Key depth" unit="mm" decimals={2} min={0} max={5} value={settings.key} onCommit={key => set({ key })} />
        <Num label="Base under the lowest ground" unit="mm" decimals={1} min={1} max={20} value={settings.base} onCommit={base => set({ base })} />
      </div>
      <p className="muted small">
        Thin walls are thickened to the thinnest width your printer can manage. Raise the gap if parts are too tight to fit
        together.
      </p>
    </>
  )
}

/** A part's box, to 0.1 mm: "120.0 × 80.0 × 12.5 mm". */
const box = (b: readonly number[]) => `${b.map(size).join(' × ')} mm`

/**
 * The print parts, a row for each part with its pieces under it when it was cut ("Terrain · 4
 * tiles"); pointing at a row lights the part up in the preview. Then the plastic, with a warning
 * and a smaller scale above a litre, the largest scale that prints the terrain in one piece, and
 * what doesn't fit.
 */
export function PrintParts({ print, settings }: { print: PrintState; settings: PrintSettings }) {
  const model = print.model
  const groups = useMemo(() => (model ? partGroups(model) : []), [model])
  const hot = usePrintHover(s => s.ids)
  const [open, setOpen] = useState<string | null>(null)
  if (print.error) return <p className="error">{print.error}</p>
  if (!model) return <p className="muted small">Building the parts…</p>
  const total = plasticOf(model)
  const tooBig = groups.filter(g => !fitsBed(g.biggest[0], g.biggest[1], settings))
  const whole = model.terrainSize ? scaleThatFits(model.terrainSize, settings.scale, settings) : null
  const under = scaleUnder(total, settings.scale)
  const point = (g: PartGroup | null) => pointAtParts(g ? g.ids : [])
  return (
    <>
      <h3>
        Parts{print.busy && <span className="muted"> · updating…</span>}
      </h3>
      <p className="muted small">Sizes are each part’s bounding box: width × depth × height.</p>
      <ul className="parts" onMouseLeave={() => point(null)}>
        {groups.map(g => {
          const cut = g.pieces.length > 0
          const lit = hot.length > 0 && g.ids.every(id => hot.includes(id))
          const row = (
            <>
              <span className={`swatch kind-${g.kind}`} aria-hidden="true" />
              <span className="part-name">
                {g.name}
                {cut && <span className="muted"> · {g.pieces.length} {g.kind === 'terrain' ? 'tiles' : 'pieces'}</span>}
              </span>
              <span className="muted part-size">
                {box(g.size)}
                {cut && <span className="part-each">each up to {size(g.biggest[0])} × {size(g.biggest[1])} mm</span>}
              </span>
            </>
          )
          return (
            <li
              key={g.id}
              className={[tooBig.includes(g) ? 'too-big' : '', lit ? 'hot' : '', cut ? 'part-group' : ''].filter(Boolean).join(' ')}
              onMouseEnter={() => point(g)}
            >
              {cut ? (
                <button aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)} onFocus={() => point(g)} onBlur={() => point(null)}>
                  {row}
                </button>
              ) : (
                row
              )}
              {cut && open === g.id && (
                <ul className="part-pieces">
                  {g.pieces.map(x => (
                    <li key={x.id} onMouseEnter={() => pointAtParts([x.id])} onMouseLeave={() => point(g)}>
                      {x.name}: {box(x.size)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <p className="muted small">About {Math.round(total).toLocaleString('en-AU')} cm³ of plastic if printed solid; far less at normal infill.</p>
      {total > LITRE && (
        <p className="notice small">
          That’s over a litre of plastic.{' '}
          {under ? `At 1:${under} it comes under a litre.` : 'Even the smallest scale takes more than that.'}
          {!settings.hollow ? ' Hollowing the terrain underneath saves a lot.' : ''}
          {settings.terrain === 'block' ? ' So does printing only the ground around the house.' : ''}
        </p>
      )}
      {model.terrainSize && (
        <p className="muted small print-hint">
          {whole === settings.scale
            ? 'The terrain prints in one piece at this scale.'
            : whole
              ? `The largest scale that prints the terrain in one piece on this bed is 1:${whole}.`
              : `The terrain doesn’t fit this bed in one piece at any scale offered${settings.tiles ? ', so it is cut into tiles' : ''}.`}
        </p>
      )}
      {tooBig.length > 0 && (
        <p className="notice small">
          {tooBig.map(x => x.name).join(', ')} {tooBig.length > 1 ? "don't" : "doesn't"} fit a {settings.bedX} × {settings.bedY} mm bed.
          Try a smaller scale{settings.tiles ? '' : ' or cut big parts into pieces'}.
        </p>
      )}
      {model.notes.length > 0 && (
        <ul className="print-notes">
          {model.notes.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Download 3MF and STL, pinned at the foot of the panel so a long parts list never hides them. */
export function PrintDownloads(p: DownloadProps) {
  return (
    <div className="print-foot">
      <Download3mfButton {...p} />
      <DownloadStlsButton {...p} />
      <p className="muted">3MF opens in most slicers with every part named and laid out; the STLs come as a ZIP, one file per part.</p>
    </div>
  )
}

export function Download3mfButton(p: DownloadProps) {
  return (
    <button className="secondary" disabled={!printReady(p.print)} onClick={() => save3mf(p)}>
      Download 3MF
    </button>
  )
}

export function DownloadStlsButton(p: DownloadProps) {
  return (
    <button className="secondary" disabled={!printReady(p.print)} onClick={() => saveStls(p)}>
      Download STLs
    </button>
  )
}

export function PrintInstructions() {
  return (
    <>
      <p className="muted small">
        3MF opens in most slicers (Bambu Studio, PrusaSlicer, Cura) with every part named, coloured and laid out on the bed. The STL
        download is a ZIP with one file per part.
      </p>
      <p className="muted small">
        Print each part the way up it sits, flat side down; nothing needs supports. The lowest floor drops into a shallow pocket in the
        terrain, walls stand a little proud of their floor and drop into slots under the floor or roof above, so you can lift each one
        off to look inside.
      </p>
    </>
  )
}

export function PaperSelect({ paper, onPaper }: { paper: Paper; onPaper: (p: Paper) => void }) {
  return <Select label="Paper" value={paper} options={PAPERS} onChange={onPaper} />
}

export function PdfFurnitureToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      Furniture on the floor plans
    </label>
  )
}


/** What the plan set holds, behind "What's in it". */
export function PlansContents() {
  return (
    <details className="sh-whats">
      <summary>What’s in it</summary>
      <p className="muted small">
        A site plan with boundary distances, key numbers and the site features (with a key, and what to check with council), a floor plan for each level with
        wall lengths, a roof plan, the sections and elevations, and a shadow diagram for 21 June at 9 am, 12 pm and 3 pm, all to a printed scale. The plans
        have a north arrow that follows the view.
      </p>
    </details>
  )
}

/**
 * Share › Plans: the caveat first, the pages as ticks (a page with nothing drawn says so and
 * can't be ticked), then Paper beside Download PDF, and what the set holds behind a fold.
 */
export function PdfPlans(p: PdfInput & { onLeaveOut: (keys: string[]) => void; onPaper: (paper: Paper) => void; furniture: ReactNode }) {
  const [pdfError, setPdfError] = useState<string | null>(null)
  const leaveOut = p.leaveOut ?? []
  const pages = useMemo(() => planPages(p.plan), [p.plan])
  const ticked = pages.filter(x => x.drawn && !leaveOut.includes(x.key)).length
  const tick = (key: string, on: boolean) => p.onLeaveOut(on ? leaveOut.filter(k => k !== key) : [...leaveOut, key])
  const downloadPdf = () => {
    setPdfError(null)
    try {
      savePlansPdf(p)
    } catch (err) {
      setPdfError((err as Error).message || 'The plans could not be drawn.')
    }
  }
  return (
    <>
      <p className="sh-lede">
        <b>Concept plans, not for building or lodging.</b> A set to scale for your builder, designer or a first talk with council.
      </p>
      <fieldset className="pdf-pages">
        <legend>Pages</legend>
        {pages.map(x => (
          <label key={x.key} className={`check${x.drawn ? '' : ' undrawn'}`}>
            <input type="checkbox" checked={x.drawn && !leaveOut.includes(x.key)} disabled={!x.drawn} onChange={e => tick(x.key, e.target.checked)} />
            <span>
              {x.label}
              {!x.drawn && <span className="muted"> (not drawn yet)</span>}
            </span>
          </label>
        ))}
        {p.furniture}
      </fieldset>
      <div className="pdf-go">
        <label className="pdf-paper">
          <span>Paper</span>
          <select value={p.paper} onChange={e => p.onPaper(e.target.value === 'A4' ? 'A4' : 'A3')}>
            {PAPERS.map(x => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary" onClick={downloadPdf} disabled={ticked === 0}>
          Download PDF
        </button>
      </div>
      {pdfError && <p className="error">{pdfError}</p>}
      <PlansContents />
    </>
  )
}


/** Download a project file to send, or open one. */
export function SendProject({ plan, project, onOpenProject, download = true }: { plan: Plan; project: SavedProject; onOpenProject: (file: File) => void; download?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <>
      <p className="sh-lede">
        <b>Only send it to people you’d show the survey to.</b> One file your builder or architect opens here to see exactly what you see.
      </p>
      <details className="sh-whats">
        <summary>What’s in it</summary>
        <p className="muted small">
          The survey, the plan and the site features. Drawings go in only where you ticked that under Site features. A project file you open
          here becomes a new project; this one stays as it is under All projects.
        </p>
      </details>
      <div className="row">
        {download && (
          <button className="secondary" onClick={() => void saveProjectFile(project, plan)}>
            Download project file
          </button>
        )}
        <button className="secondary" onClick={() => fileInput.current?.click()}>
          Open a project file
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onOpenProject(f)
        }}
      />
    </>
  )
}
