// Whether the keyboard shortcuts overlay is open.

import { create } from 'zustand'

export const useKeyboardHelp = create<{ open: boolean }>(() => ({ open: false }))
export const openKeyboardHelp = () => useKeyboardHelp.setState({ open: true })
export const closeKeyboardHelp = () => useKeyboardHelp.setState({ open: false })
