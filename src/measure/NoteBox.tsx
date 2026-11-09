// The small box a note is typed in, on the plan: Enter or Done keeps it, Esc drops the change, Delete removes the note.

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Vec2 } from '../lib/geom'
import { deleteNote, NOTE_MAX } from '../plan/notes'
import { usePlan } from '../plan/store'

export interface Editing {
  key: string
  /** The note being changed; null for a new one. */
  id: string | null
  at: Vec2
  text: string
}

export function NoteBox({ edit, at, onText, onDone }: { edit: Editing; at: Vec2; onText: (t: string) => void; onDone: (save: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null)
  // A finger's tap sends its mouse events after the plan has opened this box, and they take the focus
  // away; so a blur in the first moments is taken back rather than treated as the end of typing.
  const openedAt = useRef(0)
  useEffect(() => {
    openedAt.current = performance.now()
    input.current?.focus()
  }, [])
  const blurred = () => {
    if (performance.now() - openedAt.current < 400) setTimeout(() => input.current?.focus(), 0)
    else onDone(true)
  }
  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') onDone(true)
    else if (e.key === 'Escape') onDone(false)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault()
  return (
    <div className="note-box" style={{ left: at[0], top: at[1] }}>
      <input
        ref={input}
        value={edit.text}
        maxLength={NOTE_MAX}
        placeholder="Type a note"
        aria-label="Note text"
        onChange={e => onText(e.target.value)}
        onKeyDown={keys}
        onBlur={blurred}
      />
      <button className="plain small" onMouseDown={keepFocus} onClick={() => onDone(true)}>
        Done
      </button>
      {edit.id !== null && (
        <button
          className="plain small danger"
          onMouseDown={keepFocus}
          onClick={() => {
            const id = edit.id!
            onDone(false)
            usePlan.getState().commit(p => deleteNote(p, id))
          }}
        >
          Delete
        </button>
      )}
    </div>
  )
}
