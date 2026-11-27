# Contour & Gable

A free, browser-based planner for designing a house on a sloping block in New South Wales: bring in a contour survey (or start from an address or a sketch), draw the house, model its roofs and earthworks, check it against the planning rules, estimate what it would cost, and share it as PDF plans, a concept DA pack, a view-only link or a 3D-printable site model with removable floors and roof.

Everything runs in the browser. Survey files are read locally and saved in the browser's own storage. Nothing is uploaded unless you sign in to save to the cloud or make a view-only link.

**It is a planning aid, not advice.** The checks, volumes, grades and costs are estimates for working out what is worth asking about. Confirm anything that matters with your council, a certifier, an engineer, a surveyor and a builder; **Project menu › How accurate is this?** says how far each result can be trusted. The planning rules, map, BASIX checklist, fees and owner-builder rules are for NSW only, and the council rules cover only a few councils so far (any other council gets the state-wide Housing Code).

## How this differs from a floor planner

A floor planner draws a house on a flat page. Contour & Gable draws it on the block's real ground, so every number follows the slope: each floor's level against the ground under it, the cut and fill and the batters out to the boundary, retaining walls and how much they hold back, the driveway's grade to the street, the roof's height above natural ground, and the winter shadows over the neighbours. The same numbers then feed the planning checks, the cost estimate and the drawings, and agree across all of them.

## Getting around

The app has six areas down the left (along the bottom on a phone):

- **Site**: the block (**Block**), what is already on it (**Features**: trees, easements, fences, services, and PDF or picture drawings to line up and trace over; **Design › More › Trace a plan picture** leads there), the NSW **Map** with what the planning maps say, the **3D** view's settings, and the **Sun** study.
- **Design**: the house. **Plan** is the drawing on its own; **Levels**, **Rooms & areas**, **Walls & doors** (lists you can work from with the keyboard), **Roofs**, **Furniture**, **Sections** (section lines and the four elevations) and **Options** (named versions of the design, compared side by side).
- **Earthworks**: **Place** the house on the block, **Cut & fill** (with a grading brush and suggested retaining walls), **Retaining walls** and the **Driveway**.
- **Approvals**: the planning **Checks** for a CDC or a DA as you draw, the **BASIX** checklist, the **Stormwater** concept and the **DA pack**.
- **Costs**: an **Estimate** from the design's own quantities, the **Materials** it's built from, and **Quotes** that replace a line's estimate.
- **Share**: **Plans (PDF)**, **Export** (DXF, pictures, a door and window schedule, the 3D model), **Send** (a view-only link or the project file) and **3D print**.

Each area has its tabs across the top and a **More** tab for its rarer settings; the tab's panel floats over the plan or the 3D view, and the arrow at its top tucks it away. On a computer, the panel's dock button (or search for "dock") sets the panels beside the canvas instead, with the drawing in the space left; drag the docked panel's edge to make it wider. The **2D | 3D** switch in the top bar swaps the plan for the 3D view in any area. The key numbers sit on one line under the tabs, with **Overview** for the rest, and **Check everything** in the top bar walks the project as six steps (Block, Levels & rooms, Roof, Ground & walls, Checks, Costs & share). Search (Ctrl+K or ⌘K) finds any area, tab, setting or command, and **Help › Getting started guide** walks through the lot. The address keeps where you are, so Back, Forward and reload land in the same place. On a phone a project opens in **View**, for showing people; **Edit** brings back the tools.

**Walk through** in the 3D view's bar (or on a room's card and right-click menu) puts you inside the house at eye height: drag to look round, walk with the arrow keys or W A S D (Q and E turn; on a touch screen, the arrow pad), or click the floor to walk there. Walls stop you and doorways let you through; **Go up** and **Go down** change level, and Esc puts the camera back where it was.

## Starting a project

The start screen offers two ways in, plus a third for a block with no survey yet:

- **Import a survey**: an ASCII DXF, a LandXML file (`.xml`), or spot levels in a CSV or text file (easting, northing, level; the app asks which column is which when it can't tell). A DWG needs saving as an ASCII DXF first, and the app says what to ask your surveyor for when a file has no ground in it.
- **Sketch without a survey**: a flat or gently sloping block of the size you give, to plan on now and swap for the survey later (**Site › More › Replace survey** keeps the plan).
- **Start from the address**: find the lot on the NSW map and use the state's ground levels (the 5 m elevation model, roughly ±0.9 m) with the lot as the boundary. Good for a first look, not for earthworks; the app keeps saying so until a survey replaces it.

Or **start from a house**: seven made-up starter plans (a studio, a compact two-bedroom, a narrow-block home, three- and four-bedroom single storeys, a split level and a two-storey) go in the middle of the block facing the street, as ordinary plan data to move and change. They're on the start screen, in Getting started and under **Design › More › Start from a house**; a plan with a house drawn asks whether to replace it or add the starter beside it.

From a DXF the importer reads:

- **Contours** as 3D polylines, or 2D polylines/LWPOLYLINEs with an elevation. A survey with only spot levels gets contours drawn from them.
- **Spot levels** as points (or 3DFACE vertices).
- **The lot boundary** as a closed polyline. Without one, the extent of the data is used.
- **Site features** (trees, easements, fences, buildings) from layers whose names say so.

Layers are assigned a role automatically from their names and contents, and you can change any of them under **Site › More › Survey layers**. "Reference points" are shown on the model (with how far they sit above or below the surface) but don't shape the terrain, which is handy for checking your own measurements against a professional survey. Units come from the DXF header (`$INSUNITS`), defaulting to metres.

A PDF survey or site plan can't be read for levels, but **Site › Features** lays it (or a picture) under the plan: line it up by two points, then trace trees, easements, fences and services over it, and the app picks out what it can find in a PDF's line work.

## Drawing a floor plan

**Design › Plan** draws in the house's own frame over the site's boundary and contours.

| Tool | Key | What it does |
| --- | --- | --- |
| Select | V | Select and edit. Drag a wall to move it (walls joined to it stretch, and walls that butt into it follow), drag its end handles to reshape, drag doors and windows along their wall, Delete to remove. |
| Wall | W | Click each corner. Snaps to wall ends, along walls, square and 45° angles, and lines up with other corners. Type a length in mm and press Enter (`3000<45` sets the angle too). The length and bearing of the wall you're drawing, and the total of the run, show by the pointer. Shift keeps it square to the house; Alt (Option on a Mac) turns snapping off. Walls that close round a space make a room of it ("Room 1"), in the same undo step. **Rectangle room** (Shift+W, or the switch on the tool's card) draws four walls and their room in one go: drag from one corner to the opposite one, click each, or click a corner and type `4000x3000` (width x depth in mm) and press Enter. |
| Retaining wall | T | A wall in the yard that holds back earth: click its start and each corner, then click the side the earth is on. It asks how high the earth behind it is, and shows what it changes in cut and fill. An amber flag marks a wall holding back more than 600 mm, which needs an engineer. |
| Door / Window / Wall opening / Garage door | D / N / O / G | Click on a wall. The distance to each end of the wall shows before you click. A wall opening is a plain gap such as an archway; a garage door has no swing and starts 4.8 m wide. Pick the kind (hinged, sliding, bifold, awning and so on) on the tool's card. |
| Room | R | Click a room to name it and pick its type (rooms make themselves when walls close round a space; with Select, click a room's floor to pick it, and double-click to type its name). A closed space with no room yet gets one. The room's area is measured on the inside faces of its walls and updates as the walls change. |
| Outdoor area | A | Outline a concrete slab, driveway, deck or garden without walls. Each side's length shows as you draw, with the running total, and you can type a length in mm and press Enter for an exact side, as with walls. Pick the kind first, or change it afterwards. |
| Roof | F | Click inside the walls to roof that outline, or click corners to draw your own (with lengths and typed sides, as for areas). A selected roof shows the length of each eave. |
| Stair | S | Click where the bottom step starts, then the direction it climbs. Its overall length, width and number of risers show as you aim it. Keeps square to the house unless you hold Alt (Option on a Mac). |
| Furniture | U | Pick a piece from the catalog in **Design › Furniture** and click to place it. Beds, sofas, benches and the like snap their back flush to a nearby wall, and into a corner. The distance from each side to the nearest wall shows as you place or drag it. Q turns it 90° (Shift+Q the other way). |
| Move on site | M | On the Earthworks tool rail as **Move house**. Drag to slide the house around the block. The distance to each side of the block shows on the plan, and you can type an exact distance for any side in **Earthworks › Place**; the house slides square to that side. Rotation and floor level are there too. |
| Measure | L | Click from point to point to read each distance, the distance along the ground and the height, with a running total. Double-click, Enter or Esc finishes. With **Keep measurements** (on by default) each one stays on the plan as a dimension line until you delete it; drag its ends to measure again. |
| Note | E | Click the plan to drop a short label, with an arrow if you like; click a note to change or delete it. |
| Sketch | K | Construction lines that change nothing: straight lines (chained, with typed lengths, or `3000<45` for a length and angle), arcs (start, end, then the bulge), circles and smooth curves. Every tool snaps to their ends, middles, crossings and centres, and onto the lines. Select one to **Make walls**, **Make a retaining wall** or **Make an area outline** along it (curves in short straight pieces); the sketch stays. They show on every level; **Sketch & measurements** in the key hides them, and **Clear sketch layer** removes them all (with Undo). On a computer only; a phone shows them. |
| Section line | X | Two clicks across the plan draw a section, square to the house unless you hold Alt. **Design › Sections** shows it, with the four elevations. |
| Grading brush | B | In **Earthworks › Cut & fill**: paint ground to cut or fill to a level you type or pick from a contour ([ and ] change its size). |

Press **?** for every keyboard shortcut. The **live section** under the plan (in Design and Earthworks) is a cut through the house and the ground that follows the plan as you pan and zoom; drag a level band in it to move that floor up or down.

**Top of view** (under **Site › More**) turns the plan and the 3D view so north, east, south, west or any bearing is at the top, or keeps the plan square to the house; **North up** in the view bar does the same in one click.

**Ground vs this floor** (in the plan's key, on by default) shows how the floor you're drawing sits on the slope before you go to 3D: blue where the floor is above the natural ground (fill, or piers) and orange where it's below (cut), a shade darker every 0.5 m, with a bold line where the ground meets the floor. The tint keeps to within 4 m of the house and whatever you're drawing, and fades out past that; on an empty plan it covers the whole block to help you choose where to start. The top left says which level you're drawing on and its floor RL; the dashed lines are the walls of the level below. Point anywhere on the block to read the ground level there against the floor, and while you draw or drag walls, slabs and decks each corner shows how far the floor is above (+) or below (−) the ground, in metres. A selected room shows the range of ground under it. Upper levels work the same way, with a lighter tint.

Undo and redo with Ctrl+Z / Ctrl+Shift+Z: one order across the plan, the site features and the costs, so the latest change anywhere is what goes; the buttons name the step ("Undo: move wall"), and a step taken back on another screen is said in a note with **Show**. All three histories survive a reload, in the same order. Each level has its own walls; a new level starts with a copy of the external walls below. **Design › Rooms & areas** shows room areas and the floor area to the outside of the walls; **Earthworks › Place** shows the ground levels under the house and the distances to each boundary.

Plans save automatically in the browser. **Design › More › House plan file** exports or imports the house plan on its own as JSON; the project file (below) holds everything.

## Projects

Keep several projects in the one browser: **All projects…** (in the project menu at the top right, or `#/projects`) shows each one as a card with a sketch of the block and house, when it was last edited, and its site area, floor area and FFL. From there you can start a **New project** from another survey, **Open**, **Duplicate** (a full, separate copy, handy for trying an option), **Rename**, **Archive** and **Delete…** (after a review of what will go, with Undo). Archived projects stay under **Archived** until you **Restore** them. With seven or more projects there is a search box and a sort (last edited or name). The same project open in two tabs stays in step: a tab takes in what the other saved, or asks which version to keep if both had changes. Opening a project file someone sent you always makes a new project, so it never overwrites yours. Each project keeps its own survey, plan, last view and print settings, and opens on the area and tab you left it on. A browser that had one project before Projects existed opens it straight away as the first project, named after the plan (or "My house").

## Furniture

The **Furniture** tool (U) places furniture and fittings in common Australian sizes, drawn as simple architectural symbols:

- **Bedroom**: single, king single, double, queen and king beds, bedside table, wardrobe.
- **Living**: 2- and 3-seat sofas, armchair, coffee table, TV unit.
- **Dining**: tables for 4, 6 and 8, drawn with their chairs.
- **Kitchen**: a 600 deep bench run, island bench, 900 wide fridge space, cooktop and oven, sink, dishwasher.
- **Laundry**: washing machine, dryer, laundry tub.
- **Bathroom**: toilet, vanity basin, 900 × 900 shower, 1700 bath.
- **Study**: desk and desk chair.
- **Garage and outdoor**: a 4.9 × 1.9 m car, outdoor table for 4, BBQ.

Pieces that stand against a wall snap their back flush to the wall face when you bring them close, turn to face into the room, and slide into a corner when the side wall is close too; tables, chairs, the island and the car stay where you put them. Drag a piece to move it, drag its round handle to turn it (it snaps to square, then 5° steps), or type the angle in its card. Width, depth and height are there too; changing the depth keeps the back against its wall. Delete removes it, and undo works as usual.

Furniture shows in the 3D view (turn it off under **Site › 3D**), on the PDF floor plans in thin lines (turn it off under **PDF plans**), and is left out of the 3D print unless you tick **Include furniture**.

## Roofs

Each roof has a type (hip, gable, skillion or flat), a pitch and an eave overhang. Hip and gable roofs are built as a weighted straight skeleton of the outline, so L, T and U shaped houses get proper hips, valleys and ridges. Select a roof to:

- Click the **H** or **G** marker on an edge to switch that end between a hip and a gable.
- For a skillion, click **low** on the edge that should be the low side.
- Drag its corners, or **Fit to walls** to snap it back to the walls below.

A selected roof's card shows the top-of-roof RL, its height above the natural ground (for height limits) and the sloping roof area.

## Stairs

Stairs can be straight, L shaped or U shaped with a landing halfway. The number of risers is worked out from the height to the next level, with no riser over 190 mm, and the stair's card checks the going against the 2R + G comfort range (550 to 700 mm). A stair cuts its own opening in the floor it arrives at. An outdoor stair can start on the ground and runs down to meet it in 3D.

## Slabs, piers and cut and fill

Rooms on the lowest level sit on a slab by default; set a room to **piers** to raise it on posts with a subfloor gap instead. Areas can be:

- **Concrete slabs**, with their own top level, for patios, landings and paths.
- **Driveways**, which run from the garage slab out to the street (one that stops short of the house follows the ground). **Earthworks › Driveway** shows the direction as an arrow on the plan, with Swap ends, then the levels, the grade and the crossing checks.
- **Decks**, raised on posts.
- **Garden or lawn**, which follows the ground.

The house slab and every concrete slab is levelled into the ground, with cut and fill batters (or a retaining wall, if you pick one instead of a slope) out to the natural ground. **Earthworks › Cut & fill** shows the cut and fill volumes, the deepest cut and fill, and warns when the batters run into a boundary. **Balance cut and fill** raises or lowers the whole house until the two match. In 3D, cut shows in orange and fill in blue, and the contours follow the finished ground.

Volumes are bank measure, so allow extra for spoil bulking when ordering trucks.

**Retaining walls** are drawn with the Retaining wall tool (T) anywhere on the block, or added for you: **Retain the edges** in **Earthworks › Cut & fill** puts one along each side of the house pad, and the Cut & fill tab suggests walls where a batter would need one. They aren't part of the house (no rooms, floor area or roof), but the cut and fill stops at them: batters from the house and slabs can't cross a retaining wall, so the ground behind it stays natural, and they only wrap round its ends. Each wall's height follows the finished ground either side, standing 100 mm above the higher side. Select one to see how much it holds back, the RL of its top and its face area, which is what retaining walls are usually priced on. **Earthworks › Retaining walls** totals them up. They show in 3D, on the PDF site plan with their heights, and on the printed terrain.

## Approvals

**Approvals › Checks** runs the design against the planning rules as you draw: the Housing Code for a complying development certificate (CDC), or a council's LEP and DCP for a development application (DA), for the councils covered so far. Each row says what it measured, the clause and how sure the research is, and **Go to fix** takes you to where it's changed; a red pin on the plan marks where a check fails. Setbacks, height, site coverage, landscaped area, cut and fill, retaining walls, tree protection zones, the driveway's crossing, winter sun to the neighbours and what the planning maps say about zoning, heritage, bushfire, flood and landslide are among them. A check that needs something not drawn yet says **Not drawn yet** rather than passing.

**BASIX** gathers what the official BASIX tool will ask for from the plan (window and glass door areas by facade, living areas, roof area, the tank; a door's card has a Glass door tick, on by default for sliding, bifold and double doors) and your answers, as a checklist to download. **Stormwater** sizes the roof catchment and the tank and says whether the block drains to the street. The **DA pack** is a PDF a town planner or designer can start a DA from: a cover checklist, site plan, floor plans, elevations and sections, shadow diagrams for 21 June, a cut and fill plan, the stormwater concept and a table of the planning controls. It is a concept pack, never ready to lodge.

## Costs

**Costs › Estimate** prices the design from its own quantities (floor, walls, windows, roof, cut and fill, retaining walls, driveway) at starting rates, as a likely range 20% either way, with a cross-check against what custom-built houses at that finish usually cost and rough council and government fees. Pick a builder or yourself as owner-builder (each line then splits into materials and labour), change the **Materials**, add **Quotes** as they come in, and change any rate under **Costs › More**. It is a guide for budgeting, not a quote.

## Print and share

**Share › 3D print** shows the model as it will print, assembled or pulled apart.

**3D print.** Pick a scale (1:50, 1:75, 1:100, 1:150, 1:200 or 1:250) and your printer's bed size. At 1:50 the model is twice the size of 1:100 each way, so a typical block prints as several terrain tiles and takes about eight times the plastic; 1:75 sits between, at about 2.4 times the plastic of 1:100. The model comes in separate parts:

- **Terrain**: the finished ground on a solid base, with the slabs, decks, outdoor stairs and piers on it. When it's bigger than the bed it is cut into tiles (A1, B1, ...; letters run west to east, numbers south to north) to glue together on a board.
- **One part per level**: the floor with its walls standing on it. Stair openings are cut through. A floor bigger than the bed is cut into pieces (A1, B1, ...) to glue together before it goes on the part below.
- **Roof** for each level that has one, cut into pieces the same way when it's bigger than the bed.

Parts key together so they sit square but lift off to look inside: the lowest floor drops into a shallow pocket in the terrain, and walls stand a little proud of their floor and drop into slots under the floor or roof above. Walls too thin to print are thickened to the thinnest wall your printer can manage, and the panel says what was changed. Each part prints the way up it sits, flat side down, with no supports. **Fine tuning** sets the thinnest wall, the gap between parts, the key depth and the base thickness. **Include furniture** stands the furniture on the floor of its level, thickened where it's too thin to print; pieces outside the house are left out.

**Download 3MF** gives one file with every part named, coloured and set out side by side (use your slicer’s Arrange to fit your bed), for Bambu Studio, PrusaSlicer or Cura. **Download STLs** gives a ZIP with one STL per part. The geometry engine ([Manifold](https://github.com/elalish/manifold)) loads the first time you open the tab.

**Plans (PDF).** A3 or A4 sheets with a title block, scale bar and north arrow (turned to match **Top of view**): a site plan with contours, boundary lengths, distances from the house to each boundary and the key numbers (site area, footprint, coverage, floor level, cut and fill); a floor plan for each level with wall lengths, overall dimensions, doors, windows, stairs, furniture and room areas; a roof plan; and, where there are any, sections and elevations, a shadow diagram for 21 June and the site features. Scales are chosen from the usual architectural ones so the drawing fits the sheet. The project's name (in the project menu) goes on the title block.

**Export.** A DXF in the survey's coordinates for your surveyor or drafter, a picture of the plan or the 3D view, and the door and window schedule as a CSV. **Download 3D model** saves the whole model as the 3D view shows it (ground, each level's walls, floors, roofs and stairs, outdoor areas, furniture) as a `.glb` for Blender, renderers or SketchUp, or as OBJ with its `.mtl` in a ZIP: real metres, Y up, the origin at the middle of the block, each part named and grouped by level.

**Send.** **Download project file** saves the survey and the plan as one `.project.json`. Whoever you send it to opens it on the start screen (or with **Open a project file**) and sees exactly what you see. It holds the survey, so only send it to people you'd send the survey to.

**View-only link.** Where the app has its cloud (not on GitHub Pages), **Share › Send** makes a link that opens the latest saved plan, 3D view and numbers on any phone or computer, with no sign-in and no way to change anything. It shows the survey too. A link works for 30 days, or 90 days or a year if you pick that; **Add 30 days** keeps one going (up to a year from today), and **Turn off** stops it at once. You can let people leave comments on the plan from a link, which come back to **Share › Send** and show as pins on your plan. Accounts sign in with a passkey and are by invite for now.

## How the terrain is built

1. Contour vertices and spot levels are triangulated (Delaunay TIN).
2. The TIN is sampled onto a regular grid (0.25 m on a typical house block) with two light smoothing passes, which removes the flat "terraces" a contour-only TIN produces.
3. The grid is trimmed exactly to the lot boundary and closed with side walls and a base, giving a watertight solid that later becomes the printable terrain base.

## Working offline

Once Contour & Gable has been opened in a browser, it opens and works with no connection: drawing, the checks, costs, 3D, PDF plans, exports, 3D print files and saving on this device. The top bar says **Offline** meanwhile; sign-in, cloud saves, share links, comments and the NSW map say they need a connection, and come back when it does. Where the browser offers it (Chrome, Edge), **Project menu › Install Contour & Gable** adds it as an app; on an iPhone or iPad use **Share › Add to Home Screen**.

How it works: a hand-written service worker (`src/offline/sw.ts`, built as `sw.js` by `scripts/offlinePlugin.ts` with the list of every built file) keeps each version's files in a cache of its own. The page loads from the network first, so a deploy is picked up straight away, and from the cache when offline; the Worker API and other sites are never touched. A new version installs in the background and the app shows **A new version is ready · Reload**; it takes over only when someone chooses Reload, after their work is saved. It is built for both deployments (GitHub Pages under `/development-planner/`, Cloudflare at `/`) and never runs in `npm run dev` or the tests.

**Kill switch**: if the service worker ever misbehaves on the live site, set `SERVICE_WORKER_OFF = true` in `src/offline/killSwitch.ts` and push to main. That build's `sw.js` deletes the app's caches and unregisters itself the next time a browser checks for an update (each page load, and hourly), and the app stops registering one; open pages carry on and nothing reloads by itself. Set it back to `false` to turn offline working on again.

## Development

```sh
npm install
npm run dev      # start the app at http://localhost:5173
npm test         # unit tests
npm run lint
npm run build
```

`samples/sample-block.dxf` is a made-up survey laid out like a surveyor's DXF (made by `node scripts/make-sample-survey.mjs`); the end-to-end tests run on it. To check your own survey the same way without adding it to the repo:

```sh
SURVEY_DXF=/path/to/survey.dxf npx vitest run real-survey
```

Built with React, TypeScript, Vite and Three.js (via react-three-fiber).
