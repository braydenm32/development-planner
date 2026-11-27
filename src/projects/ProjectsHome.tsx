import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CloudCard, CloudMark } from '../cloud/CloudCard'
import { useInCloud } from '../cloud/state'
import { openExample } from '../example/open'
import { saveFile } from '../lib/download'
import { LegalFooter } from '../legal/LegalFooter'
import '../legal/legal.css'
import { focusSoon, useModal } from '../nav/useModal'
import type { SavedProject } from '../lib/storage'
import type { Plan } from '../plan/model'
import { fileSafe } from '../print/export'
import { projectFileText } from '../share/project'
import { deleteWithUndo, duplicateWithUndo, openFile as openAnyFile } from '../safety/flows'
import { ACCEPT, showToast } from '../safety/store'
import { projectSiteFromRecords } from '../site/store'
import { costsFromRecords } from '../costs/persist'
import { mapFromRecords } from '../map/store'
import { findProjects, FIND_FROM, readSort, writeSort, type ProjectSort } from './find'
import { daFromRecords } from '../da/details'
import { edited } from './format'
import { describeContents, NAME_MAX } from './ops'
import { useProjects } from './session'
import type { ProjectMeta, ProjectThumbnail } from './types'
// IBM Plex Sans, self-hosted: the same files the app's frame loads, so there is one copy.
import '../shell/fonts.css'
import './projects.css'

interface Props {
  /** Inside the app's frame, which brings its own top bar: no logo bar here, the actions sit by the heading. */
  inShell?: boolean
  /** Show archived projects instead of active ones (`#/projects/archived`). */
  archived: boolean
  onFilterChange: (archived: boolean) => void
  /** After a project has been opened (or made from a file). */
  onOpen: (id: string) => void
  /** Start a new project: the start screen, scoped to it (`#/projects/new`). */
  onNew: () => void
}

// ---------------------------------------------------------------------------
// Small pieces.

const ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M14.5 6 8.5 12l6 6" />,
  file: (
    <>
      <path d="M6.5 3.5H14l4 4v13H6.5z" />
      <path d="M14 3.5v4h4" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  pencil: (
    <>
      <path d="M4.5 19.5l1-4.2L16 4.8l3.2 3.2L8.7 18.5z" />
      <path d="m13.8 7 3.2 3.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1" />
      <path d="M15.5 8.5v-4h-11v11h4" />
    </>
  ),
  archive: (
    <>
      <path d="M3.5 5h17v4h-17z" />
      <path d="M5 9v10.5h14V9" />
      <path d="M10 13h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.8 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </>
  ),
  restore: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.2 4.5v4.2h4.2" />
    </>
  ),
  arrowR: <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 4.4 4.4" />
    </>
  ),
  bin: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" />
      <path d="M10 10.5v5.5M14 10.5v5.5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.2 20 7.6v8.8L12 20.8l-8-4.4V7.6z" />
      <path d="m4 7.6 8 4.4 8-4.4M12 12v8.8" />
    </>
  ),
}

function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="ph-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

/** The drafted mark: a gable roof over two contour lines. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg className="ph-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.4 11.4 12 4l8.6 7.4" stroke="#16181b" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 15.6c2.9-1.7 5.9 1.4 9.2 0 3.3-1.4 6.2-1.5 9.2 0" stroke="#2346d0" strokeWidth={2} strokeLinecap="round" />
      <path d="M2.8 20c2.9-1.7 5.9 1.4 9.2 0 3.3-1.4 6.2-1.5 9.2 0" stroke="#8da0e6" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function Thumb({ t }: { t: ProjectThumbnail | null }) {
  if (!t)
    return (
      <span className="ph-thumb-empty">
        <svg viewBox="0 0 100 64" aria-hidden="true">
          <rect x="22" y="10" width="56" height="44" />
        </svg>
        <span>No survey yet</span>
      </span>
    )
  return (
    <svg viewBox={t.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="ph-block" d={t.block} />
      {t.house && <path className="ph-house" d={t.house} />}
    </svg>
  )
}

/** The card's one quiet line of numbers, rounded as the app's own panels round them. */
function Numbers({ m }: { m: ProjectMeta }) {
  const { siteArea, floorArea, ffl } = m.numbers
  const parts: ReactNode[] = []
  if (siteArea != null)
    parts.push(
      <span key="site">
        Site <b>{siteArea.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} m²</b>
      </span>,
    )
  if (floorArea)
    parts.push(
      <span key="floor">
        Floor <b>{floorArea.toFixed(2)} m²</b>
      </span>,
    )
  if (ffl != null && floorArea)
    parts.push(
      <span key="ffl">
        FFL <b>RL {ffl.toFixed(2)}</b>
      </span>,
    )
  if (!parts.length) return <p className="ph-numbers muted">{m.surveyFileName ? 'No house drawn yet' : 'Import the survey to begin'}</p>
  return <p className="ph-numbers">{parts}</p>
}

async function downloadProject(m: ProjectMeta, read: (id: string) => Promise<Record<string, unknown> | null>) {
  const r = await read(m.id)
  const survey = r?.survey as SavedProject | undefined
  const plan = r?.plan as Plan | undefined
  if (!survey || !plan) throw new Error('This project has no survey and plan to put in a file yet.')
  saveFile(`${fileSafe(m.name)}.project.json`, projectFileText(survey, { ...plan, name: m.name }, projectSiteFromRecords(r), costsFromRecords(r), r?.options, mapFromRecords(r), daFromRecords(r)), 'application/json')
}

// ---------------------------------------------------------------------------

/**
 * The Projects home: every project saved in this browser, as cards, with New, Open, Duplicate,
 * Rename, Archive and Delete. Deleting, from a card's ⋯ menu or from Archived, comes after a
 * review of what goes, with Undo. More than a handful of projects get a name filter and an order.
 */
export function ProjectsHome(props: Props) {
  const p = useProjects()
  const { archived, onFilterChange: setArchived, onOpen, onNew } = props

  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [review, setReview] = useState<{ meta: ProjectMeta; lines: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>(readSort)

  const active = p.list.filter(m => !m.archived)
  const tucked = p.list.filter(m => m.archived)
  const all = archived ? tucked : active
  // Finding one by name, and the order, once there are more than a handful (or while a search or
  // an order other than the usual is on, so deleting one doesn't take the controls away mid-use).
  const finding = all.length >= FIND_FROM || query.trim() !== '' || (sort !== 'recent' && all.length > 1)
  const shown = finding ? findProjects(all, query, sort) : all
  // The project open now: the home is the same page with or without one, with a way back to it.
  const current = active.find(m => m.id === p.currentId && p.opened)

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    setMenu(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const open = (id: string) =>
    act(async () => {
      setBusy(true)
      try {
        if (id !== p.currentId || !p.opened) await p.open(id)
        onOpen(id)
      } finally {
        setBusy(false)
      }
    })

  // A project file, a survey or a plan: each opens as a new project (a project file after a
  // light review), and the app goes to it. Undo is on the toast that follows.
  const openFile = (f: File) => act(() => openAnyFile(f, { into: 'new' }))

  /** A card is about to leave the list: focus goes to the one that takes its place (else the page), not the page body. */
  const focusAfter = (id: string) => {
    const i = shown.findIndex(m => m.id === id)
    const next = shown[i + 1] ?? shown[i - 1]
    focusSoon(...(next ? [`[data-card="${next.id}"] button`] : []))
  }

  // Archive, with Undo: it comes back, and opens again if it was the one open.
  const archiveOne = (m: ProjectMeta) =>
    act(async () => {
      const wasOpen = m.id === p.currentId
      await p.archive(m.id)
      focusAfter(m.id)
      showToast({
        text: `Archived “${m.name}”.`,
        undo: async () => {
          await p.restore(m.id)
          if (wasOpen) await p.open(m.id)
        },
      })
    })

  // Delete for good, from a card's menu or from Archived: gone from the list now, with Undo on the toast.
  const deleteOne = (m: ProjectMeta) =>
    act(async () => {
      await deleteWithUndo(m)
      setReview(null)
      focusAfter(m.id)
    })

  // With nothing to show, the empty state carries the one next step instead.
  const actions = (
    <div className="ph-top-actions" hidden={p.ready && !archived && active.length === 0}>
      <button className="ph-btn" onClick={() => void openExample()} title="A project with a finished made-up house in it, to look round and change. The one you already have opens again.">
        <Icon name="cube" size={16} />
        <span className="ph-long">Open an example</span>
        <span className="ph-short">Example</span>
      </button>
      <button className="ph-btn" onClick={() => fileInput.current?.click()} title="A project file, a saved plan, or a survey (DXF)">
        <Icon name="file" size={16} />
        <span className="ph-long">Open a file</span>
        <span className="ph-short">Open file</span>
      </button>
      <button className="ph-btn primary" onClick={onNew}>
        <Icon name="plus" size={16} />
        <span className="ph-long">New project</span>
        <span className="ph-short">New</span>
      </button>
    </div>
  )
  // The app's frame has its own <main>.
  const Main = props.inShell ? 'div' : 'main'

  return (
    <div className={`projects-home${props.inShell ? ' in-shell' : ''}`} aria-busy={busy || !p.ready}>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT.any}
        hidden
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void openFile(f)
        }}
      />
      {!props.inShell && (
        <header className="ph-top">
          <div className="ph-brand">
            <Logo />
            <span>Contour &amp; Gable</span>
          </div>
          {actions}
        </header>
      )}

      <Main className="ph-main">
        {current && !props.inShell && (
          <button className="ph-back" onClick={() => void open(current.id)}>
            <Icon name="back" size={16} />
            Back to {current.name}
          </button>
        )}
        <div className="ph-head">
          <h1>Projects</h1>
          {(tucked.length > 0 || archived) && (
            <div className="ph-seg" role="group" aria-label="Show">
              <button aria-pressed={!archived} className={archived ? '' : 'on'} onClick={() => setArchived(false)}>
                Active <span className="ph-count">{active.length}</span>
              </button>
              <button aria-pressed={archived} className={archived ? 'on' : ''} onClick={() => setArchived(true)}>
                Archived <span className="ph-count">{tucked.length}</span>
              </button>
            </div>
          )}
          {props.inShell && actions}
        </div>

        {p.memoryOnly && (
          <p className="ph-note warn" role="status">
            This browser isn’t letting the planner save, so projects last only until this tab closes. Download a project file to keep your work.
          </p>
        )}
        {p.saveError && !p.memoryOnly && (
          <p className="ph-note warn" role="status">
            The last change didn’t save ({p.saveError}). It’s kept and will be tried again with the next one.
          </p>
        )}
        {error && (
          <p className="ph-note error" role="alert">
            {error}
          </p>
        )}
        {/* Sign in to save to the cloud, or how saving is going (src/cloud). */}
        {p.ready && !archived && <CloudCard />}

        {p.ready && finding && (
          <div className="ph-find" role="search">
            <label className="ph-find-box">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Find a project" aria-label="Find a project by its name or survey file" value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            {query.trim() !== '' && (
              <span className="ph-find-count" role="status">
                {shown.length} of {all.length}
              </span>
            )}
            <label className="ph-sort">
              <span>Sort</span>
              <select
                aria-label="Sort projects"
                value={sort}
                onChange={e => {
                  const next: ProjectSort = e.target.value === 'name' ? 'name' : 'recent'
                  setSort(next)
                  writeSort(next)
                }}
              >
                <option value="recent">Last edited</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        )}

        {!p.ready ? (
          <div className="ph-grid" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="ph-card skeleton">
                <div className="ph-thumb" />
                <div className="ph-body">
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 && all.length > 0 ? (
          <div className="ph-empty">
            <h2>No project matches “{query.trim()}”</h2>
            <p>The search looks at project names and survey file names.</p>
            <button className="ph-btn" onClick={() => setQuery('')}>
              Show all {all.length} projects
            </button>
          </div>
        ) : shown.length === 0 ? (
          archived ? (
            <div className="ph-empty">
              <h2>Nothing archived</h2>
              <p>Archive a project from its ⋯ menu to tuck it away. It stays here, and you can restore it any time.</p>
              <button className="ph-btn" onClick={() => setArchived(false)}>
                Back to active projects
              </button>
            </div>
          ) : (
            <div className="ph-empty">
              <svg className="ph-empty-art" viewBox="0 0 120 80" aria-hidden="true">
                <path className="ph-block" d="M14 12 102 6 110 70 20 74Z" />
                <path className="ph-house" d="M46 30h30v22H46z" />
              </svg>
              <h2>{tucked.length ? 'No active projects' : 'Start your first project'}</h2>
              <p>Bring in your block’s survey (DXF), or sketch the block until it comes, and draw the house on it. Everything saves in this browser as you go.</p>
              <button className="ph-btn primary big" onClick={onNew}>
                <Icon name="plus" size={16} />
                New project
              </button>
              <p className="ph-empty-alt">
                Want to see one finished first?{' '}
                <button className="ph-link" onClick={() => void openExample()}>
                  Open an example
                </button>
              </p>
              <p className="ph-empty-alt">
                Someone sent you a project file?{' '}
                <button className="ph-link" onClick={() => fileInput.current?.click()}>
                  Open it
                </button>
                {tucked.length > 0 && (
                  <>
                    {' · '}
                    <button className="ph-link" onClick={() => setArchived(true)}>
                      {tucked.length} archived
                    </button>
                  </>
                )}
              </p>
            </div>
          )
        ) : (
          <ul className="ph-grid">
            {shown.map(m => (
              <li key={m.id} data-card={m.id} className={`ph-card${m.id === p.currentId ? ' current' : ''}`}>
                {m.archived ? (
                  <div className="ph-thumb">
                    <Thumb t={m.thumbnail} />
                  </div>
                ) : (
                  <button className="ph-thumb" onClick={() => void open(m.id)} aria-label={`Open ${m.name}`}>
                    <Thumb t={m.thumbnail} />
                  </button>
                )}
                <div className="ph-body">
                  <div className="ph-title-row">
                    {renaming === m.id ? (
                      <RenameField
                        name={m.name}
                        onDone={name => {
                          setRenaming(null)
                          if (name !== null && name.trim() && name.trim() !== m.name) void act(() => p.rename(m.id, name))
                        }}
                      />
                    ) : (
                      <h2 className="ph-name" onDoubleClick={() => setRenaming(m.id)}>
                        {m.name}
                      </h2>
                    )}
                    {!m.archived && (
                      <div className="ph-menu-wrap">
                        <button className="ph-icon-btn" aria-label={`More for ${m.name}`} aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}>
                          <Icon name="more" />
                        </button>
                        {menu === m.id && (
                          <Menu onClose={() => setMenu(null)}>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setMenu(null)
                                setRenaming(m.id)
                              }}
                            >
                              <Icon name="pencil" size={16} /> Rename
                            </button>
                            <button
                              role="menuitem"
                              onClick={() =>
                                act(async () => {
                                  const copy = await duplicateWithUndo(m.id)
                                  setRenaming(copy.id)
                                })
                              }
                            >
                              <Icon name="copy" size={16} /> Duplicate
                            </button>
                            <button role="menuitem" onClick={() => act(() => downloadProject(m, p.read))}>
                              <Icon name="download" size={16} /> Download project file
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => void archiveOne(m)}
                            >
                              <Icon name="archive" size={16} /> Archive
                            </button>
                            <button role="menuitem" className="danger" onClick={() => act(async () => setReview({ meta: m, lines: describeContents(m, await p.read(m.id)) }))}>
                              <Icon name="bin" size={16} /> Delete…
                            </button>
                          </Menu>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="ph-when">
                    {m.id === p.currentId && <span className="ph-current">Open now</span>}
                    <span>Edited {edited(m.updated)}</span>
                    <CloudMark id={m.id} />
                  </p>
                  {/* The file name on a line of its own: a long one never wraps after a lone "·". */}
                  {m.surveyFileName && (
                    <p className="ph-file" title={m.surveyFileName}>
                      {m.surveyFileName}
                    </p>
                  )}
                  <Numbers m={m} />
                  <div className="ph-card-actions">
                    {m.archived ? (
                      <>
                        <button
                          className="ph-btn"
                          onClick={() =>
                            act(async () => {
                              await p.restore(m.id)
                              focusAfter(m.id)
                              showToast({ text: `Restored “${m.name}” to your projects.`, undo: () => p.archive(m.id) })
                            })
                          }
                        >
                          <Icon name="restore" size={16} /> Restore
                        </button>
                        <button
                          className="ph-link danger"
                          onClick={() => act(async () => setReview({ meta: m, lines: describeContents(m, await p.read(m.id)) }))}
                        >
                          Delete for good…
                        </button>
                      </>
                    ) : (
                      <button className="ph-btn" onClick={() => void open(m.id)}>
                        Open <Icon name="arrowR" size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Main>
      <LegalFooter />

      {review && (
        <DeleteReview
          meta={review.meta}
          lines={review.lines}
          onDownload={() => act(() => downloadProject(review.meta, p.read))}
          onCancel={() => setReview(null)}
          onDelete={() => void deleteOne(review.meta)}
        />
      )}
    </div>
  )
}

function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(name)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      ref={ref}
      className="ph-rename"
      aria-label="Project name"
      maxLength={NAME_MAX}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={e => {
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
    />
  )
}

function Menu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })
  // Its ⋯ button, which gets focus back when the menu closes.
  const trigger = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    trigger.current = ref.current?.parentElement?.querySelector<HTMLElement>('button') ?? null
  }, [])
  // Focus starts on the first item and Tab stays in the menu; Esc closes it (src/nav/useModal.ts).
  useModal(ref, true, () => close.current(), { returnTo: trigger })
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) close.current()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [])
  return (
    <div ref={ref} className="ph-menu" role="menu">
      {children}
    </div>
  )
}

function DeleteReview(p: { meta: ProjectMeta; lines: string[]; onDownload: () => void; onCancel: () => void; onDelete: () => void }) {
  const inCloud = useInCloud(p.meta.id)
  const cancel = useRef(p.onCancel)
  useLayoutEffect(() => {
    cancel.current = p.onCancel
  })
  const box = useRef<HTMLDivElement>(null)
  // Focus starts on Keep it and Tab stays in the dialog; Esc keeps the project (src/nav/useModal.ts).
  useModal(box, true, () => cancel.current())
  return (
    <div className="ph-scrim" onPointerDown={e => e.target === e.currentTarget && p.onCancel()}>
      <div ref={box} className="ph-dialog" role="dialog" aria-modal="true" aria-labelledby="ph-review-title">
        <h2 id="ph-review-title">Delete “{p.meta.name}” for good?</h2>
        <p>
          {inCloud ? 'This removes it from this browser and from the cloud, so from your other devices too.' : 'This removes it from this browser.'} Undo brings it back for a few
          seconds after; then it’s gone. You’ll lose:
        </p>
        <ul>
          {p.lines.map(l => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="muted">Want a copy first? A project file holds the survey and the plan, and opens here again any time.</p>
        <div className="ph-dialog-actions">
          <button className="ph-btn ph-a-dl" onClick={p.onDownload}>
            <Icon name="download" size={16} /> Download project file
          </button>
          <span className="ph-grow" />
          <button className="ph-btn ph-a-keep" onClick={p.onCancel} data-autofocus>
            Keep it
          </button>
          <button className="ph-btn danger ph-a-del" onClick={p.onDelete}>
            Delete for good
          </button>
        </div>
      </div>
    </div>
  )
}
