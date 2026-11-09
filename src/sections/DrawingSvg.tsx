// A section or elevation on screen: laid out for the width it has (so labels stay their size),
// drawn as SVG by paint.ts, styled by sections.css in the plan's drafting look.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { textWidth } from '../share/pdfWriter'
import type { Pt } from './common'
import { drawingSize, fitScale, paintDrawing, type Drawing, type Painter } from './paint'
import './sections.css'

/** IBM Plex Sans runs a little wider than the Helvetica the PDF writer measures. */
const PLEX = 1.07

const d = (pts: Pt[], close: boolean) => `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}${close ? 'Z' : ''}`

/** A Painter that collects SVG elements. */
function svgPainter(compact: boolean): Painter & { els: ReactNode[] } {
  const els: ReactNode[] = []
  return {
    els,
    size: compact ? { title: 12, label: 10.5, small: 9.5 } : { title: 14, label: 11.5, small: 10.5 },
    unit: 1,
    shape(pts, style) {
      if (pts.length > 2) els.push(<path key={els.length} className={`sec-s sec-${style}`} d={d(pts, true)} />)
    },
    line(pts, style) {
      if (pts.length > 1) els.push(<path key={els.length} className={`sec-l sec-l-${style}`} d={d(pts, false)} />)
    },
    text(x, y, s, o) {
      els.push(
        <text
          key={els.length}
          className={`sec-t sec-t-${o.ink ?? 'ink'}${o.bold ? ' bold' : ''}`}
          x={x.toFixed(1)}
          y={y.toFixed(1)}
          fontSize={o.size}
          textAnchor={o.anchor ?? 'start'}
          dominantBaseline={o.middle ? 'central' : undefined}
          transform={o.angle ? `rotate(${-o.angle} ${x.toFixed(1)} ${y.toFixed(1)})` : undefined}
        >
          {s}
        </text>,
      )
    },
    measure: (s, size, bold) => textWidth(s, size, bold ? 'bold' : 'regular') * PLEX,
  }
}

interface Props {
  drawing: Drawing
  /** Tallest it may be (px). */
  maxHeight: number
  /** Laid out at least this wide (px), scrolling sideways when the space is narrower. */
  minWidth?: number
  /** Smaller type, for the panel. */
  compact?: boolean
}

/** The drawing, fitted to the width of its box. */
export function DrawingSvg({ drawing, maxHeight, minWidth = 0, compact = false }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(Math.floor(el.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  let svg: ReactNode = null
  if (width > 0) {
    const w = Math.max(width, minWidth)
    const p = svgPainter(compact)
    const k = fitScale(p, drawing, w, maxHeight)
    const size = drawingSize(p, drawing, k)
    paintDrawing(p, drawing, 0, 0, k)
    svg = (
      <svg className="sec-svg" viewBox={`0 0 ${size.w.toFixed(1)} ${size.h.toFixed(1)}`} width={size.w} height={size.h} role="img" aria-label={drawing.title}>
        {p.els}
      </svg>
    )
  }
  return (
    <div ref={box} className={`sec-svg-box${minWidth ? ' scrolls' : ''}`}>
      {svg}
    </div>
  )
}
