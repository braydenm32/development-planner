import { createContext } from 'react'

/**
 * What a view lock says, where it isn't the phone's View (a shared project, which has no Edit):
 * its own line, and no way to Edit.
 */
export const LockedFor = createContext<{ text: string } | null>(null)
