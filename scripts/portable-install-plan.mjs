/** Review-only ordering for the draft local schema replay; not a migration. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { buildPassRevocationTriggerSql } from "./pass-invalidation-proposal.mjs";

const orderedSql = async (directory) =>
  (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `${directory}/${name}`);

export async function portableInstallPlan() {
  // The capture predates these refund changes. Preserve its comparison
  // boundary, then replay later checked-in SQL before draft postludes.
  const laterMigrationNames = new Set([
    "20261001211504_refund_ticket_atomic_claims.sql",
    "20261005134021_minimize_browser_table_grants.sql",
    "0008_refund_exact_order_attempt.sql",
  ]);
  const migrationFiles = [
    ...(await orderedSql("supabase/migrations")),
    ...(await orderedSql("drizzle/migrations")),
  ];
  const historicalFiles = [
    "scripts/early-migration-foundation.draft.sql",
    ...migrationFiles.filter((file) => !laterMigrationNames.has(file.split("/").at(-1))),
  ];
  const laterFiles = migrationFiles.filter((file) =>
    laterMigrationNames.has(file.split("/").at(-1)),
  );
  const baselineFiles = [...historicalFiles, ...laterFiles];
  const files = [
    ...baselineFiles,
    "scripts/reservation-owner-binding-proposal.sql",
    "scripts/checkout-recovery-version-proposal.sql",
    "scripts/checkout-deadline-storage-proposal.sql",
    "scripts/guarded-v2-expiry-release-proposal.sql",
    "scripts/owned-expiry-audit-proposal.sql",
    "scripts/orphan-reservation-cleanup-proposal.sql",
    "scripts/owned-reservation-preparation-proposal.sql",
    "scripts/owner-pass-issuance-proposal.sql",
    "scripts/pass-invalidation-proposal.mjs",
    "scripts/post-migration-access.draft.sql",
  ];
  assert.equal(files.length, 42, "review a changed draft install step count");
  assert.equal(new Set(files).size, files.length, "duplicate draft install step");
  return { historicalFiles, laterFiles, baselineFiles, files };
}

export async function portableInstallSql(file) {
  return file === "scripts/pass-invalidation-proposal.mjs"
    ? buildPassRevocationTriggerSql()
    : readFile(file, "utf8");
}
