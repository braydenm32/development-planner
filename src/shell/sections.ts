// What each tab's panel and each More item shows, by the menu's ids. The route test checks
// that every tab (bar the canvas-only ones) and every More item has something here.

import type { ComponentType } from 'react'
import { BasixTab } from '../basix/BasixTab'
import { AboutCostsSection, EstimateAside, EstimateTab, MaterialsTab, QuotesTab, RatesSection } from '../costs/CostsTabs'
import { StormwaterTab } from '../drainage/StormwaterTab'
import type { Tool } from '../plan/store'
import { DrivewayTab, CutFillTab, PlaceTab } from './tabs/EarthworksTabs'
import { ChecksTab } from './tabs/ChecksTab'
import { OptionsTab } from '../options/OptionsTab'
import { FloorsTab, FurnitureTab, RoofsTab, RoomsTab } from './tabs/DesignTabs'
import { OfferSettings } from '../flow/OfferSettings'
import * as More from './tabs/MoreSections'
import { ExportTab } from '../export/ExportTab'
import { RetainingWallsTab } from './tabs/RetainingWallsTab'
import { DaPackTab, PlansTab, PrintTab, SendTab } from './tabs/ShareTabs'
import { SiteFeaturesTab } from './tabs/SiteFeaturesTab'
import { Site3dTab, SiteBlockTab } from './tabs/SiteTabs'
import { SectionsTab } from '../sections/SectionsTab'
import { SiteSunTab } from '../sun/SunTab'
import { MapTab } from '../map/MapTab'

/** Each tab's panel, by `area/tab`. */
export const TAB_PANELS: Record<string, ComponentType> = {
  'site/block': SiteBlockTab,
  'site/features': SiteFeaturesTab,
  'site/map': MapTab,
  'site/3d': Site3dTab,
  'site/sun': SiteSunTab,
  'design/floors': FloorsTab,
  'design/rooms': RoomsTab,
  'design/roofs': RoofsTab,
  'design/furniture': FurnitureTab,
  'design/sections': SectionsTab,
  'design/options': OptionsTab,
  'earthworks/place': PlaceTab,
  'earthworks/cut-fill': CutFillTab,
  'earthworks/retaining-walls': RetainingWallsTab,
  'earthworks/driveway': DrivewayTab,
  'approvals/checks': ChecksTab,
  'approvals/basix': BasixTab,
  'approvals/stormwater': StormwaterTab,
  'approvals/da-pack': DaPackTab,
  'costs/estimate': EstimateTab,
  'costs/materials': MaterialsTab,
  'costs/quotes': QuotesTab,
  'share/plans': PlansTab,
  'share/export': ExportTab,
  'share/send': SendTab,
  'share/3d-print': PrintTab,
}

/** Each More item's section, by its id. */
export const MORE_SECTIONS: Record<string, ComponentType> = {
  'survey-layers': More.SurveyLayersSection,
  exaggeration: More.ExaggerationSection,
  bearing: More.BearingSection,
  'survey-warnings': More.SurveyWarningsSection,
  'site-replace': More.ReplaceSurveySection,
  'plan-file': More.PlanFileSection,
  'wall-preset': More.WallPresetSection,
  'keyboard-shortcuts': More.KeyboardSection,
  'stair-defaults': More.StairDefaultsSection,
  origin: More.OriginSection,
  'earthworks-margin': More.MarginSection,
  'subfloor-gap': More.SubfloorSection,
  'retaining-offer': OfferSettings,
  'cost-rates': RatesSection,
  'cost-about': AboutCostsSection,
  'fine-tuning': More.FineTuningSection,
  'print-instructions': More.PrintInstructionsSection,
}

/** Tabs whose panel already holds a tool's options, so the tool's own options card stays away. */
export const TAB_TOOL: Record<string, Tool> = {
  'design/roofs': 'roof',
  'design/furniture': 'furniture',
  'earthworks/retaining-walls': 'retaining',
  // Place has Move the house and says how to use it.
  'earthworks/place': 'move',
}

/** What floats beside the plan on a desktop, on the right, for a tab that has more to show there. */
export const TAB_ASIDES: Record<string, ComponentType> = {
  'costs/estimate': EstimateAside,
}
