// After `vite build`: the demo must stay out of the normal app.
//  - The entry chunk (what every visitor loads) and anything it imports statically must not
//    pull in demo code or PGlite; the demo is reachable only through import("@/demo").
//  - The service worker must not precache demo chunks or PGlite's .wasm/.data files.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const assets = path.join(dist, "assets");
const html = readFileSync(path.join(dist, "index.html"), "utf8");
const entry = html.match(/<script type="module" crossorigin src="\/assets\/([^"]+\.js)"/)?.[1];
if (!entry) throw new Error("check-bundle: entry script not found in dist/index.html");

const isDemo = (file) => /^demo-|pglite/i.test(file);
const staticImports = (file) => {
  const code = readFileSync(path.join(assets, file), "utf8");
  return [...code.matchAll(/(?:^|[;}\s])import\s*(?:[\w${},*\s]+from\s*)?"\.\/([^"]+\.js)"/g)].map((m) => m[1]);
};

const seen = new Set();
const queue = [entry];
const problems = [];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  if (isDemo(file)) problems.push(`${file} is loaded statically by the app`);
  queue.push(...staticImports(file));
}

const sw = readFileSync(path.join(dist, "sw.js"), "utf8");
for (const file of readdirSync(assets).filter((f) => isDemo(f) || /\.(wasm|data)$/.test(f))) {
  if (sw.includes(file)) problems.push(`${file} is precached by the service worker`);
}

if (problems.length) {
  console.error(`check-bundle: demo code leaks into the normal app:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-bundle: ok (${seen.size} chunks load statically with ${entry}; no demo code among them)`);
