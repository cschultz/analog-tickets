/** Fixed-path review artifact generation only; no database or target arguments. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildGuestInstallCandidate,
  buildGuestInstallVerifier,
} from "./guest-install-candidate.mjs";
import { buildGuestUpgradeCandidate } from "./guest-upgrade-candidate.mjs";
import { buildGuestManagedUpgradeCandidate } from "./guest-managed-upgrade-candidate.mjs";

assert.ok(process.argv.length === 3 && ["--write", "--verify"].includes(process.argv[2]));
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
for (const [path, builder] of [
  ["scripts/guest-install-snapshot.review.sql", buildGuestInstallCandidate],
  ["scripts/verify-guest-install.sql", buildGuestInstallVerifier],
  ["scripts/guest-upgrade-snapshot.review.sql", buildGuestUpgradeCandidate],
  ["scripts/guest-managed-upgrade-snapshot.review.sql", buildGuestManagedUpgradeCandidate],
]) {
  const generated = await builder();
  if (process.argv[2] === "--verify") {
    assert.equal(await readFile(path, "utf8"), generated, `${path}: source-backed snapshot drift`);
  } else {
    let previous;
    try {
      previous = await readFile(path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert.ok(
      previous === undefined || previous.startsWith(generated.split("\n")[0] + "\n"),
      "unexpected artifact",
    );
    await writeFile(path, generated);
  }
}
console.log(
  `PASS: guest fresh installer, additive upgrade and read-only verifier ${process.argv[2] === "--verify" ? "match source" : "generated for review"}`,
);
