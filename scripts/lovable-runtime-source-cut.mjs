import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT_FILES = new Set(["package.json", "bun.lock", "tsconfig.json", "vite.config.ts"]);
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css"];

export function selectRuntimePaths(trackedPaths) {
  return trackedPaths
    .filter(
      (file) =>
        ROOT_FILES.has(file) ||
        (file.startsWith("src/") &&
          !file.startsWith("src/test/") &&
          !/\.(test|spec)\.[^/]+$/.test(file) &&
          file !== "src/routes/README.md"),
    )
    .sort();
}

export function missingRelativeImports(paths, readSource) {
  const included = new Set(paths);
  const missing = [];
  for (const file of paths) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const imports = ts.preProcessFile(readSource(file), true, true).importedFiles;
    for (const imported of imports) {
      const specifier = imported.fileName.split("?")[0];
      if (!specifier?.startsWith(".")) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const candidates = EXTENSIONS.flatMap((extension) => [
        base + extension,
        `${base}/index${extension}`,
      ]);
      if (base.startsWith("../") || !candidates.some((candidate) => included.has(candidate))) {
        missing.push(`${file} -> ${imported.fileName}`);
      }
    }
  }
  return missing;
}

function main() {
  const mode = process.argv[2];
  if (!["--verify", "--list"].includes(mode) || process.argv.length !== 3) {
    throw new Error("usage: bun scripts/lovable-runtime-source-cut.mjs --verify|--list");
  }
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "src", ...ROOT_FILES])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const paths = selectRuntimePaths(tracked);
  for (const rootFile of ROOT_FILES) {
    if (!paths.includes(rootFile)) throw new Error(`runtime cut is missing ${rootFile}`);
  }
  const missing = missingRelativeImports(paths, (file) => readFileSync(file, "utf8"));
  if (missing.length) throw new Error(`runtime cut omits local imports:\n${missing.join("\n")}`);
  if (mode === "--list") process.stdout.write(`${paths.join("\n")}\n`);
  else process.stdout.write(`runtime source cut verified: ${paths.length} tracked paths\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
