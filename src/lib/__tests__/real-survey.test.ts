// An end-to-end check of a surveyor-style DXF. It runs on the made-up sample block
// (samples/sample-block.dxf); point it at your own survey, which stays out of the repo, with:
//   SURVEY_DXF=/path/to/survey.dxf npx vitest run real-survey
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../dxf'
import { analyzeLayers, buildSurvey, guessRoles } from '../survey'
import { buildTerrain } from '../terrain'
import { buildSiteSolid, isWatertight } from '../terrainMesh'
import { pointInPolygon } from '../geom'

const file = process.env.SURVEY_DXF ?? new URL('../../../samples/sample-block.dxf', import.meta.url).pathname

describe.skipIf(!file)('real survey', () => {
  it('imports, builds terrain and a closed site solid', () => {
    const t0 = performance.now()
    const doc = parseDxf(readFileSync(file!, 'utf8'))
    const layers = analyzeLayers(doc)
    const roles = guessRoles(layers)
    const survey = buildSurvey(doc, roles)
    const terrain = buildTerrain(survey)
    const solid = buildSiteSolid(terrain.grid, survey.boundary, Math.floor(terrain.stats.minRL) - 1)
    const ms = performance.now() - t0

    // How far spot levels inside the site sit from the terrain surface.
    const inside = [...survey.levels, ...survey.reference].filter(p => pointInPolygon(p.x, p.y, survey.boundary))
    const residuals = inside.map(p => ({
      layer: p.layer,
      d: p.z - terrain.grid.sample(p.x, p.y),
    }))
    const byLayer: Record<string, { n: number; meanAbs: number; max: number }> = {}
    for (const r of residuals) {
      const s = (byLayer[r.layer] ??= { n: 0, meanAbs: 0, max: 0 })
      s.n++
      s.meanAbs += Math.abs(r.d)
      s.max = Math.max(s.max, Math.abs(r.d))
    }
    for (const s of Object.values(byLayer)) s.meanAbs /= s.n

    console.log({
      roles,
      origin: survey.origin,
      contours: survey.contours.length,
      levels: survey.levels.length,
      reference: survey.reference.length,
      warnings: survey.warnings,
      grid: [terrain.grid.nx, terrain.grid.ny, terrain.grid.cell],
      stats: terrain.stats,
      triangles: solid.indices.length / 3,
      residuals: byLayer,
      ms: Math.round(ms),
    })
    expect(isWatertight(solid.indices)).toBe(true)
  })
})
