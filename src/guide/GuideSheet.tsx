// The getting-started guide: one sheet over whatever is on screen, in the cloud sheets' calm look.
// A section at a time is what people come for (from a hint on the plan, or ⌘K), so it opens
// scrolled to the one asked for, with the rest a short scroll away. Mounted once, on every screen.

import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { openExample } from '../example/open'
import { Icon } from '../nav/icons'
import { termTitle, TERMS } from './glossary'
import { SECTIONS, WORDS_ID, type Picture } from './sections'
import { closeGuide, useGuide } from './store'
import '../cloud/cloud.css'
import './guide.css'

export function GuideLayer({ example = true }: { example?: boolean }) {
  const open = useGuide(s => s.open)
  return open ? <GuideSheet example={example} /> : null
}

function GuideSheet({ example }: { example: boolean }) {
  const id = useId()
  const at = useGuide(s => s.at)
  const ref = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)

  // Esc closes it, before anything under it hears the key; focus goes back where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeGuide()
    }
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('keydown', esc, true)
      if (before?.isConnected) before.focus?.()
    }
  }, [])

  // Open at the section (or word) asked for.
  useLayoutEffect(() => {
    const box = body.current
    if (!box) return
    const target = at ? box.querySelector<HTMLElement>(`#guide-${CSS.escape(at)}`) : null
    box.scrollTop = target ? target.offsetTop - box.offsetTop - 8 : 0
    if (target) target.classList.add('guide-here')
  }, [at])

  const jump = (to: string) => {
    const box = body.current
    const target = box?.querySelector<HTMLElement>(`#guide-${CSS.escape(to)}`)
    if (box && target) box.scrollTo({ top: target.offsetTop - box.offsetTop - 8, behavior: 'smooth' })
  }

  return (
    <div className="cloud-ui cl-scrim guide-ui" onPointerDown={e => e.target === e.currentTarget && closeGuide()}>
      <div ref={ref} className="cl-sheet guide-sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="cl-head">
          <h2 id={id}>Getting started</h2>
          <button className="cl-x" aria-label="Close" onClick={closeGuide} data-autofocus>
            <Icon name="x" size={18} />
          </button>
        </header>
        <div ref={body} className="cl-body guide-body">
          <p className="guide-lede">
            Contour &amp; Gable lays out a house on a sloping block. Draw the plan on the survey, see it in 3D on the real ground, and watch the cut and fill, the planning checks and a rough cost as you go.
          </p>
          <nav className="guide-toc" aria-label="Sections">
            {SECTIONS.map(s => (
              <button key={s.id} className="guide-pill" onClick={() => jump(s.id)}>
                {s.title}
              </button>
            ))}
            <button className="guide-pill" onClick={() => jump(WORDS_ID)}>
              Words
            </button>
          </nav>
          {example && (
            <p className="guide-try">
              <button
                className="cl-btn"
                onClick={() => {
                  closeGuide()
                  void openExample()
                }}
              >
                <Icon name="cube" size={16} />
                Open an example
              </button>
              <span className="cl-muted">A finished made-up house to look round and change. Your own projects aren’t touched.</span>
            </p>
          )}
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={`guide-${s.id}`} className="guide-section">
              <h3>
                <span className="guide-n">{i + 1}</span>
                {s.title}
              </h3>
              <div className="guide-row">
                <ol className="guide-steps">
                  {s.steps.map(t => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                {s.picture && <GuidePicture name={s.picture} />}
              </div>
            </section>
          ))}
          <section id={`guide-${WORDS_ID}`} className="guide-section">
            <h3>Words you’ll see</h3>
            <p className="cl-muted">Words with a dotted line under them in the app show what they mean when you point at them or tap them.</p>
            <dl className="guide-words">
              {TERMS.map(t => (
                <div key={t.id} id={`guide-term-${t.id}`} className="guide-word">
                  <dt>{termTitle(t)}</dt>
                  <dd>{t.says}</dd>
                </div>
              ))}
            </dl>
          </section>
          <p className="cl-muted guide-foot">
            Something unclear or missing? Write to <a href="mailto:hello@contourandgable.com">hello@contourandgable.com</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Small line drawings, one for each step that has a shape to it. */
function GuidePicture({ name }: { name: Picture }) {
  return (
    <svg className="guide-pic" viewBox="0 0 96 64" aria-hidden="true">
      {PICTURES[name]}
    </svg>
  )
}

const PICTURES: Record<Picture, React.ReactNode> = {
  block: (
    <>
      <path className="gp-line" d="M10 14 L84 8 L88 56 L8 58 Z" />
      <path className="gp-soft" d="M8 24 C30 20 60 26 86 18 M8 36 C34 32 58 38 87 30 M8 48 C30 44 62 50 88 43" />
      <circle className="gp-dot" cx="30" cy="30" r="1.8" />
      <circle className="gp-dot" cx="62" cy="44" r="1.8" />
    </>
  ),
  walls: (
    <>
      <path className="gp-wall" d="M18 50 L18 14 L70 14 L70 50 L40 50" />
      <path className="gp-dash" d="M40 50 L18 50" />
      {[
        [18, 50],
        [18, 14],
        [70, 14],
        [70, 50],
        [40, 50],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} className="gp-corner" x={x - 3} y={y - 3} width="6" height="6" />
      ))}
      <path className="gp-accent" d="M14 54 l4 -4 l4 4" />
    </>
  ),
  rooms: (
    <>
      <path className="gp-wall" d="M12 10 H84 V54 H12 Z M48 10 V54" />
      <text className="gp-text" x="30" y="35" textAnchor="middle">
        Bed
      </text>
      <text className="gp-text" x="66" y="35" textAnchor="middle">
        Living
      </text>
    </>
  ),
  openings: (
    <>
      <path className="gp-wall" d="M8 40 H38 M60 40 H88" />
      <path className="gp-line" d="M38 40 V18" />
      <path className="gp-soft" d="M38 18 A22 22 0 0 1 60 40" />
      <path className="gp-wall" d="M68 40 H84" />
      <path className="gp-line" d="M68 37 H84 M68 43 H84" />
    </>
  ),
  levels: (
    <>
      <path className="gp-ground" d="M4 58 L92 34" />
      <path className="gp-line" d="M14 55 V28 H46 V47 M46 38 V18 H82 V38" />
      <path className="gp-accent" d="M46 47 H52 M46 42 H52 V38" />
    </>
  ),
  roof: (
    <>
      <path className="gp-line" d="M14 50 V30 H82 V50" />
      <path className="gp-wall" d="M8 32 L30 14 H66 L88 32" />
      <path className="gp-soft" d="M30 14 L48 24 L66 14" />
    </>
  ),
  earthworks: (
    <>
      <path className="gp-ground-dash" d="M4 58 L92 26" />
      <path className="gp-cut" d="M50 41.6 L92 26 V40 H50 Z" />
      <path className="gp-fill" d="M4 58 L50 41.6 V40 H20 Z" />
      <path className="gp-line" d="M20 40 H92" />
      <path className="gp-line" d="M30 40 V22 H70 V40" />
    </>
  ),
  checks: (
    <>
      {[16, 32, 48].map(y => (
        <g key={y}>
          <path className="gp-accent" d={`M12 ${y} l4 4 l8 -8`} />
          <path className="gp-soft" d={`M32 ${y} H84`} />
        </g>
      ))}
    </>
  ),
}
