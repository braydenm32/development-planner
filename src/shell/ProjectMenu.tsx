// The project menu at the right of the top bar: the projects home, the project's name and
// survey, and its files. Rendered from the menu config.

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CloudMenuItem } from '../cloud/CloudCard'
import { TextField } from '../components/fields'
import { Icon } from '../nav/icons'
import { HOMES, type ActionId } from '../nav/menu'
import { usePlan } from '../plan/store'
import { projectTitle } from '../share/project'
import { useShell } from './context'

const ITEMS = HOMES.find(h => h.id === 'project-menu')!.items

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** An item to focus when the menu opens (from ⌘K). */
  focusItem: string | null
  run: (a: ActionId) => void
}

export function ProjectMenu({ open, onOpenChange, focusItem, run }: Props) {
  const { project } = useShell()
  const plan = usePlan(s => s.plan)
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const title = plan ? projectTitle(plan) : project.fileName

  // Focus the asked-for item, or the first, when the menu opens; close on a click outside.
  useEffect(() => {
    if (!open) return
    const el = pop.current
    const target = (focusItem && el?.querySelector<HTMLElement>(`[data-item="${focusItem}"]`)) || el?.querySelector<HTMLElement>('[data-item]')
    const focusable = target?.matches('button, input') ? target : target?.querySelector<HTMLElement>('input, button')
    focusable?.focus()
    if (focusItem) target?.classList.add('flash')
    const away = (e: PointerEvent) => {
      if (!el?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) onOpenChange(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open, focusItem, onOpenChange])

  const close = () => {
    onOpenChange(false)
    button.current?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const items = [...(pop.current?.querySelectorAll<HTMLElement>('button[data-item], [data-item] input') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
    next?.focus()
    e.preventDefault()
  }

  return (
    <div className="project-menu">
      <button
        ref={button}
        className="project-button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        title="Project menu"
      >
        <span className="project-title">{title}</span>
        <Icon name="chevD" size={14} />
      </button>
      {open && (
        <div ref={pop} className="menu-pop" role="dialog" aria-label="Project" onKeyDown={onKey}>
          {ITEMS.map(item => {
            if (item.id === 'project-name')
              return plan ? (
                <div key={item.id} data-item={item.id} className="menu-field">
                  <TextField label="Project name" value={projectTitle(plan)} onCommit={name => usePlan.getState().commit(pl => ({ ...pl, name }))} />
                </div>
              ) : null
            if (item.id === 'survey-file')
              return (
                <div key={item.id} data-item={item.id} className="menu-note">
                  <span className="muted">Survey</span>
                  <span className="file-name" title={project.fileName}>
                    {project.fileName}
                  </span>
                </div>
              )
            if (item.id === 'cloud')
              return (
                <CloudMenuItem
                  key={item.id}
                  onRun={() => {
                    onOpenChange(false)
                    run('cloud')
                  }}
                />
              )
            const danger = item.id === 'new-plan' || item.id === 'replace-survey'
            return (
              <button
                key={item.id}
                data-item={item.id}
                className={`menu-item${danger ? ' danger' : ''}`}
                onClick={() => {
                  onOpenChange(false)
                  if (item.action) run(item.action)
                }}
              >
                {item.icon && <Icon name={item.icon} size={16} />}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
