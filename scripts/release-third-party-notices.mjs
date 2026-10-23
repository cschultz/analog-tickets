/** Preserve installed dependency notices, offline. No license is granted to app code. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { inspectLockedPackages, summarizeInventory } from "./release-dependency-inventory.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOTICE = /^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[.-].*)?$/i;
// Reviewed bundled upstream notices in this exact locked dependency. Do not
// recursively collect arbitrary package files or silently follow an upgrade.
const VICTORY_VENDOR_NOTICES = [
  "d3-array",
  "d3-color",
  "d3-ease",
  "d3-format",
  "d3-interpolate",
  "d3-path",
  "d3-scale",
  "d3-shape",
  "d3-time",
  "d3-time-format",
  "d3-timer",
  "d3-voronoi",
  "internmap",
].map((name) => `lib-vendor/${name}/LICENSE`);
const sha = (value) => createHash("sha256").update(value).digest("hex");

export function installedNoticeReader(root) {
  const modules = realpathSync(path.join(root, "node_modules"));
  function contained(file) {
    const resolved = realpathSync(file);
    assert.ok(
      resolved.startsWith(modules + path.sep),
      "dependency notice path escapes node_modules",
    );
    return resolved;
  }
  return (_key, names) => {
    const folder = path.join(
      modules,
      ...names.flatMap((name, index) => (index ? ["node_modules", name] : [name])),
    );
    const manifest = path.join(folder, "package.json");
    if (!existsSync(manifest)) return null;
    const pkg = JSON.parse(readFileSync(contained(manifest), "utf8"));
    const texts = {};
    const namesToRead = readdirSync(contained(folder)).filter((n) => NOTICE.test(n));
    if (pkg.name === "victory-vendor" && pkg.version === "36.9.2")
      namesToRead.push(
        ...VICTORY_VENDOR_NOTICES.filter((name) => existsSync(path.join(folder, name))),
      );
    for (const name of namesToRead.sort()) {
      const file = contained(path.join(folder, name));
      if (!statSync(file).isFile()) continue;
      assert.ok(statSync(file).size <= 1024 * 1024, "dependency notice exceeds 1 MiB");
      const text = readFileSync(file, "utf8");
      assert.ok(!text.includes("\0"), "binary dependency notice refused");
      texts[name] = text;
    }
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      noticeFiles: Object.keys(texts),
      texts,
    };
  };
}

export function buildThirdPartyNotices(lockSource, readInstalled) {
  // Vitest/CI can run under Node even when launched by `bun run`.
  // Use the already-pinned TypeScript JSONC reader, not a Bun-only global.
  const parsed = ts.parseConfigFileTextToJson("bun.lock", lockSource);
  assert.ok(!parsed.error, "invalid JSONC lockfile");
  const lock = parsed.config;
  assert.ok(lock?.packages, "lockfile packages required");
  const captured = new Map();
  const rows = inspectLockedPackages(lock.packages, (key, names) => {
    const installed = readInstalled(key, names);
    if (installed) captured.set(key, installed.texts ?? {});
    return installed;
  });
  const summary = summarizeInventory(rows);
  const contents = [
    "Analog Tickets TEST beta — collected third-party notices",
    `bun.lock SHA-256: ${sha(lockSource)}`,
    "",
    "These are verbatim root-level and explicitly reviewed bundled-vendor notices",
    "from the installed packages",
    "whose name and version match this lockfile. This file does not choose an app",
    "license, establish code/media ownership, or determine legal obligations.",
    "No node_modules, compiled dependency binary, or Python environment is shipped",
    "in this source archive. Built/binary distributions require their own review.",
    "Coverage is local and incomplete: absent packages and packages without a root",
    "notice are listed explicitly below, not silently treated as cleared. Package",
    "metadata is not an authenticity check of registry tarballs or full source.",
    "Public author/copyright contacts inside upstream notices are retained intact;",
    "they are attribution, not configured recipients or project credentials.",
    "",
    `Locked: ${summary.locked}; inspected: ${summary.inspected}; absent: ${summary.uninspected}; without root notice: ${summary.noRootNotice}`,
    "",
  ];
  const unique = new Map();
  for (const row of rows) {
    const identity = `${row.name}@${row.version}`;
    if (row.status !== "inspected" || !row.noticeFiles.length) {
      contents.push(
        `UNRESOLVED ${row.key}: ${identity}; ${row.status === "inspected" ? "no root license/notice file" : "not installed on collector platform"}`,
      );
      continue;
    }
    const texts = captured.get(row.key);
    if (!row.noticeFiles.some((file) => !file.includes("/")))
      contents.push(
        `ROOT_NOTICE_ABSENT ${row.key}: ${identity}; bundled notices retained, package-wide coverage not established`,
      );
    for (const file of row.noticeFiles) {
      assert.equal(typeof texts[file], "string", `missing captured notice: ${row.key}`);
      const text = texts[file];
      const hash = sha(text),
        key = `${identity}\0${file}\0${hash}`;
      if (!unique.has(key)) unique.set(key, { identity, file, hash, text, keys: [] });
      unique.get(key).keys.push(row.key);
    }
  }
  for (const record of unique.values())
    contents.push(
      "",
      "=".repeat(72),
      `${record.identity} — ${record.file}`,
      `Lock keys: ${record.keys.join(", ")}`,
      `Text SHA-256: ${record.hash}`,
      "",
      record.text,
      "=".repeat(72),
    );
  assert.ok(unique.size > 0, "no dependency notice texts collected");
  const coverage = { ...summary, collectedTexts: unique.size };
  return {
    summary: coverage,
    inventory: { lockSha256: sha(lockSource), coverage, packages: rows },
    text: contents.join("\n") + "\n",
  };
}

export function collectThirdPartyNotices(root = ROOT) {
  return buildThirdPartyNotices(
    readFileSync(path.join(root, "bun.lock"), "utf8"),
    installedNoticeReader(root),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(
    process.argv.length === 3 && ["--summary", "--emit"].includes(process.argv[2]),
    "usage: bun scripts/release-third-party-notices.mjs --summary|--emit",
  );
  const result = collectThirdPartyNotices();
  process.stdout.write(
    process.argv[2] === "--emit" ? result.text : JSON.stringify(result.summary, null, 2) + "\n",
  );
}
