// Search on the Projects home (LF-31): Ctrl+K works there as the keyboard help says it does, and
// finds a project by its name, with the few commands that need no project open (a new project,
// the example, the guide and the pages about the app).

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildIndex, projectItems, type SearchItem } from '../nav/search'
import { navigate } from '../nav/router'
import { NEW_PROJECT, pageRoute } from '../nav/route'
import type { ActionId } from '../nav/menu'
import { openExample } from '../example/open'
import { openGuide } from '../guide/store'
import { WORDS_ID } from '../guide/sections'
import { useProjects } from '../projects/session'
import { pickFile } from '../safety/store'
import { CommandPalette } from './CommandPalette'
import './shell.css'

/** What can be done from the Projects home, with nothing open. */
const HERE: Partial<Record<ActionId, () => void>> = {
  'new-project': () => navigate(NEW_PROJECT),
  'open-example': () => void openExample(),
  'open-file': () => pickFile('any'),
  guide: () => openGuide(),
  glossary: () => openGuide(WORDS_ID),
  about: () => navigate(pageRoute('about')),
  privacy: () => navigate(pageRoute('privacy')),
  terms: () => navigate(pageRoute('terms')),
  accuracy: () => navigate(pageRoute('accuracy')),
}

/** The commands above, as the menu names them (one row each). */
function commandsHere(): SearchItem[] {
  const seen = new Set<string>()
  return buildIndex([]).filter(i => {
    if (i.kind !== 'command' || !i.action || !HERE[i.action] || seen.has(i.action)) return false
    seen.add(i.action)
    return true
  })
}

export function ProjectsSearch({ onOpen }: { onOpen: (id: string) => void }) {
  const list = useProjects().list
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const rows = useMemo(() => [...projectItems(list.filter(m => !m.archived)), ...commandsHere().map(i => ({ ...i, run: 'now' as const }))], [list])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      // Not over a sheet that is waiting for an answer.
      if (!open && document.querySelector('[aria-modal="true"]')) return
      if (!open) opener.current = document.activeElement as HTMLElement | null
      setOpen(!open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  const act = (item: SearchItem) => {
    if (item.thing?.type === 'project') onOpen(item.thing.id)
    else if (item.action) HERE[item.action]?.()
  }
  return (
    <CommandPalette
      only={rows}
      placeholder="Find a project by its name"
      choose={item => {
        act(item)
        return 'done'
      }}
      run={act}
      onClose={restore => {
        setOpen(false)
        if (restore) opener.current?.focus?.()
      }}
    />
  )
}
