/** Exact observed managed-platform baseline; review-only, never applies SQL. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildGuestUpgradeCandidate } from "./guest-upgrade-candidate.mjs";

export const MANAGED_DEFAULT_NORMALIZATION = `-- Only future defaults of this backend's original installer role.
-- Keep sandbox_exec platform access and all existing object grants unchanged.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`;

const managedRoleCheck = `DO $managed_platform_role$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec'
    AND rolbypassrls AND rolcanlogin AND NOT rolsuper)
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (
      SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','sandbox_exec')))
  THEN RAISE EXCEPTION 'managed platform role or inheritance differs'; END IF;
END $managed_platform_role$;`;

export function validateManagedProfile(base, managed) {
  assert.equal(managed.baselineSha256, base.baselineSha256);
  assert.deepEqual(Object.keys(managed.fingerprints).sort(), Object.keys(base.fingerprints).sort());
  for (const [key, hash] of Object.entries(managed.fingerprints)) {
    assert.match(hash, /^[0-9a-f]{32}$/);
    if (!["directPrivileges", "defaultPrivileges", "routinePrivileges"].includes(key))
      assert.equal(hash, base.fingerprints[key], `managed profile cannot waive ${key}`);
  }
}

export async function buildGuestManagedUpgradeCandidate() {
  const base = JSON.parse(await readFile("scripts/guest-upgrade-baseline.json", "utf8"));
  const managed = JSON.parse(await readFile("scripts/guest-managed-upgrade-baseline.json", "utf8"));
  validateManagedProfile(base, managed);
  let sql = await buildGuestUpgradeCandidate();
  const expected = JSON.stringify(base.fingerprints);
  assert.equal(sql.split(expected).length, 2);
  sql = sql.replace(expected, JSON.stringify(managed.fingerprints));
  const boundary = "END $guest_upgrade_preflight$;\n";
  assert.equal(sql.split(boundary).length, 2);
  sql = sql.replace(
    boundary,
    boundary + managedRoleCheck + "\n" + MANAGED_DEFAULT_NORMALIZATION + "\n",
  );
  return sql.replace(
    "-- REVIEW ONLY. Exact-baseline additive guest upgrade; not approval to apply.",
    "-- REVIEW ONLY. Exact managed-platform guest upgrade; not approval to apply.\n-- Preserves existing sandbox_exec grants and its future table/sequence defaults.\n-- That trusted platform role retains access to newly created guest tables.",
  );
}
