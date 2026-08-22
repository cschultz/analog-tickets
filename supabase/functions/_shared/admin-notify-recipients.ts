// Single source of truth for "platform admin" email recipients.
// Other users with the `admin` role are event-only admins and must NOT
// receive platform-level notification emails (new sales, escalations,
// incident alerts, etc.).
//
// Configure with the PLATFORM_ADMIN_EMAILS environment variable: a
// comma-separated list of addresses. No address is hardcoded here; when the
// variable is unset the list is empty and platform notifications are simply
// not sent to anyone.
export const SUPER_ADMIN_EMAILS: readonly string[] = (
  Deno.env.get("PLATFORM_ADMIN_EMAILS") ?? ""
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.includes("@"));

const SUPER_SET = new Set(SUPER_ADMIN_EMAILS);

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return !!email && SUPER_SET.has(email.toLowerCase());
}

export function filterSuperAdminEmails(
  emails: Array<string | null | undefined>,
): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    if (e && SUPER_SET.has(e.toLowerCase())) out.add(e.toLowerCase());
  }
  // If the db has no match (e.g. profile email casing/missing), fall back to
  // the configured list so platform alerts are never silently dropped. When
  // PLATFORM_ADMIN_EMAILS is unset this stays empty and callers send nothing.
  if (out.size === 0) for (const e of SUPER_ADMIN_EMAILS) out.add(e);
  return Array.from(out);
}
