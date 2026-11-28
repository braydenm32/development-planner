// A phone's first answer to a tap on the plan: one line along the bottom with what was tapped and
// its key size, so the plan stays in view. A tap on the line (or Details) opens the full card;
// Delete and × are there too. The full card is the inspector (src/shell/CanvasChrome.tsx).

import { Icon } from '../nav/icons'
import { deleteSelected } from '../plan/editActions'
import type { Plan } from '../plan/model'
import { usePlan } from '../plan/store'
import { selectionPeek } from './selectionPeek'

interface Props {
  plan: Plan
  /** Whether it can be deleted here (Edit, in Design or Earthworks). */
  canDelete: boolean
  onOpen: () => void
}

export function SelectionPeek({ plan, canDelete, onOpen }: Props) {
  const selection = usePlan(s => s.selection)
  const extra = usePlan(s => s.extra)
  const line = selection && selectionPeek(plan, selection, extra)
  if (!line) return null
  return (
    <aside className="selection-peek" aria-label="Selection">
      {/* The whole line opens the card, as the Key numbers' line opens the Overview. */}
      <button type="button" className="selection-peek-open" onClick={onOpen} aria-label={`${line.name}${line.size ? `, ${line.size}` : ''}. Open its details`}>
        <span className="selection-peek-text">
          <b>{line.name}</b>
          {line.size && <span>{line.size}</span>}
        </span>
        <span className="selection-peek-more" aria-hidden="true">
          Details <Icon name="chevU" size={14} />
        </span>
      </button>
      {canDelete && (
        <button type="button" className="secondary danger selection-peek-delete" onClick={() => deleteSelected()}>
          Delete
        </button>
      )}
      <button type="button" className="icon-button" onClick={() => usePlan.getState().select(null)} aria-label="Close (clear the selection)" title="Close">
        <Icon name="x" size={16} />
      </button>
    </aside>
  )
}
