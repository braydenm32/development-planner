// Zoom out and in on the plan, a step at a time, about the middle of what's showing: beside
// Zoom out and in, beside Fit block and Fit house in the view bar
// on a desktop (src/shell/CanvasChrome.tsx). The plan carries the order out (src/plan/viewMemory.ts).

import { BUTTON_ZOOM, zoomPlan } from '../plan/viewMemory'
import './zoom.css'

const STEP = `${Math.round((BUTTON_ZOOM - 1) * 100)}%`

export function ZoomButtons({ className }: { className?: string }) {
  return (
    <div className={className ? `zoom-buttons ${className}` : 'zoom-buttons'} role="group" aria-label="Zoom">
      <button type="button" onClick={() => zoomPlan(-1)} aria-label="Zoom out (−)" title={`Zoom out ${STEP} (−)`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9" />
        </svg>
      </button>
      <button type="button" onClick={() => zoomPlan(1)} aria-label="Zoom in (+)" title={`Zoom in ${STEP} (+)`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9M8 3.5v9" />
        </svg>
      </button>
    </div>
  )
}
