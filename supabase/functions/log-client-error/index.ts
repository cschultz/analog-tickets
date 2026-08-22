import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// @ts-ignore - deno esm
import { SourceMapConsumer } from "https://esm.sh/source-map-js@1.2.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// In-memory source map cache (per cold-start). Keys are absolute bundle URLs.
const mapCache = new Map<string, any | null>();
const MAX_CACHE = 50;

async function fetchSourceMap(bundleUrl: string): Promise<any | null> {
  if (mapCache.has(bundleUrl)) return mapCache.get(bundleUrl)!;
  try {
    const mapUrl = bundleUrl + ".map";
    const res = await fetch(mapUrl, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      mapCache.set(bundleUrl, null);
      return null;
    }
    const json = await res.json();
    const consumer = new SourceMapConsumer(json);
    if (mapCache.size >= MAX_CACHE) {
      // Drop oldest entry (Map preserves insertion order)
      const firstKey = mapCache.keys().next().value;
      if (firstKey) mapCache.delete(firstKey);
    }
    mapCache.set(bundleUrl, consumer);
    return consumer;
  } catch (_e) {
    mapCache.set(bundleUrl, null);
    return null;
  }
}

// Matches frames like:
//   at fn (https://example.invalid/assets/foo-abc123.js:123:45)
//   at https://example.invalid/assets/foo-abc123.js:123:45
//   foo@https://example.invalid/assets/foo-abc123.js:123:45  (Firefox)
const FRAME_REGEX =
  /(\s*(?:at\s+)?(?:[^\s@(]+\s*[@(])?)((?:https?:\/\/|\/)[^\s)]+?\.m?js)(?::(\d+):(\d+))(\)?)/gi;

async function deminifyStack(
  stack: string,
  pageUrl?: string | null,
): Promise<string> {
  const lines = stack.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    let mapped: string | null = null;
    // Use replace-style scan to find the first frame location
    FRAME_REGEX.lastIndex = 0;
    const m = FRAME_REGEX.exec(line);
    if (m) {
      const [, prefix, urlMatch, lineStr, colStr, suffix] = m;
      let absUrl = urlMatch;
      if (urlMatch.startsWith("/") && pageUrl) {
        try {
          absUrl = new URL(urlMatch, pageUrl).toString();
        } catch {
          // ignore
        }
      }
      try {
        const consumer = await fetchSourceMap(absUrl);
        if (consumer) {
          const orig = consumer.originalPositionFor({
            line: Number(lineStr),
            column: Number(colStr),
          });
          if (orig && orig.source) {
            const name = orig.name ? `${orig.name} ` : "";
            mapped =
              `${prefix}${name}(${orig.source}:${orig.line}:${orig.column})${suffix}`.trimStart();
          }
        }
      } catch (_e) {
        // ignore individual frame failures
      }
    }
    out.push(mapped ?? line);
  }
  return out.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit per IP: 30 requests / 10 minutes (matches log-checkout-error).
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  try {
    const rlClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: rl } = await rlClient.rpc("check_rate_limit", {
      p_identifier: clientIp,
      p_endpoint: "log-client-error",
      p_max_requests: 30,
      p_window_seconds: 600,
    });
    if (rl && rl.length > 0 && rl[0].allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (_e) {
    // fail open on rate-limit infra errors
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      url,
      route,
      routePattern,
      routeParams,
      previousUrl,
      referrer,
      message,
      stack,
      componentStack,
      userAgent,
      email,
      buildVersion,
      context,
    } = body ?? {};

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let originalStack: string | null = null;
    if (typeof stack === "string" && stack.length > 0) {
      try {
        originalStack = await deminifyStack(stack.slice(0, 8000), url);
        if (originalStack === stack) originalStack = null;
      } catch (_e) {
        originalStack = null;
      }
    }

    const mergedContext: Record<string, unknown> = {
      ...(context && typeof context === "object" ? context : {}),
    };
    if (routePattern) mergedContext.routePattern = routePattern;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("client_errors").insert({
      url: typeof url === "string" ? url.slice(0, 2000) : null,
      route: typeof route === "string" ? route.slice(0, 500) : null,
      route_params:
        routeParams && typeof routeParams === "object" ? routeParams : null,
      previous_url:
        typeof previousUrl === "string" ? previousUrl.slice(0, 2000) : null,
      referrer: typeof referrer === "string" ? referrer.slice(0, 2000) : null,
      message: message.slice(0, 4000),
      stack: typeof stack === "string" ? stack.slice(0, 8000) : null,
      original_stack: originalStack ? originalStack.slice(0, 12000) : null,
      component_stack:
        typeof componentStack === "string"
          ? componentStack.slice(0, 8000)
          : null,
      user_agent: typeof userAgent === "string" ? userAgent.slice(0, 500) : null,
      email: typeof email === "string" ? email.slice(0, 320) : null,
      build_version:
        typeof buildVersion === "string" ? buildVersion.slice(0, 100) : null,
      context: Object.keys(mergedContext).length ? mergedContext : null,
    });

    if (error) {
      console.error("client_errors insert failed", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mirror into incidents table for unified admin visibility (medium severity → no SMS by default)
    try {
      const { reportIncident } = await import("../_shared/incident-reporter.ts");
      void reportIncident({
        functionName: typeof route === "string" && route ? route : "frontend",
        error: { message, stack: originalStack || stack },
        severity: "medium",
        source: "frontend",
        context: {
          route, routePattern, url, buildVersion,
          ...(context && typeof context === "object" ? context : {}),
        },
      });
    } catch (_e) { /* swallow */ }

    return new Response(
      JSON.stringify({ ok: true, deminified: !!originalStack }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
