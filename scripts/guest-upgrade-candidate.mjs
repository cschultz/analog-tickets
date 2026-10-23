/** Additive upgrade draft for the exact reviewed 42-step baseline. Never applies SQL. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildPortableInstallCandidate } from "./portable-install-candidate.mjs";
import {
  GUEST_INSTALL_STEPS,
  unwrapGuestDraft,
  guestInstallVerification,
} from "./guest-install-candidate.mjs";
import { guestCatalogFingerprintSql, guestCatalogQueries } from "./guest-upgrade-catalog.mjs";

export async function buildGuestUpgradeCandidate() {
  const baseline = await buildPortableInstallCandidate();
  const fixture = JSON.parse(await readFile("scripts/guest-upgrade-baseline.json", "utf8"));
  assert.equal(
    fixture.baselineSha256,
    createHash("sha256")
      .update(baseline)
      .digest("hex"),
  );
  assert.deepEqual(
    Object.keys(fixture.fingerprints).sort(),
    Object.keys(guestCatalogQueries).sort(),
  );
  for (const hash of Object.values(fixture.fingerprints)) assert.match(hash, /^[0-9a-f]{32}$/);
  const probe = baseline.slice(
    baseline.indexOf("SAVEPOINT portable_future_acl_probe;"),
    baseline.lastIndexOf("COMMIT;"),
  );
  assert.ok(probe.startsWith("SAVEPOINT") && probe.includes("RELEASE SAVEPOINT"));
  const steps = await Promise.all(
    GUEST_INSTALL_STEPS.map(
      async (file) =>
        `-- Additive guest source: ${file}\n${unwrapGuestDraft(await readFile(file, "utf8"))}`,
    ),
  );
  return `-- REVIEW ONLY. Exact-baseline additive guest upgrade; not approval to apply.
-- Quiesce application writers first. No reset, backfill, ownership rewrite or provider calls.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_advisory_xact_lock(hashtextextended('analog-guest-baseline-upgrade',0));
DO $guest_upgrade_preflight$ DECLARE actual jsonb; tables text; BEGIN
  IF to_regclass('public.events') IS NULL OR
    (SELECT relowner FROM pg_class WHERE oid=to_regclass('public.events')) <> current_user::regrole::oid
  THEN RAISE EXCEPTION 'upgrade requires the original baseline installer role'; END IF;
  SELECT string_agg(format('public.%I',c.relname),',' ORDER BY c.relname) INTO tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p');
  EXECUTE 'LOCK TABLE ' || tables || ' IN SHARE ROW EXCLUSIVE MODE';
  ${guestCatalogFingerprintSql().replace(" AS fingerprints", " INTO actual")};
  IF actual IS DISTINCT FROM '${JSON.stringify(fixture.fingerprints)}'::jsonb
  THEN RAISE EXCEPTION 'upgrade baseline catalog differs; no changes applied'; END IF;
END $guest_upgrade_preflight$;
${probe}
${steps.join("\n\n")}
${await guestInstallVerification()}
${probe}
COMMIT;
`;
}
