type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

/** Editor diagnostics are deliberately generic; never forward raw runtime values. */
export function reportLovableError() {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    new Error("Analog Tickets application error"),
    { source: "react_error_boundary" },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  // The editor hook may report outside this app. Do not send error messages,
  // stacks, response URLs or location paths through it.
  window.__lovableReportRuntimeError?.({ message: "Analog Tickets application error" });
}
