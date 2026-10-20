"use strict";

// These suites cover the switched-off build, whose engines now live under
// parked/js while the engines it shares with the Selector stayed in js/.
// Each suite asks for "js/..." the way it always did; this makes a request
// that is not in one tree fall through to the other, so no suite has to know
// which half of the split a file ended up in.
const Module = require("module");
const path = require("path");
const fs = require("fs");

const repoRoot = path.resolve(__dirname, "../..");
const parkedRoot = path.join(repoRoot, "parked");
const resolveFilename = Module._resolveFilename;

function swap(request) {
  const full = path.resolve(request);
  if (full.startsWith(parkedRoot + path.sep)) {
    return path.join(repoRoot, path.relative(parkedRoot, full));
  }
  if (full.startsWith(repoRoot + path.sep)) {
    return path.join(parkedRoot, path.relative(repoRoot, full));
  }
  return null;
}

Module._resolveFilename = function patched(request, parent, isMain, options) {
  try {
    return resolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    // Only absolute or parent-relative file requests can be in the other tree.
    const base = parent && parent.filename ? path.dirname(parent.filename) : process.cwd();
    const asked = path.isAbsolute(request) ? request : path.resolve(base, request);
    const other = swap(asked);
    if (other && fs.existsSync(other)) return resolveFilename.call(this, other, parent, isMain, options);
    throw error;
  }
};

// The same split applies to files a suite reads as text rather than requires.
const readFileSync = fs.readFileSync;
fs.readFileSync = function patchedRead(file, ...rest) {
  try {
    return readFileSync.call(this, file, ...rest);
  } catch (error) {
    if (typeof file !== "string") throw error;
    const other = swap(path.isAbsolute(file) ? file : path.resolve(file));
    if (other && fs.existsSync(other)) return readFileSync.call(this, other, ...rest);
    throw error;
  }
};
