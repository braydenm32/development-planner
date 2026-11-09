// The one menu for the app. The area rail, the top-bar tabs, the phone's bottom bar,
// each area's More, the project menu and ⌘K search all render from this file, and the
// route test checks that every feature in features.json has exactly one home here.
//
// Order follows the usage audit (CALM 9): the plan and the numbers first, then earthworks,
// then sharing. Rare things live under each area's More. Nothing is removed.

import { TOOLS } from '../components/tools'
import { TERMS } from '../guide/glossary'
import type { Tool } from '../plan/store'
import type { IconName } from './icons'

export type AreaId = 'site' | 'design' | 'earthworks' | 'costs' | 'share'
export type CanvasView = 'plan' | '3d'

/** Numbers the summary strip shows; a tab that shows one in its panel makes the strip's chip step back. */
export type NumberId = 'floor-area' | 'ffl' | 'cut-fill' | 'retaining' | 'roof-height' | 'warnings' | 'checks' | 'site-checks' | 'cost'

export type ActionId =
  | 'undo'
  | 'redo'
  | 'view-plan'
  | 'view-3d'
  | 'overview'
  | 'balance'
  | 'download-pdf'
  | 'download-da-pack'
  | 'download-3mf'
  | 'download-dxf'
  | 'download-schedule'
  | 'save-picture'
  | 'download-stls'
  | 'save-project'
  | 'open-file'
  | 'open-project'
  | 'import-plan'
  | 'export-plan'
  | 'new-plan'
  | 'replace-survey'
  | 'projects'
  | 'new-project'
  | 'cloud'
  | 'fit-house'
  | 'fit-block'
  | 'zoom-in'
  | 'zoom-out'
  | 'north-up'
  | 'reset-camera'
  | 'camera-street'
  | 'camera-above'
  | 'camera-rear'
  | 'pick-contour'
  | 'draw-section'
  | 'grade-brush'
  | 'keyboard-help'
  | 'open-example'
  | 'guide'
  | 'glossary'
  | 'plan-tips'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'accuracy'
  | `tool:${Tool}`
  /** What a planning word means: the guide, open at the word. */
  | `term:${string}`

export interface Entry {
  /** Unique across the whole menu; used in links, anchors and tests. */
  id: string
  label: string
  icon?: IconName
  /** Plain words ⌘K also finds it by. */
  keywords?: string[]
  /** Feature ids (features.json) whose home this is. Each feature has exactly one home. */
  features: string[]
  /** Something ⌘K can do for it. */
  action?: ActionId
  /**
   * How ⌘K runs the action: `now` runs it as soon as it is chosen; `offer` goes to its home
   * and offers a Run button; `menu` opens the project menu at it (for actions that replace
   * work, which keep their own confirmations).
   */
  run?: 'now' | 'offer' | 'menu'
  /** Keyboard shortcut, as `mod+Z` (⌘ on a Mac, Ctrl elsewhere) or a single key. */
  shortcut?: string
  /** Where ⌘K takes you (before it offers to run the action, if there is one): `area/tab` or `area/more/item`. */
  at?: string
  /** What ⌘K says about it when choosing it can't show it by itself: where to look, or how to use it. */
  hint?: string
}

export interface Tab extends Entry {
  /** The canvas this tab opens on, when you arrive from another area. */
  view?: CanvasView
  /** A canvas of its own instead of the plan or 3D view. */
  canvas?: 'print'
  /** Numbers its panel already shows, so the strip doesn't print them twice. */
  shows?: NumberId[]
  /** Short line under the panel's title. */
  subtitle?: string
  /** The line instead where the app has no cloud (GitHub Pages, a copy run at home), for a tab whose subtitle promises a cloud part. */
  offlineSubtitle?: string
  /** The tab is the canvas alone, with no panel. */
  noPanel?: boolean
}

export interface Area extends Entry {
  id: AreaId
  tabs: Tab[]
  defaultTab: string
  /** The canvas the area opens on. */
  view: CanvasView
  /** The plan tools sit on a rail on the plan canvas. */
  rail: boolean
  /**
   * The area reports on the design rather than changing it (Costs): the plan is only for looking
   * at, with nothing to pick on it, and on a phone the panel fills the screen in place of the plan.
   */
  report?: boolean
  /** Rare things, in one themed group at the end of the tabs. */
  more: { label: string; icon: IconName; subtitle: string; items: Entry[] }
}

/** Places that are there in every area: the top bar, project menu, summary strip and so on. */
export interface Home extends Entry {
  items: Entry[]
}

/** The More tab's id, in every area. */
export const MORE = 'more'

// ---------------------------------------------------------------------------
// The five areas

export const AREAS: Area[] = [
  {
    id: 'site',
    label: 'Site',
    icon: 'site',
    keywords: ['block', 'survey', 'land', 'terrain', 'lot'],
    features: [],
    view: '3d',
    rail: false,
    // Site opens on the block's facts (and the street side) rather than the 3D view's settings.
    defaultTab: 'block',
    tabs: [
      {
        id: 'block',
        label: 'Block',
        icon: 'block',
        // Its own canvas, so Site in a phone's bottom bar still lands where nothing covers the numbers.
        view: '3d',
        subtitle: 'Its size, levels and fall.',
        keywords: ['site facts', 'area', 'perimeter', 'slope', 'fall', 'levels', 'RL range', 'aspect', 'size', 'sketch block', 'block size', 'street side', 'front', 'faces the street', 'low side'],
        features: ['site-area-perimeter', 'site-levels-fall', 'site-slope-aspect', 'sketch-block-notice', 'sketch-change-size', 'dem-block-notice', 'street-side-block', 'survey-layers-badge'],
      },
      {
        id: 'features',
        label: 'Features',
        icon: 'pin',
        // Drawings are lined up and features traced on the plan.
        view: 'plan',
        subtitle: 'What is already on the block.',
        shows: ['site-checks'],
        keywords: [
          'easement',
          'trees',
          'tree protection zone',
          'TPZ',
          'SRZ',
          'root zone',
          'arborist',
          'fences',
          'services',
          'sewer',
          'existing',
          'overlay',
          'driveway',
          'buildings',
          'shed',
          'PDF',
          'picture',
          'drawing',
          'line up',
          'trace',
          'council',
        ],
        features: [
          'site-to-check',
          'site-tree-zones',
          'site-feature-inspector',
          'site-feature-list',
          'site-drawing-add',
          'site-drawing-line-up',
          'site-drawing-settings',
          'site-drawing-include',
          'site-drawing-found',
          'site-trace',
          'site-plan-toolbar',
          'site-features-plan',
          'site-features-3d',
          'site-extra-dxf',
          'site-trace-easement',
          'site-trace-off-block',
          'site-features-view',
        ],
      },
      {
        id: 'map',
        label: 'Map',
        icon: 'map',
        // The aerial photo shows under the plan once the block is placed.
        view: 'plan',
        subtitle: 'Your block on the NSW map, and what the planning maps say.',
        keywords: [
          'map',
          'aerial',
          'satellite',
          'photo',
          'address',
          'lot',
          'DP',
          'Lot and DP',
          'cadastre',
          'place',
          'locate',
          'zone',
          'zoning',
          'heritage',
          'bushfire',
          'bush fire',
          'BAL',
          'flood',
          'landslide',
          'planning certificate',
          'LEP map',
          'height of buildings',
          'floor space ratio',
          'MGA',
          'ground levels',
          'elevation',
          'LiDAR',
          'DEM',
          'no survey',
        ],
        features: ['map-find-lot', 'map-pick-lot', 'map-fit-survey', 'map-state-ground', 'map-nudge', 'map-aerial-plan', 'map-planning-layers', 'map-checks', 'map-include-file', 'map-remove', 'map-on-canvas', 'map-trouble'],
      },
      {
        id: '3d',
        label: '3D',
        icon: 'cube',
        view: '3d',
        subtitle: 'What the 3D view shows.',
        keywords: ['view', 'show', 'hide', 'contours', 'spot levels', 'model', 'camera', 'orbit', 'solid'],
        features: [
          'show-contours-3d',
          'show-spot-levels-3d',
          'show-reference-points-3d',
          'show-solid-block-3d',
          'show-house-3d',
          'show-roof-3d',
          'show-furniture-3d',
          'show-cut-fill-3d',
          'reset-camera-3d',
          'street-side-3d',
          'orbit-3d',
          'house-model-3d',
          'furniture-3d',
          'terrain-elevation-colours',
          'survey-markers-3d',
        ],
      },
      {
        id: 'sun',
        label: 'Sun',
        icon: 'sun',
        view: '3d',
        subtitle: 'The sun and shadows, by place, day and time.',
        keywords: [
          'sun',
          'shadow',
          'shadows',
          'overshadowing',
          'solar',
          'sun study',
          'sunlight',
          'shade',
          'winter sun',
          '21 June',
          'solstice',
          'equinox',
          'shadow diagram',
          'location',
          'town',
          'latitude',
          'longitude',
          'true north',
          'MGA',
          'daylight saving',
          'AEST',
        ],
        features: ['sun-location', 'sun-true-north', 'sun-study-3d', 'sun-day-time', 'sun-play-day', 'sun-living-hours'],
      },
    ],
    more: {
      label: 'More',
      icon: 'sliders',
      subtitle: 'Survey layers and other settings you rarely need.',
      items: [
        {
          id: 'survey-layers',
          label: 'Survey layers',
          icon: 'layers',
          keywords: ['DXF', 'layer', 'roles', 'contours', 'boundary', 'mapping', 'trees', 'easements', 'fences', 'check the layers', 'what was found', 'read back', 'import summary', 'spot levels'],
          features: ['survey-layer-summary', 'survey-layer-role', 'site-feature-layer-roles', 'survey-read-back', 'contours-from-levels'],
        },
        {
          id: 'exaggeration',
          label: 'Vertical exaggeration',
          icon: 'sliders',
          keywords: ['stretch', 'height', 'scale', 'steeper'],
          features: ['vertical-exaggeration'],
        },
        {
          id: 'bearing',
          label: 'Top of view bearing',
          icon: 'north',
          keywords: ['north', 'orientation', 'rotate view', 'compass', 'bearing'],
          features: ['top-of-view-bearing'],
        },
        {
          id: 'survey-warnings',
          label: 'Survey import warnings',
          icon: 'warn',
          keywords: ['problems', 'import', 'DXF'],
          features: ['survey-warnings'],
        },
        {
          id: 'site-replace',
          label: 'Replace survey',
          icon: 'file',
          keywords: ['new survey', 'DXF', 'import', 'add survey', 'survey arrived', 'put back', 'earlier survey', 'line up'],
          features: ['replace-survey', 'replace-survey-keep', 'review-replace-survey', 'add-survey-later', 'previous-survey-kept', 'replace-survey-top-undo'],
          action: 'replace-survey',
          run: 'offer',
        },
      ],
    },
  },
  {
    id: 'design',
    label: 'Design',
    icon: 'design',
    keywords: ['house', 'plan', 'draw', 'floor plan'],
    features: [],
    view: 'plan',
    rail: true,
    defaultTab: 'plan',
    tabs: [
      {
        id: 'plan',
        label: 'Plan',
        icon: 'plan',
        view: 'plan',
        noPanel: true,
        keywords: ['draw', 'floor plan', 'walls', 'canvas', 'edit', 'select', 'drag', 'snap', 'zoom', 'pan', 'where I left off', 'remember view'],
        features: [
          'plan-pan',
          'plan-look-only-drag',
          'plan-wheel-zoom',
          'plan-view-remembered',
          'click-select',
          'drag-wall',
          'drag-wall-end-handles',
          'walls-on-one-another',
          'drag-opening',
          'drag-room-label',
          'drag-stair',
          'drag-area-corners',
          'drag-roof-corners',
          'roof-gable-hip-markers',
          'roof-skillion-low-marker',
          'draw-walls',
          'place-opening',
          'place-room',
          'draw-area',
          'draw-roof',
          'place-stair',
          'double-click-finish',
          'snapping',
          'plan-dimension-labels',
          'plan-room-area-labels',
          'plan-symbols',
          'site-underlay',
          'ghost-level-below',
          'corner-offsets',
        ],
      },
      {
        id: 'floors',
        label: 'Floors',
        icon: 'floors',
        subtitle: 'The levels of the house, their floor heights and how each is built.',
        shows: ['ffl'],
        keywords: [
          'levels',
          'storey',
          'first floor',
          'upstairs',
          'ceiling',
          'add level',
          'height',
          'floor type',
          'slab on ground',
          'bearers and joists',
          'piers',
          'waffle pod',
          'suspended slab',
          'foundation',
          'framed floor',
        ],
        features: ['level-switch', 'level-name', 'level-elevation', 'level-ceiling-height', 'add-level-above', 'delete-level', 'floor-type-level'],
      },
      {
        id: 'rooms',
        label: 'Rooms & areas',
        icon: 'list',
        subtitle: 'Room areas, floor area and outdoor areas.',
        shows: ['floor-area'],
        keywords: ['schedule', 'm2', 'square metres', 'floor area', 'size', 'outdoor', 'deck', 'patio'],
        features: ['room-area-schedule', 'gross-floor-area', 'outdoor-area-sizes'],
      },
      {
        id: 'roofs',
        label: 'Roofs',
        icon: 'roof',
        subtitle: 'New roofs, and the roofs on the plan.',
        keywords: ['pitch', 'hip', 'gable', 'skillion', 'eaves', 'overhang'],
        features: ['new-roof-type', 'new-roof-pitch', 'new-roof-overhang'],
      },
      {
        id: 'furniture',
        label: 'Furniture',
        icon: 'furniture',
        subtitle: 'Pick a piece, then click on the plan to place it.',
        keywords: ['bed', 'sofa', 'table', 'kitchen', 'catalogue', 'fitout'],
        features: ['furniture-catalog', 'place-furniture', 'drag-furniture', 'furniture-turn', 'furniture-wall-distances'],
      },
      {
        id: 'sections',
        label: 'Sections',
        icon: 'section',
        view: 'plan',
        subtitle: 'Cuts through the house and the slope, and the four elevations.',
        keywords: [
          'section',
          'sections',
          'cross section',
          'cut through',
          'A-A',
          'elevation',
          'elevations',
          'north elevation',
          'east elevation',
          'south elevation',
          'west elevation',
          'facade',
          'side view',
          'profile',
          'height',
          'building height',
          'natural ground',
          'finished ground',
          'ground line',
          'slope',
          'council drawings',
        ],
        features: ['sections-tab', 'section-drawing', 'section-flip-delete', 'elevations', 'elevation-height', 'sections-large', 'section-marks-plan'],
      },
      {
        id: 'checks',
        label: 'Checks',
        icon: 'check',
        subtitle: 'The design against the planning rules, as you draw.',
        shows: ['checks'],
        keywords: ['compliance', 'CDC', 'DA', 'Housing Code', 'LEP', 'DCP', 'setback', 'height limit', 'floor space ratio', 'landscaped', 'site coverage', 'council', 'rules', 'tree protection', 'TPZ', 'battle-axe', 'Wollongong', 'council switch', 'lga', 'local government area', 'NSW only', 'Shellharbour', 'Kiama', 'Blue Mountains', 'Central Coast', 'Lake Macquarie', 'my council', 'outside the lot', 'over the boundary', 'not drawn yet', 'zone', 'heritage', 'flood', 'bushfire', 'overshadowing', 'solar access', 'driveway crossing', 'kerb', 'scrape', 'B85', 'B99', 'to fix', 'to confirm', 'verdict', 'approval route', 'pins', 'show on plan', 'go to fix', 'remove tree', 'plan to remove', 'wall spacing', 'walls 2 m apart', 'CDC vs DA'],
        features: ['compliance-checks', 'checks-pathway', 'council-switches', 'checks-sources', 'lot-facts', 'tree-protection-checks', 'mark-tree-removal', 'checks-not-drawn-yet', 'checks-lot-inside', 'checks-cdc-land', 'sun-checks', 'checks-plan-pins', 'checks-go-to-fix', 'checks-route-differences', 'checks-wall-spacing'],
      },
      {
        id: 'options',
        label: 'Options',
        icon: 'layers',
        subtitle: 'Named versions of the design on the same survey, side by side.',
        keywords: ['option', 'options', 'version', 'variant', 'compare', 'alternative', 'scenario', 'slab vs piers', 'copy', 'duplicate design', 'try something', 'split level', 'what if', 'side by side', 'differences only', 'building height', 'storeys', 'levels'],
        features: ['options-list', 'options-open', 'options-copy', 'options-rename', 'options-delete', 'options-compare', 'options-undo-separate'],
      },
      {
        id: 'basix',
        label: 'BASIX',
        icon: 'leaf',
        subtitle: 'What the BASIX tool will ask for, gathered from the plan.',
        keywords: ['basix', 'energy', 'glazing', 'windows', 'window area', 'insulation', 'hot water', 'sustainability', 'thermal', 'orientation', 'north', 'heating', 'cooling', 'lighting', 'pool', 'water target', 'NatHERS', 'certificate', 'csv'],
        features: ['basix-checklist', 'basix-from-plan', 'basix-answers', 'basix-csv', 'basix-links'],
      },
    ],
    more: {
      label: 'More',
      icon: 'sliders',
      subtitle: 'The plan file and tools you rarely need.',
      items: [
        {
          id: 'plan-file',
          label: 'Plan file',
          icon: 'file',
          keywords: ['export', 'import', 'import plan', 'replace plan', 'new plan', 'json', 'save', 'backup'],
          features: ['plan-autosave', 'plan-import', 'review-import-plan'],
        },
        {
          id: 'wall-preset',
          label: 'Wall presets',
          icon: 'wall',
          keywords: ['custom', 'brick', 'stud', 'veneer', 'masonry', 'thickness'],
          features: ['new-wall-preset'],
        },
        {
          id: 'opening-tool',
          label: 'Opening tool',
          icon: 'opening',
          keywords: ['gap', 'archway', 'no door', 'carport', 'doorway'],
          features: ['tool-opening'],
          action: 'tool:opening',
          run: 'now',
          shortcut: 'O',
        },
        {
          id: 'garage-door-tool',
          label: 'Garage door tool',
          icon: 'garage',
          keywords: ['garage door', 'roller door', 'panel lift', 'sectional door', 'tilt door', 'overhead door', 'car', 'garage'],
          features: ['tool-garage', 'new-garage-door-size', 'garage-door-symbol', 'garage-door-3d'],
          action: 'tool:garage',
          run: 'now',
          shortcut: 'G',
        },
        {
          id: 'keyboard-shortcuts',
          label: 'Keyboard shortcuts',
          icon: 'list',
          keywords: ['keys', 'shortcuts', 'hotkeys', 'cheat sheet', 'help', 'nudge', 'arrow keys', 'copy', 'paste', 'duplicate', 'select all', 'fit'],
          features: ['keyboard-shortcuts-overlay'],
          action: 'keyboard-help',
          run: 'now',
          shortcut: '?',
        },
        {
          id: 'stair-defaults',
          label: 'L- and U-shaped stairs',
          icon: 'stair',
          keywords: ['landing', 'stairs', 'turn', 'quarter', 'half'],
          features: ['new-stair-shape', 'new-stair-turn'],
        },
      ],
    },
  },
  {
    id: 'earthworks',
    label: 'Earthworks',
    icon: 'earth',
    keywords: ['ground', 'dig', 'excavation', 'site works'],
    features: [],
    view: 'plan',
    rail: true,
    defaultTab: 'cut-fill',
    tabs: [
      {
        id: 'place',
        label: 'Place',
        icon: 'pin',
        subtitle: 'Where the house sits and how high its floor is.',
        shows: ['ffl'],
        keywords: ['setback', 'setbacks', 'boundary', 'distance', 'FFL', 'floor level', 'position', 'RL', 'over the boundary', 'outside the lot'],
        features: ['ground-floor-level', 'ground-under-house', 'boundary-distance-fields', 'boundary-over'],
      },
      {
        id: 'cut-fill',
        label: 'Cut & fill',
        icon: 'shovel',
        subtitle: 'Levelling the ground under the house.',
        shows: ['cut-fill', 'warnings'],
        keywords: ['earthworks', 'cut', 'fill', 'balance', 'batter', 'volume', 'slab', 'pad', 'excavation', 'm3', 'brush', 'grade', 'grading', 'level', 'cut to', 'fill to', 'bench', 'terrace', 'suggested retaining wall'],
        features: [
          'earthworks-cut-batter',
          'earthworks-fill-batter',
          'earthworks-volumes',
          'earthworks-boundary-warning',
          'balance-cut-fill',
          'dem-results-flag',
          'grade-brush',
          'grade-level-pick',
          'grade-areas',
          'grade-wall-suggestions',
        ],
      },
      {
        id: 'retaining-walls',
        label: 'Retaining walls',
        icon: 'retain',
        subtitle: 'Walls that hold back the ground.',
        shows: ['retaining'],
        keywords: ['retaining', 'wall height', 'engineer', 'sleepers', 'block wall', 'hold back', 'uphill', 'downhill', 'levels', 'bench', 'section', 'earth side', 'earth behind'],
        features: [
          'retaining-walls-total',
          'retaining-wall-stats',
          'retaining-new-wall',
          'retaining-pick-side',
          'retaining-side',
          'retaining-height',
          'retaining-exact-details',
          'retaining-levels',
          'retaining-bench',
          'retaining-section',
          'retaining-engineer-flag',
        ],
      },
      {
        id: 'driveway',
        label: 'Driveway',
        icon: 'drive',
        subtitle: 'Its levels, how steep it is, and whether a car gets in from the street.',
        keywords: [
          'grade',
          'slope',
          'car',
          'garage',
          'gradient',
          'cross-fall',
          'levels',
          'kerb',
          'street',
          'RL',
          'slab',
          '1 in 4',
          'driveway grade',
          'crossing',
          'crossover',
          'vehicle crossing',
          'footpath',
          'verge',
          'gutter',
          'kerb level',
          'layback',
          'scrape',
          'scraping',
          'ground clearance',
          'bottom out',
          'transition',
          'change of grade',
          'long section',
          'profile',
          'turning',
          'turn in',
          'swept path',
          'B85',
          'B99',
          'AS 2890',
          'AS/NZS 2890.1',
        ],
        features: [
          'driveway-grade',
          'driveway-average-grade',
          'driveway-cross-fall',
          'driveway-verdict',
          'driveway-levels',
          'driveway-design-grade',
          'driveway-kerb-level',
          'driveway-long-section',
          'driveway-crossing-checks',
        ],
      },
      {
        id: 'stormwater',
        label: 'Stormwater',
        icon: 'drop',
        subtitle: 'Roof water: the tank, then the street or the low corner.',
        keywords: ['stormwater', 'drainage', 'downpipe', 'tank', 'rainwater', 'OSD', 'detention', 'runoff', 'catchment', 'roof area', 'gravity', 'easement', 'pump', 'low point', 'kerb', 'concept'],
        features: ['stormwater-catchment', 'stormwater-tank', 'stormwater-fall', 'stormwater-plan-path', 'stormwater-sources'],
      },
    ],
    more: {
      label: 'More',
      icon: 'sliders',
      subtitle: 'Exact placement and earthworks settings you rarely need.',
      items: [
        {
          id: 'origin',
          label: 'Easting and northing of plan origin',
          icon: 'target',
          keywords: ['coordinates', 'position', 'E', 'N', 'MGA'],
          features: ['placement-easting', 'placement-northing'],
        },
        {
          id: 'rotation',
          label: 'Rotation',
          icon: 'rotate',
          keywords: ['turn the house', 'angle', 'orientation'],
          features: ['placement-rotation'],
        },
        {
          id: 'placement-actions',
          label: 'Centre, square and floor at ground level',
          icon: 'move',
          keywords: ['centre on block', 'square to boundary', 'floor at ground level', 'align'],
          features: ['centre-on-block', 'square-to-boundary', 'floor-at-ground-level'],
        },
        {
          id: 'move-tool',
          label: 'Move-on-site drag tool',
          icon: 'move',
          keywords: ['drag the house', 'move house', 'position'],
          features: ['tool-move', 'move-house-drag', 'move-clearances'],
          action: 'tool:move',
          run: 'now',
          shortcut: 'M',
        },
        {
          id: 'earthworks-margin',
          label: 'Level area past slab edges',
          icon: 'shovel',
          keywords: ['margin', 'apron', 'working space'],
          features: ['earthworks-margin'],
        },
        {
          id: 'subfloor-gap',
          label: 'Gap under floors on piers',
          icon: 'floors',
          keywords: ['subfloor', 'piers', 'stumps', 'clearance', 'suspended slab'],
          features: ['earthworks-subfloor-gap'],
        },
        {
          id: 'retaining-offer',
          label: 'When to suggest a retaining wall',
          icon: 'retain',
          keywords: ['retaining wall offer', 'suggest', 'threshold', 'deep cut', 'high fill', 'stop asking', 'don’t ask'],
          features: ['retaining-offer-settings'],
        },
      ],
    },
  },
  {
    id: 'costs',
    label: 'Costs',
    icon: 'costs',
    keywords: ['cost', 'estimate', 'budget', 'price', 'quote', 'owner-builder', 'materials', 'rates', 'how much', 'money'],
    features: ['cost-strip'],
    view: 'plan',
    rail: false,
    report: true,
    defaultTab: 'estimate',
    tabs: [
      {
        id: 'estimate',
        label: 'Estimate',
        icon: 'costs',
        subtitle: 'What the design would cost to build, from its own quantities.',
        shows: ['cost'],
        keywords: ['cost', 'estimate', 'budget', 'total', 'per m2', 'square metre', 'owner-builder', 'builder', 'labour', 'contingency', 'csv', 'spreadsheet', 'range', 'finish', 'guide', 'basic', 'high end', 'incomplete'],
        features: ['cost-incomplete', 'cost-estimate', 'cost-line-source', 'cost-range', 'cost-finish-guide', 'cost-who-builds', 'cost-owner-builder-split', 'cost-quote-add', 'cost-plan-highlight', 'cost-csv'],
      },
      {
        id: 'materials',
        label: 'Materials',
        icon: 'layers',
        subtitle: 'What it’s built from, and what each choice adds or saves.',
        keywords: ['frame', 'timber', 'steel', 'cladding', 'brick veneer', 'weatherboard', 'fibre cement', 'Colorbond', 'tile', 'terracotta', 'double glazed', 'finish', 'specification'],
        features: ['cost-materials', 'cost-floor-linked'],
      },
      {
        id: 'quotes',
        label: 'Quotes',
        icon: 'pencil',
        subtitle: 'Prices people have given you; each replaces its line’s estimate.',
        keywords: ['quote', 'tradie', 'trades', 'price', 'compare', 'tender'],
        features: ['cost-quotes-list'],
      },
    ],
    more: {
      label: 'More',
      icon: 'sliders',
      subtitle: 'Rates, allowances and where the figures come from.',
      items: [
        {
          id: 'cost-rates',
          label: 'Rates',
          icon: 'sliders',
          keywords: ['rate', 'price per m2', 'starting rate', 'reset', 'contingency', 'margin', 'allowance', 'fees'],
          features: ['cost-rates', 'cost-reset-rate', 'cost-allowances'],
        },
        {
          id: 'cost-about',
          label: 'About the estimate',
          icon: 'list',
          keywords: ['sources', 'how it works', 'GST', 'owner-builder permit', 'Fair Trading', 'not included'],
          features: ['cost-sources', 'cost-owner-builder-rules'],
        },
      ],
    },
  },
  {
    id: 'share',
    label: 'Share',
    icon: 'share',
    keywords: ['export', 'print', 'send', 'builder', 'council'],
    features: ['mode-print-share'],
    view: 'plan',
    rail: false,
    defaultTab: 'plans',
    tabs: [
      {
        id: 'plans',
        label: 'Plans (PDF)',
        icon: 'file',
        subtitle: 'A plan set for the builder or council, and a DA pack.',
        keywords: [
          'pdf',
          'print',
          'sheets',
          'drawings',
          'site plan',
          'floor plan',
          'roof plan',
          'paper',
          'shadow diagram',
          'sections',
          'elevations',
          '1:100',
          'DA',
          'DA pack',
          'development application',
          'lodgement',
          'lodge',
          'title block',
          'revision',
          'cover sheet',
          'checklist',
          'town planner',
          'cut and fill plan',
          'stormwater plan',
        ],
        features: [
          'download-pdf',
          'furniture-pdf',
          'finished-contours-pdf',
          'site-features-pdf',
          'share-from-phone',
          'setback-dimensions-pdf',
          'shadow-diagram-pdf',
          'sections-pdf',
          'da-pack-pdf',
          'da-pack-title-block',
          'da-pack-checklist',
          'da-pack-revision',
          'da-pack-details',
          'da-pack-checks',
        ],
      },
      {
        id: 'export',
        label: 'Export',
        icon: 'download',
        subtitle: 'A DXF for your surveyor, pictures, and a door and window list.',
        keywords: ['dxf', 'cad', 'autocad', 'export', 'png', 'image', 'screenshot', 'picture', 'schedule', 'doors', 'windows', 'door and window schedule', 'csv', 'spreadsheet', 'surveyor', 'engineer'],
        features: ['download-dxf', 'download-plan-png', 'download-3d-png', 'door-window-schedule', 'download-schedule-csv'],
      },
      {
        id: 'send',
        label: 'Send',
        icon: 'send',
        subtitle: 'A view-only link, or one file with the survey and the plan.',
        offlineSubtitle: 'One file with the survey and the plan.',
        keywords: ['share', 'project file', 'email', 'builder', 'architect', 'link', 'view-only link', 'share link', 'read only', 'show people', 'family', 'turn off link', 'revoke', 'expire', 'expiry', 'extend link', 'how long', 'comment', 'comments', 'feedback', 'notes from', 'review', 'markup', 'resolve'],
        features: [
          'share-link-make',
          'share-link-length',
          'share-link-list',
          'share-link-extend',
          'share-link-off',
          'share-link-view',
          'share-link-comments-setting',
          'share-link-comment-add',
          'share-link-comments-list',
          'share-link-comments-badge',
          'download-project-file',
          'open-project-file',
          'site-features-project-file',
          'cost-project-file',
        ],
      },
      {
        id: '3d-print',
        label: '3D print',
        icon: 'print3d',
        canvas: 'print',
        subtitle: 'A model of the house on the block.',
        keywords: ['3mf', 'stl', 'printer', 'model', 'scale', 'slicer', 'bed', '1:50', '1:75', '1:100'],
        features: [
          'print-scale',
          'print-scale-1-50',
          'print-bed-width',
          'print-bed-depth',
          'print-tiles',
          'furniture-3d-print',
          'site-features-3d-print',
          'print-status',
          'print-parts-list',
          'print-plastic-volume',
          'print-too-big-warning',
          'print-notes',
          'download-3mf',
          'print-preview-orbit',
          'print-assembled-apart',
          'print-colour-key',
          'print-readout',
        ],
      },
    ],
    more: {
      label: 'More',
      icon: 'sliders',
      subtitle: 'Print settings you rarely need.',
      items: [
        {
          id: 'fine-tuning',
          label: '3D print fine tuning',
          icon: 'gear',
          keywords: ['thinnest wall', 'clearance', 'gap', 'key depth', 'base'],
          features: ['print-fine-tuning', 'print-min-feature', 'print-clearance', 'print-key-depth', 'print-base'],
        },
        {
          id: 'stl',
          label: 'STL files instead of 3MF',
          icon: 'download',
          keywords: ['stl', 'zip', 'slicer'],
          features: ['download-stls'],
          action: 'download-stls',
          run: 'offer',
        },
        {
          id: 'paper',
          label: 'Paper size',
          icon: 'file',
          keywords: ['A3', 'A4', 'sheet size', 'paper'],
          features: ['pdf-paper'],
        },
        {
          id: 'print-instructions',
          label: 'How to print the parts',
          icon: 'print3d',
          keywords: ['instructions', 'supports', 'assemble', 'slicer'],
          features: ['print-instructions'],
        },
      ],
    },
  },
]

// ---------------------------------------------------------------------------
// Always there, in every area

/** Feature ids for each tool on the rail, with its options for new items. */
const TOOL_FEATURES: Partial<Record<Tool, string[]>> = {
  select: ['tool-select'],
  wall: ['tool-wall', 'new-wall-thickness', 'new-wall-kind', 'new-tool-settings-kept'],
  retaining: ['tool-retaining', 'new-retaining-type'],
  door: ['tool-door', 'new-opening-width', 'new-opening-height'],
  window: ['tool-window', 'new-window-sill'],
  room: ['tool-room'],
  area: ['tool-area', 'new-area-kind'],
  roof: ['tool-roof', 'new-roof-mode'],
  stair: ['tool-stair', 'new-stair-width'],
  furniture: ['tool-furniture'],
  measure: ['tool-measure'],
  note: ['tool-note', 'note-edit-delete'],
}

const TOOL_WORDS: Partial<Record<Tool, string[]>> = {
  select: ['pointer', 'pick', 'choose'],
  wall: ['draw walls', 'thickness', 'external', 'internal'],
  retaining: ['retaining wall', 'hold back', 'sleepers', 'block wall', 'earth'],
  door: ['entry', 'swing'],
  window: ['glazing', 'sill'],
  room: ['name a room', 'label'],
  area: ['slab', 'driveway', 'deck', 'garden', 'patio', 'outdoor'],
  roof: ['pitch', 'hip', 'gable', 'roof this building', 'draw roof outline', 'outline'],
  stair: ['stairs', 'steps', 'risers'],
  furniture: ['bed', 'sofa', 'table'],
  measure: ['measure', 'ruler', 'distance', 'slope', 'height', 'fall', 'how far', 'length'],
  note: ['note', 'label', 'text', 'comment', 'annotate'],
}

export const HOMES: Home[] = [
  {
    id: 'top-bar',
    label: 'Top bar',
    features: [],
    items: [
      { id: 'view-plan', label: 'Show the plan', icon: 'plan', keywords: ['floor plan', '2D', 'canvas'], features: ['mode-floor-plan'], action: 'view-plan', run: 'now' },
      { id: 'view-3d', label: 'Show in 3D', icon: 'cube', keywords: ['3D site', 'model', 'canvas'], features: ['mode-3d-site'], action: 'view-3d', run: 'now' },
      { id: 'undo', label: 'Undo', icon: 'undo', keywords: ['back', 'revert', 'history'], features: ['undo-button', 'undo-after-reload', 'cost-undo'], action: 'undo', run: 'now', shortcut: 'mod+Z' },
      { id: 'redo', label: 'Redo', icon: 'redo', keywords: ['again'], features: ['redo-button'], action: 'redo', run: 'now', shortcut: 'mod+shift+Z' },
      { id: 'search', label: 'Search', icon: 'search', keywords: ['find', 'command'], features: ['command-search'], shortcut: 'mod+K', hint: 'Search is open now. ⌘K or Ctrl+K opens it from anywhere.' },
      {
        id: 'sync-chip',
        label: 'Cloud sync status',
        icon: 'cloud',
        keywords: ['saved', 'saving', 'offline', 'sync now', 'synced', 'not saved', 'two devices', 'conflict', 'from another device'],
        features: ['cloud-sync', 'cloud-sync-chip', 'cloud-conflict-copies'],
        hint: 'While you’re signed in, the chip at the top right says Saved, Saving… or Offline. Tap it for what happened, and Sync now.',
      },
      {
        id: 'undo-toast',
        label: 'Undo a replaced survey or plan',
        icon: 'undo',
        keywords: ['put back', 'oops', 'review', 'undo import', 'undo new plan', 'undo delete'],
        features: ['undo-toast', 'review-sheet'],
        hint: 'Replace survey, Import plan, Start the plan again, Open and deleting a project each show what will change first. Afterwards a note at the bottom offers Undo for a few seconds.',
      },
    ],
  },
  {
    id: 'project-menu',
    label: 'Project menu',
    icon: 'file',
    features: [],
    items: [
      { id: 'all-projects', label: 'All projects…', icon: 'list', keywords: ['projects', 'open', 'switch project', 'home'], features: ['projects-home'], action: 'projects', run: 'now' },
      { id: 'new-project', label: 'New project…', icon: 'plus', keywords: ['another house', 'another block', 'start another', 'new survey'], features: ['project-new'], action: 'new-project', run: 'now' },
      {
        // Always a new project, beside the others (src/example).
        id: 'open-example',
        label: 'Open an example',
        icon: 'cube',
        keywords: ['example', 'sample', 'demo', 'try it out', 'finished house', 'show me', 'split level', 'tutorial'],
        features: ['example-project'],
        action: 'open-example',
        run: 'now',
      },
      {
        // "Saved in this browser · 2:14 pm", while not signed in (src/cloud/LocalSave.tsx); signed in, the cloud item says it.
        id: 'save-state',
        label: 'Where it’s saved',
        icon: 'check',
        keywords: ['saved', 'save', 'autosave', 'last saved', 'this browser', 'this device', 'lost work', 'backup', 'storage'],
        features: ['save-state', 'storage-persist'],
      },
      {
        // Shown as "Sign in to save to the cloud…" or "Cloud saves" with the account's name (src/cloud).
        id: 'cloud',
        label: 'Sign in and cloud saves',
        icon: 'cloud',
        keywords: ['sign in', 'log in', 'account', 'passkey', 'Face ID', 'Touch ID', 'Windows Hello', 'cloud', 'sync', 'other devices', 'backup', 'recovery code', 'sign out', 'log out', 'delete account', 'close account', 'storage', 'space', 'email', 'email code', 'sign-in code', 'one-time code', 'lost passkey', 'new device', 'change email', 'remove email'],
        features: ['cloud-sign-in', 'cloud-email-sign-in', 'cloud-create-account', 'cloud-recovery-code', 'cloud-add-passkey', 'cloud-email-address', 'cloud-sign-out', 'cloud-delete-account', 'cloud-space', 'create-account-terms-line'],
        action: 'cloud',
        run: 'now',
      },
      { id: 'project-name', label: 'Project name', icon: 'pencil', keywords: ['title', 'rename'], features: ['project-name'] },
      { id: 'survey-file', label: 'Survey file name', icon: 'file', keywords: ['DXF', 'survey'], features: ['survey-file-name'] },
      { id: 'save-project', label: 'Download a backup (project file)', icon: 'download', keywords: ['download', 'backup', 'keep a copy', 'save project file', 'export project'], features: [], action: 'save-project', run: 'offer', at: 'share/send' },
      {
        id: 'open-file',
        label: 'Open…',
        icon: 'file',
        keywords: ['open project file', 'load', 'import', 'shared', 'json', 'from builder', 'survey', 'DXF', 'LandXML', 'xml', 'CSV', 'spot levels', 'points', 'survey file', 'DWG', 'total station', 'plan', 'import plan', 'add survey'],
        features: ['project-file-as-new', 'open-any-file', 'review-open-project', 'plan-without-survey'],
        action: 'open-file',
        run: 'menu',
      },
      { id: 'export-plan', label: 'Export plan', icon: 'download', keywords: ['save plan', 'json', 'backup'], features: ['plan-export'], action: 'export-plan', run: 'offer', at: 'design/more/plan-file' },
      // Clears the plan in this project (reviewed, with Undo); New project… is the one that starts another.
      { id: 'new-plan', label: 'Start the plan again', icon: 'plus', keywords: ['new plan', 'start over', 'empty', 'clear the plan', 'blank'], features: ['plan-new', 'review-new-plan'], action: 'new-plan', run: 'menu' },
      // The pages about the app (src/legal): they open on their own, with or without a project.
      { id: 'about', label: 'About Contour & Gable', icon: 'file', keywords: ['about us', 'who makes this', 'contact', 'email', 'hello', 'help', 'feedback', 'support', 'who is this for'], features: ['about-page'], action: 'about', run: 'now' },
      { id: 'privacy', label: 'Privacy policy', icon: 'file', keywords: ['privacy', 'data', 'my data', 'cookies', 'tracking', 'analytics', 'what do you keep', 'delete my data', 'personal information', 'APP', 'privacy act'], features: ['privacy-page'], action: 'privacy', run: 'now' },
      { id: 'terms', label: 'Terms of use', icon: 'file', keywords: ['terms', 'terms and conditions', 'conditions', 'legal', 'liability', 'acceptable use', 'storage limit', 'agreement'], features: ['terms-page'], action: 'terms', run: 'now' },
      {
        id: 'accuracy',
        label: 'How accurate is this?',
        icon: 'check',
        keywords: ['accuracy', 'accurate', 'estimates', 'disclaimer', 'caveat', 'can I rely on this', 'limits', 'not advice', 'professional advice', 'reliable', 'trust', 'how good'],
        features: ['accuracy-page', 'caveat-everywhere', 'shared-view-footer'],
        action: 'accuracy',
        run: 'now',
        hint: 'The same short caveat, with a link here, is on the PDF plans, the costs CSV, the 3D print files, the earthworks panel, the checks and the shared view.',
      },
    ],
  },
  {
    // #/projects: the Projects home (src/projects). Each project's card holds what it can do;
    // ⌘K goes to the home and says where on the card to look.
    id: 'projects-page',
    label: 'All projects',
    features: [],
    items: [
      {
        id: 'legal-links',
        label: 'About, Privacy, Terms and Contact',
        icon: 'file',
        keywords: ['footer', 'contact', 'email', 'hello', 'about', 'privacy', 'terms'],
        features: ['legal-footer'],
        action: 'about',
        run: 'now',
        hint: 'The links are at the foot of the start screen and this page, and in the project menu.',
      },
      {
        id: 'project-open',
        label: 'Open a project',
        icon: 'list',
        keywords: ['switch', 'other house', 'recent', 'cards', 'last edited'],
        features: ['project-open', 'project-card'],
        action: 'projects',
        run: 'now',
        hint: 'Each card opens its project where you left it.',
      },
      {
        id: 'project-duplicate',
        label: 'Duplicate a project',
        icon: 'copy',
        keywords: ['copy', 'clone', 'another version', 'option'],
        features: ['project-duplicate'],
        action: 'projects',
        run: 'now',
        hint: 'Duplicate is in each project’s ⋯ menu.',
      },
      {
        id: 'project-rename',
        label: 'Rename a project',
        icon: 'pencil',
        keywords: ['name', 'title', 'call it'],
        features: ['project-rename'],
        action: 'projects',
        run: 'now',
        hint: 'Double-click a project’s name, or use Rename in its ⋯ menu.',
      },
      {
        id: 'project-archive',
        label: 'Archive a project',
        icon: 'archive',
        keywords: ['hide', 'tuck away', 'put away', 'remove', 'archived'],
        features: ['project-archive'],
        action: 'projects',
        run: 'now',
        hint: 'Archive is in each project’s ⋯ menu. Archived projects wait under Archived, where you can restore them.',
      },
      {
        id: 'project-restore',
        label: 'Restore an archived project',
        icon: 'rotate',
        keywords: ['unarchive', 'bring back', 'archived'],
        features: ['project-restore'],
        action: 'projects',
        run: 'now',
        hint: 'Choose Archived at the top of All projects, then Restore on the project.',
      },
      {
        id: 'cloud-upload',
        label: 'Upload projects to the cloud',
        icon: 'cloud',
        keywords: ['this device only', 'local', 'upload', 'move to cloud', 'first sign in'],
        features: ['cloud-first-upload', 'cloud-device-only'],
        action: 'projects',
        run: 'now',
        hint: 'While you’re signed in, the line above your projects says how many are on this device only. Upload… lets you choose which go to the cloud.',
      },
      {
        id: 'project-delete',
        label: 'Delete a project for good',
        icon: 'x',
        keywords: ['remove', 'erase', 'bin', 'trash', 'permanently'],
        features: ['project-delete-review', 'project-delete-undo'],
        action: 'projects',
        run: 'now',
        hint: 'Archive the project first. Under Archived, Delete for good shows what will go before it does, and Undo brings it back for a few seconds after.',
      },
    ],
  },
  {
    id: 'summary-strip',
    label: 'Summary strip',
    features: [],
    items: [
      {
        id: 'strip',
        label: 'Summary strip',
        icon: 'list',
        keywords: ['key numbers', 'chips'],
        features: ['summary-strip', 'checks-chip'],
        hint: 'The line of key numbers under the tabs. Each one opens the panel it comes from.',
      },
      {
        id: 'peek',
        label: 'Key numbers on a phone',
        icon: 'list',
        keywords: ['showing people', 'peek', 'pull up', 'floor', 'FFL', 'roof height', 'phone'],
        features: ['peek-sheet'],
        hint: 'On a phone the key numbers sit in a sheet at the bottom of the plan and 3D. Pull it up, or tap it, for every number.',
      },
      { id: 'overview', label: 'Overview of every number', icon: 'list', keywords: ['numbers', 'summary', 'key numbers', 'facts'], features: ['overview-sheet', 'overview-sun'], action: 'overview', run: 'now' },
      {
        id: 'site-checks',
        label: 'Site features to check',
        icon: 'warn',
        keywords: ['easement', 'tree protection zone', 'TPZ', 'warnings', 'council', 'arborist'],
        features: ['site-checks-chip', 'strip-waits-for-floor'],
        at: 'site/features',
      },
      { id: 'balance', label: 'Balance cut and fill', icon: 'scale', keywords: ['equal', 'earthworks', 'FFL', 'out of balance'], features: [], action: 'balance', run: 'offer', at: 'earthworks/cut-fill' },
    ],
  },
  {
    id: 'commands',
    label: 'Commands',
    features: [],
    items: [
      { id: 'cmd-pdf', label: 'Download PDF plans', icon: 'download', keywords: ['print', 'plan set', 'drawings'], features: [], action: 'download-pdf', run: 'offer', at: 'share/plans' },
      {
        id: 'cmd-da-pack',
        label: 'Download DA pack (PDF)',
        icon: 'download',
        keywords: ['DA', 'development application', 'lodgement', 'title block', 'council', 'town planner', 'checklist'],
        features: [],
        action: 'download-da-pack',
        run: 'offer',
        at: 'share/plans',
      },
      { id: 'cmd-dxf', label: 'Download DXF for CAD', icon: 'download', keywords: ['dxf', 'cad', 'autocad', 'export', 'surveyor', 'engineer'], features: [], action: 'download-dxf', run: 'offer', at: 'share/export' },
      { id: 'cmd-schedule', label: 'Download door and window schedule', icon: 'download', keywords: ['schedule', 'doors', 'windows', 'csv', 'export'], features: [], action: 'download-schedule', run: 'offer', at: 'share/export' },
      { id: 'cmd-picture', label: 'Save a picture of the plan or 3D view', icon: 'download', keywords: ['png', 'image', 'screenshot', 'export'], features: [], action: 'save-picture', run: 'now' },
      { id: 'cmd-3mf', label: 'Download 3MF for printing', icon: 'download', keywords: ['3D print', 'model'], features: [], action: 'download-3mf', run: 'offer', at: 'share/3d-print' },
      { id: 'cmd-reset-camera', label: 'Reset the 3D camera', icon: 'rotate', keywords: ['view', 'orbit', 'home'], features: [], action: 'reset-camera', run: 'now', at: 'site/3d' },
    ],
  },
  {
    id: 'canvas',
    label: 'On the canvas',
    features: [],
    items: [
      {
        id: 'plan-overlays',
        label: 'On the plan',
        icon: 'plan',
        keywords: ['compass', 'scale bar', 'status', 'hint', 'level chip', 'ground meets floor'],
        features: [
          'plan-compass',
          'plan-scale-bar',
          'plan-tool-hint',
          'plan-notice',
          'ground-vs-floor-key',
          'ground-meets-floor-line',
          'level-chip',
          'sketch-canvas-chip',
          'dem-canvas-chip',
          'ghost-walls-note',
          'ground-pointer-readout',
          'retaining-holds-back-pill',
          'key-chip',
        ],
        at: 'design/plan',
      },
      {
        id: '3d-overlays',
        label: 'In the 3D view',
        icon: 'cube',
        keywords: ['compass', 'legend', 'key', 'colours', 'contour labels', 'point at the ground', 'orbit'],
        features: ['compass-3d', 'elevation-legend-3d', 'key-3d', 'contour-labels-3d', 'ground-hover-readout', 'marker-hover-readout', 'orbit-controls-hint', 'survey-problem-message', 'ground-tap-level'],
        at: 'site/3d',
      },
      {
        id: 'plan-tooltips',
        label: 'Tooltips on the plan',
        icon: 'plan',
        keywords: ['hover', 'tooltip', 'what is this', 'point at', 'mouse over', 'name', 'identify'],
        features: ['plan-hover-tooltips'],
        at: 'design/plan',
        hint: 'With the Select tool, rest the mouse on anything on the plan: a tooltip says what it is, with a number or two. On a phone, tap in View instead.',
      },
      {
        id: 'plan-questions',
        label: 'Floor type and retaining wall questions',
        icon: 'floors',
        keywords: ['popup', 'card', 'ask', 'floor type', 'slab or piers', 'suggest retaining wall', 'retaining wall offer', 'gap from house', 'house wall retaining'],
        features: ['floor-type-ask', 'retaining-offer', 'retaining-offer-placement'],
        at: 'design/plan',
        hint: 'When a new room appears on the ground floor, a card at the foot of the plan asks how that floor is built, once (after you finish drawing the walls). On a slab that cuts deep or fills high, another card offers a retaining wall: out from the house, or the house wall itself.',
      },
      {
        id: 'plan-hints',
        label: 'Tips on the plan',
        icon: 'plan',
        keywords: ['hints', 'what next', 'empty plan', 'how to draw walls', 'next step', 'show tips again', 'turn tips back on'],
        features: ['plan-hints'],
        action: 'plan-tips',
        run: 'now',
        hint: 'An empty floor shows how to draw its walls; after that, the next step. × hides one tip; Hide tips hides them all.',
      },
      {
        id: 'floor-from-contour',
        label: 'Floor level from a contour',
        icon: 'floors',
        keywords: ['pick a contour', 'contour line', 'RL', 'set floor level', 'FFL', 'ground floor =', 'floor height'],
        features: ['floor-level-from-contour'],
        action: 'pick-contour',
        run: 'now',
        hint: 'Click a contour line on the plan to put the active floor at its RL. Esc cancels.',
      },
      { id: 'fit-house', label: 'Fit house', icon: 'fitHouse', keywords: ['fit to view', 'zoom', 'frame', 'centre'], features: ['plan-fit-to-view'], action: 'fit-house', run: 'now' },
      { id: 'fit-block', label: 'Fit block', icon: 'fitBlock', keywords: ['whole block', 'zoom out', 'frame'], features: ['fit-block'], action: 'fit-block', run: 'now' },
      { id: 'zoom-in', label: 'Zoom in', icon: 'plus', keywords: ['zoom', 'closer', 'magnify', 'enlarge', 'bigger', 'plus'], features: ['plan-zoom-buttons'], action: 'zoom-in', run: 'now', shortcut: '+' },
      { id: 'zoom-out', label: 'Zoom out', icon: 'minus', keywords: ['zoom', 'further away', 'smaller', 'shrink', 'minus', 'see more'], features: [], action: 'zoom-out', run: 'now', shortcut: '−' },
      {
        id: 'save-notice',
        label: 'Not saved notice',
        icon: 'warn',
        keywords: ['save failed', 'not saving', 'storage', 'private window', 'browser storage'],
        features: ['save-failed-notice'],
        at: 'design/plan',
        hint: 'If the browser won’t save a change, a notice shows at the top of the canvas and on All projects. The change is kept and tried again.',
      },
      {
        id: 'camera-street',
        label: 'Street view',
        icon: 'people',
        keywords: ['3D', 'camera', 'from the street', 'front', 'show people', 'present'],
        features: ['camera-presets-3d', 'camera-remembered', 'show-people-3d', 'camera-clear-of-panels'],
        action: 'camera-street',
        run: 'now',
      },
      { id: 'camera-above', label: 'From above', icon: 'cube', keywords: ['3D', 'camera', 'top down', 'bird’s eye', 'north up'], features: [], action: 'camera-above', run: 'now' },
      { id: 'camera-rear', label: 'From the rear', icon: 'cube', keywords: ['3D', 'camera', 'back', 'backyard'], features: [], action: 'camera-rear', run: 'now' },
      {
        id: 'view-or-edit',
        label: 'View or Edit (phone)',
        icon: 'eye',
        keywords: ['phone', 'touch', 'read only', 'look', 'pinch', 'zoom', 'pan', 'fingers', 'double tap'],
        features: ['phone-view-edit', 'plan-touch-gestures'],
        at: 'design/plan',
        hint: 'On a phone the plan opens in View: one finger pans, two pinch, a double tap zooms and a tap shows numbers. Tap Edit at the top to change things.',
      },
      { id: 'north-up', label: 'North up', icon: 'north', keywords: ['top of view', 'orientation', 'compass', 'square to the house'], features: ['top-of-view'], action: 'north-up', run: 'now' },
      {
        id: 'draw-section',
        label: 'Draw a section line',
        icon: 'section',
        keywords: ['section', 'cross section', 'cut through', 'section line', 'A-A', 'profile', 'slope'],
        features: ['section-line-draw'],
        action: 'draw-section',
        run: 'now',
        shortcut: 'X',
        at: 'design/sections',
      },
      {
        id: 'paint-grade',
        label: 'Grading brush: cut or fill to a level',
        icon: 'shovel',
        keywords: ['brush', 'paint', 'grade', 'grading', 'level', 'levelling', 'cut to', 'fill to', 'cut down', 'fill up', 'bench', 'terrace', 'flat yard', 'eraser', 'RL'],
        features: [],
        action: 'grade-brush',
        run: 'now',
        shortcut: 'B',
        at: 'earthworks/cut-fill',
      },
      {
        id: 'suggested-walls',
        label: 'Suggested retaining walls',
        icon: 'retain',
        keywords: ['suggested retaining wall', 'where do walls go', 'wall needed', 'batter', 'boundary', 'engineer', 'add wall', 'dismiss'],
        features: [],
        at: 'earthworks/cut-fill',
        hint: 'Earthworks › Cut & fill lists the walls the batters need, dashed on the plan, each with why, Add and Dismiss.',
      },
      {
        id: 'finished-contours',
        label: 'Finished contours',
        icon: 'layers',
        keywords: ['proposed contours', 'finished ground', 'design levels', 'existing contours', 'after cut and fill'],
        features: ['finished-contours-toggle', 'finished-contours-key', 'finished-contours-plan'],
        at: 'earthworks/cut-fill',
        hint: 'Finished contours is the switch under Ground vs this floor, at the bottom left of the plan. It shows once there is any cut or fill.',
      },
      {
        id: 'setbacks',
        label: 'Setback dimensions',
        icon: 'setback',
        keywords: ['setback', 'setbacks', 'boundary', 'distance to boundary', 'side boundary', 'dimension', 'clearance'],
        features: ['setback-dimensions-plan', 'setback-dimensions-toggle'],
        at: 'earthworks/place',
        hint: 'Earthworks › Place draws the distance from the house to each side of the block. In Design, tick Setbacks in the key at the bottom left of the plan.',
      },
      {
        id: 'share-link-comments',
        label: 'Comments from share links',
        icon: 'comment',
        keywords: ['comment', 'comments', 'feedback', 'notes from', 'pin', 'review', 'markup', 'resolve'],
        features: ['share-link-comments-plan'],
        at: 'share/send',
        hint: 'People with a link that takes comments pin them on the plan. Tick Comments from share links in the key at the bottom left of the plan to see them; Share › Send lists them.',
      },
      {
        id: 'plan-shadows',
        label: 'Shadows on the plan',
        icon: 'sun',
        keywords: ['shadow', 'shadows', 'shadow diagram', 'overshadowing', 'sun', 'solar', '21 June', 'winter', '9 am', '3 pm', 'neighbours', 'over the boundary'],
        features: ['plan-shadow-diagram', 'shadow-over-boundary'],
        at: 'design/plan',
        hint: 'Tick Shadows, 21 June in the key at the bottom left of the plan, or in Site › Sun. The house’s shadows at 9 am, 12 pm and 3 pm are hatched, with red where they reach over the boundary.',
      },
      {
        id: 'ground-vs-floor',
        label: 'Ground vs this floor',
        icon: 'layers',
        keywords: ['tint', 'cut', 'fill', 'above ground', 'below ground'],
        features: ['ground-vs-floor-toggle'],
        at: 'design/plan',
        hint: 'Ground vs this floor is the key at the bottom left of the plan. Tick it to tint the plan.',
      },
    ],
  },
  {
    id: 'tool-rail',
    label: 'Tool rail',
    features: [],
    items: TOOLS.filter(t => !t.more).map(t => ({
      id: `tool-${t.id}`,
      label: `${t.label} tool`,
      icon: t.icon as IconName | undefined,
      keywords: TOOL_WORDS[t.id] ?? [],
      features: TOOL_FEATURES[t.id] ?? [],
      action: `tool:${t.id}` as const,
      run: 'now' as const,
      shortcut: t.key,
    })),
  },
  {
    id: 'inspector',
    label: 'Selection inspector',
    features: [],
    items: [
      { id: 'inspect-wall', at: 'design/plan', hint: 'Click a wall on the plan: its settings open on the right.', label: 'Selected wall', icon: 'wall', keywords: ['length', 'thickness', 'kind'], features: ['wall-length', 'wall-thickness', 'wall-kind'] },
      {
        id: 'inspect-opening', at: 'design/plan', hint: 'Click a door or window on the plan: its settings open on the right.',
        label: 'Selected door or window',
        icon: 'door',
        keywords: ['width', 'height', 'sill', 'hinge', 'swing', 'garage door'],
        features: ['opening-type', 'opening-width', 'opening-height', 'opening-sill', 'opening-offset', 'door-flip-hinge', 'door-flip-swing'],
      },
      { id: 'inspect-room', at: 'design/plan', hint: 'Click a room’s name on the plan: its settings open on the right.', label: 'Selected room', icon: 'room', keywords: ['rename', 'slab', 'piers', 'ground under', 'living area', 'winter sun', 'sunlight'], features: ['room-name', 'room-floor-type', 'room-ground-range', 'room-living-area'] },
      { id: 'inspect-roof', at: 'design/plan', hint: 'Click anywhere inside a roof on the plan: its settings open on the right.', label: 'Selected roof', icon: 'roof', keywords: ['pitch', 'height above ground', 'fit to walls'], features: ['roof-type', 'roof-pitch', 'roof-overhang', 'roof-stats', 'roof-fit-to-walls', 'roof-click-inside'] },
      {
        id: 'inspect-stair', at: 'design/plan', hint: 'Click a stair on the plan: its settings open on the right.',
        label: 'Selected stair',
        icon: 'stair',
        keywords: ['risers', 'going', 'treads', 'rotate'],
        features: ['stair-shape', 'stair-turn', 'stair-width', 'stair-going', 'stair-bottom-rl', 'stair-top-rl', 'stair-direction', 'stair-stats', 'stair-rotate-90', 'stair-start-on-ground'],
      },
      { id: 'inspect-area', at: 'design/plan', hint: 'Click an area on the plan: its settings open on the right.', label: 'Selected area', icon: 'area', keywords: ['slab', 'deck', 'driveway', 'top level'], features: ['area-name', 'area-type', 'area-top-level'] },
      { id: 'inspect-furniture', at: 'design/plan', hint: 'Click a piece of furniture on the plan: its settings open on the right.', label: 'Selected furniture', icon: 'furniture', keywords: ['size', 'turn', 'rename'], features: ['furniture-settings'] },
      { id: 'delete', label: 'Delete the selection', icon: 'x', keywords: ['remove'], features: ['delete-selected'], shortcut: 'Delete', hint: 'Select something on the plan, then press Delete or use Delete at the foot of its settings.' },
    ],
  },
  {
    id: 'panel',
    label: 'Tab panel',
    features: [],
    items: [
      {
        id: 'panel-hide',
        label: 'Hide or show the panel',
        icon: 'chevL',
        keywords: ['sidebar', 'fold', 'collapse', 'more room'],
        features: ['sidebar-hide', 'sidebar-show', 'sidebar-fold-section'],
        hint: 'The arrow at the top of each panel tucks it away; the tab’s name brings it back. Headings under More fold too.',
      },
    ],
  },
  {
    id: 'onboarding',
    label: 'Start screen',
    features: [],
    items: [
      {
        id: 'start-screen',
        label: 'Start screen',
        icon: 'file',
        keywords: ['import', 'DXF', 'LandXML', 'xml', 'CSV', 'spot levels', 'points', 'survey file', 'DWG', 'total station', 'drop', 'open survey', 'begin', 'onboarding', 'sketch', 'no survey', 'without a survey', 'block size', 'binary DXF', 'no contours', 'survey layers', 'ask the surveyor', 'ASCII DXF', 'address', 'start from an address', 'before buying', 'ground levels', 'elevation', 'LiDAR', 'DEM'],
        features: [
          'restore-saved-project',
          'start-screen',
          'import-dxf-drop',
          'import-dxf-choose',
          'import-landxml',
          'import-csv-points',
          'import-csv-columns',
          'import-dwg-tip',
          'import-project-start',
          'import-status-error',
          'import-help',
          'start-two-choices',
          'survey-layer-pick',
          'surveyor-request',
          'sketch-without-survey',
          'sketch-block-size',
          'start-from-address',
          'start-never-traps',
          'start-what-it-does',
          'street-side-ask',
          'street-side-ask-plan',
        ],
        action: 'new-project',
        run: 'now',
        hint: 'New project opens the start screen: import a survey, sketch the block without one, or start from an address on the state’s ground levels, and add the survey later.',
      },
    ],
  },
  {
    // The getting-started guide and the words it explains (src/guide). Each word is its own
    // command, labelled "What … means" so it never outranks the place a word names.
    id: 'help',
    label: 'Help',
    features: [],
    items: [
      {
        id: 'guide',
        label: 'Help: getting started guide',
        icon: 'list',
        keywords: ['how do I', 'how to', 'tutorial', 'getting started', 'learn', 'instructions', 'manual', 'first steps', 'what next'],
        features: ['getting-started-guide'],
        action: 'guide',
        run: 'now',
      },
      {
        id: 'glossary',
        label: 'Words explained (glossary)',
        icon: 'list',
        keywords: ['help', 'jargon', 'what does it mean', 'definitions', 'terms', 'meaning', 'acronyms'],
        features: ['glossary', 'term-tips'],
        action: 'glossary',
        run: 'now',
      },
      ...TERMS.map(t => ({
        id: `term-${t.id}`,
        label: `What “${t.short}” means`,
        keywords: [t.short, ...(t.long ? [t.long] : [])],
        features: [],
        action: `term:${t.id}` as const,
        run: 'now' as const,
      })),
    ],
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    features: [],
    items: [
      {
        id: 'kbd-fields',
        label: 'Number fields',
        keywords: ['enter', 'escape', 'type a number', 'metres', 'millimetres', 'units', 'error', 'red', 'too small', 'too big'],
        features: ['number-field-keys', 'number-field-units', 'number-field-errors'],
        hint: 'In a number box, Enter keeps what you typed and Esc puts it back. Type 0.9 or 0.9m for 900 mm. A value that can’t be used stays, in red, with why.',
      },
      {
        id: 'kbd-nudge',
        label: 'Nudge with arrow keys',
        keywords: ['arrows', 'move a little', 'small move', 'shift arrow', 'precise'],
        features: ['kbd-nudge'],
        shortcut: 'arrows',
        hint: 'Arrow keys move what is selected 10 mm; Shift+arrow moves it 100 mm. A run of presses is one Undo.',
      },
      {
        id: 'kbd-copy',
        label: 'Copy, paste and duplicate',
        keywords: ['copy', 'paste', 'duplicate', 'clone', 'ctrl c', 'ctrl v', 'ctrl d', 'cmd c'],
        features: ['kbd-copy-paste'],
        shortcut: 'mod+C',
        hint: '⌘C or Ctrl+C copies furniture, rooms, areas and walls with their doors and windows; V pastes them a little off to one side; D copies and pastes in one go.',
      },
      {
        id: 'kbd-multi',
        label: 'Pick several things',
        keywords: ['multi select', 'select all', 'box select', 'marquee', 'group', 'ctrl click', 'several', 'rubber band'],
        features: ['multi-select', 'kbd-select-all', 'multi-select-panel'],
        shortcut: 'mod+A',
        hint: 'Ctrl or ⌘ and click adds to the selection; Ctrl or ⌘ and A picks everything on the floor; Shift and drag over empty ground picks what the box holds. Then drag, nudge, copy or delete them together.',
      },
      {
        id: 'kbd-fit',
        label: 'Fit the house or the block',
        keywords: ['zoom to fit', 'zoom all', 'frame', 'show everything'],
        features: ['kbd-fit'],
        shortcut: '0',
        hint: '0 fits the house in view; Shift+0 fits the whole block.',
      },
      { id: 'kbd-help', label: 'Show all the shortcuts', keywords: ['question mark', 'cheat sheet'], features: ['kbd-help'], shortcut: '?', hint: 'Press ? to list every shortcut.' },
      {
        id: 'kbd-tools',
        label: 'Tool keys',
        keywords: ['shortcuts', 'V W T D N O G R A F S U M'],
        features: ['kbd-tool-shortcuts'],
        hint: 'On the plan, press a tool’s letter: V select, W wall, T retaining wall, D door, N window, O opening, G garage door, R room, A area, F roof, S stair, U furniture, M move. X draws a section line.',
      },
      { id: 'kbd-undo', label: 'Undo key', keywords: ['shortcut', 'ctrl z', 'cmd z'], features: ['kbd-undo', 'undo-keeps-selection'], shortcut: 'mod+Z', hint: '⌘Z or Ctrl+Z undoes the last change, and what you had selected stays selected.' },
      { id: 'kbd-redo', label: 'Redo key', keywords: ['shortcut', 'ctrl y'], features: ['kbd-redo'], shortcut: 'mod+shift+Z', hint: '⌘⇧Z, Ctrl+Shift+Z or Ctrl+Y does it again.' },
      { id: 'kbd-save', label: 'Save key', keywords: ['shortcut', 'ctrl s', 'cmd s', 'save now'], features: ['kbd-save'], shortcut: 'mod+S', hint: '⌘S or Ctrl+S saves now and says where: in this browser, or to the cloud.' },
      { id: 'kbd-delete', label: 'Delete key', keywords: ['backspace', 'remove'], features: ['kbd-delete', 'delete-undo-toast'], shortcut: 'Delete', hint: 'Delete or Backspace removes what is selected on the plan; a toast says what went and has Undo.' },
      { id: 'kbd-escape', label: 'Escape key', keywords: ['finish', 'cancel', 'deselect'], features: ['kbd-escape'], shortcut: 'Esc', hint: 'Esc finishes a run of walls, drops a half-drawn outline, or clears the selection.' },
      { id: 'kbd-length', label: 'Type a length', keywords: ['exact', 'mm', 'dimension'], features: ['kbd-typed-length'], shortcut: '0–9 ↵', hint: 'While drawing a wall or an outline, type a length in mm and press Enter.' },
      { id: 'kbd-close', label: 'Enter closes an outline', keywords: ['finish area', 'close roof'], features: ['kbd-enter-close'], shortcut: '↵', hint: 'Enter closes the area or roof outline you are drawing.' },
      { id: 'kbd-turn', label: 'Turn furniture', keywords: ['rotate', 'quarter turn'], features: ['kbd-furniture-turn'], shortcut: 'Q', hint: 'Q turns the piece you are placing, or the selected one, a quarter turn; Shift+Q turns it back.' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Lookups

export const areaById = (id: string): Area | undefined => AREAS.find(a => a.id === id)

/** A tab of an area, or its More. */
export function tabOf(area: Area, tab: string): Tab | undefined {
  if (tab === MORE) return { id: MORE, label: area.more.label, icon: area.more.icon, subtitle: area.more.subtitle, features: [] }
  return area.tabs.find(t => t.id === tab)
}

/** Every tab id an area has, More last. */
export const tabIds = (area: Area) => [...area.tabs.map(t => t.id), MORE]

export type Place =
  | { kind: 'area'; area: Area }
  | { kind: 'tab'; area: Area; tab: Tab }
  | { kind: 'more'; area: Area; item: Entry }
  | { kind: 'home'; home: Home; item?: Entry }

/** Every entry in the menu with where it lives. */
export function allPlaces(): { entry: Entry; place: Place }[] {
  const out: { entry: Entry; place: Place }[] = []
  for (const area of AREAS) {
    out.push({ entry: area, place: { kind: 'area', area } })
    for (const tab of area.tabs) out.push({ entry: tab, place: { kind: 'tab', area, tab } })
    for (const item of area.more.items) out.push({ entry: item, place: { kind: 'more', area, item } })
  }
  for (const home of HOMES) {
    out.push({ entry: home, place: { kind: 'home', home } })
    for (const item of home.items) out.push({ entry: item, place: { kind: 'home', home, item } })
  }
  return out
}

/** Where a place is, in words: "Earthworks › Cut & fill". */
export function placeName(place: Place): string {
  if (place.kind === 'area') return place.area.label
  if (place.kind === 'tab') return `${place.area.label} › ${place.tab.label}`
  if (place.kind === 'more') return `${place.area.label} › ${place.area.more.label}`
  return place.home.label
}

/** The entry whose home a feature is. */
export function homeOf(featureId: string): { entry: Entry; place: Place } | undefined {
  return allPlaces().find(p => p.entry.features.includes(featureId))
}
