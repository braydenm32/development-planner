// What each review sheet says: what comes in, what changes and what's kept, in plain words,
// with every number from the helpers the panels use (CALM 8).

import type { SavedProject } from '../lib/storage'
import { floorRL, sortedLevels, type Plan } from '../plan/model'
import { projectThumbnail, totalFloorArea } from '../projects/summary'
import { m2 } from '../shell/format'
import { isSketch } from '../start/sketch'
import { fitOnBlock, groundUnder, heightToKeep, levelsOff, type Fit, type Site } from './align'
import { foundText, rlRangeText, siteAreaText } from './readBack'
import type { Review, ReviewChoice } from './store'

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const rl = (v: number) => `RL ${v.toFixed(2)}`

/** "2 floors: Ground floor, First floor". */
function floors(plan: Plan): string {
  const names = sortedLevels(plan).map(l => l.name)
  return `${count(names.length, 'floor')}: ${names.join(', ')}`
}

/** A plan in one line: "24 walls, 7 rooms, 2 roofs · 182.40 m²", or "nothing drawn yet". */
export function planLine(plan: Plan | null): string {
  if (!plan) return 'nothing drawn yet'
  const parts = [
    plan.walls.length ? count(plan.walls.length, 'wall') : null,
    plan.rooms.length ? count(plan.rooms.length, 'room') : null,
    plan.roofs.length ? count(plan.roofs.length, 'roof') : null,
    plan.areas.length ? count(plan.areas.length, 'outdoor area') : null,
  ].filter(Boolean)
  if (!parts.length) return 'nothing drawn yet'
  const area = totalFloorArea(plan)
  return `${parts.join(', ')}${area > 0 ? ` · ${m2(area)}` : ''}`
}

/** The facts a plan brings: its floor area, floors and floor level. */
function planFacts(plan: Plan): Review['facts'] {
  const area = totalFloorArea(plan)
  return [
    { label: 'Floor area', value: area > 0 ? m2(area) : 'none enclosed yet' },
    { label: 'Floors', value: floors(plan) },
    { label: 'Drawn', value: planLine(plan).split(' · ')[0] },
  ]
}

const thumbOf = (site: Site, plan: Plan | null) => projectThumbnail({ boundary: site.survey.boundary, origin: site.survey.origin }, plan)

/** How far off, in words: "about 700 m", "about 2.4 km". */
export function howFar(m: number): string {
  if (m >= 1000) return `about ${(m / 1000).toFixed(1)} km`
  if (m >= 100) return `about ${Math.round(m / 10) * 10} m`
  return `about ${Math.max(1, Math.round(m))} m`
}

/** The warning for a plan that would land off the block, or null when it sits on it. */
export function offBlockWarning(fit: { fit: Fit; distance: number }, what = 'the house'): string | null {
  if (fit.fit === 'outside') return `Where the file puts it, ${what} would land outside your block, ${howFar(fit.distance)} from it.`
  if (fit.fit === 'partly') return `Where the file puts it, part of ${what} would sit over the boundary.`
  return null
}

// ---------------------------------------------------------------------------
// Replace survey

export interface SurveyReviewInput {
  old: SavedProject | null
  next: SavedProject
  plan: Plan | null
  /** The old block, when it reads. */
  from: Site | null
  to: Site
  /** The plan left at its coordinates, and moved onto the new block. */
  kept: Plan | null
  moved: Plan | null
  /** Site features with the project, to say they stay. */
  siteFeatures?: number
}

export function surveyReview(i: SurveyReviewInput): Review {
  const { next, to, plan } = i
  const sketchBefore = isSketch(i.old)
  const sketchAfter = isSketch(next)
  const drawn = !!plan && planLine(plan) !== 'nothing drawn yet'
  const fit = plan ? fitOnBlock(plan, to.survey) : ({ fit: 'empty', distance: 0 } as const)

  const choices: ReviewChoice[] = []
  const movedChoice = (): ReviewChoice | null => {
    if (!i.moved) return null
    const g = groundUnder(i.moved, to)
    const ffl = floorRL(i.moved)
    const was = plan ? floorRL(plan) : null
    const height = plan && i.from ? heightToKeep(plan, i.from) : null
    const how = height !== null ? 'the same height above the ground as before' : 'at ground level, as it was far from the ground before'
    return {
      id: 'centre',
      label: sketchBefore ? 'Centre the house on the surveyed block' : 'Centre the house on the new block',
      detail: drawn
        ? `Turned square to it as it was to the old block. Floor at ${rl(ffl)}${was !== null && Math.abs(was - ffl) >= 0.005 ? ` (was ${rl(was)})` : ''}, ${how}${g ? `; the ground under it is ${rl(g.min)} to ${rl(g.max).slice(3)}` : ''}.`
        : 'Your plan starts in the middle of the new block, floor at ground level.',
      thumb: thumbOf(to, i.moved),
    }
  }
  const keptChoice = (): ReviewChoice | null => {
    if (!i.kept || !drawn) return null
    const g = groundUnder(i.kept, to)
    return {
      id: 'keep',
      label: 'Keep the house where it is',
      detail: `Same coordinates as now. Floor stays at ${rl(floorRL(i.kept))}${g ? `; the ground under it is ${rl(g.min)} to ${rl(g.max).slice(3)}` : ''}.`,
      thumb: thumbOf(to, i.kept),
    }
  }
  // From a sketch to the survey, the sketch's made-up coordinates mean nothing: the house is centred.
  // Keeping is suggested only when the house is on the new block and its floor is near the new ground.
  const keepFirst = !sketchBefore && (fit.fit === 'inside' || fit.fit === 'partly') && !(plan && levelsOff(floorRL(plan), to.terrain.stats))
  const both = sketchBefore && !sketchAfter ? [movedChoice()] : keepFirst ? [keptChoice(), movedChoice()] : [movedChoice(), keptChoice()]
  for (const c of both) if (c) choices.push(c)

  const changes = [
    i.old ? `The survey: ${i.old.fileName} becomes ${next.fileName}.` : `The survey: ${next.fileName}.`,
    sketchAfter ? 'The block is a sketch until the survey comes.' : `The block: ${siteAreaText(to.terrain.stats)}, ${rlRangeText(to.terrain.stats)}.`,
    'Survey layers are read fresh from the new file.',
  ]
  const kept = [
    drawn ? `Your plan: ${planLine(plan)}.` : 'Your plan.',
    ...(i.siteFeatures ? [`Your site features (${count(i.siteFeatures, 'feature')}).`] : []),
    ...(i.old && !sketchBefore ? [`${i.old.fileName}, with its layer settings: Undo, or Replace survey later, can put it back.`] : []),
  ]
  return {
    kind: 'replace-survey',
    title: sketchBefore && !sketchAfter ? `Use ${next.fileName} as your block?` : `Replace the survey with ${next.fileName}?`,
    file: next.fileName,
    facts: sketchAfter
      ? [{ label: 'Block', value: next.fileName.replace(/^Sketch block\s*/, '') }]
      : [
          // What the file's layers gave, so a wrong layer shows before anything changes.
          { label: 'Found', value: foundText(to.survey) },
          { label: 'Site area', value: siteAreaText(to.terrain.stats) },
          { label: 'Levels', value: rlRangeText(to.terrain.stats) },
          ...(to.survey.warnings.length ? [{ label: 'Warnings', value: count(to.survey.warnings.length, 'warning') }] : []),
        ],
    changes,
    kept,
    warning: !sketchBefore && drawn && fit.fit === 'outside' ? offBlockWarning(fit) : null,
    choices,
    thumb: choices.length ? undefined : thumbOf(to, i.moved ?? plan),
    confirm: sketchBefore && !sketchAfter ? 'Use this survey' : 'Replace survey',
    replaces: true,
  }
}

// ---------------------------------------------------------------------------
// Import plan

export interface PlanReviewInput {
  name: string
  current: Plan | null
  next: Plan
  site: Site
  /** The plan centred on the block (offered when it would land off it, or its floor is far from this ground). */
  centred: Plan | null
}

export function planReview(i: PlanReviewInput): Review {
  const fit = fitOnBlock(i.next, i.site.survey)
  const off = fit.fit === 'outside' || fit.fit === 'partly'
  // A floor from another site's levels (a plan drawn on a different survey, or before a sketch).
  const stats = i.site.terrain.stats
  const levels = levelsOff(floorRL(i.next), stats)
  const choices: ReviewChoice[] = []
  if ((off || levels) && i.centred) {
    const centre: ReviewChoice = {
      id: 'centre',
      label: 'Centre it on the block',
      detail: `Floor at ${rl(floorRL(i.centred))}, as Centre on block would put it.`,
      thumb: thumbOf(i.site, i.centred),
    }
    const keep: ReviewChoice = {
      id: 'keep',
      label: 'Keep it where the file puts it',
      detail: `Floor at ${rl(floorRL(i.next))}.`,
      thumb: thumbOf(i.site, i.next),
    }
    choices.push(...(fit.fit === 'outside' || levels ? [centre, keep] : [keep, centre]))
  }
  const levelNote = levels
    ? `Its floor, ${rl(floorRL(i.next))}, is ${howFar(Math.abs(levels))} ${levels < 0 ? 'below' : 'above'} the ${levels < 0 ? 'lowest' : 'highest'} ground on this block (${rl(levels < 0 ? stats.minRL : stats.maxRL)}).`
    : null
  const warning = [offBlockWarning(fit), levelNote].filter(Boolean).join(' ') || null
  return {
    kind: 'import-plan',
    title: `Replace your plan with ${i.name}?`,
    file: i.name,
    facts: planFacts(i.next),
    changes: [i.current ? `Your plan (${planLine(i.current)}) is replaced by the one in ${i.name}.` : `The plan in ${i.name} comes in.`],
    kept: ['The survey, the site features and your print settings.', 'Undo puts your plan back.'],
    warning,
    choices,
    thumb: choices.length ? undefined : thumbOf(i.site, i.next),
    confirm: 'Replace plan',
    replaces: true,
  }
}

// ---------------------------------------------------------------------------
// New plan

export function newPlanReview(plan: Plan, site: Site | null): Review {
  return {
    kind: 'new-plan',
    title: 'Start the plan again?',
    facts: [{ label: 'Now', value: planLine(plan) }],
    changes: ['Clears the walls, rooms, roofs, stairs, areas and furniture on every floor of this project, and the cut and fill settings.'],
    kept: [
      `The survey, and the house’s spot on the block (floor at ${rl(floorRL(plan))}).`,
      'Undo puts this plan back. To keep it and draw another, use Duplicate under All projects, or New project for another block.',
    ],
    thumb: site ? thumbOf(site, plan) : null,
    confirm: 'Start again',
    replaces: true,
  }
}

// ---------------------------------------------------------------------------
// Open project file

export interface ProjectReviewInput {
  file: string
  name: string
  survey: SavedProject
  plan: Plan
  siteFeatures: number
  /** What its costs hold, in a few words, when it has any. */
  costs?: string | null
  /** The project open now, which stays. */
  current: string | null
}

export function projectReview(i: ProjectReviewInput): Review {
  return {
    kind: 'open-project',
    title: `Open “${i.name}” as a new project?`,
    file: i.file,
    facts: [
      { label: 'Name', value: i.name },
      { label: 'Survey', value: i.survey.fileName },
      { label: 'Plan', value: planLine(i.plan) },
      ...(i.siteFeatures ? [{ label: 'Site features', value: String(i.siteFeatures) }] : []),
      ...(i.costs ? [{ label: 'Costs', value: i.costs }] : []),
    ],
    changes: [`Adds “${i.name}” to your projects and opens it.`],
    kept: [i.current ? `“${i.current}” stays as it is, under All projects.` : 'Nothing is replaced.'],
    confirm: 'Open as a new project',
    replaces: false,
  }
}
