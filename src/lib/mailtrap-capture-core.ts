/**
 * Gate 123 — pure logic for the private Mailtrap **Email Testing** (sandbox)
 * capture adapter.
 *
 * Email Testing only: every message is captured by a disposable inbox and is
 * never delivered to a real mailbox. Mailtrap's Email Sending / bulk transports
 * are refused structurally by the host allow-list below.
 *
 * This module holds no transport, no credentials, and no environment access.
 * It never returns, formats, or logs a raw OTP code, recipient address, token,
 * or configuration value.
 */
import { isSyntheticDomain, normalizeRecipient } from "./mail-capture-core";

/** Server-only configuration names. None of these may ever be `VITE_*`. */
export const MAILTRAP_ENV_NAMES = [
  "MAILTRAP_TESTING_MODE",
  "MAILTRAP_API_TOKEN",
  "MAILTRAP_ACCOUNT_ID",
  "MAILTRAP_INBOX_ID",
  "MAILTRAP_FROM_ADDRESS",
  "MAILTRAP_RECIPIENT_DOMAIN",
] as const;

export type MailtrapEnvName = (typeof MAILTRAP_ENV_NAMES)[number];

/** The only name that carries a credential. */
export const MAILTRAP_SECRET_ENV_NAMES: readonly MailtrapEnvName[] = ["MAILTRAP_API_TOKEN"];

/** Email Testing hosts only. Sending / bulk hosts are never reachable. */
export const MAILTRAP_SANDBOX_HOST = "sandbox.api.mailtrap.io";
export const MAILTRAP_MANAGEMENT_HOST = "mailtrap.io";
export const MAILTRAP_FORBIDDEN_HOSTS = [
  "send.api.mailtrap.io",
  "bulk.api.mailtrap.io",
  "live.smtp.mailtrap.io",
] as const;

export type MailtrapDisabledReason =
  | "mode_off"
  | "missing_configuration"
  | "invalid_identifier"
  | "non_synthetic_domain"
  | "non_synthetic_sender";

export type MailtrapFailureReason =
  | "disabled"
  | "recipient_not_allowed"
  | "invalid_input"
  | "provider_unavailable";

export interface MailtrapConfig {
  apiToken: string;
  accountId: string;
  inboxId: string;
  fromAddress: string;
  recipientDomain: string;
}

export type MailtrapResolution =
  | { enabled: true; config: MailtrapConfig }
  | { enabled: false; reason: MailtrapDisabledReason };

function trimmed(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Fail-closed: only the exact literal `true` enables the sandbox adapter. */
export function isTestingModeEnabled(value: string | undefined | null): boolean {
  return trimmed(value).toLowerCase() === "true";
}

/** Mailtrap account and inbox identifiers are plain positive integers. */
export function isNumericId(value: string): boolean {
  return /^[0-9]{1,12}$/.test(value);
}

/**
 * Resolves configuration into an enabled adapter or an explicit disabled
 * reason. Absent, partial, or non-synthetic configuration means disabled.
 */
export function resolveMailtrapConfig(
  env: Partial<Record<MailtrapEnvName, string | undefined>>,
): MailtrapResolution {
  if (!isTestingModeEnabled(env.MAILTRAP_TESTING_MODE)) {
    return { enabled: false, reason: "mode_off" };
  }
  const apiToken = trimmed(env.MAILTRAP_API_TOKEN);
  const accountId = trimmed(env.MAILTRAP_ACCOUNT_ID);
  const inboxId = trimmed(env.MAILTRAP_INBOX_ID);
  const fromAddress = normalizeRecipient(env.MAILTRAP_FROM_ADDRESS) ?? "";
  const recipientDomain = trimmed(env.MAILTRAP_RECIPIENT_DOMAIN).toLowerCase();

  if (!apiToken || !accountId || !inboxId || !fromAddress || !recipientDomain) {
    return { enabled: false, reason: "missing_configuration" };
  }
  if (!isNumericId(accountId) || !isNumericId(inboxId)) {
    return { enabled: false, reason: "invalid_identifier" };
  }
  if (!isSyntheticDomain(recipientDomain)) {
    return { enabled: false, reason: "non_synthetic_domain" };
  }
  if (!isSyntheticDomain(fromAddress.split("@")[1] ?? "")) {
    return { enabled: false, reason: "non_synthetic_sender" };
  }
  return { enabled: true, config: { apiToken, accountId, inboxId, fromAddress, recipientDomain } };
}

/* ------------------------------- Endpoints ------------------------------- */

/** Sandbox send: captured by the inbox, never delivered to a real address. */
export function sandboxSendUrl(config: MailtrapConfig): string {
  return `https://${MAILTRAP_SANDBOX_HOST}/api/send/${config.inboxId}`;
}

function inboxRoot(config: MailtrapConfig): string {
  return `https://${MAILTRAP_MANAGEMENT_HOST}/api/accounts/${config.accountId}/inboxes/${config.inboxId}`;
}

export function messagesUrl(config: MailtrapConfig): string {
  return `${inboxRoot(config)}/messages`;
}

export function messageBodyUrl(config: MailtrapConfig, messageId: string | number): string {
  return `${inboxRoot(config)}/messages/${encodeURIComponent(String(messageId))}/body.txt`;
}

export function messageDeleteUrl(config: MailtrapConfig, messageId: string | number): string {
  return `${inboxRoot(config)}/messages/${encodeURIComponent(String(messageId))}`;
}

/** True only for the two Email Testing hosts; sending/bulk hosts are refused. */
export function isAllowedMailtrapUrl(url: string): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  if ((MAILTRAP_FORBIDDEN_HOSTS as readonly string[]).includes(host)) return false;
  return host === MAILTRAP_SANDBOX_HOST || host === MAILTRAP_MANAGEMENT_HOST;
}

/* ----------------------------- Message shaping ---------------------------- */

export interface MailtrapSendPayload {
  from: { email: string };
  to: { email: string }[];
  subject: string;
  text: string;
  category: string;
}

/** The code appears only inside the sandbox message text, never elsewhere. */
export function buildSandboxPayload(input: {
  from: string;
  to: string;
  code: string;
}): MailtrapSendPayload {
  return {
    from: { email: input.from },
    to: [{ email: input.to }],
    subject: "Your test verification code",
    text: `Test-only verification code: ${input.code}. It expires in 10 minutes.`,
    category: "staging-otp-capture",
  };
}

export interface MailtrapMessageSummary {
  id: string;
  toEmail: string;
  sentAtMs: number;
}

/** Reads only the three fields the harness needs; ignores all other payload. */
export function parseMessageList(payload: unknown): MailtrapMessageSummary[] {
  if (!Array.isArray(payload)) return [];
  const out: MailtrapMessageSummary[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = item['id'];
    const to = normalizeRecipient(item['to_email']);
    if ((typeof id !== "string" && typeof id !== "number") || !to) continue;
    const sent = typeof item['sent_at'] === "string" ? Date.parse(item['sent_at']) : NaN;
    out.push({ id: String(id), toEmail: to, sentAtMs: Number.isFinite(sent) ? sent : 0 });
  }
  return out;
}

/** Newest message for one recipient at or after `since`; null when absent. */
export function selectLatest(
  messages: readonly MailtrapMessageSummary[],
  to: string,
  since: number,
): MailtrapMessageSummary | null {
  const matches = messages
    .filter((m) => m.toEmail === to && m.sentAtMs >= since)
    .sort((a, b) => b.sentAtMs - a.sentAtMs);
  return matches[0] ?? null;
}
