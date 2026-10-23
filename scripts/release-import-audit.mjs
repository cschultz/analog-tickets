/** Check an imported private release cut before installing or building it. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST = "SOURCE_MANIFEST.sha256";
const BUILD_DIRECTORIES = new Set([".git", ".output", ".wrangler", "node_modules", "dist"]);

/** Check inline local file links used by the release docs, not Markdown anchors. */
export function missingInlineDocumentTargets(paths, readSource) {
  const known = new Set(paths);
  const missing = [];
  for (const file of paths.filter((p) => p.endsWith(".md"))) {
    // Examples inside fenced/inline code are not navigable document links.
    const source = readSource(file)
      .toString("utf8")
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
      .replace(/`[^`\n]*`/g, "");
    for (const match of source.matchAll(
      /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g,
    )) {
      const ref = match[1] ?? match[2];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(ref)) continue;
      let target;
      try {
        const decoded = decodeURIComponent(ref.split(/[?#]/)[0]);
        if (path.posix.isAbsolute(decoded)) {
          missing.push(`${file} -> ${ref}`);
          continue;
        }
        target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded));
      } catch {
        missing.push(`${file} -> invalid encoded target`);
        continue;
      }
      if (ref.startsWith("/") || !known.has(target)) missing.push(`${file} -> ${ref}`);
    }
  }
  return missing.sort();
}

function validRelativePath(file) {
  return (
    !path.isAbsolute(file) &&
    file.split("/").every((part) => part && part !== "." && part !== ".." && /^[\w.-]+$/.test(part))
  );
}

export function parseSourceManifest(source) {
  if (!source.endsWith("\n")) throw new Error("source manifest is not newline-terminated");
  const entries = new Map();
  for (const line of source.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match || !validRelativePath(match[2]) || match[2] === MANIFEST)
      throw new Error("source manifest has an invalid entry");
    if (entries.has(match[2])) throw new Error("source manifest has a duplicate path");
    entries.set(match[2], match[1]);
  }
  if (!entries.size) throw new Error("source manifest is empty");
  return entries;
}

function regularFile(root, relative) {
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return "missing";
      throw error;
    }
    if (stat.isSymbolicLink()) return "symlink";
    if (index < parts.length - 1 && !stat.isDirectory()) return "not-file";
    if (index === parts.length - 1 && !stat.isFile()) return "not-file";
  }
  return "regular";
}

function allProjectFiles(root) {
  const files = [];
  const visit = (directory, relative) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Generated directories are expected only at the archive root. A
      // src/dist or docs/node_modules folder is inherited source, not build
      // output, and must not make an exact-import audit pass.
      if (!relative && entry.isDirectory() && BUILD_DIRECTORIES.has(entry.name)) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), name);
      else files.push(name);
    }
  };
  visit(root, "");
  return files.sort();
}

export function auditReleaseImport(root, manifestSource) {
  const expected = parseSourceManifest(manifestSource);
  const result = { missing: [], changed: [], unexpected: [], unsafe: [] };
  for (const [file, sha] of expected) {
    const state = regularFile(root, file);
    if (state === "missing") result.missing.push(file);
    else if (state !== "regular") result.unsafe.push(file);
    else if (
      createHash("sha256")
        .update(readFileSync(path.join(root, file)))
        .digest("hex") !== sha
    )
      result.changed.push(file);
  }
  for (const file of allProjectFiles(root)) {
    if (file === MANIFEST || expected.has(file)) continue;
    if (regularFile(root, file) === "symlink") result.unsafe.push(file);
    else result.unexpected.push(file);
  }
  for (const paths of Object.values(result)) paths.sort();
  return result;
}

function main() {
  if (process.argv.length !== 2) throw new Error("run from an imported release archive root");
  const root = process.cwd();
  if (regularFile(root, MANIFEST) !== "regular")
    throw new Error("source manifest is missing or unsafe");
  const result = auditReleaseImport(root, readFileSync(path.join(root, MANIFEST), "utf8"));
  for (const [kind, files] of Object.entries(result)) {
    for (const file of files) process.stdout.write(`${kind}: ${file}\n`);
  }
  const clean = Object.values(result).every((files) => files.length === 0);
  const missingLinks = clean
    ? missingInlineDocumentTargets(
        [...parseSourceManifest(readFileSync(path.join(root, MANIFEST), "utf8")).keys()],
        (file) => readFileSync(path.join(root, file)),
      )
    : [];
  for (const link of missingLinks) process.stdout.write(`missing document target: ${link}\n`);
  process.stdout.write(
    clean && !missingLinks.length
      ? "import audit: exact source tree and inline document targets\n"
      : "import audit: review required\n",
  );
  if (!clean || missingLinks.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
