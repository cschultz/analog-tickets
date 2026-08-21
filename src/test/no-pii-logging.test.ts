/**
 * Static check: frontend console logging must not emit customer PII or credentials.
 *
 * Scope: `src/**` frontend source only. Server-side (edge function) logging is
 * intentionally out of scope for this check.
 *
 * The check is deliberately narrow so it stays maintainable: it flags logging
 * of *values* that are known PII/credential identifiers (email, phone, full
 * name, invitation/reset tokens, auth session objects), not generic diagnostic
 * logging such as `console.error("Error saving template:", error)`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "test") return [];
      return walk(full);
    }
    return /\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

/** Console call, capturing its argument list up to the end of the line. */
const CONSOLE_CALL = /console\.(log|debug|info|warn|error)\(([^\n]*)/g;

/**
 * Bare identifiers/expressions that leak PII when logged as a value.
 * Matches `, email)`, `${registration.email}`, `, data.session`, etc.
 */
const PII_VALUE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "email value", re: /(\$\{[^}]*[eE]mail[^}]*\}|[,(]\s*[\w.?]*[eE]mail(?!Error|Err)[\w.?]*\s*[,)])/ },
  { name: "phone value", re: /(\$\{[^}]*[pP]hone[^}]*\}|[,(]\s*[\w.?]*[pP]hone[\w.?]*\s*[,)])/ },
  { name: "person name value", re: /(\$\{[^}]*\.(name|fullName|full_name|last_name|first_name)\b[^}]*\}|[,(]\s*[\w.?]*\.(name|fullName|full_name|last_name|first_name)\s*[,)])/ },
  { name: "token value", re: /[,(]\s*[\w.?]*(invitationToken|resetToken|accessToken|access_token|refresh_token|apiKey|api_key|password)\b[\w.?]*\s*[,)]/i },
  {
    name: "PII field in logged object literal",
    re: /\{[^}]*\b(email|fullName|full_name|firstName|lastName|phone|password|invitationToken|token)\b\s*[,:}]/,
  },
  { name: "auth session object", re: /[,(]\s*[\w.?]*\b(session|authData|userData)\b\s*[,)]/ },
];

/**
 * Safe shapes: redacted booleans/counts/ids are allowed even if the key name
 * contains a PII word (e.g. `{ has_email: !!x }`, `{ configured: !!email }`).
 */
const REDACTED_HINT = /!!|\?\?|\b(has[A-Z_]|is[A-Z_]|configured|count|length|resolved|failed|redacted)/;

describe("frontend console logging contains no PII", () => {
  const files = walk(SRC);

  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  const scanLine = (line: string): string[] => {
    const hits: string[] = [];
    CONSOLE_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CONSOLE_CALL.exec(line))) {
      const args = match[2];
      if (REDACTED_HINT.test(args)) continue;
      for (const { name, re } of PII_VALUE_PATTERNS) {
        if (re.test(args)) hits.push(name);
      }
    }
    return hits;
  };

  it("has no console call logging PII or credential values", () => {
    const findings: string[] = [];

    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const name of scanLine(line)) {
            findings.push(`${file.replace(process.cwd() + "/", "")}:${i + 1} — ${name}: ${line.trim()}`);
          }
        });
    }

    expect(findings).toEqual([]);
  });

  it("flags the historical findings this slice fixed (detector self-test)", () => {
    // Regressions of the exact lines removed in Gate 5 Slice 6.
    expect(scanLine(`console.log("Attempting signup with:", { email, fullName });`).length).toBeGreaterThan(0);
    expect(scanLine("console.error(`Failed to send reminder to ${registration.email}:`, error);").length).toBeGreaterThan(0);
    expect(scanLine(`console.log('Signup started with invitation token:', invitationToken);`).length).toBeGreaterThan(0);
    expect(scanLine(`console.log("Setting reply-to email:", talentEmail);`).length).toBeGreaterThan(0);
    expect(scanLine(`console.log("Signup result:", data.session);`).length).toBeGreaterThan(0);
  });

  it("does not flag legitimate generic diagnostic logging", () => {
    expect(scanLine(`console.error("Error saving template:", error);`)).toEqual([]);
    expect(scanLine(`console.log("[GA4] user_data set:", { has_email: !!userData.email });`)).toEqual([]);
    expect(scanLine(`console.log("[artist-emailer] Reply-to default", { configured: !!talentEmail });`)).toEqual([]);
    expect(scanLine(`console.warn("[realtime-capture] Best-effort field capture skipped", error);`)).toEqual([]);
  });

  it("does not reintroduce the diagnostic-only signup test page", () => {
    expect(existsSync(join(SRC, "pages/SignupTest.tsx"))).toBe(false);
    const adminRoutes = readFileSync(join(SRC, "routes/admin.routes.tsx"), "utf8");
    expect(adminRoutes).not.toContain("signup-test");
  });
});

