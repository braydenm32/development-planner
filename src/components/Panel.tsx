import { useContext, type ReactNode } from 'react'
import { FoldingContext, foldKey, isUnfolded } from './folding'

/** A section whose heading folds it away (each item in an area's More). `startsOpen` false keeps it folded until it's opened. */
export function Panel({ id, title, className, children, startsOpen = true }: { id: string; title: ReactNode; className?: string; children: ReactNode; startsOpen?: boolean }) {
  const { collapsed, toggle } = useContext(FoldingContext)
  const open = isUnfolded(collapsed, id, startsOpen)
  return (
    <section className={`panel${open ? '' : ' folded'}${className ? ` ${className}` : ''}`} data-panel={id}>
      <h2>
        <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => toggle(foldKey(id, startsOpen))}>
          <span>{title}</span>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>
      </h2>
      {open && children}
    </section>
  )
}
