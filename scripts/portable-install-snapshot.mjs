/** Generate or verify the fixed-path, review-only portable SQL snapshot. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPortableInstallCandidate } from "./portable-install-candidate.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshotPath = join(root, "scripts", "portable-install-snapshot.review.sql");
const mode = process.argv.slice(2);
assert.ok(
  mode.length === 1 && ["--write", "--verify"].includes(mode[0]),
  "expected exactly --write or --verify; no database or output target",
);
process.chdir(root);

const generated = await buildPortableInstallCandidate();
const digest = createHash("sha256").update(generated).digest("hex");
if (mode[0] === "--verify") {
  const checkedIn = await readFile(snapshotPath, "utf8");
  assert.equal(checkedIn, generated, "review SQL snapshot drift; regenerate and review it");
  console.log(`PASS: review-only SQL snapshot matches 42 source steps; SHA-256 ${digest}`);
} else {
  let previous;
  try {
    previous = await readFile(snapshotPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  assert.ok(
    previous === undefined ||
      previous.startsWith("-- REVIEW ONLY. Fresh synthetic database candidate"),
    "refusing to replace an unexpected snapshot file",
  );
  await writeFile(snapshotPath, generated);
  console.log(`Wrote review-only SQL snapshot; SHA-256 ${digest}`);
}
