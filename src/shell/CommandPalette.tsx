// ⌘K (Ctrl+K) search: every area, tab, More item, command and feature by its name and plain
// words. Choosing one goes to its home; an action like Balance or Download PDF is offered to
// run there. Arrow keys move, Enter chooses, ⌘/Ctrl+Enter runs straight away, Esc closes.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Icon } from '../nav/icons'
import { shortcutText } from '../nav/keys'
import { buildIndex, search, suggestions, type Feature, type SearchItem } from '../nav/search'

let loaded: Feature[] | null = null

/** The feature list, loaded the first time search opens. */
function useFeatures(): Feature[] | null {
  const [features, setFeatures] = useState(loaded)
  useEffect(() => {
    if (loaded) return
    let live = true
    import('../nav/features.json').then(m => {
      loaded = (m.default as Feature[]).map(f => ({ id: f.id, name: f.name }))
      if (live) setFeatures(loaded)
    })
    return () => {
      live = false
    }
  }, [])
  return features
}

const KIND_LABEL: Record<SearchItem['kind'], string> = { area: 'Area', tab: 'Tab', more: 'More', command: 'Command', feature: 'Feature', term: 'Word' }

export type Choice = 'done' | 'offer'

interface Props {
  /** Go to the item's home, or run it. `direct` runs an action without offering first. */
  choose: (item: SearchItem, direct: boolean) => Choice
  run: (item: SearchItem) => void
  /** Close; `restore` gives focus back to where it was. */
  onClose: (restore: boolean) => void
}

export function CommandPalette({ choose, run, onClose }: Props) {
  const features = useFeatures()
  const index = useMemo(() => buildIndex(features ?? []), [features])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [offer, setOffer] = useState<SearchItem | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const runButton = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const results = useMemo(() => (query.trim() ? search(index, query) : suggestions(index)), [index, query])
  const current = Math.min(active, results.length - 1)

  useEffect(() => {
    if (offer) runButton.current?.focus()
    else input.current?.focus()
  }, [offer])

  useEffect(() => {
    list.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const pick = (item: SearchItem | undefined, direct = false) => {
    if (!item) return
    if (choose(item, direct) === 'offer') setOffer(item)
    else onClose(false)
  }

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose(true)
      return
    }
    if (offer) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = results.length
      if (n) setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + n) % n)
    } else if (e.key === 'Home' && e.ctrlKey) {
      setActive(0)
    } else if (e.key === 'End' && e.ctrlKey) {
      setActive(results.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[current], e.metaKey || e.ctrlKey)
    }
  }

  if (offer) return <PaletteOffer item={offer} run={run} onClose={onClose} onKeyDown={onKey} runButton={runButton} />

  return (
    <div className="palette-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose(true)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKey}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={results.length ? `${id}-${current}` : undefined}
            aria-autocomplete="list"
            placeholder="Search areas, tabs, features and commands"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
          <kbd className="desk-only">Esc</kbd>
          {/* A phone has no Esc key: the sheet needs a way out of its own. */}
          <button type="button" className="palette-close phone-only" onClick={() => onClose(true)}>
            Close
          </button>
        </div>
        <ul ref={list} id={`${id}-list`} className="palette-list" role="listbox" aria-label={query ? 'Results' : 'Areas and tabs'}>
          {results.length === 0 && <li className="palette-empty muted">Nothing matches “{query}”.</li>}
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === current}
              className={`${i === current ? 'on' : ''}${r.kind === 'feature' ? ' pi-feature' : ''}`}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={e => pick(r, e.metaKey || e.ctrlKey)}
            >
              <span className="pi-icon">{r.entry.icon && r.kind !== 'feature' ? <Icon name={r.entry.icon} size={16} /> : <i className="pi-dot" />}</span>
              <span className="pi-text">
                <span className="pi-label">{r.label}</span>
                <span className="pi-where">{r.kind === 'area' ? 'Area' : r.where}</span>
              </span>
              {r.shortcut && <kbd>{shortcutText(r.shortcut)}</kbd>}
              {r.action && r.kind !== 'feature' && r.kind !== 'term' ? <span className="pi-kind run">{r.run === 'offer' ? 'Go and run' : 'Run'}</span> : <span className="pi-kind">{KIND_LABEL[r.kind]}</span>}
            </li>
          ))}
        </ul>
        <div className="palette-foot muted">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> go
          </span>
          <span>
            <kbd>{shortcutText('mod+↵')}</kbd> run now
          </span>
        </div>
      </div>
    </div>
  )
}

interface OfferProps {
  item: SearchItem
  run: (item: SearchItem) => void
  onClose: (restore: boolean) => void
  onKeyDown?: (e: KeyboardEvent) => void
  runButton?: Ref<HTMLButtonElement>
}

/**
 * The offer to run an action, once search has gone to its home: a small card over that place,
 * not over the whole page. On a phone search fills the screen, so the offer drops to a bar
 * along the bottom with the place it means showing above it (shell.css, `.offering`).
 */
export function PaletteOffer({ item, run, onClose, onKeyDown, runButton }: OfferProps) {
  return (
    <div className="palette-backdrop offering" onMouseDown={e => e.target === e.currentTarget && onClose(true)}>
      <div className="palette offering" role="dialog" aria-modal="true" aria-label={`Run ${item.entry.label}?`} onKeyDown={onKeyDown}>
        <div className="palette-offer">
          <p>
            <b>{item.entry.label}</b>
            <span className="muted"> · {item.where}</span>
          </p>
          <p className="muted">It’s here now. Run it?</p>
          <div className="row">
            <button
              ref={runButton}
              className="primary"
              onClick={() => {
                run(item)
                onClose(true)
              }}
            >
              Run now
            </button>
            <button className="plain" onClick={() => onClose(true)}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
