// What the plan's right-click menu offers for what is under the pointer: the same actions as the
// item's card and the keyboard, where the pointer already is. Each one is a single undo step,
// because each calls the action the card or the key calls.

import type { Vec2 } from '../lib/geom'
import { askName } from '../components/nameFocus'
import { copySelected, cutSelected, deleteSelected, duplicateSelected, hasCopied, pasteCopied, selectAllOnLevel } from '../plan/editActions'
import { copySelection } from '../plan/editing'
import { normDeg } from '../plan/furniture'
import { isRetaining, type Plan } from '../plan/model'
import { setWallKind, updateFurniture, updateOpening, updateStair } from '../plan/ops'
import { openingStyle } from '../plan/openingStyles'
import { usePlan, type Selection, type Tool } from '../plan/store'
import { editWallLength } from './dimStore'
import { useSnapping } from './snapping'
import { walkThrough } from '../walk/start'

export interface MenuItem {
  id: string
  label: string
  /** Its key, as src/nav/keys.ts shortcutText reads it ("mod+D"). */
  keys?: string
  danger?: boolean
  /** A rule above it: the start of another group. */
  rule?: boolean
  run: () => void
}

export interface MenuScene {
  plan: Plan
  /** What is selected, the thing right-clicked first; empty on bare ground. */
  sels: Selection[]
  tool: Tool
  /** Where the click was, in the house frame (a typed length opens there). */
  at: Vec2
}

const plural = (n: number) => (n === 1 ? '' : ` ${n} items`)

/** Snapping, the grid and fitting: for bare ground, and under a drawing tool. */
function viewItems(): MenuItem[] {
  const snap = useSnapping.getState()
  return [
    { id: 'snap', rule: true, label: snap.on ? 'Turn snapping off' : 'Turn snapping on', run: () => snap.setOn(!snap.on) },
    { id: 'grid', label: snap.grid ? 'Hide the grid' : 'Show the grid', run: () => snap.setGrid(!snap.grid) },
    { id: 'fit', label: 'Fit the house in view', keys: '0', run: () => usePlan.getState().requestFit('house') },
  ]
}

/** Duplicate, copy, cut (where the selection can be copied) and delete. */
function editItems(plan: Plan, sels: Selection[]): MenuItem[] {
  const n = plural(sels.length)
  const copies: MenuItem[] = copySelection(plan, sels)
    ? [
        { id: 'duplicate', rule: true, label: `Duplicate${n}`, keys: 'mod+D', run: () => void duplicateSelected() },
        { id: 'copy', label: `Copy${n}`, keys: 'mod+C', run: () => void copySelected() },
        { id: 'cut', label: `Cut${n}`, keys: 'mod+X', run: () => void cutSelected() },
      ]
    : []
  return [...copies, { id: 'delete', rule: copies.length === 0, label: `Delete${n}`, keys: 'Delete', danger: true, run: () => void deleteSelected() }]
}

/** The menu for a right-click: the item's own actions first, then the ones every item has. */
export function menuItems({ plan, sels, tool, at }: MenuScene): MenuItem[] {
  const st = usePlan.getState()
  if (tool !== 'select') return [{ id: 'select-tool', label: 'Stop drawing and go back to Select', keys: 'Esc', run: () => st.setTool('select') }, ...viewItems()]
  if (!sels.length) {
    const paste: MenuItem[] = hasCopied() ? [{ id: 'paste', label: 'Paste', keys: 'mod+V', run: () => void pasteCopied() }] : []
    return [...paste, { id: 'select-all', label: 'Select everything on this floor', keys: 'mod+A', run: () => void selectAllOnLevel() }, ...viewItems()]
  }
  if (sels.length > 1) return editItems(plan, sels)
  const s = sels[0]
  const own: MenuItem[] = []
  if (s.type === 'wall') {
    const w = plan.walls.find(x => x.id === s.id)
    if (!w) return []
    own.push({ id: 'length', label: 'Type its length…', run: () => editWallLength(w.id, at) })
    if (!isRetaining(w)) {
      const kind = w.kind === 'internal' ? 'external' : 'internal'
      // As its card's Kind does: the Wall tool's own thickness for that kind, when it's set to it.
      own.push({ id: 'kind', label: `Make it an ${kind} wall`, run: () => st.commit(p => setWallKind(p, w.id, kind, st.wallStyle.kind === kind ? st.wallStyle.thickness : undefined)) })
    }
  } else if (s.type === 'opening') {
    const o = plan.openings.find(x => x.id === s.id)
    if (!o) return []
    // As its card does: a sliding door has nothing to flip, and a pair of doors is hinged at both sides.
    const style = openingStyle(o)
    if (o.kind === 'door' && style !== 'sliding') {
      if (style !== 'double') own.push({ id: 'flip-hinge', label: 'Flip hinge', run: () => st.commit(p => updateOpening(p, o.id, { flipHinge: !o.flipHinge })) })
      own.push({ id: 'flip-swing', label: 'Flip swing', run: () => st.commit(p => updateOpening(p, o.id, { flipSwing: !o.flipSwing })) })
    }
  } else if (s.type === 'room') {
    own.push({ id: 'rename', label: 'Rename', run: () => askName(s.id) })
    own.push({ id: 'walk', label: 'Walk through from here', run: () => walkThrough(s.id) })
  } else if (s.type === 'furniture') {
    const f = plan.furniture.find(x => x.id === s.id)
    if (f) own.push({ id: 'turn', label: 'Turn 90°', keys: 'Q', run: () => st.commit(p => updateFurniture(p, f.id, { rotation: normDeg(f.rotation - 90) })) })
  } else if (s.type === 'stair') {
    const stair = plan.stairs.find(x => x.id === s.id)
    if (stair) own.push({ id: 'turn', label: 'Rotate 90°', run: () => st.commit(p => updateStair(p, stair.id, { angle: (stair.angle + 90) % 360 })) })
  }
  const rest = editItems(plan, sels)
  // With nothing of its own above them, the shared ones start the menu: no rule over the first.
  if (!own.length && rest[0]) rest[0] = { ...rest[0], rule: false }
  return [...own, ...rest]
}
