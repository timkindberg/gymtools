// Minimal browser shims so the app's modules can be imported under `node --test`.
// store.js is the only module that touches the DOM-ish globals, and only
// localStorage — everything below it (movements, measures, sets) is pure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

export function installBrowserGlobals() {
  if (!globalThis.localStorage) globalThis.localStorage = new MemoryStorage();
  return globalThis.localStorage;
}

export function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(here, "fixtures", name), "utf8"));
}

// Load the fixture through the app's own import path, so what the tests see is
// exactly what the app would have after opening an old backup.
export async function loadStoreWithFixture(name = "sessions-v1.json") {
  installBrowserGlobals();
  const store = await import("../js/store.js");
  store.importData(readFixture(name));
  return store;
}
