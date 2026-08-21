export type StripeFailureCategory =
  | "card_declined"
  | "insufficient_funds"
  | "incorrect_cvc"
  | "expired_card"
  | "network_error"
  | "canceled"
  | "unknown";

interface StripeFailureSignals {
  error_code?: unknown;
  error_message?: unknown;
  stripe_session_status?: unknown;
  stripe_payment_status?: unknown;
  payment_intent_status?: unknown;
  payment_intent_last_error?: unknown;
  request_payload?: Record<string, unknown> | null;
}

const CATEGORY_MATCHERS: Array<{
  category: Exclude<StripeFailureCategory, "unknown">;
  patterns: RegExp[];
}> = [
  {
    category: "canceled",
    patterns: [
      /\bcanceled\b/i,
      /\bcancelled\b/i,
      /without completing payment/i,
      /checkout was canceled/i,
    ],
  },
  {
    category: "insufficient_funds",
    patterns: [/\binsufficient_funds\b/i, /insufficient funds/i],
  },
  {
    category: "incorrect_cvc",
    patterns: [/\bincorrect_cvc\b/i, /incorrect cvc/i, /incorrect security code/i],
  },
  {
    category: "expired_card",
    patterns: [/\bexpired_card\b/i, /expired card/i, /card has expired/i],
  },
  {
    category: "network_error",
    patterns: [
      /\bnetwork[_ -]?error\b/i,
      /failed to fetch/i,
      /network request failed/i,
      /api_connection_error/i,
      /connection error/i,
      /timeout/i,
    ],
  },
  {
    category: "card_declined",
    patterns: [/\bcard_declined\b/i, /card was declined/i, /declined/i, /do_not_honor/i, /generic_decline/i],
  },
];

function flattenValue(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenValue);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(flattenValue);
  }
  return [];
}

export function categorizeStripeFailure(signals: StripeFailureSignals): StripeFailureCategory {
  const haystack = [
    ...flattenValue(signals.error_code),
    ...flattenValue(signals.error_message),
    ...flattenValue(signals.stripe_session_status),
    ...flattenValue(signals.stripe_payment_status),
    ...flattenValue(signals.payment_intent_status),
    ...flattenValue(signals.payment_intent_last_error),
    ...flattenValue(signals.request_payload),
  ].join(" ");

  for (const matcher of CATEGORY_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(haystack))) {
      return matcher.category;
    }
  }

  return "unknown";
}