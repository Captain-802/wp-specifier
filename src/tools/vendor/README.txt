Vendored third-party library — BUILD TOOL ONLY
==============================================

File:     xlsx.mini.min.js
Library:  SheetJS Community Edition (js-xlsx), "mini" standalone build
Version:  0.18.5
Source:   npm package "xlsx@0.18.5"  (https://www.npmjs.com/package/xlsx)
          dist/xlsx.mini.min.js
SHA note: pinned version; do not auto-update without re-testing the pipeline.

Why this file exists
--------------------
The update pipeline (tools/build-database.js) reads windpost-database.xlsx to
regenerate the section / tie / constant data files. Node has no built-in
spreadsheet reader, so this small library provides .xlsx read + write.

IMPORTANT
---------
This library is used ONLY by the offline build tool on the maintainer's PC.
It is NEVER included in index.html or Windpost-Selector-Full.html, so the
shipped calculator stays zero-dependency and CSP-clean. Do not add a
<script> tag for this file to any HTML page.

Usage in Node is via buffers (the standalone build disables its own fs):
    const XLSX = require("./vendor/xlsx.mini.min.js");
    const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
    fs.writeFileSync(path, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
