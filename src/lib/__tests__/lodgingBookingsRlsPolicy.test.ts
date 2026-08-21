import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard: My Tickets reads lodging_bookings via a session-token RLS
 * policy (x-mytickets-session header) minted by mint_my_tickets_session. If that
 * policy disappears, paid lodging silently vanishes from the wallet.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function loadMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

describe("lodging_bookings RLS policy for My Tickets session lookup", () => {
  const migrations = loadMigrations();

  it("has at least one SELECT policy on lodging_bookings keyed off the MyTickets session", () => {
    const matches = migrations.filter(({ sql }) => {
      const lower = sql.toLowerCase();
      return (
        lower.includes("lodging_bookings") &&
        (lower.includes("current_mytickets_email") || lower.includes("x-mytickets-session")) &&
        /create\s+policy/i.test(sql) &&
        /for\s+select/i.test(sql)
      );
    });

    expect(
      matches.length,
      "Expected a CREATE POLICY ... FOR SELECT on public.lodging_bookings using the MyTickets session token.",
    ).toBeGreaterThan(0);
  });
});

