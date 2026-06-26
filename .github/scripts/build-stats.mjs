// Rebuilds stats.json from the profile's terminal.svg (single source of truth).
// Fetches the public raw SVG and preserves the existing `profile` block
// (it is refreshed live in the browser anyway).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SVG_URL =
  "https://raw.githubusercontent.com/idesyatov/idesyatov/master/assets/terminal.svg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATS_PATH = join(ROOT, "stats.json");

function fail(msg) {
  console.error("build-stats: " + msg);
  process.exit(1);
}

// --- fetch the SVG ---
const res = await fetch(SVG_URL, { redirect: "follow" });
if (!res.ok) fail("SVG fetch failed: HTTP " + res.status);
const svg = await res.text();
if (svg.length < 500 || !svg.includes("<svg")) fail("SVG response looks invalid");

// --- parse languages: name + color + percent triplets ---
// Restrict to the `cat languages` region so neofetch text can't match.
const langRegion = svg.slice(
  svg.indexOf("$ cat languages"),
  svg.indexOf("$ cat stack")
);
const langRe =
  /<tspan fill="#c0caf5">([^<]+?)<\/tspan>\s*<tspan fill="(#[0-9A-Fa-f]{6})"[^>]*>[^<]*<\/tspan>(?:\s*<tspan fill="#414868"[^>]*>[^<]*<\/tspan>)?\s*<tspan fill="#565f89"[^>]*>\s*(\d+)%/g;

const languages = [];
for (const m of langRegion.matchAll(langRe)) {
  const name = m[1].trim();
  const color = m[2];
  const pct = Number(m[3]);
  if (!name || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
  languages.push({ name, pct, color });
}
if (languages.length === 0) fail("parsed 0 languages — SVG layout may have changed");

// --- parse code metrics by label -> value("x=620") ---
function metric(label) {
  const re = new RegExp(
    ">" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "<\\/tspan>\\s*<tspan x=\"620\"[^>]*>([^<]+)<"
  );
  const m = svg.match(re);
  return m ? m[1].trim() : null;
}
function intMetric(label) {
  const v = metric(label);
  const n = v == null ? NaN : parseInt(v.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) fail('metric "' + label + '" not found/parseable');
  return n;
}

const code = {
  languages: intMetric("languages"),
  totalCodeKB: intMetric("Σ code"), // "Σ code"
  commits2026: intMetric("commits 2026"),
  pullRequests: intMetric("PRs"),
  commits7d: intMetric("commits 7d"),
};

// --- preserve existing profile + comment ---
let prev = {};
try {
  prev = JSON.parse(await readFile(STATS_PATH, "utf8"));
} catch {
  /* first run — fine */
}

const next = {
  _comment: prev._comment ||
    "Snapshot of heavy metrics parsed from the profile terminal.svg. Not computed in-browser (API rate limits). Refreshed by .github/workflows/refresh-stats.yml.",
  updated: prev.updated || "",
  languages,
  code,
  profile: prev.profile || { followers: 0, public_repos: 0 },
};

// --- write only if meaningful data changed (ignore `updated`) ---
const same =
  JSON.stringify({ ...prev, updated: "" }) ===
  JSON.stringify({ ...next, updated: "" });
if (same) {
  console.log("build-stats: no changes — stats.json is up to date");
  process.exit(0);
}

next.updated = new Date().toISOString().slice(0, 10);
await writeFile(STATS_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log("build-stats: stats.json updated -> " + next.updated);
console.log("  languages: " + languages.map((l) => l.name + " " + l.pct + "%").join(", "));
console.log("  code: " + JSON.stringify(code));
