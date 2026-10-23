/** Source-backed SQL only: no database connections, credentials or apply action. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildPromotionArtifacts,
  PROMOTION_ARTIFACT_PATHS,
} from "./promotion-release-candidate.mjs";

const mode = process.argv[2];
assert.ok(
  process.argv.length === 3 &&
    ["--check-source", "--verify", "--emit-fresh", "--emit-upgrade", "--emit-verifier"].includes(
      mode,
    ),
  "Use --check-source, --verify (in staged archive), or --emit-fresh/--emit-upgrade/--emit-verifier. Nothing applies SQL.",
);
const artifacts = await buildPromotionArtifacts();
if (mode === "--verify") {
  for (const [file, sql] of Object.entries(artifacts))
    assert.equal(await readFile(file, "utf8"), sql, `generated release artifact drift: ${file}`);
  console.log(
    "PASS: all three packaged SQL files match their reviewed source and captured catalog profiles.",
  );
} else if (mode === "--check-source")
  console.log("PASS: source-backed fresh, upgrade and read-only verifier build successfully.");
else
  process.stdout.write(
    artifacts[
      PROMOTION_ARTIFACT_PATHS[["--emit-fresh", "--emit-upgrade", "--emit-verifier"].indexOf(mode)]
    ],
  );
