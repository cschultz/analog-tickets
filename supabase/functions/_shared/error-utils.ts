// Shared error handling utilities for all edge functions

import { corsHeaders } from "./email-template.ts";

// Structured log entry interface
export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  fn: string;
  message: string;
  data?: Record<string, unknown>;
  error?: Error | unknown;
  timestamp?: string;
  duration_ms?: number;
}

// Create a structured logger for a specific function
export function createLogger(functionName: string) {
  const startTime = Date.now();
  
  const formatLog = (entry: Omit<LogEntry, "fn" | "timestamp">): string => {
    const log: LogEntry = {
      ...entry,
      fn: functionName,
      timestamp: new Date().toISOString(),
    };
    
    // Extract error details if present
    if (entry.error instanceof Error) {
      log.data = {
        ...log.data,
        error_message: entry.error.message,
        error_stack: entry.error.stack?.split("\n").slice(0, 5).join("\n"),
      };
    } else if (entry.error) {
      log.data = {
        ...log.data,
        error_raw: String(entry.error),
      };
    }
    
    return JSON.stringify(log);
  };
  
  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      console.log(formatLog({ level: "debug", message, data }));
    },
    
    info: (message: string, data?: Record<string, unknown>) => {
      console.log(formatLog({ level: "info", message, data }));
    },
    
    warn: (message: string, data?: Record<string, unknown>, error?: unknown) => {
      console.warn(formatLog({ level: "warn", message, data, error }));
    },
    
    error: (message: string, error?: unknown, data?: Record<string, unknown>) => {
      console.error(formatLog({ level: "error", message, data, error }));
    },
    
    // Log with elapsed time since logger creation
    elapsed: (message: string, data?: Record<string, unknown>) => {
      console.log(formatLog({ 
        level: "info", 
        message, 
        data,
        duration_ms: Date.now() - startTime,
      }));
    },
  };
}

// Error response types with user-friendly messages
export const ErrorCodes = {
  VALIDATION_ERROR: {
    status: 400,
    message: "Invalid request. Please check your input and try again.",
  },
  NOT_FOUND: {
    status: 404,
    message: "The requested resource was not found.",
  },
  UNAUTHORIZED: {
    status: 401,
    message: "You are not authorized to perform this action.",
  },
  FORBIDDEN: {
    status: 403,
    message: "Access denied.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests. Please try again later.",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "An unexpected error occurred. Please try again later.",
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: "Service temporarily unavailable. Please try again in a few minutes.",
  },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

// Create a standardized error response
export function errorResponse(
  code: ErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): Response {
  const { status, message } = ErrorCodes[code];
  
  return new Response(
    JSON.stringify({
      error: customMessage || message,
      code,
      ...(details && { details }),
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Create a standardized success response
export function successResponse(
  data: unknown,
  status: number = 200
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// Wrap async function with error handling
export function withErrorHandling(
  functionName: string,
  handler: (req: Request, log: ReturnType<typeof createLogger>) => Promise<Response>
) {
  const log = createLogger(functionName);
  
  return async (req: Request): Promise<Response> => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      log.info("Request started", { 
        method: req.method, 
        url: req.url,
      });
      
      const response = await handler(req, log);
      
      log.elapsed("Request completed", { status: response.status });
      
      return response;
    } catch (error) {
      log.error("Unhandled error", error);

      // Fire-and-forget incident report (never blocks the response)
      try {
        const { reportIncident } = await import("./incident-reporter.ts");
        void reportIncident({
          functionName,
          error,
          severity: "high",
          context: { url: req.url, method: req.method },
        });
      } catch (_) { /* never throw from logging */ }

      return errorResponse("INTERNAL_ERROR");
    }
  };
}

// Safe JSON parse with validation
export async function parseJsonBody<T>(
  req: Request,
  log: ReturnType<typeof createLogger>
): Promise<T | null> {
  try {
    return await req.json() as T;
  } catch (error) {
    log.warn("Failed to parse JSON body", {}, error);
    return null;
  }
}

// Validate required environment variables
export function requireEnvVars(
  vars: string[],
  log: ReturnType<typeof createLogger>
): boolean {
  const missing = vars.filter(v => !Deno.env.get(v));
  
  if (missing.length > 0) {
    log.error("Missing required environment variables", undefined, { 
      missing: missing.map(v => v.replace(/KEY|SECRET|PASSWORD/gi, '***')),
    });
    return false;
  }
  
  return true;
}

// Extract client IP from request headers
export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
         req.headers.get("x-real-ip") ||
         "unknown";
}

// Simple in-memory rate limiter (resets on cold start) - DEPRECATED
// Use checkRateLimitDb for persistent rate limiting across cold starts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 60 * 1000 // 1 hour default
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

// Database-backed rate limiter that persists across cold starts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  resetsAt: Date;
}

export async function checkRateLimitDb(
  identifier: string,
  endpoint: string,
  maxRequests: number = 10,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_identifier: identifier,
    p_endpoint: endpoint,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  
  if (error || !data || data.length === 0) {
    // On error, fail open to avoid blocking legitimate requests
    console.error("[rate-limit] DB check failed, allowing request:", error);
    return { allowed: true, currentCount: 0, resetsAt: new Date() };
  }
  
  const result = data[0];
  return {
    allowed: result.allowed,
    currentCount: result.current_count,
    resetsAt: new Date(result.resets_at),
  };
}
