/**
 * Pure logic for the private staging "OTP replay probe".
 *
 * Nothing here stores, logs, or returns the sandbox code, ticket identifiers,
 * raw backend errors, or any row contents. Callers hold the code only in a
 * local variable for the duration of a single run.
 */

export type OtpStepStatus = "pass" | "fail" | "skipped";

export type OtpRunState =
  | "idle"
  | "not-ready"
  | "running"
  | "complete"
  | "blocked";

export interface OtpStepResult {
  /** Stable step key: issuance | first-verification | replay-denied. */
  step: "issuance" | "first-verification" | "replay-denied";
  status: OtpStepStatus;
  /** Generic, safe category label. Never raw backend text. */
  detail: string;
}

export interface OtpRunResult {
  state: OtpRunState;
  steps: OtpStepResult[];
  /** Overall aggregate verdict — null when the run could not be scored. */
  overall: "pass" | "fail" | null;
  /** Generic status message for the UI. */
  message: string;
}

export const OTP_MESSAGES = {
  signedOut: "Sign in with a synthetic staging account to enable this probe.",
  notReady: "Not ready: no eligible issued ticket is visible to this session.",
  lookupBlocked: "Blocked: eligible-ticket lookup was rejected.",
  running: "Running the internal OTP replay sequence…",
  complete: "Run complete. Aggregate results only.",
  aborted: "Run aborted: a step returned an unexpected condition.",
} as const;

export const OTP_DETAILS = {
  ok: "succeeded",
  denied: "denied (expected)",
  deniedAuth: "authorization denied",
  rejected: "request rejected",
  unexpected: "unexpected condition",
  notRun: "not run",
  accepted: "accepted (unexpected)",
} as const;

/** Generic failure categories, derived without echoing backend text. */
export type OtpFailureCategory = "denied" | "rejected" | "unexpected";

export function categorizeInvokeError(error: unknown): OtpFailureCategory {
  if (!error) return "unexpected";
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof e.status === "number" ? e.status : undefined;
  const code = typeof e.code === "string" ? e.code.toLowerCase() : "";
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";

  if (status === 400 || status === 401 || status === 403 || status === 409 || status === 410) {
    return "denied";
  }
  if (
    code.includes("invalid") ||
    code.includes("used") ||
    code.includes("expired") ||
    message.includes("invalid") ||
    message.includes("already") ||
    message.includes("used") ||
    message.includes("expired") ||
    message.includes("denied")
  ) {
    return "denied";
  }
  if (status === 404 || status === 422) return "rejected";
  return "unexpected";
}

/** True when a response payload indicates the verification was accepted. */
export function isVerificationAccepted(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (p['error']) return false;
  if (typeof p['verified'] === "boolean") return p['verified'];
  if (typeof p['valid'] === "boolean") return p['valid'];
  if (typeof p['ok'] === "boolean") return p['ok'];
  if (typeof p['success'] === "boolean") return p['success'];
  if (typeof p['status'] === "string") {
    const s = p['status'].toLowerCase();
    return s === "verified" || s === "ok" || s === "success";
  }
  return false;
}

/**
 * Extracts the sandbox code from an issuance payload.
 * The caller must keep the return value in memory only.
 */
export function extractSandboxCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const key of ["code", "otp", "otp_code", "sandbox_code", "debug_code"]) {
    const v = p[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export interface OtpRunInputs {
  /** Issuance call outcome. */
  issuance: { ok: boolean; hasCode: boolean; failure?: OtpFailureCategory };
  /** First verification outcome (undefined when not run). */
  firstVerify?: { accepted: boolean; failure?: OtpFailureCategory };
  /** Replay (second) verification outcome (undefined when not run). */
  replay?: { accepted: boolean; failure?: OtpFailureCategory };
}

/** Scores a completed or partial run into safe aggregate results. */
export function scoreOtpRun(inputs: OtpRunInputs): OtpRunResult {
  const steps: OtpStepResult[] = [];

  const issuanceOk = inputs.issuance.ok && inputs.issuance.hasCode;
  steps.push({
    step: "issuance",
    status: issuanceOk ? "pass" : "fail",
    detail: inputs.issuance.ok
      ? inputs.issuance.hasCode
        ? OTP_DETAILS.ok
        : OTP_DETAILS.unexpected
      : failureDetail(inputs.issuance.failure),
  });

  if (!issuanceOk || !inputs.firstVerify) {
    steps.push({ step: "first-verification", status: "skipped", detail: OTP_DETAILS.notRun });
    steps.push({ step: "replay-denied", status: "skipped", detail: OTP_DETAILS.notRun });
    return {
      state: "complete",
      steps,
      overall: "fail",
      message: OTP_MESSAGES.aborted,
    };
  }

  const firstOk = inputs.firstVerify.accepted;
  steps.push({
    step: "first-verification",
    status: firstOk ? "pass" : "fail",
    detail: firstOk ? OTP_DETAILS.ok : failureDetail(inputs.firstVerify.failure),
  });

  if (!firstOk || !inputs.replay) {
    steps.push({ step: "replay-denied", status: "skipped", detail: OTP_DETAILS.notRun });
    return { state: "complete", steps, overall: "fail", message: OTP_MESSAGES.aborted };
  }

  const replayDenied = !inputs.replay.accepted;
  steps.push({
    step: "replay-denied",
    status: replayDenied ? "pass" : "fail",
    detail: replayDenied ? OTP_DETAILS.denied : OTP_DETAILS.accepted,
  });

  const overall = steps.every((s) => s.status === "pass") ? "pass" : "fail";
  return { state: "complete", steps, overall, message: OTP_MESSAGES.complete };
}

function failureDetail(category?: OtpFailureCategory): string {
  switch (category) {
    case "denied":
      return OTP_DETAILS.deniedAuth;
    case "rejected":
      return OTP_DETAILS.rejected;
    default:
      return OTP_DETAILS.unexpected;
  }
}

export const IDLE_OTP_RESULT: OtpRunResult = {
  state: "idle",
  steps: [],
  overall: null,
  message: OTP_MESSAGES.signedOut,
};

export function notReadyResult(blocked: boolean): OtpRunResult {
  return {
    state: blocked ? "blocked" : "not-ready",
    steps: [],
    overall: null,
    message: blocked ? OTP_MESSAGES.lookupBlocked : OTP_MESSAGES.notReady,
  };
}

export function runningResult(): OtpRunResult {
  return { state: "running", steps: [], overall: null, message: OTP_MESSAGES.running };
}

export const OTP_STEP_LABELS: Record<OtpStepResult["step"], string> = {
  issuance: "Issuance succeeded",
  "first-verification": "First verification succeeded",
  "replay-denied": "Replay denied",
};

/* ------------------------- Prompt-completion guards ------------------------ */

/** Client-side deadline for every OTP step (token lookup, fetch). */
export const OTP_STEP_TIMEOUT_MS = 12_000;

/** Synthetic status used when a step exceeds its deadline. */
export const OTP_TIMEOUT_STATUS = 408;

/**
 * Resolves a promise or rejects with a generic timeout marker so a stalled
 * auth/session or network call can never leave the run hanging forever.
 * The rejection carries only a status — no backend text.
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = OTP_STEP_TIMEOUT_MS,
  scheduler: (fn: () => void, delay: number) => unknown = setTimeout,
  clear: (handle: never) => void = clearTimeout as unknown as (handle: never) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = scheduler(() => {
      reject({ status: OTP_TIMEOUT_STATUS });
    }, ms) as never;
    Promise.resolve(promise).then(
      (value) => {
        clear(handle);
        resolve(value);
      },
      (error) => {
        clear(handle);
        reject(error);
      },
    );
  });
}
