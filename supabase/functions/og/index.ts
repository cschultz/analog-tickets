import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// Per-route Open Graph proxy. Use a canonical URL like:
//   https://example.invalid/og?p=win
// Share that URL on iMessage / WhatsApp / Instagram DMs / Slack / X to get the
// correct social card. Crawlers see the meta tags below; humans get redirected
// to the real page via meta-refresh.

type Card = {
  title: string;
  description: string;
  ogImage: string;
  url: string;
};

const PROD = "https://example.invalid";

const CARDS: Record<string, Card> = {
  win: {
    title: "Win the Weekend — Cosmico 2026 Giveaway",
    description:
      "Enter free to win 2 Krewe passes, 2 nights on-site at Wildhaven Sonoma, a Sundrop sauna ritual, and a Rivian weekend. Open to CA residents 18+. Ends May 8, 2026.",
    ogImage: `${PROD}/og-win.jpg`,
    url: `${PROD}/win`,
  },
  crew: {
    title: "Bring Your Crew — Cosmico",
    description:
      "Gather 4–10 friends, name your price, and lock in group tickets. Limited spots — when they're gone, they're gone.",
    ogImage: `${PROD}/og-crew.jpg`,
    url: `${PROD}/bringyourcrew`,
  },
  bringyourcrew: {
    title: "Bring Your Crew — Cosmico",
    description:
      "Gather 4–10 friends, name your price, and lock in group tickets. Limited spots — when they're gone, they're gone.",
    ogImage: `${PROD}/og-crew.jpg`,
    url: `${PROD}/bringyourcrew`,
  },
  default: {
    title: "Cosmico 2026 — May 15–17, Wildhaven Sonoma",
    description:
      "A small, intentional festival weekend in Sonoma County. Music, wine, food, sauna, and 700 people who actually want to be there.",
    ogImage: `${PROD}/og-default.jpg`,
    url: `${PROD}/`,
  },
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

serve((req) => {
  const { searchParams } = new URL(req.url);
  // Accept either ?p=win or legacy ?s=win
  const slug = (searchParams.get("p") || searchParams.get("s") || "default").toLowerCase();
  const card = CARDS[slug] || CARDS.default;

  const t = escapeHtml(card.title);
  const d = escapeHtml(card.description);
  const img = escapeHtml(card.ogImage);
  const url = escapeHtml(card.url);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
  <meta http-equiv="refresh" content="0;url=${url}" />
</head>
<body>
  <p>Redirecting to <a href="${url}">${t}</a>…</p>
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
