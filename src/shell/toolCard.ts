import { TOOLS_WITH_OPTIONS } from '../components/tools'
import type { Tool } from '../plan/store'

/** Tools with a card of their own beside the rail: their options for what they draw next, or how to use them. */
export const hasToolCard = (tool: Tool): boolean => TOOLS_WITH_OPTIONS.includes(tool) || tool === 'move'
