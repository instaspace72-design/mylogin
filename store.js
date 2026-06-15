'use strict';
/*
 * store.js
 * Tiny, dependency-free persistence layer backed by a single JSON file.
 * Chosen over SQLite so there is no native build step (installs and runs
 * anywhere: local, Railway, Render, a basic VPS). Adequate for a team of 20.
 *
 * Data file location is configurable via DATA_FILE. On Railway, point this at
 * a mounted volume path (e.g. /data/db.json) so it survives redeploys.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE =
  process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

const EMPTY = { users: [], tasks: [], meta: { seeded: false } };

let cache = null;

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DATA_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
      console.error('Data file is corrupt, refusing to overwrite. ' + err.message);
      throw err;
    }
  } else {
    cache = JSON.parse(JSON.stringify(EMPTY));
    persist();
  }
  // Backfill any missing top-level keys (forward compatibility).
  for (const k of Object.keys(EMPTY)) {
    if (!(k in cache)) cache[k] = JSON.parse(JSON.stringify(EMPTY[k]));
  }
  return cache;
}

// Atomic write: write to a temp file then rename, so a crash mid-write
// never leaves a half-written (corrupt) data file.
function persist() {
  ensureDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

module.exports = { load, persist, DATA_FILE };
