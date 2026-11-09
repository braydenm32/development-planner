import { createContext } from 'react'

export interface Folding {
  /**
   * Ids of the panels and More headings that are folded away. A heading that starts folded
   * (Site's More) is listed as `open:<id>` once it's unfolded instead, so the one saved list
   * keeps both, and older saved lists still mean what they did.
   */
  collapsed: string[]
  toggle: (id: string) => void
}

export const FoldingContext = createContext<Folding>({ collapsed: [], toggle: () => {} })

/** The entry `toggle` flips for a heading: its id, or `open:<id>` for one that starts folded. */
export const foldKey = (id: string, startsOpen = true) => (startsOpen ? id : `open:${id}`)

/** Whether a heading is unfolded now. */
export const isUnfolded = (collapsed: string[], id: string, startsOpen = true) => (startsOpen ? !collapsed.includes(id) : collapsed.includes(foldKey(id, false)))
