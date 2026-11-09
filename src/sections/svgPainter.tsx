// A Painter (paint.ts) that collects SVG elements, styled by sections.css: the drawings in
// Design › Sections (DrawingSvg.tsx), and the live section strip under the plan (src/sectionStrip).

import type { ReactNode } from 'react'
import { textWidth } from '../share/pdfWriter'
import type { Pt } from './common'
import type { Painter } from './paint'

/** IBM Plex Sans runs a little wider than the Helvetica the PDF writer measures. */
const PLEX = 1.07

const d = (pts: Pt[], close: boolean) => `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}${close ? 'Z' : ''}`

/** A Painter that collects SVG elements; `compact` has smaller type. */
export function svgPainter(compact: boolean): Painter & { els: ReactNode[] } {
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
