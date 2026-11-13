// The app shell: what the service worker caches and what index.html preloads.
// The app is served from that cache, so a module missing from the list is a
// module that isn't there offline, and a version that doesn't change is an
// update no phone ever receives.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION } from "../js/version.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const modules = fs.readdirSync(path.join(root, "js")).filter((f) => f.endsWith(".js")).map((f) => `./js/${f}`);

test("the service worker caches every module the app imports", () => {
  const sw = read("sw.js");
  for (const m of modules) assert.ok(sw.includes(`"${m}"`), `${m} is missing from ASSETS in sw.js`);
});

test("index.html preloads every module, so a first load isn't a chain of round trips", () => {
  const html = read("index.html");
  for (const m of modules) assert.ok(html.includes(`<link rel="modulepreload" href="${m}" />`), `${m} has no modulepreload`);
});

test("the cache name carries the app version, in the shape the deploy step stamps", () => {
  const m = read("sw.js").match(/^const CACHE = "gymtools-(v\d+)";$/m);
  assert.ok(m, "sw.js must declare: const CACHE = \"gymtools-vNN\";");
  assert.equal(m[1], APP_VERSION, "bump sw.js CACHE together with APP_VERSION");
  assert.match(read(".github/workflows/deploy.yml"), /const CACHE = /, "the deploy workflow stamps the commit into CACHE");
});
