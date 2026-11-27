// Asking for a room's Name box: the Room tool makes a room (or a room is double-clicked), and
// what is typed next names it instead of picking tools.

import { create } from 'zustand'

export const useNameAsk = create<{ id: string | null; n: number }>(() => ({ id: null, n: 0 }))

/** Put the cursor in this item's Name box, its text selected, once its card shows. */
export const askName = (id: string) => useNameAsk.setState(s => ({ id, n: s.n + 1 }))

/** The box has taken the cursor: picking the item again later doesn't ask again. */
export const nameAsked = () => useNameAsk.setState({ id: null })
