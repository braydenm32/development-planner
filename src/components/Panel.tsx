import { useContext, type ReactNode } from 'react'
import { FoldingContext } from './folding'

/** A section whose heading folds it away (each item in an area's More). */
export function Panel({ id, title, className, children }: { id: string; title: ReactNode; className?: string; children: ReactNode }) {
  const { collapsed, toggle } = useContext(FoldingContext)
  const open = !collapsed.includes(id)
  return (
    <section className={`panel${open ? '' : ' folded'}${className ? ` ${className}` : ''}`} data-panel={id}>
      <h2>
        <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => toggle(id)}>
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
