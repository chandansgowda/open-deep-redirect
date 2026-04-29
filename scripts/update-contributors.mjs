#!/usr/bin/env node
// Fetches the contributor list from the GitHub API and patches README.md
// between the CONTRIBUTORS_START / CONTRIBUTORS_END marker comments.
//
// Usage (local):  node scripts/update-contributors.mjs
// Usage (CI):     called automatically by .github/workflows/update-contributors.yml
//
// Env vars:
//   GITHUB_REPOSITORY  owner/repo  (set automatically in Actions; defaults to package value)
//   GITHUB_TOKEN       optional — raises the API rate limit from 60 to 5000 req/hr

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root       = resolve(__dirname, "..");
const readmePath = resolve(root, "README.md");

const repo  = process.env.GITHUB_REPOSITORY || "chandansgowda/open-deep-redirect";
const token = process.env.GITHUB_TOKEN;

const MARKER_START = "<!-- CONTRIBUTORS_START -->";
const MARKER_END   = "<!-- CONTRIBUTORS_END -->";

// ── Fetch all human contributors (auto-paginates) ────────────────────────────
async function fetchContributors() {
  const headers = { "User-Agent": "open-deep-redirect-bot" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const all = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contributors?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${res.statusText} — ${await res.text()}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    // Skip bots (type === "Bot" or login ends with "[bot]")
    all.push(...batch.filter(c => c.type !== "Bot" && !c.login.endsWith("[bot]")));
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

// ── Build an HTML contributor table (6 columns) ───────────────────────────────
function buildTable(contributors) {
  const COLS = 6;

  const cells = contributors.map(c => {
    const label = c.contributions === 1
      ? "1 commit"
      : `${c.contributions} commits`;
    return [
      `    <td align="center" valign="top" width="120">`,
      `      <a href="https://github.com/${c.login}">`,
      `        <img src="${c.avatar_url}&s=80" width="64" height="64" alt="${c.login}" style="border-radius:50%" />`,
      `        <br /><sub><b>${c.login}</b></sub>`,
      `      </a>`,
      `      <br /><sub>🔨 ${label}</sub>`,
      `    </td>`,
    ].join("\n");
  });

  const rows = [];
  for (let i = 0; i < cells.length; i += COLS) {
    rows.push(`  <tr>\n${cells.slice(i, i + COLS).join("\n")}\n  </tr>`);
  }

  return `<table>\n${rows.join("\n")}\n</table>`;
}

// ── Patch README.md ───────────────────────────────────────────────────────────
const contributors = await fetchContributors();
console.log(`Fetched ${contributors.length} contributor(s) from ${repo}`);

const table = buildTable(contributors);
const block = `${MARKER_START}\n${table}\n${MARKER_END}`;

let readme = readFileSync(readmePath, "utf8");

const startIdx = readme.indexOf(MARKER_START);
const endIdx   = readme.indexOf(MARKER_END);

if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error(
    "Could not find CONTRIBUTORS_START / CONTRIBUTORS_END markers in README.md.\n" +
    "Add them where you want the table to appear:\n\n" +
    "  <!-- CONTRIBUTORS_START -->\n  <!-- CONTRIBUTORS_END -->"
  );
  process.exit(1);
}

const before  = readme.slice(0, startIdx);
const after   = readme.slice(endIdx + MARKER_END.length);
const updated = before + block + after;

if (updated === readme) {
  console.log("README.md contributors section is already up to date.");
} else {
  writeFileSync(readmePath, updated, "utf8");
  console.log(`Done — ${contributors.length} contributor(s) written to README.md.`);
}
