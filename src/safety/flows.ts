// The file actions: one Open for a survey, a project file or a plan;
// Replace survey, Import plan and New plan each with a review before anything changes and an
// Undo after; and the start screen's two ways in. Saves go through the Projects write queue
// (src/projects), so they never race.

import { emptyPlan, sortedLevels, type Plan } from '../plan/model'
import { defaultPlacement } from '../plan/placement'
import { usePlan } from '../plan/store'
import { freeName, nameInProjectFile } from '../projects/ops'
import { projectActions, projectsNow } from '../projects/session'
import { parseProjectFile } from '../share/project'
import { costsSummary } from '../costs/model'
import { moveSiteData, siteDataOffBlock, useSiteStore } from '../site/store'
import { isSketch, sketchAround, sketchSurvey, type SketchBlock } from '../start/sketch'
import { centreOnBlock, fitOnBlock, houseMove, moveOntoBlock, placeOnSketch, type Site } from './align'
import { PickLayersError, readFile, readSite, type OpenedFile } from './files'
import { CHECK_LAYERS, demReadBack, readBackLine } from './readBack'
import { newPlanReview, planReview, projectReview, surveyReview } from './review'
import { askLayers, askReview, showToast, useSafety } from './store'
import { forgetFileStep, rememberFileStep } from './fileUndo'
import type { SavedProject } from '../lib/storage'
import type { ProjectMeta } from '../projects/types'
import { planBounds } from '../plan/ops'
import { usePhoneMode } from '../phone/device'
import { streetSideOf, withStreetSide } from '../plan/streetSide'
import { askStreetSide } from '../start/streetQuestion'

// ---------------------------------------------------------------------------
// What the app tells the flows: how to go into the project, and the site it has built.

export interface Host {
  /** Show the project open now: where it was left, or Design › Plan for a new one. `replace` keeps Back from returning to the start screen. */
  toProject: (replace?: boolean) => void
  /** Show the survey's layers (Site › More › Survey layers), to check what an import read. */
  toLayers?: () => void
}

let host: Host = { toProject: () => {} }
let openSite: Site | null = null

export function connectHost(h: Host) {
  host = h
}

/** The open project's survey and ground, as the app built them (null while it can't be read). */
export function setOpenSite(site: Site | null) {
  openSite = site
}

const plan = () => usePlan.getState().plan

/** The open project's site: the one the app built, or built here from its survey. */
function currentSite(): Site | null {
  if (openSite) return openSite
  const survey = projectsNow().opened?.survey
  if (!survey) return null
  try {
    return readSite(survey)
  } catch {
    return null
  }
}

async function busy<T>(fn: () => Promise<T>): Promise<T> {
  useSafety.setState({ busy: true })
  try {
    return await fn()
  } finally {
    useSafety.setState({ busy: false })
  }
}

/** Run a plan change as one undoable step, and keep the level being drawn on. */
function setPlan(next: Plan) {
  const st = usePlan.getState()
  st.commit(() => next)
  if (!next.levels.some(l => l.id === usePlan.getState().activeLevel)) st.setActiveLevel(sortedLevels(next)[0].id)
}

/** The read-back's link to the layers. */
const checkLayers = () => ({ label: CHECK_LAYERS, go: () => host.toLayers?.() })

/** Say in one line what an imported survey gave (a sketch isn't an import), with the way to check its layers. */
function sayFound(survey: SavedProject) {
  if (isSketch(survey)) return
  let site: Site
  try {
    site = readSite(survey)
  } catch {
    return // the canvas says what's wrong with it
  }
  // Levels from the state's model: what came in, and how rough it is, rather than the layers.
  if (survey.dem) return showToast({ text: demReadBack(site, survey.dem), project: true })
  showToast({ text: readBackLine(site), link: checkLayers(), project: true })
}

/** The project open now, opened again if Undo comes after another was opened. */
async function backTo(id: string) {
  if (projectsNow().currentId !== id) {
    await projectActions.open(id)
    host.toProject()
  }
}

// ---------------------------------------------------------------------------
// One Open.

export interface OpenOptions {
  /** From the start screen: into the project open now (one with no survey yet), or a new one. */
  into?: 'current' | 'new'
}

/**
 * Read a file; a survey whose contours aren't on the layers they're usually on opens the layer
 * review, so they can be picked there rather than from a project that can't be made without them.
 * Null when that's cancelled.
 */
async function readOrPick(file: File): Promise<OpenedFile | null> {
  try {
    return await busy(() => readFile(file))
  } catch (e) {
    if (!(e instanceof PickLayersError)) throw e
    const survey = await askLayers(e)
    return survey ? { kind: 'survey', name: e.fileName, survey } : null
  }
}

/** Open any file the planner reads. Throws a plain message when it can't. */
export async function openFile(file: File, opts: OpenOptions = {}): Promise<void> {
  const f = await readOrPick(file)
  if (f) await openRead(f, opts)
}

/** Open a file already read. */
export async function openRead(f: OpenedFile, opts: OpenOptions = {}): Promise<void> {
  const opened = projectsNow().opened
  const hasSite = !!opened?.survey && opts.into !== 'new'
  if (f.kind === 'project') return openProjectText(f.text, f.name)
  if (f.kind === 'survey') {
    if (hasSite) return replaceSurvey(f.survey)
    return startWith(f.survey, null, opts.into)
  }
  // A plan: into the project open now (with a review), or on a sketch block of its own.
  if (hasSite && plan()) return importPlan(f.plan, f.name)
  return openPlanWithoutSurvey(f.plan, f.name, opts.into)
}

/** Start a project from a survey (and maybe a plan), or give the open project with no survey its first. Nothing is replaced. */
async function startWith(survey: SavedProject, withPlan: Plan | null, into: OpenOptions['into']) {
  const opened = projectsNow().opened
  const records = { survey, ...(withPlan ? { plan: withPlan } : {}), prefs: { view: { mode: 'plan' as const } } }
  await busy(async () => {
    if (into === 'current' && opened && !opened.survey) {
      // The plan first, so the app doesn't start an empty one when the survey arrives.
      if (withPlan) usePlan.getState().load(withPlan)
      await projectActions.savePrefs({ view: { ...opened.prefs.view, mode: 'plan' } })
      await projectActions.saveSurvey(survey)
    } else await projectActions.create(records)
  })
  // A new project is for drawing on, so a phone opens it in Edit rather than View.
  usePhoneMode.getState().setMode('edit')
  host.toProject()
  sayFound(survey)
  // The survey doesn't say where the street is: ask, unless the plan that came with it does.
  if (!isSketch(survey) && withPlan?.checks?.frontEdge === undefined) askStreetSide(projectsNow().currentId)
}

// ---------------------------------------------------------------------------
// Sketch without a survey.

/** A new project (or the open one, with no survey yet) on a sketch block, opened on Design › Plan. */
export async function startSketch(block: SketchBlock, into: OpenOptions['into'] = 'new'): Promise<void> {
  const survey = sketchSurvey(block)
  const site = readSite(survey)
  // The street side picked here is the plan's: the checks and Street view in 3D both use it.
  const start = withStreetSide(emptyPlan(defaultPlacement(site.survey, site.terrain)), site.survey.boundary, block.street)
  await startWith(survey, start, into)
}

/** A plan opened with no survey: it goes on a sketch block sized to fit it. */
async function openPlanWithoutSurvey(p: Plan, name: string, into: OpenOptions['into']) {
  const b = planBounds(p)
  const block = sketchAround(b ? b.maxX - b.minX : 0, b ? b.maxY - b.minY : 0)
  const survey = sketchSurvey(block)
  const placed = placeOnSketch(p, readSite(survey))
  await startWith(survey, placed, into)
  showToast({ text: `Opened ${name} on a ${survey.fileName.toLowerCase()}. Add the survey when it comes, from Site › More.`, project: true })
}

/** A new project (or the open one, with no survey yet) on ground levels from the state's model (src/map/demSite.ts), opened on Design › Plan. */
export async function startFromGround(survey: SavedProject, into: OpenOptions['into'] = 'new'): Promise<void> {
  const site = readSite(survey)
  await startWith(survey, emptyPlan(defaultPlacement(site.survey, site.terrain)), into)
}

// ---------------------------------------------------------------------------
// Replace survey.

/** Replace the open project's survey with `next`, after a review. The plan is kept and lined up. */
export async function replaceSurvey(next: SavedProject): Promise<void> {
  const opened = projectsNow().opened
  if (!opened) return startWith(next, null, 'new')
  const id = opened.id
  const old = opened.survey
  const current = plan()
  const from = currentSite()
  let to: Site
  try {
    to = readSite(next)
  } catch (e) {
    throw new Error(`${next.fileName} can’t be used as the block: ${(e as Error).message}`)
  }
  const moved = current ? moveOntoBlock(current, to, from) : null
  const site = useSiteStore.getState().data
  // Stored features and drawings with none of them near the new block are on the old block's
  // coordinates: they go where the house goes, so trees and easements stay where they were
  // around it rather than being left kilometres away with their checks quietly off.
  const siteOff = siteDataOffBlock(site, to.survey.boundary, to.survey.origin)
  const review = surveyReview({
    old,
    next,
    plan: current,
    from,
    to,
    kept: current,
    moved,
    siteFeatures: site.features.length + site.overlays.length,
    siteFeaturesOff: siteOff,
  })
  const choice = await askReview(review)
  if (!choice || projectsNow().currentId !== id) return

  const before = { survey: old, previous: opened.previousSurvey ?? null, plan: current, history: usePlan.getState().past }
  // The survey it replaces is kept (a sketch isn't worth keeping).
  await projectActions.saveSurvey(next, old && !isSketch(old) ? old : before.previous)
  const siteBefore = useSiteStore.getState().data
  if (choice === 'centre' && moved && current && usePlan.getState().plan === current) {
    setPlan(moved)
    usePlan.getState().requestFit()
    if (siteOff && siteBefore === site) useSiteStore.getState().commit(d => moveSiteData(d, houseMove(current.placement, moved.placement)))
  }
  const siteAfter = useSiteStore.getState().data
  // The street side is kept by the way it faces, since the new boundary's sides are numbered
  // afresh; a sketch's is the one picked for it. A real survey with none set yet asks.
  const turned = plan()
  const side = next.sketch ? next.sketch.street : turned && from ? streetSideOf(turned, from.survey.boundary) : 'auto'
  if (turned && side !== 'auto') {
    const faced = withStreetSide(turned, to.survey.boundary, side)
    if (faced.checks?.frontEdge !== turned.checks?.frontEdge) setPlan(faced)
  }
  if (!isSketch(next) && plan()?.checks?.frontEdge === undefined) askStreetSide(id)
  const after = plan()
  // The toast's Undo and the top bar's (./fileUndo.ts) both put it back, once.
  let undone = false
  const putBack = async () => {
    if (undone) return
    undone = true
    forgetFileStep()
    await backTo(id)
    if (before.survey) await projectActions.saveSurvey(before.survey, before.previous)
    const now = plan()
    if (before.plan && now && after !== before.plan) {
      // Nothing drawn since: the plan and its history go back to just before, as if it never happened.
      if (now === after) usePlan.setState({ plan: before.plan, past: before.history, future: [] })
      else setPlan({ ...now, placement: before.plan.placement })
      usePlan.getState().requestFit()
    }
    if (siteAfter !== siteBefore && useSiteStore.getState().data === siteAfter) useSiteStore.getState().commit(() => siteBefore)
    showToast({ text: `Put back ${before.survey?.fileName ?? 'the survey'}.` })
  }
  showToast({
    text: isSketch(old) && !isSketch(next) ? `Your block is now ${next.fileName}.` : `Survey replaced with ${next.fileName}.`,
    // What it found was in the review; the layers are a tap away.
    link: isSketch(next) ? undefined : checkLayers(),
    undo: putBack,
  })
  if (before.survey) rememberFileStep({ label: isSketch(old) ? 'Add the survey' : 'Replace survey', undo: putBack })
}

// ---------------------------------------------------------------------------
// Import plan.

/** Replace the open project's plan with one from a file, after a review. */
export async function importPlan(next: Plan, name: string): Promise<void> {
  const id = projectsNow().currentId
  const site = currentSite()
  const current = plan()
  if (!id || !site) return openPlanWithoutSurvey(next, name, 'current')
  const fit = fitOnBlock(next, site.survey)
  const centred = fit.fit === 'empty' ? null : centreOnBlock(next, site)
  const choice = await askReview(planReview({ name, current, next, site, centred }))
  if (!choice || projectsNow().currentId !== id) return
  // The open project's name stays its name.
  const incoming = { ...(choice === 'centre' && centred ? centred : next), name: current?.name ?? next.name }
  const level = usePlan.getState().activeLevel
  if (current) setPlan(incoming)
  else usePlan.getState().load(incoming)
  usePlan.getState().requestFit()
  const after = plan()
  showToast({
    text: `Plan replaced with ${name}.`,
    undo: async () => {
      await backTo(id)
      if (!current || plan() === current) return
      setPlan(current)
      if (current.levels.some(l => l.id === level)) usePlan.getState().setActiveLevel(level)
      if (plan() !== after) usePlan.getState().requestFit()
      showToast({ text: 'Put your plan back.' })
    },
  })
}

/** Import plan, from a chosen file. Anything else goes the way Open would take it. */
export async function importPlanFrom(file: File): Promise<void> {
  const f = await readOrPick(file)
  if (!f) return
  if (f.kind === 'plan') return importPlan(f.plan, f.name)
  return openRead(f)
}

// ---------------------------------------------------------------------------
// New plan.

/** Clear the plan for an empty one in the same spot, after a review. */
export async function newPlan(): Promise<void> {
  const id = projectsNow().currentId
  const current = plan()
  if (!id || !current) return
  const choice = await askReview(newPlanReview(current, currentSite()))
  if (!choice || projectsNow().currentId !== id || plan() !== current) return
  const level = usePlan.getState().activeLevel
  setPlan({ ...emptyPlan(current.placement), name: current.name })
  usePlan.getState().setActiveLevel('level_ground')
  showToast({
    text: 'Started the plan again: it’s empty now.',
    undo: async () => {
      await backTo(id)
      setPlan(current)
      if (current.levels.some(l => l.id === level)) usePlan.getState().setActiveLevel(level)
      showToast({ text: 'Put your plan back.' })
    },
  })
}

// ---------------------------------------------------------------------------
// Open project file.

/** A project file opens as a new project, after a light review; Undo puts it under Archived and goes back. */
export async function openProjectText(text: string, fileName: string): Promise<void> {
  const parsed = parseProjectFile(text)
  // The name it will have: the file's, made unique as the new project's will be.
  const name = await freeName({ list: async () => projectsNow().list }, nameInProjectFile(text) ?? 'Shared project')
  const { list, currentId } = projectsNow()
  const prev = list.find(m => m.id === currentId) ?? null
  const before = prev ? { id: prev.id, name: prev.name } : null
  const choice = await askReview(
    projectReview({
      file: fileName,
      name,
      survey: parsed.survey,
      plan: parsed.plan,
      siteFeatures: (parsed.site?.data.features.length ?? 0) + (parsed.site?.data.overlays.length ?? 0),
      costs: parsed.costs ? costsSummary(parsed.costs) : null,
      current: before?.name ?? null,
    }),
  )
  if (!choice) return
  const meta = await busy(() => projectActions.openFile(text))
  host.toProject()
  showToast({
    text: `Opened “${meta.name}” as a new project.${before ? ` “${before.name}” is under All projects.` : ''}`,
    project: true,
    undo: async () => {
      await projectActions.archive(meta.id)
      if (before) {
        await projectActions.open(before.id)
        host.toProject()
      }
      showToast({ text: `Put “${meta.name}” away under Archived.` })
    },
  })
}

// ---------------------------------------------------------------------------
// Duplicate (All projects).

/** Copy a project under All projects, and say so; Undo takes the copy away again. Returns the copy. */
export async function duplicateWithUndo(id: string): Promise<ProjectMeta> {
  const copy = await projectActions.duplicate(id)
  showToast({
    text: `Duplicated as “${copy.name}”.`,
    undo: async () => {
      // Deleting for good is only for archived projects; the copy has nothing of its own to keep.
      if (!projectsNow().list.some(m => m.id === copy.id)) return
      await projectActions.archive(copy.id)
      projectActions.deleteSoon(copy.id)
      await projectActions.finishDelete(copy.id)
      showToast({ text: `Took away “${copy.name}”.` })
    },
  })
  return copy
}
