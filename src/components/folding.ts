import { createContext } from 'react'

export interface Folding {
  /** Ids of the panels and More headings that are folded away. */
  collapsed: string[]
  toggle: (id: string) => void
}

export const FoldingContext = createContext<Folding>({ collapsed: [], toggle: () => {} })
