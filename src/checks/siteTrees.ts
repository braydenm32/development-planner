// The adapter between the site features' trees (Site › Features) and the checks: one tree
// list in the app. The remove flag is the same one Site › Features sets ("Plan: Remove"),
// written back through the site store so Undo there covers it.

import { useMemo } from 'react'
import { pointInPolygon } from '../lib/geom'
import type { SiteFeature } from '../site/model'
import { updateFeature, useSiteFeatures, useSiteStore } from '../site/store'
import type { CheckTree } from './types'

/** Trees drawn as a point with a trunk size: the ones a protection zone can be worked out for. */
export function checkTreesOf(features: SiteFeature[], boundary: [number, number][] | null): CheckTree[] {
  return features.flatMap(f => {
    if (f.type !== 'tree' || f.geom.kind !== 'point' || !f.trunk) return []
    const at = f.geom.at
    return [
      {
        id: f.id,
        label: f.label ?? '',
        at,
        trunk: f.trunk,
        height: f.height,
        remove: !!f.remove,
        neighbour: !!boundary && boundary.length >= 3 && !pointInPolygon(at[0], at[1], boundary),
      },
    ]
  })
}

/** The block's trees (and the neighbours' near it), as the checks see them, in the survey's local frame. */
export function useCheckTrees(): CheckTree[] {
  const features = useSiteFeatures({ includeHidden: true })
  const boundary = useSiteStore(s => s.boundary)
  return useMemo(() => checkTreesOf(features, boundary), [features, boundary])
}

/** Trees with no trunk size yet, which the checks can't size a zone for. */
export function useUnsizedTrees(): number {
  const features = useSiteFeatures({ includeHidden: true })
  return features.filter(f => f.type === 'tree' && f.geom.kind === 'point' && !f.trunk).length
}

/** Mark a tree for removal (pending the DA or CDC), or keep it. */
export function setTreeRemoval(id: string, remove: boolean): void {
  updateFeature(id, { remove })
}
