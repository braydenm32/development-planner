# Contour & Gable

A free, browser-based planner for designing a house on a sloping block: import a contour survey, draw floor plans, model roofs and earthworks, and export a 3D-printable site model with removable floors and roof.

Everything runs in the browser. Survey files are read locally and saved in the browser's own storage. Nothing is uploaded unless you sign in to save to the cloud or make a view-only link.

## Status

| Step | What it covers | State |
| --- | --- | --- |
| 1. Site import and terrain | DXF contour import, spot levels, lot boundary, 3D terrain, site stats | Done |
| 2. Floor plan editor | Walls, doors, windows, rooms, dimensions and areas, multiple levels, placing the house on the site | Done |
| 3. 3D house, roofs, cut and fill | Gable/hip/skillion/flat roofs, stairs, slabs and driveways, slab or piers per room, cut and fill volumes | Done |
| 4. Print and share | STL/3MF export at 1:50 to 1:250 with separate terrain, floors and roof that key together; PDF plans; a project file to share | Done |

## Getting around

The app has five areas down the left (along the bottom on a phone): **Site** (the block, its features and the 3D view), **Design** (the floor plan, levels, rooms, roofs, furniture and the planning checks), **Earthworks** (placing the house, cut and fill, retaining walls and the driveway), **Costs** and **Share** (PDF plans, the project file, share links and the 3D print). Each area has its tabs across the top and a **More** tab for its rarer settings; the tab's panel floats over the plan or the 3D view, and the arrow at its top tucks it away. The key numbers sit on one line under the tabs, with **Overview** for the rest. Search (Ctrl+K or ⌘K) finds any area, tab, setting or command. The address keeps where you are, so Back, Forward and reload land in the same place.

## Importing a survey

Export the survey as an ASCII DXF. The importer reads:

- **Contours** as 3D polylines, or 2D polylines/LWPOLYLINEs with an elevation.
- **Spot levels** as points (or 3DFACE vertices).
- **The lot boundary** as a closed polyline. Without one, the extent of the data is used.

Layers are assigned a role automatically from their names and contents, and you can change any of them under **Site › More › Survey layers**. "Reference points" are shown on the model (with how far they sit above or below the surface) but don't shape the terrain, which is handy for checking your own measurements against a professional survey.

Units come from the DXF header (`$INSUNITS`), defaulting to metres. PDF surveys aren't supported yet.

## Drawing a floor plan

**Design › Plan** draws in the house's own frame over the site's boundary and contours.

| Tool | Key | What it does |
| --- | --- | --- |
| Select | V | Select and edit. Drag a wall to move it (walls joined to it stretch), drag its end handles to reshape, drag doors and windows along their wall, Delete to remove. |
| Wall | W | Click each corner. Snaps to wall ends, along walls, square and 45° angles, and lines up with other corners. Type a length in mm and press Enter. The length and bearing of the wall you're drawing, and the total of the run, show by the pointer. Shift turns snapping off. |
| Door / Window / Opening | D / N / O | Click on a wall. The distance to each end of the wall shows before you click. Openings are plain gaps such as garage doors. |
| Room | R | Click inside an area enclosed by walls. The room's area is measured on the inside faces of its walls and updates as the walls change. |
| Area | A | Outline a concrete slab, driveway, deck or garden without walls. Each side's length shows as you draw, with the running total, and you can type a length in mm and press Enter for an exact side, as with walls. Pick the kind first, or change it afterwards. |
| Roof | F | Click inside the walls to roof that outline, or click corners to draw your own (with lengths and typed sides, as for areas). A selected roof shows the length of each eave. |
| Stair | S | Click where the bottom step starts, then the direction it climbs. Its overall length, width and number of risers show as you aim it. Snaps to square unless you hold Shift. |
| Furniture | U | Pick a piece from the catalog in **Design › Furniture** and click to place it. Beds, sofas, benches and the like snap their back flush to a nearby wall, and into a corner. The distance from each side to the nearest wall shows as you place or drag it. Q turns it 90° (Shift+Q the other way). |
| Move on site | M | Drag to slide the house around the block. The distance to each side of the block shows on the plan, and you can type an exact distance for any side in **Earthworks › Place**; the house slides square to that side. Rotation and floor level are there too. |

**Top of view** (under **Site › More**) turns the plan and the 3D view so north, east, south, west or any bearing is at the top, or keeps the plan square to the house; **North up** in the view bar does the same in one click.

**Ground vs this floor** (in the plan's key, on by default) shows how the floor you're drawing sits on the slope before you go to 3D: blue where the floor is above the natural ground (fill, or piers) and orange where it's below (cut), a shade darker every 0.5 m, with a bold line where the ground meets the floor. The tint keeps to within 4 m of the house and whatever you're drawing, and fades out past that; on an empty plan it covers the whole block to help you choose where to start. The top left says which level you're drawing on and its floor RL; the dashed lines are the walls of the level below. Point anywhere on the block to read the ground level there against the floor, and while you draw or drag walls, slabs and decks each corner shows how far the floor is above (+) or below (−) the ground, in metres. A selected room shows the range of ground under it. Upper levels work the same way, with a lighter tint.

Undo and redo with Ctrl+Z / Ctrl+Shift+Z. Each level has its own walls; a new level starts with a copy of the external walls below. **Design › Rooms & areas** shows room areas and the floor area to the outside of the walls; **Earthworks › Place** shows the ground levels under the house and the distances to each boundary.

Plans save automatically in the browser and can be exported or imported as JSON.

## Projects

Keep several projects in the one browser: **All projects…** (in the project menu at the top right, or `#/projects`) shows each one as a card with a sketch of the block and house, when it was last edited, and its site area, floor area and FFL. From there you can start a **New project** from another survey, **Open**, **Duplicate** (a full, separate copy, handy for trying an option), **Rename** and **Archive**. Archived projects stay under **Archived** until you **Restore** them; only an archived project can be deleted, after a review of what will go. Opening a project file someone sent you always makes a new project, so it never overwrites yours. Each project keeps its own survey, plan, last view and print settings, and opens on the area and tab you left it on. A browser that had one project before Projects existed opens it straight away as the first project, named after the plan (or "My house").

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

Pieces that stand against a wall snap their back flush to the wall face when you bring them close, turn to face into the room, and slide into a corner when the side wall is close too; tables, chairs, the island and the car stay where you put them. Drag a piece to move it, drag its round handle to turn it (it snaps to square, then 5° steps; Shift for any angle), or type the angle in its card. Width, depth and height are there too; changing the depth keeps the back against its wall. Delete removes it, and undo works as usual.

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
- **Driveways**, which follow the finished ground. **Earthworks › Driveway** shows the steepest grade.
- **Decks**, raised on posts.
- **Garden or lawn**, which follows the ground.

The house slab and every concrete slab is levelled into the ground, with cut and fill batters (or a retaining wall, if you pick one instead of a slope) out to the natural ground. **Earthworks › Cut & fill** shows the cut and fill volumes, the deepest cut and fill, and warns when the batters run into a boundary. **Balance cut and fill** raises or lowers the whole house until the two match. In 3D, cut shows in orange and fill in blue, and the contours follow the finished ground.

Volumes are bank measure, so allow extra for spoil bulking when ordering trucks.

**Retaining walls** are walls of the kind **Retaining**, drawn with the Wall tool anywhere on the block. They aren't part of the house (no rooms, floor area or roof), but the cut and fill stops at them: batters from the house and slabs can't cross a retaining wall, so the ground behind it stays natural, and they only wrap round its ends. Each wall's height follows the finished ground either side, standing 100 mm above the higher side. Select one to see how much it holds back, the RL of its top and its face area, which is what retaining walls are usually priced on. **Earthworks › Retaining walls** totals them up. They show in 3D, on the PDF site plan with their heights, and on the printed terrain.

## Print and share

**Share › 3D print** shows the model as it will print, assembled or pulled apart.

**3D print.** Pick a scale (1:50, 1:75, 1:100, 1:150, 1:200 or 1:250) and your printer's bed size. At 1:50 the model is twice the size of 1:100 each way, so a typical block prints as several terrain tiles and takes about eight times the plastic; 1:75 sits between, at about 2.4 times the plastic of 1:100. The model comes in separate parts:

- **Terrain**: the finished ground on a solid base, with the slabs, decks, outdoor stairs and piers on it. When it's bigger than the bed it is cut into tiles (A1, B1, ...; letters run west to east, numbers south to north) to glue together on a board.
- **One part per level**: the floor with its walls standing on it. Stair openings are cut through. A floor bigger than the bed is cut into pieces (A1, B1, ...) to glue together before it goes on the part below.
- **Roof** for each level that has one, cut into pieces the same way when it's bigger than the bed.

Parts key together so they sit square but lift off to look inside: the lowest floor drops into a shallow pocket in the terrain, and walls stand a little proud of their floor and drop into slots under the floor or roof above. Walls too thin to print are thickened to the thinnest wall your printer can manage, and the panel says what was changed. Each part prints the way up it sits, flat side down, with no supports. **Fine tuning** sets the thinnest wall, the gap between parts, the key depth and the base thickness. **Include furniture** stands the furniture on the floor of its level, thickened where it's too thin to print; pieces outside the house are left out.

**Download 3MF** gives one file with every part named, coloured and laid out on the bed, for Bambu Studio, PrusaSlicer or Cura. **Download STLs** gives a ZIP with one STL per part. The geometry engine ([Manifold](https://github.com/elalish/manifold)) loads the first time you open the tab.

**PDF plans.** A3 or A4 sheets with a title block, scale bar and north arrow (turned to match **Top of view**): a site plan with contours, boundary lengths, distances from the house to each boundary and the key numbers (site area, footprint, coverage, floor level, cut and fill); a floor plan for each level with wall lengths, overall dimensions, doors, windows, stairs, furniture and room areas; and a roof plan. Scales are chosen from the usual architectural ones so the drawing fits the sheet. The project's name (in the project menu) goes on the title block.

**Share.** **Download project file** saves the survey and the plan as one `.project.json`. Whoever you send it to opens it on the start screen (or with **Open a project file**) and sees exactly what you see. It holds the survey, so only send it to people you'd send the survey to.

**View-only link.** Where the app has its cloud (not on GitHub Pages), **Share › Send** makes a link that opens the latest saved plan, 3D view and numbers on any phone or computer, with no sign-in and no way to change anything. It shows the survey too. A link works for 30 days, or 90 days or a year if you pick that; **Add 30 days** keeps one going (up to a year from today), and **Turn off** stops it at once.

## How the terrain is built

1. Contour vertices and spot levels are triangulated (Delaunay TIN).
2. The TIN is sampled onto a regular grid (0.25 m on a typical house block) with two light smoothing passes, which removes the flat "terraces" a contour-only TIN produces.
3. The grid is trimmed exactly to the lot boundary and closed with side walls and a base, giving a watertight solid that later becomes the printable terrain base.

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
