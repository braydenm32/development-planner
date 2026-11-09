// A section or elevation on screen: laid out for the width it has (so labels stay their size),
// drawn as SVG by paint.ts, styled by sections.css in the plan's drafting look.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { drawingSize, fitScale, paintDrawing, type Drawing } from './paint'
import { svgPainter } from './svgPainter'
import './sections.css'

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
