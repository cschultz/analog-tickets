/** Review-only fresh guest installer. Never connects to or modifies a database. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPortableInstallCandidate } from "./portable-install-candidate.mjs";

export const GUEST_INSTALL_STEPS = Object.freeze([
  "scripts/guest-checkout-carts.draft.sql",
  "scripts/guest-purchase-recovery.draft.sql",
  "scripts/guest-purchase-account.draft.sql",
]);

// The component drafts remain independently reviewable, but must not commit
// partway through the combined installer. Fail closed if their wrappers change.
export function unwrapGuestDraft(sql) {
  assert.equal((sql.match(/^BEGIN;\s*$/gm) ?? []).length, 1, "expected one draft BEGIN");
  assert.equal((sql.match(/^COMMIT;\s*$/gm) ?? []).length, 1, "expected one draft COMMIT");
  assert.match(sql, /^--[^]*?\nBEGIN;\n/);
  assert.match(sql, /\nCOMMIT;\s*$/);
  assert.ok(
    sql
      .slice(0, sql.indexOf("\nBEGIN;"))
      .split("\n")
      .every((line) => !line.trim() || line.trim().startsWith("--")),
    "SQL before draft transaction",
  );
  return sql
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/^COMMIT;\s*$/m, "")
    .trim();
}

export async function guestInstallVerification() {
  // Keep the complete baseline permission matrix, not just the new counts.
  const baseline = await readFile("scripts/verify-portable-install.sql", "utf8");
  const check = baseline.slice(
    baseline.indexOf("DO $verify_install$"),
    baseline.indexOf("\nCOMMIT;"),
  );
  assert.ok(check.startsWith("DO $verify_install$") && check.endsWith("$verify_install$;"));
  assert.equal((check.match(/20, 20, 15, 22, 29/g) ?? []).length, 1);
  return (
    check.replace("20, 20, 15, 22, 29", "24, 24, 15, 23, 40") +
    `
DO $verify_guest$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])
      AND p.proname IN ('prepare_guest_checkout_cart','queue_guest_purchase_receipt',
        'claim_guest_purchase_delivery','finish_guest_purchase_delivery','request_guest_purchase_recovery',
        'redeem_guest_purchase_proof','resolve_guest_purchase_session','revoke_guest_purchase_session',
        'attach_guest_purchase_account','resolve_guest_account_purchase','list_guest_account_purchases')
  ) THEN RAISE EXCEPTION 'guest routine must be invoker with empty search path'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'prepare_guest_checkout_cart','queue_guest_purchase_receipt','claim_guest_purchase_delivery',
        'finish_guest_purchase_delivery','request_guest_purchase_recovery','redeem_guest_purchase_proof',
        'resolve_guest_purchase_session','revoke_guest_purchase_session','attach_guest_purchase_account',
        'resolve_guest_account_purchase','list_guest_account_purchases')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')) <> 11
  THEN RAISE EXCEPTION 'guest service routine grant mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('guest_checkout_carts',false),('guest_purchase_deliveries',true),
      ('guest_purchase_sessions',true),('guest_purchase_account_links',false)) AS expected(name,can_update)
    WHERE NOT has_table_privilege('service_role','public.'||name,'SELECT')
      OR NOT has_table_privilege('service_role','public.'||name,'INSERT')
      OR has_table_privilege('service_role','public.'||name,'UPDATE') IS DISTINCT FROM can_update
      OR has_table_privilege('service_role','public.'||name,'DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN RAISE EXCEPTION 'guest service table grant mismatch'; END IF;
END $verify_guest$;`
  );
}

export async function buildGuestInstallCandidate() {
  const baseline = await buildPortableInstallCandidate();
  assert.match(baseline, /\nCOMMIT;\n$/);
  const steps = await Promise.all(
    GUEST_INSTALL_STEPS.map(
      async (file, index) =>
        `-- Guest step ${index + 43}/45: ${file}\n${unwrapGuestDraft(await readFile(file, "utf8"))}`,
    ),
  );
  return (
    baseline.replace(/\nCOMMIT;\n$/, "\n") +
    `\n${steps.join("\n\n")}\n${await guestInstallVerification()}\nCOMMIT;\n`
  );
}

export async function buildGuestInstallVerifier() {
  return `-- Read-only verifier for the 45-step fresh guest installer.\nBEGIN TRANSACTION READ ONLY;\n${await guestInstallVerification()}\nCOMMIT;\n`;
}
