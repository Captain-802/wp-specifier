# Windpost Select — Automatic Selector

Chooses a windpost section and its wall ties for a given cavity build, height,
support condition and load. One self-contained HTML file, no server, no
internet connection.

Base plate design, production drawings, DXF export and the 3D cavity-wall
assembly are finished but **not released** — they are parked under
[`parked/`](parked/README.md) and form no part of the shipped file.

## Open it

Double-click `OPEN-WINDPOST-SELECTOR.cmd`, or open
`Windpost-Selector-Full.html` in Chrome or Edge. That one file holds every
style, section table and calculation script.

To work on the engines instead, open `index.html`, which loads them as
separate files. Rebuild the single file with:

```bash
node build-standalone.js
```

## Workflow

1. Choose a U, L, DU (double-U) or I (flat plate, inner leaf) windpost. DU and
   I posts are simply supported only.
2. Choose simply supported or cantilever.
3. Choose a total ULS UDL, or a top point load for a cantilever.
4. Enter any exact windpost height.
5. Choose how the section is picked:
   - **Automatic** — enter the required load and let it select;
   - **Manual** — choose a catalogue section and see its capacity;
   - **Custom section** — enter `a`, `b`, `t` and `r` and it works out the area,
     `Ixx`, `Zxx` and `ȳ` itself, by the same geometry used to build the
     catalogue, so a custom U/L/DU/I matches the catalogue figures exactly.
     An I post is a flat plate, so it takes `a` and `t` only.
6. Enter the inner-leaf thickness, cavity width and outer-leaf thickness.
7. Run the selection. The result gives the section, the final governing ULS
   capacity, the governing criterion, the tie schedule with the inner and
   outer tie for every level, and the post weight.

Any design figure can be changed before running: open **Design constants** at
the foot of the form. Constants and the whole tie list are editable — add,
remove or re-measure a tie, or change a tie capacity. Edits are listed in the
printed calculation so a record never passes an edited value off as a
catalogue one. **Reset** puts the catalogue values back.

## How the capacity is decided

Flexural capacity, deflection capacity and tie capacity are each worked out;
the lowest governs. **The governing value is then rounded down to 2 decimal
places, and that is the final figure** — it is never rounded up.

A level's tie capacity depends on the family:

| Post | Ties per level | Level capacity |
|---|---|---|
| U | 1 inner + 1 outer | the weaker of the two |
| L | 1 inner + 1 outer | the weaker of the two |
| I | inner (shear) tie only | the inner tie |
| DU | 2 inner + 2 outer | `2 × outer + 2 × inner` |

## Design defaults

| | |
|---|---|
| Allowable stress | `127.27 N/mm²` |
| Initial elastic modulus | `200 kN/mm²` |
| Secant-model proof strength | `210 N/mm²` |
| Ramberg–Osgood exponent | `7` |
| U-post and DU-post tie strength | `1.713 kN/tie` |
| L-post and I-post tie strength | `2.25 kN/tie` |
| First tie spacing | `225 mm` |
| Standard tie spacing | `225 mm c/c` |
| Parapet free-top tie clearance | `50 mm` |
| 10 mm deflection cap | not applied |

Every one of these is editable in the Design constants panel.

## Tie rules

- U/DU inner-leaf tie: the `EDC25-U tie`, `84 mm` actual with `65.23 mm`
  embedment into the inner leaf; the post is held `6 mm` clear of the inner
  leaf.
- L/I inner-leaf tie: the shear tie.
- Outer-leaf tie: an EDC25 tie, `EDC25-100` to `EDC25-375` in 25 mm steps —
  **or the `EDC25-U tie`**, which is taken over no solution at all when the
  cavity is tight enough for it to reach and still fit the outer leaf. It is
  one product with one name, so the tie table lists it once, under **Either
  leaf**.
- Minimum outer-leaf embedment: `55 mm`. Minimum clear gap to the outer leaf:
  `15 mm`.

  Those two together close the U tie's outer-leaf branch at the catalogue
  values: it projects `84 − 18.77 = 65.23 mm` from the post face, while
  reaching the outer leaf needs `gap + 55`, which is `70 mm` at a 15 mm gap.
  The U tie reaches the outer leaf only where the gap is `10.23 mm` or less,
  so the branch opens only if the minimum gap or the minimum embedment is
  lowered in the Design constants.
- Tie geometry from the EDC drawings: actual length = nominal + `8 mm`
  (`EDC25-125` is 133 mm overall). The windpost slot consumes the `7.6 mm`
  notch plus the `11.17 mm` tail beyond it (`18.77 mm`), so the length
  available from the post face is `nominal + 8 − 18.77 = nominal − 10.77`.
- L and I posts are embedded `90 mm` into the inner leaf.

## Tie quantities

- Simply supported, with a top connection: `floor((L − 225) / 225)`.
- Cantilever or parapet, no top connection: `floor((L − 50) / 225)`.
- Always a whole number, never below zero.

## Source layout

```text
index.html                           the application (loads the engines below)
css/app.css                          presentation
js/data/                             U, L, DU and I catalogues, ties, fixings
js/engines/                          design engines and the selectors
js/engines/custom-section-properties-engine.js   custom U/L/DU/I properties
js/engines/design-data-engine.js     the editable constants and tie list
js/engines/fold-width-engine.js      blank width, for the post weight
js/engines/connection-selection-engine.js        weights and tie counts
js/services/design-report-service.js the printable calculation
js/ui/app.js                         the guided interface
js/ui/design-data-editor.js          the Design constants panel
tests/                               the regression suites
tools/                               database build from the Excel workbook
parked/                              switched-off features (see its README)
```

## Updating the section data

The catalogues are generated from `windpost-database.xlsx`. Edit the workbook,
then double-click `UPDATE-FROM-EXCEL.cmd`: it rebuilds the data files, runs
every suite in `tests\`, and rebuilds the single-file edition only if they all
pass.

## Tests

```bash
node tests/run-tests.js
```

`tests/` holds the suites for what ships; `parked/tests/` holds the suites for
the parked features and still runs. Every suite passes.
