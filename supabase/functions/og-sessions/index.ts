import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SESSIONS: Record<string, { title: string; description: string; ogImage: string; url: string }> = {
  analogxh2hotel: {
    title: "Analog Sessions x h2hotel — March 6 & 7, 2026",
    description:
      "On March 6–7, we're gathering in Healdsburg for Analog Sessions x h2hotel — a small, intentional cultural weekend centered on ideas, music, and insider access to the people who help shape the town year-round.",
    ogImage: "https://example.invalid/og-sessions-h2hotel.png",
    url: "https://example.invalid/sessions/analogxh2hotel",
  },
  crew: {
    title: "Bring Your Crew — Cosmico",
    description:
      "Gather 3–10 friends, name your price, and join the reunion together. 48-hour crew bid window now open.",
    ogImage: "https://example.invalid/og-crew.jpg",
    url: "https://example.invalid/crew",
  },
};

serve((req) => {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("s") || "analogxh2hotel";
  const session = SESSIONS[slug];

  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${session.title}</title>
  <meta name="description" content="${session.description}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${session.title}" />
  <meta property="og:description" content="${session.description}" />
  <meta property="og:image" content="${session.ogImage}" />
  <meta property="og:url" content="${session.url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${session.title}" />
  <meta name="twitter:description" content="${session.description}" />
  <meta name="twitter:image" content="${session.ogImage}" />
  <meta http-equiv="refresh" content="0;url=${session.url}" />
</head>
<body>
  <p>Redirecting to <a href="${session.url}">${session.title}</a>…</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
