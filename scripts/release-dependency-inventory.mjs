/** Read-only, local license-metadata inventory; not publication clearance. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LICENSE_FILE = /^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[.-].*)?$/i;

export function splitLockKey(key) {
  const parts = key.split("/");
  const names = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("@")) {
      assert.match(part, /^@[a-z0-9._-]+$/i, `invalid package key: ${key}`);
      assert.match(parts[++i] ?? "", /^[a-z0-9._-]+$/i, `invalid package key: ${key}`);
      assert.notEqual(parts[i], "..", `invalid package key: ${key}`);
      assert.notEqual(parts[i], ".", `invalid package key: ${key}`);
      names.push(`${part}/${parts[i]}`);
    } else {
      assert.match(part, /^[a-z0-9._-]+$/i, `invalid package key: ${key}`);
      assert.notEqual(part, "..", `invalid package key: ${key}`);
      assert.notEqual(part, ".", `invalid package key: ${key}`);
      names.push(part);
    }
  }
  return names;
}

export function inspectLockedPackages(packages, readInstalled) {
  const rows = [];
  for (const [key, entry] of Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) {
    const names = splitLockKey(key);
    assert.ok(Array.isArray(entry) && typeof entry[0] === "string", `invalid lock entry: ${key}`);
    const at = entry[0].lastIndexOf("@");
    assert.ok(at > 0, `lock entry lacks version: ${key}`);
    const name = entry[0].slice(0, at);
    const version = entry[0].slice(at + 1);
    // Bun can lock an alias such as h3-v2 to a package whose manifest name is h3.
    assert.ok(version, `lock entry lacks version: ${key}`);
    const installed = readInstalled(key, names);
    if (!installed) {
      rows.push({ key, name, version, status: "uninspected", license: null, noticeFiles: [] });
      continue;
    }
    assert.equal(installed.name, name, `installed package name mismatch: ${key}`);
    assert.equal(installed.version, version, `installed package version mismatch: ${key}`);
    rows.push({
      key,
      name,
      version,
      status: "inspected",
      license: installed.license ?? null,
      noticeFiles: [...(installed.noticeFiles ?? [])].sort(),
    });
  }
  return rows;
}

export function summarizeInventory(rows) {
  const licenses = {};
  let inspected = 0;
  let uninspected = 0;
  let noLicenseField = 0;
  let noRootNotice = 0;
  for (const row of rows) {
    if (row.status === "uninspected") {
      uninspected++;
      continue;
    }
    inspected++;
    const label = row.license ?? "<missing>";
    licenses[label] = (licenses[label] ?? 0) + 1;
    if (!row.license) noLicenseField++;
    if (!row.noticeFiles.some((file) => !file.includes("/"))) noRootNotice++;
  }
  return {
    locked: rows.length,
    inspected,
    uninspected,
    noLicenseField,
    noRootNotice,
    licenses: Object.fromEntries(Object.entries(licenses).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function readInstalled(_key, names) {
  const folder = path.join(
    ROOT,
    "node_modules",
    ...names.flatMap((name, index) => (index === 0 ? [name] : ["node_modules", name])),
  );
  const manifest = path.join(folder, "package.json");
  if (!existsSync(manifest)) return null;
  const packageJson = JSON.parse(readFileSync(manifest, "utf8"));
  return {
    name: packageJson.name,
    version: packageJson.version,
    license: packageJson.license,
    noticeFiles: readdirSync(folder).filter((name) => LICENSE_FILE.test(name)),
  };
}

function main() {
  assert.ok(
    process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--json"),
    "usage: bun scripts/release-dependency-inventory.mjs [--json]",
  );
  const lock = Bun.JSONC.parse(readFileSync(path.join(ROOT, "bun.lock"), "utf8"));
  assert.ok(lock?.packages && typeof lock.packages === "object", "missing lockfile packages");
  const rows = inspectLockedPackages(lock.packages, readInstalled);
  const summary = summarizeInventory(rows);
  process.stdout.write(
    `${JSON.stringify(process.argv[2] === "--json" ? { summary, packages: rows } : summary, null, 2)}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
