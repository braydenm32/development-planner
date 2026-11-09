// Share's sections: the 3D print settings and parts, the PDF plans, and sending the project
// file. Share › Plans, Send, 3D print and Share's More render them (src/shell/tabs).

import { useRef, useState } from 'react'
import type { SavedProject } from '../lib/storage'
import type { Plan } from '../plan/model'
import { fitsBed, type PrintSettings } from '../print/build'
import type { Paper } from '../share/plans'
import { Num, Select } from './fields'
import { printReady, save3mf, savePlansPdf, saveProjectFile, saveStls, type DownloadProps, type PdfInput, type PrintState } from './printFiles'

export type { PrintState }

const SCALES = [50, 75, 100, 150, 200, 250].map(s => ({ id: s, label: `1:${s}` }))
const PAPERS: { id: Paper; label: string }[] = [
  { id: 'A3', label: 'A3 landscape' },
  { id: 'A4', label: 'A4 landscape' },
]

/** Part sizes, all to 0.1 mm so the three in a line read alike. */
const size = (v: number) => v.toFixed(1)

type SetPrint = (patch: Partial<PrintSettings>) => void

export function PrintSettingsFields({ settings, onChange: set }: { settings: PrintSettings; onChange: SetPrint }) {
  return (
    <div className="tool-options">
      <Select label="Scale" value={settings.scale} options={SCALES} onChange={scale => set({ scale })} />
      <Num label="Printer bed width" unit="mm" decimals={0} min={50} max={2000} value={settings.bedX} onCommit={bedX => set({ bedX })} />
      <Num label="Printer bed depth" unit="mm" decimals={0} min={50} max={2000} value={settings.bedY} onCommit={bedY => set({ bedY })} />
      <label className="check">
        <input type="checkbox" checked={settings.tiles} onChange={e => set({ tiles: e.target.checked })} />
        Cut anything bigger than the bed into pieces that fit
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

/** The print parts: building or updating, each part's size, the plastic, and what doesn't fit. */
export function PrintParts({ print, settings }: { print: PrintState; settings: PrintSettings }) {
  const parts = print.model?.parts ?? []
  const total = parts.reduce((n, x) => n + x.volume, 0)
  const tooBig = parts.filter(x => !fitsBed(x.max[0] - x.min[0], x.max[1] - x.min[1], settings))
  return print.error ? (
    <p className="error">{print.error}</p>
  ) : !print.model ? (
    <p className="muted small">Building the parts…</p>
  ) : (
    <>
      <h3>
        Parts{print.busy && <span className="muted"> · updating…</span>}
      </h3>
      <ul className="parts">
        {parts.map(x => {
          const w = x.max[0] - x.min[0]
          const d = x.max[1] - x.min[1]
          const h = x.max[2] - x.min[2]
          const big = tooBig.includes(x)
          return (
            <li key={x.id} className={big ? 'too-big' : ''}>
              <span className={`swatch kind-${x.kind}`} aria-hidden="true" />
              <span className="part-name">{x.name}</span>
              <span className="muted">
                {size(w)} × {size(d)} × {size(h)} mm
              </span>
            </li>
          )
        })}
      </ul>
      <p className="muted small">About {Math.round(total)} cm³ of plastic if printed solid; far less at normal infill.</p>
      {tooBig.length > 0 && (
        <p className="notice small">
          {tooBig.map(x => x.name).join(', ')} {tooBig.length > 1 ? "don't" : "doesn't"} fit a {settings.bedX} × {settings.bedY} mm bed.
          Try a smaller scale{settings.tiles ? '' : ' or cut big parts into pieces'}.
        </p>
      )}
      {print.model.notes.length > 0 && (
        <ul className="print-notes">
          {print.model.notes.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
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


/** Download PDF, its error, and what the plan set holds. */
export function PdfDownload(p: PdfInput & { note?: boolean }) {
  const [pdfError, setPdfError] = useState<string | null>(null)
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
      <div className="row">
        <button className="secondary" onClick={downloadPdf}>
          Download PDF
        </button>
      </div>
      {pdfError && <p className="error">{pdfError}</p>}
      {p.note !== false && (
        <p className="muted small">
          A site plan with boundary distances, key numbers and the site features (with a key, and what to check with council), a floor
          plan for each level with wall lengths, a roof plan, a shadow diagram for 21 June at 9 am, 12 pm and 3 pm, and the sections and
          elevations, all to a printed scale. The plans have a north arrow that follows the view.
        </p>
      )}
    </>
  )
}


/** Download a project file to send, or open one. */
export function SendProject({ plan, project, onOpenProject, download = true }: { plan: Plan; project: SavedProject; onOpenProject: (file: File) => void; download?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <>
      <p className="muted small">
        Send one project file to your builder or architect. It holds the survey, the plan and the site features, so they open it here and
        see exactly what you see. Drawings go in only where you ticked that under Site features. Only share it with people you'd share the
        survey with.
      </p>
      <p className="muted small">A project file you open here becomes a new project; this one stays as it is under All projects.</p>
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
