// A project's survey record, read and built: its DXF's layers, the survey on the roles chosen,
// the terrain from it, and the solid block for the 3D view. The app and a shared view both build
// the site here, so they show the same block from the same record.

import { useMemo } from 'react'
import { parseDxf } from './dxf'
import type { SavedProject } from './storage'
import { analyzeLayers, buildSurvey } from './survey'
import { buildTerrain } from './terrain'
import { buildSiteSolid } from './terrainMesh'

export function useBuiltSite(project: SavedProject | null) {
  const dxfText = project?.dxfText
  const roles = project?.roles
  const doc = useMemo(() => {
    if (!dxfText) return null
    try {
      return parseDxf(dxfText)
    } catch {
      return null
    }
  }, [dxfText])
  const layers = useMemo(() => (doc ? analyzeLayers(doc) : []), [doc])

  const site = useMemo(() => {
    if (!doc || !roles) return null
    try {
      const survey = buildSurvey(doc, roles)
      const terrain = buildTerrain(survey)
      const solid = buildSiteSolid(terrain.grid, survey.boundary, Math.floor(terrain.stats.minRL) - 1)
      return { survey, terrain, solid, error: null }
    } catch (e) {
      return { survey: null, terrain: null, solid: null, error: (e as Error).message }
    }
  }, [doc, roles])

  return { layers, site }
}
