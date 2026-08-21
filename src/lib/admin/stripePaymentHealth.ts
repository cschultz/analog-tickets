import { categorizeStripeFailure } from "@/lib/stripeFailureCategory";

export interface StripeHealthFunnelEventRow {
  created_at: string;
  session_id: string;
  step: string;
  metadata: Record<string, unknown> | null;
}

export interface StripeHealthCheckoutErrorRow {
  created_at: string;
  error_type: string;
  error_code: string | null;
  error_message?: string | null;
  request_payload?: Record<string, unknown> | null;
  session_id?: string | null;
  user_email?: string | null;
  failure_category?: string | null;
}

export interface StripePaymentHealthSessionDetail {
  sessionId: string;
  stripeSessionId: string | null;
  userEmail: string | null;
  reachedAt: string;
  droppedOffAt: string | null;
  droppedOffStep: string;
  detail: string;
}

export interface StripePaymentHealthStepDetail {
  key: "payment_redirect" | "canceled_return" | "verification_failure";
  label: string;
  count: number;
  sessions: StripePaymentHealthSessionDetail[];
}

export interface StripeHealthWindowSummary {
  redirectStarts: number;
  canceledReturns: number;
  verificationFailures: number;
  canceledReturnRate: number;
  verificationFailureRate: number;
  totalDropOffRate: number;
  topLastErrorReasons: Array<{ reason: string; count: number }>;
  stepDetails: StripePaymentHealthStepDetail[];
}

export interface StripePaymentHealthSummary {
  lastUpdatedAt: string | null;
  windows: Record<1 | 7 | 30, StripeHealthWindowSummary>;
}

const VERIFICATION_ERROR_CODES = new Set([
  "verify_payment_failed",
  "payment_not_completed",
  "ticket_success_verification_exception",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeLastErrorReason(lastError: unknown): string | null {
  if (!lastError) return null;
  if (typeof lastError === "string") return lastError;

  const record = asRecord(lastError);
  if (!record) return null;

  const code = typeof record.code === "string" ? record.code : null;
  const declineCode = typeof record.decline_code === "string" ? record.decline_code : null;
  const type = typeof record.type === "string" ? record.type : null;
  const message = typeof record.message === "string" ? record.message : null;

  if (code && declineCode) return `${code} · ${declineCode}`;
  if (code) return code;
  if (declineCode) return declineCode;
  if (type) return type;
  if (message) return message;
  return JSON.stringify(record);
}

function toDisplayString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function getStripeSessionId(payload: Record<string, unknown> | null): string | null {
  return toDisplayString(payload?.stripe_session_id) ?? toDisplayString(payload?.session_id);
}

function getDropOffLabel(error: StripeHealthCheckoutErrorRow): string {
  if (isCanceledReturn(error)) {
    return "Canceled return";
  }

  if (isVerificationFailure(error)) {
    return "Verification failure";
  }

  return error.error_type === "stripe" ? "Stripe error" : error.error_type;
}

function getDropOffDetail(error: StripeHealthCheckoutErrorRow): string {
  const payload = asRecord(error.request_payload);
  return normalizeLastErrorReason(payload?.payment_intent_last_error)
    ?? error.error_code
    ?? error.error_message
    ?? "No further error details logged";
}

function isCanceledReturn(error: StripeHealthCheckoutErrorRow): boolean {
  if (error.error_type !== "redirect") return false;

  const derivedCategory = categorizeStripeFailure({
    error_code: error.error_code,
    error_message: error.error_message,
    request_payload: error.request_payload,
  });

  if (derivedCategory === "canceled") return true;

  const payload = asRecord(error.request_payload);
  const canceledFlag = payload?.canceled;

  return canceledFlag === true || canceledFlag === "true" || error.error_code === "checkout_canceled";
}

function isVerificationFailure(error: StripeHealthCheckoutErrorRow): boolean {
  if (error.error_type === "payment_verification") return true;

  const payload = asRecord(error.request_payload);
  const hasStripeSession = typeof payload?.stripe_session_id === "string";
  const hasVerificationSignals = Boolean(
    payload?.payment_intent_last_error ||
    payload?.payment_intent_status ||
    payload?.registration_payment_status
  );

  return error.error_type === "stripe"
    && hasStripeSession
    && (hasVerificationSignals || VERIFICATION_ERROR_CODES.has(error.error_code ?? ""));
}

function buildStepDetails(
  inWindowEvents: StripeHealthFunnelEventRow[],
  inWindowErrors: StripeHealthCheckoutErrorRow[],
): StripeHealthWindowSummary["stepDetails"] {
  const errorsBySession = new Map<string, StripeHealthCheckoutErrorRow[]>();

  inWindowErrors.forEach((error) => {
    const payload = asRecord(error.request_payload);
    const sessionKeys = [
      toDisplayString(error.session_id),
      getStripeSessionId(payload),
    ].filter((value): value is string => Boolean(value));

    sessionKeys.forEach((sessionKey) => {
      const current = errorsBySession.get(sessionKey) ?? [];
      current.push(error);
      errorsBySession.set(sessionKey, current);
    });
  });

  const redirectSessions = inWindowEvents
    .filter((event) => event.step === "payment_redirect")
    .map<StripePaymentHealthSessionDetail>((event) => {
      const matchingErrors = (errorsBySession.get(event.session_id) ?? []).slice().sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      const latestError = matchingErrors[0] ?? null;
      const payload = latestError ? asRecord(latestError.request_payload) : null;

      return {
        sessionId: event.session_id,
        stripeSessionId: getStripeSessionId(asRecord(event.metadata)) ?? getStripeSessionId(payload),
        userEmail: latestError?.user_email ?? null,
        reachedAt: event.created_at,
        droppedOffAt: latestError?.created_at ?? null,
        droppedOffStep: latestError ? getDropOffLabel(latestError) : "No logged failure after redirect",
        detail: latestError ? getDropOffDetail(latestError) : "No cancel or verification failure logged for this session",
      };
    });

  const canceledReturns = inWindowErrors
    .filter(isCanceledReturn)
    .map<StripePaymentHealthSessionDetail>((error) => {
      const payload = asRecord(error.request_payload);
      return {
        sessionId: toDisplayString(error.session_id) ?? getStripeSessionId(payload) ?? `checkout-error-${error.created_at}`,
        stripeSessionId: getStripeSessionId(payload),
        userEmail: error.user_email ?? null,
        reachedAt: error.created_at,
        droppedOffAt: error.created_at,
        droppedOffStep: "Canceled return",
        detail: getDropOffDetail(error),
      };
    });

  const verificationFailures = inWindowErrors
    .filter(isVerificationFailure)
    .map<StripePaymentHealthSessionDetail>((error) => {
      const payload = asRecord(error.request_payload);
      return {
        sessionId: toDisplayString(error.session_id) ?? getStripeSessionId(payload) ?? `checkout-error-${error.created_at}`,
        stripeSessionId: getStripeSessionId(payload),
        userEmail: error.user_email ?? null,
        reachedAt: error.created_at,
        droppedOffAt: error.created_at,
        droppedOffStep: "Verification failure",
        detail: getDropOffDetail(error),
      };
    });

  const sortSessions = (sessions: StripePaymentHealthSessionDetail[]) => sessions.sort(
    (a, b) => new Date(b.droppedOffAt ?? b.reachedAt).getTime() - new Date(a.droppedOffAt ?? a.reachedAt).getTime(),
  );

  return [
    {
      key: "payment_redirect",
      label: "Redirect starts",
      count: redirectSessions.length,
      sessions: sortSessions(redirectSessions),
    },
    {
      key: "canceled_return",
      label: "Canceled returns",
      count: canceledReturns.length,
      sessions: sortSessions(canceledReturns),
    },
    {
      key: "verification_failure",
      label: "Verification failures",
      count: verificationFailures.length,
      sessions: sortSessions(verificationFailures),
    },
  ];
}

function summarizeWindow(
  days: 1 | 7 | 30,
  funnelEvents: StripeHealthFunnelEventRow[],
  checkoutErrors: StripeHealthCheckoutErrorRow[],
): StripeHealthWindowSummary {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const inWindowEvents = funnelEvents.filter((event) => new Date(event.created_at).getTime() >= cutoff);
  const inWindowErrors = checkoutErrors.filter((error) => new Date(error.created_at).getTime() >= cutoff);

  const topReasonMap = new Map<string, number>();

  inWindowErrors.forEach((error) => {
    const payload = asRecord(error.request_payload);
    const normalizedReason = normalizeLastErrorReason(payload?.payment_intent_last_error);
    if (!normalizedReason) return;
    topReasonMap.set(normalizedReason, (topReasonMap.get(normalizedReason) ?? 0) + 1);
  });

  const redirectStarts = inWindowEvents.filter((event) => event.step === "payment_redirect").length;
  const canceledReturns = inWindowErrors.filter(isCanceledReturn).length;
  const verificationFailures = inWindowErrors.filter(isVerificationFailure).length;
  const safeRate = (count: number) => (redirectStarts > 0 ? count / redirectStarts : 0);

  return {
    redirectStarts,
    canceledReturns,
    verificationFailures,
    canceledReturnRate: safeRate(canceledReturns),
    verificationFailureRate: safeRate(verificationFailures),
    totalDropOffRate: safeRate(canceledReturns + verificationFailures),
    topLastErrorReasons: [...topReasonMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
    stepDetails: buildStepDetails(inWindowEvents, inWindowErrors),
  };
}

export function buildStripePaymentHealthSummary(
  funnelEvents: StripeHealthFunnelEventRow[],
  checkoutErrors: StripeHealthCheckoutErrorRow[],
): StripePaymentHealthSummary {
  const timestamps = [...funnelEvents, ...checkoutErrors]
    .map((row) => row.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return {
    lastUpdatedAt: timestamps[0] ?? null,
    windows: {
      1: summarizeWindow(1, funnelEvents, checkoutErrors),
      7: summarizeWindow(7, funnelEvents, checkoutErrors),
      30: summarizeWindow(30, funnelEvents, checkoutErrors),
    },
  };
}