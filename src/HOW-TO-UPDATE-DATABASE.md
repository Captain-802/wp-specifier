# Updating the Windpost Select database

All of the calculator's data — U and L sections, EDC tie lengths, tie
strengths, `fy`, the secant-model values, spacings and the wall/tie geometry
constants — lives in one spreadsheet:

    windpost-database.xlsx

You never edit the JavaScript. You edit the workbook and run one file.

## To make a change

1. Open **windpost-database.xlsx** in Excel.
2. Edit the relevant tab (see below), then **Save** (keep it as .xlsx).
3. Double-click **UPDATE-FROM-EXCEL.cmd**.
4. Read the messages:
   - If it says *"Done"*, the calculator now matches the workbook. Open it
     with **OPEN-WINDPOST-SELECTOR.cmd**.
   - If it lists a problem, nothing was changed — fix the cell it names and run
     the updater again.

## The tabs

- **U_Sections / L_Sections** — one row per section. To add a section, add a
  row; to remove one, delete its row. You only need **name, a_mm, b_mm, t_mm**.
  - `inner_radius_mm` can be left blank — it defaults to 1.5 x thickness.
  - `sharp_edges` = `no` for normal rounded corners, `yes` for square corners.
  - Area, Ixx, Zxx, centroid and Z-top/bottom are worked out automatically from
    the geometry — do not enter them.
- **Ties** — one row per outer tie, with three columns: **name**,
  **nominal_length_mm**, **actual_length_mm**. The name is free text, so you can
  rename a tie or add a differently-named product; selection uses the actual
  (manufactured) length. Keep the rows ordered smallest-first.
- **Heights** — the standard catalogue heights shown in the dropdown.
- **Constants** — edit the **value** column only; do not rename the keys.
  Includes `fy`, `E`, secant `fy`/`n`, tie spacings, U/L tie strengths, steel
  density, and the tie/wall geometry (the 6 mm U clearance, 90 mm L embedment,
  55 mm minimum embedment, and the tie connection detail: 7.6 mm notch +
  11.17 mm tail).

## Why it is safe

The updater validates every value first. If a number is missing, negative, not
a number, or a section's geometry is impossible, it stops and tells you exactly
which tab/row/cell is wrong **without changing any files**. After it rebuilds
the data it also runs the full self-check test suite, so a change that would
break the calculation is caught before you ship it.

## Notes for a developer

- The pipeline is `tools/build-database.js` (reads the workbook, validates,
  regenerates the four files under `js/data/`, including the generated
  `windpost-parameters.js`). It uses the vendored SheetJS reader in
  `tools/vendor/` (build-tool only — never shipped in the HTML).
- `tools/init-workbook.js` regenerates the workbook itself from the current
  live data (used once to create it; safe to re-run).
- The engines read their constants from `windpost.parameters` with the original
  literals kept as a fallback, so the app still runs even if the generated
  parameters file is missing.
- Section properties are computed by `tools/lib/section-geometry.js`, a verified
  port of the manual calculator's geometry engine (reproduces the original
  database to 6 decimal places).
