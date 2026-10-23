/**
 * Gate 121 — server-only, provider-neutral test-only capture adapter.
 *
 * Disabled and fail-closed unless every server-only `TEST_MAIL_*` setting is
 * present and the mode flag is exactly `true`. No credential is currently
 * stored, so in this gate the adapter never reaches the network: every entry
 * point returns a disabled result before any request is constructed.
 *
 * This file is server-only by filename (`*.server.ts`) and is imported by no
 * route. Retrieval is a harness affordance and requires an explicit opt-in.
 */
import {
  buildOtpMessage,
  canRetrieve,
  captureLog,
  extractCode,
  idempotencyKey,
  isAllowedRecipient,
  normalizeRecipient,
  resolveCaptureConfig,
  type CaptureConfig,
  type CaptureFailureReason,
  type CaptureLogRecord,
  type CaptureResolution,
} from "./mail-capture-core";

export type CaptureFetch = typeof fetch;

export interface CaptureDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: CaptureFetch;
}

function resolve(deps?: CaptureDeps): CaptureResolution {
  const env = deps?.env ?? (process.env as Record<string, string | undefined>);
  return resolveCaptureConfig({
    TEST_MAIL_CAPTURE_PROVIDER: env['TEST_MAIL_CAPTURE_PROVIDER'],
    TEST_MAIL_CAPTURE_BASE_URL: env['TEST_MAIL_CAPTURE_BASE_URL'],
    TEST_MAIL_CAPTURE_API_KEY: env['TEST_MAIL_CAPTURE_API_KEY'],
    TEST_MAIL_FROM_ADDRESS: env['TEST_MAIL_FROM_ADDRESS'],
    TEST_MAIL_RECIPIENT_DOMAIN: env['TEST_MAIL_RECIPIENT_DOMAIN'],
    TEST_MAIL_CAPTURE_MODE: env['TEST_MAIL_CAPTURE_MODE'],
  });
}

/** True only when every required server-only setting is present and valid. */
export function isEnabled(deps?: CaptureDeps): boolean {
  return resolve(deps).enabled;
}

export interface DeliverResult {
  delivered: boolean;
  reason?: CaptureFailureReason;
  log: CaptureLogRecord;
}

/**
 * Hands one synthetic message to the capture provider. Refuses any recipient
 * outside the allow-listed synthetic domain. Returns no provider payload.
 */
export async function deliver(
  input: { to: unknown; code: unknown; scope?: string; salt?: string },
  deps?: CaptureDeps,
): Promise<DeliverResult> {
  const resolution = resolve(deps);
  if (!resolution.enabled) {
    return { delivered: false, reason: "disabled", log: captureLog("capture_deliver", "skipped", resolution.reason) };
  }
  const to = normalizeRecipient(input.to);
  if (!isAllowedRecipient(to, resolution.config.recipientDomain)) {
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

  const key = await idempotencyKey(input.scope ?? "otp", to as string, input.salt ?? "");
  const message = buildOtpMessage({ to: to as string, code: input.code, idempotencyKey: key });

  try {
    const res = await request(resolution.config, "/messages", deps, {
      method: "POST",
      body: JSON.stringify({
        from: resolution.config.fromAddress,
        to: message.to,
        subject: message.subject,
        body: message.body,
      }),
      headers: { "Idempotency-Key": message.idempotencyKey },
    });
    if (!res.ok) {
      return {
        delivered: false,
        reason: "provider_unavailable",
        log: captureLog("capture_deliver", "failed", "provider_unavailable"),
      };
    }
    return { delivered: true, log: captureLog("capture_deliver", "ok") };
  } catch {
    return {
      delivered: false,
      reason: "provider_unavailable",
      log: captureLog("capture_deliver", "failed", "provider_unavailable"),
    };
  }
}

export interface RetrieveResult {
  found: boolean;
  code?: string;
  reason?: CaptureFailureReason;
  log: CaptureLogRecord;
}

/**
 * Harness-only retrieval. Requires `{ harness: true }`; without it the call
 * is refused even when capture is enabled. Never reachable from a route.
 */
export async function fetchLatest(
  input: { to: unknown; since?: number; harness?: boolean },
  deps?: CaptureDeps,
): Promise<RetrieveResult> {
  const resolution = resolve(deps);
  if (!canRetrieve(resolution, input)) {
    const reason = resolution.enabled ? undefined : resolution.reason;
    return { found: false, reason: "disabled", log: captureLog("capture_retrieve", "skipped", reason ?? "disabled") };
  }
  const config = (resolution as { enabled: true; config: CaptureConfig }).config;
  const to = normalizeRecipient(input.to);
  if (!isAllowedRecipient(to, config.recipientDomain)) {
    return {
      found: false,
      reason: "recipient_not_allowed",
      log: captureLog("capture_retrieve", "skipped", "recipient_not_allowed"),
    };
  }
  try {
    const query = `?to=${encodeURIComponent(to as string)}&since=${Number(input.since ?? 0)}`;
    const res = await request(config, `/messages/latest${query}`, deps, { method: "GET" });
    if (!res.ok) {
      return {
        found: false,
        reason: "provider_unavailable",
        log: captureLog("capture_retrieve", "failed", "provider_unavailable"),
      };
    }
    const payload = (await res.json()) as { body?: unknown };
    const code = extractCode(payload?.body);
    return code
      ? { found: true, code, log: captureLog("capture_retrieve", "ok") }
      : { found: false, log: captureLog("capture_retrieve", "skipped") };
  } catch {
    return {
      found: false,
      reason: "provider_unavailable",
      log: captureLog("capture_retrieve", "failed", "provider_unavailable"),
    };
  }
}

/** Teardown for synthetic recipients. Silent no-op when disabled. */
export async function purge(
  input: { to: unknown; harness?: boolean },
  deps?: CaptureDeps,
): Promise<{ purged: boolean; log: CaptureLogRecord }> {
  const resolution = resolve(deps);
  if (!canRetrieve(resolution, input)) {
    return { purged: false, log: captureLog("capture_purge", "skipped", "disabled") };
  }
  const config = (resolution as { enabled: true; config: CaptureConfig }).config;
  const to = normalizeRecipient(input.to);
  if (!isAllowedRecipient(to, config.recipientDomain)) {
    return { purged: false, log: captureLog("capture_purge", "skipped", "recipient_not_allowed") };
  }
  try {
    const res = await request(config, `/messages?to=${encodeURIComponent(to as string)}`, deps, {
      method: "DELETE",
    });
    return res.ok
      ? { purged: true, log: captureLog("capture_purge", "ok") }
      : { purged: false, log: captureLog("capture_purge", "failed", "provider_unavailable") };
  } catch {
    return { purged: false, log: captureLog("capture_purge", "failed", "provider_unavailable") };
  }
}

/** Single outbound point. The credential is sent as a header, never logged. */
async function request(
  config: CaptureConfig,
  path: string,
  deps: CaptureDeps | undefined,
  init: { method: string; body?: string; headers?: Record<string, string> },
): Promise<Response> {
  const doFetch = deps?.fetchImpl ?? fetch;
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-Capture-Provider", config.provider);
  const requestInit: RequestInit = { method: init.method, headers };
  if (init.body !== undefined) requestInit.body = init.body;
  return doFetch(`${config.baseUrl}${path}`, requestInit);
}
