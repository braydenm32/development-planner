import { createContext } from 'react'

/** Pixels of the canvas covered at each edge. */
export interface Insets {
  l: number
  r: number
  t: number
  b: number
}

/**
 * The frame floats its panels over the canvas, so fitting the plan keeps clear of them.
 * With no frame (a test rendering the plan alone), the plan fits the whole canvas.
 */
export const CanvasFrame = createContext<{ insets: Insets } | null>(null)
