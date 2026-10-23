/**
 * Gate 123 — server-only Mailtrap **Email Testing** (sandbox) adapter that
 * implements the Gate 121 provider-neutral capture contract
 * (`isEnabled` / `deliver` / `fetchLatest` / `purge`).
 *
 * Disabled and fail-closed unless every server-only `MAILTRAP_*` setting is
 * present and the mode flag is exactly `true`. No credential is stored today,
 * so every entry point returns a disabled result before a request is built.
 *
 * Email Testing only: messages land in a disposable inbox and are never
 * delivered to a real mailbox. Mailtrap's Email Sending / bulk hosts are
 * refused by the host allow-list. Retrieval is a harness affordance requiring
 * an explicit in-process opt-in; this file is server-only by filename and is
 * imported by no route or browser module.
 */
import { canRetrieve, captureLog, extractCode, isAllowedRecipient, normalizeRecipient, type CaptureLogRecord } from "./mail-capture-core";
import {
  buildSandboxPayload,
  isAllowedMailtrapUrl,
  messageBodyUrl,
  messageDeleteUrl,
  messagesUrl,
  parseMessageList,
  resolveMailtrapConfig,
  sandboxSendUrl,
  selectLatest,
  type MailtrapConfig,
  type MailtrapFailureReason,
  type MailtrapResolution,
} from "./mailtrap-capture-core";

export interface MailtrapDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

function resolve(deps?: MailtrapDeps): MailtrapResolution {
  const env = deps?.env ?? (process.env as Record<string, string | undefined>);
  return resolveMailtrapConfig({
    MAILTRAP_TESTING_MODE: env['MAILTRAP_TESTING_MODE'],
    MAILTRAP_API_TOKEN: env['MAILTRAP_API_TOKEN'],
    MAILTRAP_ACCOUNT_ID: env['MAILTRAP_ACCOUNT_ID'],
    MAILTRAP_INBOX_ID: env['MAILTRAP_INBOX_ID'],
    MAILTRAP_FROM_ADDRESS: env['MAILTRAP_FROM_ADDRESS'],
    MAILTRAP_RECIPIENT_DOMAIN: env['MAILTRAP_RECIPIENT_DOMAIN'],
  });
}

/** True only when every required server-only setting is present and valid. */
export function isEnabled(deps?: MailtrapDeps): boolean {
  return resolve(deps).enabled;
}

export interface MailtrapDeliverResult {
  delivered: boolean;
  reason?: MailtrapFailureReason;
  log: CaptureLogRecord;
}

/** Hands one synthetic message to the sandbox inbox. Returns no provider payload. */
export async function deliver(
  input: { to: unknown; code: unknown },
  deps?: MailtrapDeps,
): Promise<MailtrapDeliverResult> {
  const resolution = resolve(deps);
  if (!resolution.enabled) {
    return {
      delivered: false,
      reason: "disabled",
      log: captureLog("capture_deliver", "skipped", resolution.reason as never),
    };
  }
  const config = resolution.config;
  const to = normalizeRecipient(input.to);
  if (!isAllowedRecipient(to, config.recipientDomain)) {
    return {
      delivered: false,
      reason: "recipient_not_allowed",
      log: captureLog("capture_deliver", "skipped", "recipient_not_allowed"),
    };
  }
  if (typeof input.code !== "string" || !/^[0-9]{6}$/.test(input.code)) {
    return {
      delivered: false,
      reason: "invalid_input",
      log: captureLog("capture_deliver", "skipped", "invalid_input"),
    };
  }
  const payload = buildSandboxPayload({ from: config.fromAddress, to: to as string, code: input.code });
  try {
    const res = await request(config, sandboxSendUrl(config), deps, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return res.ok
      ? { delivered: true, log: captureLog("capture_deliver", "ok") }
      : {
          delivered: false,
          reason: "provider_unavailable",
          log: captureLog("capture_deliver", "failed", "provider_unavailable"),
        };
  } catch {
    return {
      delivered: false,
      reason: "provider_unavailable",
      log: captureLog("capture_deliver", "failed", "provider_unavailable"),
    };
  }
}

export interface MailtrapRetrieveResult {
  found: boolean;
  code?: string;
  reason?: MailtrapFailureReason;
  log: CaptureLogRecord;
}

/**
 * Harness-only retrieval. Requires `{ harness: true }`; without it the call is
 * refused even when the adapter is enabled. Never reachable from a route.
 */
export async function fetchLatest(
  input: { to: unknown; since?: number; harness?: boolean },
  deps?: MailtrapDeps,
): Promise<MailtrapRetrieveResult> {
  const resolution = resolve(deps);
  if (!canRetrieve(resolution as never, input)) {
    return { found: false, reason: "disabled", log: captureLog("capture_retrieve", "skipped", "disabled") };
  }
  const config = (resolution as { enabled: true; config: MailtrapConfig }).config;
  const to = normalizeRecipient(input.to);
  if (!isAllowedRecipient(to, config.recipientDomain)) {
    return {
      found: false,
      reason: "recipient_not_allowed",
      log: captureLog("capture_retrieve", "skipped", "recipient_not_allowed"),
    };
  }
  try {
    const list = await request(config, messagesUrl(config), deps, { method: "GET" });
    if (!list.ok) return providerDown("capture_retrieve");
    const latest = selectLatest(parseMessageList(await list.json()), to as string, Number(input.since ?? 0));
    if (!latest) return { found: false, log: captureLog("capture_retrieve", "skipped") };
    const body = await request(config, messageBodyUrl(config, latest.id), deps, { method: "GET" });
    if (!body.ok) return providerDown("capture_retrieve");
    const code = extractCode(await body.text());
    return code
      ? { found: true, code, log: captureLog("capture_retrieve", "ok") }
      : { found: false, log: captureLog("capture_retrieve", "skipped") };
  } catch {
    return providerDown("capture_retrieve");
  }
}

/** Teardown: deletes only the synthetic recipient's captured messages. */
export async function purge(
  input: { to: unknown; harness?: boolean },
  deps?: MailtrapDeps,
): Promise<{ purged: boolean; log: CaptureLogRecord }> {
  const resolution = resolve(deps);
  if (!canRetrieve(resolution as never, input)) {
    return { purged: false, log: captureLog("capture_purge", "skipped", "disabled") };
  }
  const config = (resolution as { enabled: true; config: MailtrapConfig }).config;
  const to = normalizeRecipient(input.to);
  if (!isAllowedRecipient(to, config.recipientDomain)) {
    return { purged: false, log: captureLog("capture_purge", "skipped", "recipient_not_allowed") };
  }
  try {
    const list = await request(config, messagesUrl(config), deps, { method: "GET" });
    if (!list.ok) return { purged: false, log: captureLog("capture_purge", "failed", "provider_unavailable") };
    const targets = parseMessageList(await list.json()).filter((m) => m.toEmail === to);
    for (const message of targets) {
      const res = await request(config, messageDeleteUrl(config, message.id), deps, { method: "DELETE" });
      if (!res.ok) return { purged: false, log: captureLog("capture_purge", "failed", "provider_unavailable") };
    }
    return { purged: true, log: captureLog("capture_purge", "ok") };
  } catch {
    return { purged: false, log: captureLog("capture_purge", "failed", "provider_unavailable") };
  }
}

function providerDown(event: "capture_retrieve"): MailtrapRetrieveResult {
  return {
    found: false,
    reason: "provider_unavailable",
    log: captureLog(event, "failed", "provider_unavailable"),
  };
}

/**
 * Single outbound point. Refuses any URL outside the Email Testing hosts, so
 * Email Sending / bulk transport is unreachable. The credential travels only
 * in the `Api-Token` header and is never logged.
 */
async function request(
  config: MailtrapConfig,
  url: string,
  deps: MailtrapDeps | undefined,
  init: { method: string; body?: string },
): Promise<Response> {
  if (!isAllowedMailtrapUrl(url)) throw new Error("forbidden_host");
  const doFetch = deps?.fetchImpl ?? fetch;
  const headers = new Headers({
    "Api-Token": config.apiToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  });
  const requestInit: RequestInit = { method: init.method, headers };
  if (init.body !== undefined) requestInit.body = init.body;
  return doFetch(url, requestInit);
}
