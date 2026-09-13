# Windpost Select — Developer & Maintainer Guide

This document explains how the whole tool is put together and gives exact,
step-by-step instructions for changing anything in it. It is written so that
someone who did not build the software can safely make a change.

Read the section for the change you want in **Part 5 — "How to change X"**.
The earlier parts explain the layout and the calculation so those steps make
sense.

---

## Part 1 — What this software is

- A **structural design tool** that selects a U or L windpost, calculates its
  final ULS capacity at an exact height, and schedules the wall ties.
- It runs **entirely in the browser, offline**. There is no server and no
  internet call at runtime.
- It ships as **one self-contained HTML file** (`Windpost-Selector-Full.html`)
  that can be opened by double-click or embedded in a web page.

### Two copies of the app — keep this straight

| File | What it is | When to use |
|------|------------|-------------|
| `index.html` + the `css/` and `js/` folders | The **development** version, split into many small files | Edit these |
| `Windpost-Selector-Full.html` | The **standalone** version — every CSS and JS file inlined into one | Generated automatically; ship this |

You **edit the split files**, then run the build to regenerate the standalone.
Never hand-edit `Windpost-Selector-Full.html` — your change would be lost the
next time it is rebuilt.

---

## Part 2 — File map

```
index.html                     The development app page (loads the js/css files)
cavity-wall-assembly.html      Separate L-post masonry/tie assembly page
Windpost-Selector-Full.html    GENERATED standalone (do not edit by hand)
build-standalone.js            Inlines css+js into the standalone file
OPEN-WINDPOST-SELECTOR.cmd     Double-click to open the standalone
OPEN-CAVITY-WALL-ASSEMBLY.cmd  Double-click to open the cavity-wall page
UPDATE-FROM-EXCEL.cmd          Double-click to rebuild data from the workbook
windpost-database.xlsx         The DATA source of truth (sections/ties/constants)
HOW-TO-UPDATE-DATABASE.md      Short guide for the Excel workflow
DEVELOPER-GUIDE.md             This file

css/
  app.css                      All styling for the app page

js/
  data/
    windpost-parameters.js     GENERATED — ties + all editable constants
    standard-section-heights.js GENERATED — the standard heights list
    u-section-database.js      GENERATED — the U sections
    l-section-database.js      GENERATED — the L sections
    section-profiles.js        Section lookup helpers (getSections, properties)
  config.js                    App constants (reads windpost.parameters)
  utils.js                     Small shared helpers
  engines/
    secant-modulus-engine.js   Stainless secant modulus (Ramberg-Osgood solve)
    load-case-engine.js        Deflection limits + per-support-condition factors
    tie-capacity-engine.js     Number of ties and total tie capacity
    windpost-calculation-engine.js  Orchestrates one section's full calculation
    result-selection-engine.js Service vs ultimate governing value selection
    outer-tie-selection-engine.js   Wall geometry + EDC outer tie selection
    automatic-selection-engine.js   Iterates sections; DESIGN_DEFAULTS; runDesign
    baseplate-*.js                  Shared U/L RGM 12 sizing and design checks
  services/
    design-report-service.js   Builds the printable detailed-calculation HTML
    baseplate-*.js             Existing L-post plan/section SVG drawing
    u-baseplate-*.js           U-post floating-baseplate plan/section SVG drawing
    cavity-wall-assembly-engine.js  Shared L-post/wall/tie geometry model
    cavity-wall-drawing-service.js Coordinated plan/elevation/side/iso SVGs
    windpost-scene-mesh-engine.js  Polygon scene -> triangle meshes (smooth
                               normals, hole triangulation) + cavity-wall
                               context: slabs, cut-away brick/block leaves,
                               ties, head connection
    windpost-gl-renderer.js     Library-free WebGL 1 renderer: depth buffer,
                               shadow map, procedural stainless/concrete/
                               brick/block materials, white studio ground
    ../engines/fold-width-engine.js  Fold (blank) width per the workbook lines
                               (U, L, DU = 2 x U, I); "workbook" or "developed"
                               basis (config.FOLD_WIDTH_BASIS); one source for
                               drawings, DXF, post weight and Selector results
    cad-layer-standard.js       Detailer layer standard: names, ACI colour,
                               lineweight, linetypes, Arial styles, SALEEM
    dxf-r2000-writer.js         AutoCAD 2000 DXF writer (lineweights, LWPOLYLINE,
                               ANSI31 hatch, dimension style) for the A4 sheet
    cavity-wall-3d-engine.js    Scene geometry + interactive viewer; draws
                               through the WebGL renderer, 2D painter fallback
  ui/
    app.js                     UI controller: reads the form, runs the design,
                               renders the result panel and detailed report
    cavity-wall-page.js         Separate cavity-wall page controller

tools/                         BUILD-TIME ONLY (never shipped in the app)
  build-database.js            Reads the workbook -> regenerates js/data files
  init-workbook.js             Reads current data -> (re)creates the workbook
  lib/section-geometry.js      Cold-formed U/L section property calculator
  vendor/xlsx.mini.min.js      SheetJS (spreadsheet reader); build tool only
  vendor/README.txt            Provenance of the vendored library

tests/
  run-tests.js                 23 core behavioural checks
  outer-tie-table-tests.js     EDC tie selection vs the published tables
  tie-naming-tests.js          Custom tie names + per-tie actual lengths
  parapet-tests.js             Parapet matrix + photographed ULS UDL values
  photo-mode-tests.js          Realistic (photo) drawing mode + inlined approval views
  deployment-tests.js          Built-page links, hand-off gating of drawn connections, DXF hatch codes, DU elevation edges
  design-data-tests.js         Editable design data: per-tie capacities, constants, anchors, bolt SKUs, connection bolts, workbook-basis U blank
  random-tests.js              1600 randomised end-to-end invariant checks
  baseplate-tests.js           Shared design + U/L geometry and UI routing checks
  cavity-wall-assembly-tests.js L-post masonry/tie/drawing geometry checks
```

### Connections, DU / I catalogues (V.03, 11 Sep 2026)

`js/data/du-section-database.js`, `js/data/i-section-database.js` and
`js/data/connections-database.js` are generated from
`WINDPOST_CALCULATOR_V2.xlsx` (sheets Sections_DU, Sections_I, Connections,
BasePlates, Bolts) by the V2 build tooling, not by `UPDATE-FROM-EXCEL.cmd`.
The engine that uses them is `js/engines/connection-selection-engine.js`
(pure: fixings + bolt families + capacity + height in, codes / SKUs / counts /
weights out). The UI reads steps 6 and 7 in `js/ui/app.js`
(`readConnectionInputs`, `populateFixings`, `connectionsBlockHtml`) and the
report appends section 5 in `design-report-service.js`. Tests:
`tests/connections-tests.js`.

### Which files are GENERATED (never edit by hand)

- `js/data/du-section-database.js`, `js/data/i-section-database.js`, `js/data/connections-database.js` (from the V2 workbook)
- `js/data/windpost-parameters.js`
- `js/data/standard-section-heights.js`
- `js/data/u-section-database.js`
- `js/data/l-section-database.js`
- `Windpost-Selector-Full.html`

Every generated file starts with a `// GENERATED FILE — DO NOT EDIT BY HAND`
banner. To change what is in them, edit `windpost-database.xlsx` and run
`UPDATE-FROM-EXCEL.cmd` (data files), or `build-standalone.js` (the HTML).

---

## Part 3 — How a calculation runs (end to end)

When the user clicks **Run windpost selection**:

1. `js/ui/app.js` `readOptions()` reads the form (type, support, load, height,
   mode, required load / chosen section, wall leaves).
2. It calls `automaticSelectionEngine.runDesign(options)`.
3. `runDesign` gets the candidate list from `sectionProfileEngine.getSections`
   and, for each section, calls `evaluateSection`, which:
   - a. reads the section's `ixx`, `zxx`, `area` (`getSectionProperties`);
   - b. calls `windpostCalculationEngine.getCalculatedDesignValues(...)` for the
        structural capacity;
   - c. calls `outerTieSelectionEngine.calculateWallAndTie(...)` for wall fit and
        the outer tie;
   - d. marks the section **suitable** if the calc is valid, the wall fits, and
        the final capacity meets the required load.
4. In **automatic** mode it picks the **first suitable** section (catalogue
   order) and lists up to three suitable alternatives. In **manual** mode it
   evaluates the one chosen section.
5. `app.js` `renderSuccess` / `renderFailure` draws the result panel, and
   `design-report-service.js` builds the printable detailed calculation.
6. For a cantilever U or L post, `app.js` calls the shared
   `baseplateEngine.autoDesign`. The same structural sizing/checking logic is
   used for both shapes; the selected section type only chooses the drawing
   service:
   - L: `baseplate-drawing-service.js`;
   - U: `u-baseplate-drawing-service.js`.
7. For a simply-supported U post, `app.js` instead calls the separate
   `simplyUBaseplateStandard.create`. It returns the fixed 150 × 6 plate and
   two-anchor arrangement plus the 25 mm minimum edge-distance check. It does
   not call the cantilever structural baseplate engine. Plan and side views are
   generated by `simply-u-baseplate-drawing-service.js`.
8. For a simply-supported L post, `app.js` calls
   `simplyLBaseplateStandard.create`. It shares the fixed right-hand anchor
   standard but retains the established L-post 90 mm inner-leaf embedment.
   Plan and side views are generated by
   `simply-l-baseplate-drawing-service.js`.
9. Every successful L-post result exposes **Open cavity-wall assembly**.
   `app.js` stores the selected section, exact height, support condition, wall
   geometry, tie schedule and baseplate, and supplies the essential values in
   the link query string. `cavity-wall-assembly.html` rebuilds one shared
   geometry model from those values and feeds both the 3D renderer and all four
   SVG drawing views.

### L-post cavity-wall assembly geometry

- This is a separate page; it does not change the windpost selection or
  capacity calculations.
- The long leg remains embedded `90 mm` into the inner block leaf.
- Standard masonry modules are `440 × 100 × 215 mm` blockwork and
  `215 × 102.5 × 65 mm` brickwork with `10 mm` mortar.
- The interactive block solids are split around a central `10 mm` masonry
  joint containing the embedded steel leg.
- Each tie level has one `10 × 50 mm` R5 slot on each L leg.
- The first inner/outer tie pair is at `225 mm` from the baseplate and the
  remaining pairs are at `225 mm c/c`.
- The confirmed two-way shear tie is `168 × 10 × 1.5 mm`, with `84 mm`
  projection each side and four `6 × 10 mm` R3 holes.
- The best-fit non-overlapping hole layout uses centres `10 mm` and `25 mm`
  from each end, giving the requested `5 mm` clear end and inter-hole gaps.
- The outer EDC tie is selected by `outer-tie-selection-engine.js`; its drawn
  projection starts at the post face and terminates at the exact calculated
  outer-leaf embedment.
- `cavity-wall-drawing-service.js` creates plan, inner-leaf elevation, wall
  section/side and cutaway isometric SVGs from the same model.
- `cavity-wall-3d-engine.js` uses no external libraries and renders course
  units, steel, post slots, the four confirmed shear-tie holes, baseplate and
  concrete on an orbitable canvas. Since V.03 the picture is drawn by
  `windpost-gl-renderer.js` (hand-written WebGL 1, inline GLSL, CSP-safe)
  from meshes built by `windpost-scene-mesh-engine.js`; the Detailing viewer
  shows the post built into its cavity wall (floor slabs, stepped cut-away
  brick leaf with perforated bricks, block leaf, ties, head connection) with
  an "In wall / Post only" toggle. Browsers without WebGL keep the 2D painter.

### U-post baseplate drawing geometry

- Datum `x = 0` is the inner-leaf / concrete edge.
- The U post is wholly in the cavity with its front flange 6 mm clear.
- The floating plate projection left of the datum is
  `6 mm + section a_mm + u_inner_clearance_mm`; the current clearance is 6 mm.
- The 6 mm rear projection accommodates fabrication welding; no weld symbol is
  drawn.
- The U opening faces downward in plan, matching the reference drawing.
- The actual section thickness and inner bend radius are used.
- The flange mid-line and longitudinal stiffener lie on the plate-width
  centre-line.
- The stiffener reaches its calculated maximum height at the front flange face
  and tapers directly to zero at the design plate end.
- Plan-view dimension chains sit outside the plate; hole, plate and stiffener
  callout leaders use separate routed lanes so arrows do not cross.
- Everything to the right of the datum—plate width, anchor rows, pitch,
  thickness, and structural checks—is produced by the shared L/U designer.

### Simply-supported U-post standard baseplate geometry

- This is a separate fixed-standard engine with no moment, capacity,
  plate-bending or stiffener design.
- Datum `x = 0` is the inner-leaf / concrete edge.
- The left portion is the common U detail:
  `6 mm fabrication projection + section a_mm + 6 mm wall clearance`.
- The right portion is hard-coded: anchor line `x = 90 mm`, plate end
  `x = 125 mm`, giving `35 mm` longitudinal plate-edge distance.
- Plate width is `150 mm`; two anchors are `90 mm c/c`, giving `30 mm`
  transverse edge distances.
- Holes are `14 mm` diameter for RGM 12 anchors; plate thickness is `6 mm`.
- The fixed arrangement is accepted when its minimum provided edge distance is
  at least `25 mm` (currently 30 mm).
- The U is centred across the width, opens downward and uses the selected
  section's actual thickness and bend radius.
- Both plan and side views are produced; no stiffener is drawn.

### Simply-supported L-post standard baseplate geometry

- This is a separate fixed-standard engine with no moment, capacity,
  plate-bending or stiffener design.
- Datum `x = 0` is the inner-leaf / concrete edge.
- The L long leg retains its `90 mm` inner-leaf embedment and its centreline is
  aligned with the plate-width centreline.
- The left portion is
  `6 mm fabrication projection + (section a_mm − 90 mm)`.
- The fixed right portion matches the U standard: anchor line `x = 90 mm`,
  plate end `x = 125 mm`, two RGM 12 anchors in `14 mm` holes at `90 mm c/c`.
- The 70 mm short-leg sections use a `150 mm` plate (`30 mm` side edges).
- The 80 mm short-leg sections use the confirmed `160 mm` plate (`35 mm` side
  edges), keeping their centred profiles fully on the plate.
- The minimum permitted edge distance is `25 mm`.
- Both plan and side views are produced; no stiffener is drawn.

### Global baseplate drawing conventions

All four drawing services (cantilever L/U and simply-supported L/U) follow one
annotation standard:

- dimensions contain numeric values only;
- plate size is carried by a `length × width × thickness` baseplate
  annotation;
- the two-line 14 mm/RGM 12 callout leader terminates at the selected hole
  centre;
- row/column summaries and projected-anchor notes are omitted;
- plan A/A markers and A–A title suffixes are omitted;
- every side view uses one centred windpost continuation break instead of a
  repeated saw-tooth edge or separate breaks on the U flanges;
- fixed-standard edge-check results remain in the UI/report and are not
  repeated on the SVG.

### Inside `getCalculatedDesignValues` (the structural core)

Units are millimetre-based internally (N, mm, N·mm, MPa). Note **E is entered
in kN/mm² and multiplied by 1000** to N/mm².

1. **Self weight** = area(m²) × steel density.
2. **Allowable deflection** (`loadCaseEngine.calculateAllowableDeflection`):
   - ratio limit = L/180 for cantilever, else L/360;
   - optionally capped at 10 mm and/or a custom cap (the smaller wins).
3. **Deflection factors** (`loadCaseEngine.getDeflectionFactors`) — the
   support-condition-specific elastic formulas that give load and stress per
   unit secant modulus. Cases: cantilever tip point load, cantilever UDL,
   simply supported, propped cantilever.
4. **Secant modulus** (`secantModulusEngine.solveSecantModulus`) — solves the
   Ramberg–Osgood relation `ε = σ/E + 0.002·(σ/σ0.2)^n` for stress by
   **bisection (100 iterations)**, giving the stainless secant modulus.
5. **Safe deflection load** = load factor × secant modulus.
6. **Bending capacity**: allowable moment = `fy·Zxx`; then
   `loadCaseEngine.getBendingLoadCapacity` applies the span factor
   (tip point: M/L; cantilever UDL: 2M/L; simply supported / propped: 8M/L).
7. **Tie capacity** (`tieCapacityEngine.calculateTieCapacity`): number of ties ×
   per-tie strength (see Part 3 tie counts below).
8. **Result selection** (`resultSelectionEngine.selectResults`):
   - **Service value** = min(deflection, bending).
   - **Ultimate**: deflection×1.5, bending×1.5, and the tie capacity
     (**already ultimate — no ×1.5**); the **final ultimate design value** is the
     smallest of those three, optionally capped by a connection cap.
   - Governing labels are set from whichever term equals the minimum.
   The value the automatic selector compares against demand is
   `ultimateDesignValue`.

### Tie counts (`tie-capacity-engine.js`)

- Simply supported (top connection present): `floor((L − firstTieSpacing) / standardTieSpacing)`.
- Cantilever / parapet (free top): `floor((L − parapetTopTieClearance) / standardTieSpacing)`.

### Outer tie selection (`outer-tie-selection-engine.js`)

- **U inner tie**: stored actual length 84 mm and inner-leaf embedment 65.23 mm.
  The post remains 6 mm clear of the inner leaf. These inner-tie values are
  reported separately and do not participate in outer EDC-tie selection.
  The same workbook-controlled `u_inner_clearance_mm` value also positions the
  post in the cantilever U-post floating-baseplate drawing.
- **Post projection into cavity**: U post = full depth, held `uInnerClearance`
  (6 mm) clear of the inner leaf; L post = depth − `lInnerLeafEmbedment` (90 mm)
  because it is built into the inner leaf.
- **Clear outer gap** = cavity − projection (U also subtracts the 6 mm).
  If the gap is below `minimumOuterGap` (4 mm) the post does not fit.
- Each tie carries its own **name**, **nominal** designation length, and
  **actual** manufactured length (from `windpost.parameters.tie.list`).
- **Usable tie length from the post face** = tie's actual length − (`tieNotch`
  7.6 + `tieTailBeyondNotch` 11.17), i.e. actual − 18.77. (For the standard EDC
  range actual = nominal + 8, so this equals nominal − 10.77 — but the actual
  length is now stored per tie, not assumed.)
- The chosen tie is the **first** (by actual length, smallest first) whose usable
  length ≥ gap + `minimumOuterEmbedment` (55 mm). Its **name** is reported as the
  outer tie. The resulting embedment must not exceed the outer leaf thickness.

---

## Part 4 — Where every editable value lives

Most numbers a designer would change are now driven by the workbook through the
generated `js/data/windpost-parameters.js`. A few structural formula constants
remain in code (they are design logic, not catalogue data).

### Editable in Excel (`windpost-database.xlsx` -> Constants tab)

`fy`, `E`, secant `fy`, secant `n`, first/standard tie spacing, U/L tie
strength, steel density, parapet top-tie clearance, propped-cantilever
deflection coefficient, U inner clearance (6), L inner-leaf embedment (90),
U-tie actual length (84), U-tie inner-leaf embedment (65.23),
minimum outer gap (4), minimum outer embedment (55), tie notch (7.6), tie tail
beyond notch (11.17). Ties (name + nominal + actual length) are on the **Ties**
tab; heights on the **Heights** tab; sections on **U_Sections/L_Sections**.

### Still hard-coded in the engines (change in code, see Part 5.7)

| Value | File | Meaning |
|-------|------|---------|
| 180 / 360 | `load-case-engine.js` | Deflection ratio denominators |
| 2× / 8× / ÷L factors | `load-case-engine.js` | Bending span factors |
| the deflection factor formulas | `load-case-engine.js` | Elastic load/stress factors |
| 0.002 | `secant-modulus-engine.js` | Ramberg–Osgood 0.2% offset |
| 1.5 | `result-selection-engine.js` | Service→ultimate multiplier |
| 10 (mm cap) | `load-case-engine.js` | Optional 10 mm deflection cap |
| default radius = 1.5·t | `tools/build-database.js` | Blank-radius fallback |

---

## Part 5 — How to change X (step by step)

After **any** change: run every suite in `tests/` (Part 6) and rebuild the standalone
pages (Part 7). The `UPDATE-FROM-EXCEL.cmd` route does both automatically for data
changes; code changes you rebuild and test yourself.

### 5.1 Add, remove, or edit a U or L section

1. Open `windpost-database.xlsx`, go to **U_Sections** (or **L_Sections**).
2. Add a row (or edit / delete one). Fill **name, a_mm, b_mm, t_mm**.
   - Leave `inner_radius_mm` blank to use the standard 1.5·t, or type a value.
   - `sharp_edges`: `no` for rounded corners, `yes` for square.
3. Save the workbook.
4. Double-click **UPDATE-FROM-EXCEL.cmd**.
   - Area, Ixx, Zxx, centroid, Z-top/bottom are computed for you.
   - If a value is invalid it tells you the exact row and stops without
     changing anything.
5. Open with `OPEN-WINDPOST-SELECTOR.cmd` and check the section appears.

> Sections are tried in **workbook row order**; the automatic selector returns
> the first suitable one, so keep rows ordered from smallest/lightest upward.

### 5.2 Add, remove, rename, or re-size a tie

1. `windpost-database.xlsx` -> **Ties** tab. Each row has **name**,
   **nominal_length_mm**, **actual_length_mm**.
   - To **rename** a tie, edit its `name` cell.
   - To **add** a tie, add a row with a name and its nominal + actual length.
   - To **remove** a tie, delete its row. Keep rows ordered smallest-first.
2. Save -> **UPDATE-FROM-EXCEL.cmd**.

> Selection uses the **actual** length (real manufactured length). The tie name
> is whatever you type — it no longer has to be `EDC25-<number>`.
> The connection detail (7.6 notch + 11.17 tail) and the 55 mm minimum embedment
> live on the **Constants** tab — see 5.4.

### 5.3 Change tie strength, fy, E, secant fy/n, or spacings

1. `windpost-database.xlsx` -> **Constants** tab.
2. Edit the **value** column only. Do not rename the **key** column.
   - e.g. `fy`, `E`, `secant_fy`, `secant_n`, `tie_strength_U_kN`,
     `tie_strength_L_kN`, `first_tie_spacing_mm`, `standard_tie_spacing_mm`.
3. Save -> **UPDATE-FROM-EXCEL.cmd**.

### 5.4 Change wall or tie geometry constants

Same as 5.3, on the **Constants** tab: `u_inner_clearance_mm` (6),
`u_tie_actual_length_mm` (84), `u_tie_inner_embedment_mm` (65.23),
`l_inner_leaf_embedment_mm` (90), `min_outer_gap_mm` (4),
`min_outer_embedment_mm` (55), `tie_manufactured_extra_mm` (8),
`tie_notch_mm` (7.6), `tie_tail_beyond_notch_mm` (11.17),
`parapet_top_tie_clearance_mm` (50), `steel_density_kN_m3` (78.5),
`propped_cantilever_deflection_coeff`.

### 5.5 Change the standard heights (dropdown)

`windpost-database.xlsx` -> **Heights** tab, one height (mm) per row, ascending.
Save -> **UPDATE-FROM-EXCEL.cmd**. (Any exact height can still be typed in the
app; this list only fills the manual-mode dropdown.)

### 5.6 Change on-screen text, layout, or colours

1. Text and structure: edit `index.html`.
2. Styling: edit `css/app.css`.
3. Result-panel / detailed-report wording: `js/ui/app.js` (renderSuccess) and
   `js/services/design-report-service.js`.
4. Rebuild: `node build-standalone.js` (or `UPDATE-FROM-EXCEL.cmd`, which also
   rebuilds).

> House rules for the HTML/CSS/JS: **one file when shipped, no CDNs, no inline
> `onclick=` handlers, no `eval`**. Attach events with `addEventListener` in
> `app.js`. Do not add a `<script>` tag for anything in `tools/vendor/`.

### 5.7 Change a calculation formula

These are the structural constants NOT in Excel (Part 4 table). Edit the engine,
then **add or update a test** that pins the new expected number, and re-run all
tests.

- Deflection ratio (L/180, L/360) or the 10 mm cap: `load-case-engine.js`
  `calculateAllowableDeflection`.
- Per-support-condition load/stress factors, or bending span factors:
  `load-case-engine.js` `getDeflectionFactors` / `getBendingLoadCapacity`.
- Ramberg–Osgood form or the 0.002 offset or iteration count:
  `secant-modulus-engine.js`.
- Service→ultimate 1.5 factor, or how governing is chosen, or the connection
  cap logic: `result-selection-engine.js`.
- Tie-count rule: `tie-capacity-engine.js`.
- Outer-tie selection rule: `outer-tie-selection-engine.js`.

> Sign/unit conventions: deflection positive downward; lengths mm; slopes in
> radians internally; E entered kN/mm² and ×1000 in the calc engine. Keep any
> new formula consistent with these.

### 5.8 Add a new editable constant to the Excel workflow

If you want a value that is currently hard-coded to become Excel-editable:

1. Add the key/value row to the **Constants** tab of the workbook (and to
   `tools/init-workbook.js` so a future re-init keeps it).
2. In `tools/build-database.js`: add the key to `REQUIRED_CONSTANTS` and emit it
   in `emitParameters` under the right group (`design`, `config`, or `tie`).
3. In the consuming engine, read it from `windpost.parameters` with the literal
   as a fallback, e.g. `P.myValue ?? 123`.
4. Run `node tools/build-database.js`, then the tests, then the standalone build.

### 5.9 Recreate the workbook from the current data

If the workbook is lost or you changed data directly in code and want the
spreadsheet to match: `node tools/init-workbook.js` rewrites
`windpost-database.xlsx` from the live `js/data` files.

---

## Part 6 — Testing

Run all seven from the project folder:

```
node tests/run-tests.js
node tests/outer-tie-table-tests.js
node tests/tie-naming-tests.js
node tests/parapet-tests.js
node tests/random-tests.js
node tests/baseplate-tests.js
node tests/cavity-wall-assembly-tests.js
node tests/connections-tests.js
node tests/baseplate-standard-tests.js
```

These are the data-facing suites; there are 22 in `tests/` altogether and
`UPDATE-FROM-EXCEL.cmd` runs every one of them (`for %%t in (tests\*.js)`) and
refuses to finish if any fail. Run them all yourself with
`for t in tests/*.js; do node "$t"; done` (Git Bash) before a commit.

- **run-tests.js** — 23 checks: defaults preserved, section counts, tie
  equations, the 2670 mm / 13 kN reference case, manual mode, "no external
  dependencies".
- **outer-tie-table-tests.js** — outer tie selection vs the published EDC
  tables, the 55 mm embedment boundary for every size, and L placement.
- **tie-naming-tests.js** — proves custom tie names and per-tie actual lengths
  flow through selection (that ties can be renamed / added freely).
- **parapet-tests.js** — the full UPP/LPP parapet matrix and the photographed
  ULS UDL capacities (must match within 0.015 kN).
- **random-tests.js** — 1600 random cases checked against an independent
  re-implementation of every rule (fixed seed, so it is reproducible).
- **baseplate-tests.js** — shared U/L structural design, variable U-post depth,
  `6 + a + u_inner_clearance_mm` floating projection, flange/stiffener
  centring, bend radii, non-crossing plan dimensions and callout leaders,
  SVG dimensions, centred side-view continuation breaks, script loading and UI
  routing.
- **cavity-wall-assembly-tests.js** — confirmed L-post embedment, paired
  225 mm tie schedule, shear-tie fabrication geometry, UK masonry modules,
  shared EDC selection, exact drawn embedment and all four SVG views.

**When you change a formula or a golden number**, update the matching expected
value in the relevant test in the same commit. The tests are the safety net that
lets a non-author change things with confidence.

---

## Part 7 — Building and deploying

- **Rebuild the standalone**: `node build-standalone.js` — inlines `css/app.css`
  and every `js/...` file referenced by `<script>` tags in `index.html` into
  `Windpost-Selector-Full.html`.
- **Load order matters**: `windpost-parameters.js` must load before `config.js`
  (it does, via its `<script>` position in `index.html`). If you add a new JS
  file, add its `<script>` tag in the correct dependency order; the build picks
  up tags automatically.
- **Deploy**: ship the four built pages together — `Windpost-Selector-Full.html`,
  `Windpost-Detailing-Full.html`, `Windpost-CavityWall-Full.html` and
  `Windpost-PrintCalibration-Full.html`. Each is fully offline and CSP-safe
  (no external requests, no inline handlers, no eval), and they link to each
  other by those names (the Selector's Detailing tab and cavity-wall button,
  the Detailing page's print-calibration link).
- **Live site**: the public repo `Captain-802/wp-specifier` hosts them on GitHub
  Pages (https://captain-802.github.io/wp-specifier/) under the split names
  `index.html`, `l-section-prototype.html`, `cavity-wall-assembly.html`,
  `print-calibration.html` (plus `dist/` with the built names and `src/` with
  this tree); the CED Google Site page `wp-specifier` embeds that URL as a
  whole-page embed, so a push to `wp-specifier` `main` is the deployment.
  Inside that embed `window.print()` and `alert()` are inert (sandbox without
  allow-modals), which is why the Selector's PDF opens the report in a new tab
  when embedded and every page reports errors in-page rather than via alert.

---

## Part 8 — Environment and the Excel pipeline internals

- **Requirement**: Node.js on the PC that runs the build/update. No internet and
  no `npm install` are needed — the spreadsheet reader (SheetJS 0.18.5, "mini")
  is vendored at `tools/vendor/xlsx.mini.min.js` and used **only** by the build
  tool. It is never included in the shipped HTML.
- **`tools/build-database.js`** reads `windpost-database.xlsx`, validates every
  value (positive numbers, unique names, valid geometry, required constant keys
  present), computes section properties via `tools/lib/section-geometry.js`
  (a verified port of the manual calculator's geometry engine — reproduces the
  original database to 6 decimals), and writes the four `js/data` files with the
  DO-NOT-EDIT banner. **On any validation error it writes nothing** and lists the
  problems.
- **Fallbacks**: every engine that reads `windpost.parameters` keeps its original
  literal as a `?? fallback`, so the app still runs correctly even if the
  generated parameters file is deleted.

---

## Part 9 — The manual calculator (related project)

`D:\Windpost-Calculator-Local` is the manual Windpost Calculator. It shares the
same U/L section data and already contains the geometry engine this pipeline was
ported from. The same Excel-driven pipeline can be added there if desired; the
section databases are interchangeable.

---

## Quick reference — "I want to…"

| I want to… | Do this |
|------------|---------|
| Add/edit a section | Excel **U_Sections/L_Sections** -> `UPDATE-FROM-EXCEL.cmd` |
| Add/rename/resize a tie | Excel **Ties** (name/nominal/actual) -> update cmd |
| Change fy/E/tie strength/spacing | Excel **Constants** -> update cmd |
| Change wall/tie geometry | Excel **Constants** -> update cmd |
| Change dropdown heights | Excel **Heights** -> update cmd |
| Change wording/styling | `index.html` / `css/app.css` -> `build-standalone.js` |
| Change a formula | edit engine in `js/engines/` + update a test + rebuild |
| Make a constant Excel-editable | Part 5.8 |
| Rebuild the workbook from code | `node tools/init-workbook.js` |
| Rebuild the shipped file | `node build-standalone.js` |
| Prove nothing broke | run the four `tests/…` files |
