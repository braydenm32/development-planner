// The print part pointed at in Share › 3D print's list, which the preview picks out.

import { create } from 'zustand'

export const usePrintHover = create<{ ids: string[] }>(() => ({ ids: [] }))

export const pointAtParts = (ids: string[]) => usePrintHover.setState({ ids })
