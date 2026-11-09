// "Plan to remove this tree": the one toggle for it, in Approvals › Checks' tree rows and on the tree
// in Site › Features, so the two read the same. Removing a tree needs approval (the DA or CDC, or
// council's tree permit), which the label after it says.

export const TREE_REMOVAL_LABEL = 'Plan to remove this tree'

export function TreeRemoval({ remove, onChange }: { remove: boolean; onChange: (remove: boolean) => void }) {
  return (
    <label className="check tree-removal">
      <input type="checkbox" checked={remove} onChange={e => onChange(e.target.checked)} />
      <span>
        {TREE_REMOVAL_LABEL}
        {remove && <span className="muted"> · needs approval</span>}
      </span>
    </label>
  )
}
