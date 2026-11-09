import type { Tool } from '../plan/store'

export interface ToolDef {
  id: Tool
  label: string
  /** Keyboard shortcut. */
  key: string
  /** Icon on the tool rail (see src/nav/icons.tsx); the first letter shows when it has none. */
  icon?: string
  /** Lives under an area's More instead of on the tool rail (rarely used). */
  more?: boolean
}

/** Every plan tool, in order. The tool rail renders from this list. */
export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', key: 'V', icon: 'select' },
  { id: 'wall', label: 'Wall', key: 'W', icon: 'wall' },
  { id: 'retaining', label: 'Retaining wall', key: 'T', icon: 'retain' },
  { id: 'door', label: 'Door', key: 'D', icon: 'door' },
  { id: 'window', label: 'Window', key: 'N', icon: 'window' },
  { id: 'opening', label: 'Opening', key: 'O', icon: 'opening', more: true },
  { id: 'garage', label: 'Garage door', key: 'G', icon: 'garage', more: true },
  { id: 'room', label: 'Room', key: 'R', icon: 'room' },
  { id: 'area', label: 'Area', key: 'A', icon: 'area' },
  { id: 'roof', label: 'Roof', key: 'F', icon: 'roof' },
  { id: 'stair', label: 'Stair', key: 'S', icon: 'stair' },
  { id: 'furniture', label: 'Furniture', key: 'U', icon: 'furniture' },
  { id: 'move', label: 'Move on site', key: 'M', icon: 'move', more: true },
]

/** Tools whose options show next to the rail. */
export const TOOLS_WITH_OPTIONS: Tool[] = ['wall', 'retaining', 'door', 'window', 'opening', 'garage', 'area', 'roof', 'stair', 'furniture']
