// Retains the original error briefly so server.ts can classify its HTTP status
// when h3 has already swallowed the throw into a generic 500 Response. Raw
// error detail is never forwarded to the default log transport.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// Error messages, stacks, causes and arbitrary thrown values can contain a
// token, pass code, customer detail or provider payload. Log only a bounded
// status class; detailed failure diagnostics would need a separately approved
// private channel, not the default application log.

export function describeError(error: unknown): string {
  try {
    if (!(error instanceof Error)) return "Analog Tickets server error";
    const value =
      (error as Error & { status?: unknown; statusCode?: unknown }).status ??
      (error as Error & { statusCode?: unknown }).statusCode;
    return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599
      ? `Analog Tickets server error (HTTP ${value})`
      : "Analog Tickets server error";
  } catch {
    return "Analog Tickets server error";
  }
}

// h3 can log an error before server.ts sees its generic 500 response. Capture
// the original in memory for that response path, but never forward raw logging
// arguments (including non-Error strings and objects) to the log transport.
const originalConsoleError = console.error.bind(console);
export function safeErrorReporter(write: (message: string) => void) {
  return (...args: unknown[]) => {
    let error: Error | undefined;
    for (const arg of args) {
      try {
        if (arg instanceof Error) {
          error = arg;
          break;
        }
      } catch {
        // A hostile thrown Proxy must not break the error logger.
      }
    }
    if (error) record(error);
    write(describeError(error));
  };
}
console.error = safeErrorReporter(originalConsoleError);

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
