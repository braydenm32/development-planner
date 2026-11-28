// What only the desktop app shows: where its files go (Share › Export), the slicer prints go to
// (Share › Print), the project files in the projects folder (All projects), and the copy of the
// open project it keeps in that folder as you work. Each renders nothing on the website.

import { useEffect, useRef, useState } from 'react'
import { print3mfFile, printReady, projectFile, type DownloadProps } from '../components/printFiles'
import type { SavedProject } from '../lib/storage'
import { Select } from '../components/fields'
import { usePlan } from '../plan/store'
import { findSlicers, isDesktop, listFiles, pickFile, pickFolder, reveal, type FolderFile, type Slicer } from './bridge'
import { openPathAsNew, saveToFolder, sendToSlicer } from './files'
import { projectsDir, setDesktop, useDesktop } from './settings'
import './desktop.css'

function FolderRow({ label, dir, onPick }: { label: string; dir: string; onPick: (d: string) => void }) {
  return (
    <div className="dk-folder">
      <div className="dk-folder-text">
        <span className="dk-label">{label}</span>
        <code className="dk-path" title={dir}>
          {dir || '…'}
        </code>
      </div>
      <div className="row">
        <button className="secondary" onClick={() => void pickFolder(`Choose the ${label.toLowerCase()}`, dir).then(d => d && onPick(d))}>
          Change…
        </button>
        <button className="secondary" disabled={!dir} onClick={() => void reveal(dir)}>
          Show
        </button>
      </div>
    </div>
  )
}

/** Where the desktop app saves: the projects folder and the exports folder. */
export function DesktopFolders() {
  const s = useDesktop()
  if (!isDesktop()) return null
  return (
    <section className="dk-panel" aria-label="Where files are saved">
      <h3>Where files are saved</h3>
      <p className="muted small">The desktop app saves straight into these folders, with no save box: project files in the first, everything else here (PDFs, DXFs, 3D models, prints) in the second.</p>
      <FolderRow label="Projects folder" dir={s.projectsDir ?? ''} onPick={d => setDesktop({ projectsDir: d })} />
      <FolderRow label="Exports folder" dir={s.exportsDir ?? ''} onPick={d => setDesktop({ exportsDir: d })} />
      <label className="check">
        <input type="checkbox" checked={s.keepCopy} onChange={e => setDesktop({ keepCopy: e.target.checked })} />
        Keep each project’s file in the projects folder up to date as I work
      </label>
      {s.info && <p className="muted small">Contour &amp; Gable for {s.info.os === 'macos' ? 'Mac' : s.info.os === 'windows' ? 'Windows' : 'Linux'}, version {s.info.version}.</p>}
    </section>
  )
}

const APP_FILTER: Record<string, [string, string[]][]> = {
  macos: [['Apps', ['app']]],
  windows: [['Programs', ['exe']]],
  linux: [['Programs', ['*']]],
}

/** Pick the slicer prints go to: one found on this computer, the computer's own app for 3MF, or any other app. */
export function SlicerPicker() {
  const s = useDesktop()
  const [found, setFound] = useState<Slicer[] | null>(null)
  useEffect(() => {
    if (isDesktop()) void findSlicers().then(setFound, () => setFound([]))
  }, [])
  if (!isDesktop()) return null
  const chosen = s.slicer
  const value = chosen === 'default' ? 'default' : chosen ? chosen.path : found?.[0]?.path ?? 'default'
  const options: Slicer[] = [...(found ?? [])]
  if (chosen && chosen !== 'default' && !options.some(o => o.path === chosen.path)) options.push(chosen)
  const other = async () => {
    const path = await pickFile('Choose your slicer', APP_FILTER[s.info?.os ?? 'windows'] ?? [], s.info?.os === 'macos' ? '/Applications' : undefined)
    if (!path) return
    const name = (path.split(/[\\/]/).pop() ?? path).replace(/\.(app|exe|AppImage)$/i, '')
    setDesktop({ slicer: { name, path } })
  }
  return (
    <div className="dk-slicer">
      <Select
        label="Slicer"
        value={value}
        options={[...options.map(o => ({ id: o.path, label: o.name })), { id: 'default', label: 'My computer’s app for 3MF files' }, { id: 'other', label: 'Another app…' }]}
        onChange={v => {
          if (v === 'other') return void other()
          setDesktop({ slicer: v === 'default' ? 'default' : (options.find(o => o.path === v) ?? null) })
        }}
      />
      {found && found.length === 0 && !chosen && <p className="muted small">No slicer found in the usual places. Pick yours with Another app…, or prints open in your computer’s app for 3MF files.</p>}
    </div>
  )
}

/** Open in slicer: the 3MF saved into the exports folder and opened in the slicer, in one go. */
export function SendToSlicerButton(p: DownloadProps) {
  const slicer = useDesktop(s => s.slicer)
  const [busy, setBusy] = useState(false)
  if (!isDesktop()) return null
  const label = slicer && slicer !== 'default' ? `Open in ${slicer.name}` : 'Open in slicer'
  return (
    <button
      className="primary"
      disabled={!printReady(p.print) || busy}
      onClick={() => {
        const f = print3mfFile(p)
        if (!f) return
        setBusy(true)
        void sendToSlicer(f).finally(() => setBusy(false))
      }}
    >
      {busy ? 'Sending…' : label}
    </button>
  )
}

const ago = (ms: number) => new Date(ms).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** The project files in the projects folder, newest first, each one opened with a click (All projects). */
export function FolderProjects() {
  const dir = useDesktop(s => s.projectsDir)
  const [files, setFiles] = useState<FolderFile[] | null>(null)
  useEffect(() => {
    if (!isDesktop() || !dir) return
    let live = true
    const load = () => void listFiles(dir, '.project.json').then(f => live && setFiles(f), () => live && setFiles([]))
    load()
    // Files dropped into the folder (or saved by another window) show up when you come back.
    window.addEventListener('focus', load)
    return () => {
      live = false
      window.removeEventListener('focus', load)
    }
  }, [dir])
  if (!isDesktop() || !files?.length) return null
  return (
    <section className="dk-folder-projects" aria-label="In your projects folder">
      <h2 className="dk-h">In your projects folder</h2>
      <ul>
        {files.map(f => (
          <li key={f.path}>
            <button className="ph-link" onClick={() => void openPathAsNew(f.path)}>
              {f.name.replace(/\.project\.json$/i, '')}
            </button>
            <span className="muted small"> · saved {ago(f.modified)}</span>
          </li>
        ))}
      </ul>
      <button className="ph-link small" onClick={() => void reveal(projectsDir())}>
        Show the folder
      </button>
    </section>
  )
}

/** How long after the last change the project's file is written. */
const KEEP_AFTER_MS = 4000

/** Keeps the open project's file in the projects folder up to date, a few seconds after each change. */
export function ProjectCopyKeeper({ project }: { project: SavedProject | null }) {
  const keep = useDesktop(s => s.keepCopy)
  const plan = usePlan(s => s.plan)
  // The project last seen: opening one (or switching to another) isn't a change to it.
  const seen = useRef<SavedProject | null>(null)
  useEffect(() => {
    if (!isDesktop() || !keep || !project || !plan) return
    if (seen.current !== project) {
      seen.current = project
      return
    }
    const t = setTimeout(() => {
      void projectFile(project, plan).then(f => saveToFolder(f.name, f.data, { quiet: true }))
    }, KEEP_AFTER_MS)
    return () => clearTimeout(t)
  }, [keep, project, plan])
  return null
}
