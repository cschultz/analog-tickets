/** Deterministic TEST release SQL. Builds artifacts; never connects/applies. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  buildGuestInstallCandidate,
  guestInstallVerification,
  unwrapGuestDraft,
} from "./guest-install-candidate.mjs";
import { buildQuotedCheckoutDraft } from "./quoted-checkout-candidate.mjs";
import { guestCatalogFingerprintSql } from "./guest-upgrade-catalog.mjs";

export const PROMOTION_RELEASE_STEPS = Object.freeze([
  "scripts/promotion-quotes.draft.sql",
  "scripts/quoted-checkout.draft.sql",
  "scripts/quoted-expiry.draft.sql",
  "scripts/guest-promo-checkout.draft.sql",
  "scripts/quoted-expiry-dispatch.draft.sql",
  "scripts/organizer-promotions.draft.sql",
]);
export const PROMOTION_ARTIFACT_PATHS = Object.freeze([
  "scripts/promotion-install.review.sql",
  "scripts/promotion-upgrade.review.sql",
  "scripts/verify-promotion-install.sql",
]);
export const PROMOTION_PACKAGE_SOURCE_PATHS = Object.freeze([
  ...PROMOTION_RELEASE_STEPS,
  "scripts/promotion-release-candidate.mjs",
  "scripts/promotion-release-package.mjs",
  "scripts/promotion-release-profile.json",
  "scripts/quoted-checkout-candidate.mjs",
  "docs/PROMOTION_RELEASE_INSTALL.md",
]);
const sha = (text) => createHash("sha256").update(text).digest("hex");
export async function promotionReleaseInputs() {
  const guest = await buildGuestInstallCandidate(),
    layers = [];
  for (const [index, file] of PROMOTION_RELEASE_STEPS.entries()) {
    const source = await readFile(file, "utf8");
    const sql =
      file === "scripts/quoted-checkout.draft.sql"
        ? buildQuotedCheckoutDraft(guest, source)
        : source;
    layers.push(`-- Product step ${index + 46}/51: ${file}\n${unwrapGuestDraft(sql)}`);
  }
  const delta = layers.join("\n\n");
  return { guest, delta, sourceSha256: sha(guest + "\0" + delta) };
}
async function profiles() {
  const inputs = await promotionReleaseInputs();
  const profile = JSON.parse(await readFile("scripts/promotion-release-profile.json", "utf8"));
  assert.equal(
    profile.sourceSha256,
    inputs.sourceSha256,
    "release SQL/profile drift; rehearse locally before regenerating",
  );
  assert.deepEqual(Object.keys(profile.profiles).sort(), ["managed", "standard", "supabase"]);
  for (const name of ["standard", "managed", "supabase"])
    for (const phase of ["baseline", "release"]) {
      const p = profile.profiles[name][phase];
      assert.equal(Object.keys(p).length, 14);
      for (const value of Object.values(p)) assert.match(value, /^[0-9a-f]{32}$/);
    }
  return { ...inputs, profile };
}
function compareSql(values) {
  return values.map((x) => `actual='${JSON.stringify(x)}'::jsonb`).join(" OR ");
}
function roleGuard(managed) {
  return `
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles
    WHERE rolname IN ('anon','authenticated','service_role','sandbox_exec'))) THEN
    RAISE EXCEPTION 'application role inheritance differs'; END IF;
  IF actual='${JSON.stringify(managed)}'::jsonb AND NOT EXISTS(SELECT 1 FROM pg_roles
    WHERE rolname='sandbox_exec' AND rolcanlogin AND rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'managed platform role differs'; END IF;`;
}

export async function buildPromotionVerification() {
  const { profile } = await profiles();
  let baseline = await guestInstallVerification();
  assert.equal(baseline.split("24, 24, 15, 23, 40").length, 2);
  baseline = baseline.replace("24, 24, 15, 23, 40", "29, 29, 15, 34, 62");
  return (
    baseline +
    `
DO $verify_promotion_release$ DECLARE actual jsonb; checked_role text; checked_table text; BEGIN
  ${guestCatalogFingerprintSql().replace(" AS fingerprints", " INTO actual")};
  IF NOT (${compareSql(Object.values(profile.profiles).map((p) => p.release))}) THEN
    RAISE EXCEPTION 'release catalog/permissions differ'; END IF;
  ${roleGuard(profile.profiles.managed.release)}
  FOR checked_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','sandbox_exec') LOOP
    FOREACH checked_table IN ARRAY ARRAY['ticket_promotions','ticket_price_quotes','ticket_quote_allocations',
      'promotion_redemptions','ticket_quote_expiry_records'] LOOP
      IF has_table_privilege(checked_role,'public.'||checked_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(checked_role,'public.'||checked_table,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'private pricing table grant differs'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('guard_immutable_ticket_quote','guard_ticket_quote_allocation','guard_ticket_promotion_version',
        'guard_promotion_redemption','reserve_ticket_price_quote','settle_ticket_promotion','guard_checkout_price_quote',
        'guard_ticket_quote_identity','guard_linked_promotion_release','read_quoted_refund_amount','guard_quoted_hold_release',
        'guard_quoted_attempt_delete','release_priced_guest_cart','ticket_price_revision','preview_ticket_price',
        'prepare_priced_guest_cart','read_priced_guest_cart','begin_priced_guest_payment','read_priced_expiry_target',
        'list_priced_expiry_candidates','read_organizer_promotions','save_organizer_promotion')
      AND has_function_privilege(checked_role,p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'private pricing routine grant differs'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef) THEN
    RAISE EXCEPTION 'release routines must remain invoker'; END IF;
  -- The complete routine fingerprint above checks every function body/config.
  -- Retain historical invoker helpers with their reviewed public search path;
  -- all new pricing routines use an explicitly empty search path.
END $verify_promotion_release$;`
  );
}
export async function buildPromotionInstallCandidate() {
  const { guest, delta } = await profiles();
  assert.match(guest, /\nCOMMIT;\n$/);
  const boundary = "SET LOCAL statement_timeout = '60s';";
  assert.equal(guest.split(boundary).length, 2);
  const fresh = guest.replace(
    boundary,
    boundary +
      `
SELECT pg_advisory_xact_lock(hashtextextended('analog-promotion-release-install',0));
DO $promotion_fresh_auth$ BEGIN
  IF EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'fresh install requires zero Auth users'; END IF;
END $promotion_fresh_auth$;`,
  );
  return (
    "-- Current app TEST fresh install: 51 source-backed steps. Not approval to apply.\n" +
    fresh.replace(/\nCOMMIT;\n$/, "\n") +
    "\n" +
    delta +
    "\n" +
    (await buildPromotionVerification()) +
    "\nCOMMIT;\n"
  );
}
export async function buildPromotionUpgradeCandidate() {
  const { profile, delta } = await profiles();
  return `-- Current app TEST upgrade from the exact 45-step guest baseline. Not approval to apply.
-- Quiesce writers; preserve rows, role identities, existing grants and defaults.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
SELECT pg_advisory_xact_lock(hashtextextended('analog-promotion-release-install',0));
DO $promotion_upgrade_preflight$ DECLARE actual jsonb; tables text; BEGIN
  IF to_regclass('public.events') IS NULL OR (SELECT relowner FROM pg_class WHERE oid=to_regclass('public.events'))<>current_user::regrole::oid
  THEN RAISE EXCEPTION 'upgrade requires the original guest installer role'; END IF;
  SELECT string_agg(format('public.%I',c.relname),',' ORDER BY c.relname) INTO tables FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');
  EXECUTE 'LOCK TABLE '||tables||' IN SHARE ROW EXCLUSIVE MODE';
  ${guestCatalogFingerprintSql().replace(" AS fingerprints", " INTO actual")};
  IF NOT (${compareSql(Object.values(profile.profiles).map((p) => p.baseline))}) THEN
    RAISE EXCEPTION '45-step guest catalog/permissions differ; upgrade refused'; END IF;
  ${roleGuard(profile.profiles.managed.baseline)}
END $promotion_upgrade_preflight$;
${delta}
${await buildPromotionVerification()}
COMMIT;
`;
}
export async function buildPromotionArtifacts() {
  return {
    [PROMOTION_ARTIFACT_PATHS[0]]: await buildPromotionInstallCandidate(),
    [PROMOTION_ARTIFACT_PATHS[1]]: await buildPromotionUpgradeCandidate(),
    [PROMOTION_ARTIFACT_PATHS[2]]:
      "-- Read-only current app catalog/permission verifier.\nBEGIN TRANSACTION READ ONLY;\n" +
      (await buildPromotionVerification()) +
      "\nCOMMIT;\n",
  };
}
