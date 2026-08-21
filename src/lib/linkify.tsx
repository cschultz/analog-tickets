import React from "react";

// Renders text with:
//  - Markdown links: [label](https://url)
//  - Bare URLs: https://example.com/path
//  - Email addresses: name@domain.com
// Preserves original whitespace; safe for use inside whitespace-pre-wrap containers.
const URL_REGEX = /https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/g;
const MD_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const linkClass =
  "underline underline-offset-2 hover:opacity-80 transition-opacity break-words";

export function linkify(text: string): React.ReactNode[] {
  if (!text) return [text];

  const nodes: React.ReactNode[] = [];
  let key = 0;

  // First, split on markdown links so we can render them as anchors with custom labels.
  let lastIndex = 0;
  const mdMatches = Array.from(text.matchAll(MD_LINK_REGEX));

  for (const m of mdMatches) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      nodes.push(...renderPlain(text.slice(lastIndex, start), () => key++));
    }
    nodes.push(
      <a
        key={`md-${key++}`}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {m[1]}
      </a>
    );
    lastIndex = start + m[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...renderPlain(text.slice(lastIndex), () => key++));
  }

  return nodes;
}

function renderPlain(text: string, nextKey: () => number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Combined pass: walk URLs and emails in order.
  const tokens: Array<{ start: number; end: number; type: "url" | "email"; value: string }> = [];
  for (const m of text.matchAll(URL_REGEX)) {
    tokens.push({ start: m.index!, end: m.index! + m[0].length, type: "url", value: m[0] });
  }
  for (const m of text.matchAll(EMAIL_REGEX)) {
    tokens.push({ start: m.index!, end: m.index! + m[0].length, type: "email", value: m[0] });
  }
  // Sort and dedupe overlapping (URL wins over email if overlap).
  tokens.sort((a, b) => a.start - b.start || (a.type === "url" ? -1 : 1));
  const filtered: typeof tokens = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.start < cursor) continue;
    filtered.push(t);
    cursor = t.end;
  }

  let last = 0;
  for (const t of filtered) {
    if (t.start > last) out.push(text.slice(last, t.start));
    if (t.type === "url") {
      out.push(
        <a
          key={`u-${nextKey()}`}
          href={t.value}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {t.value.replace(/^https?:\/\//, "")}
        </a>
      );
    } else {
      out.push(
        <a
          key={`e-${nextKey()}`}
          href={`mailto:${t.value}`}
          className={linkClass}
        >
          {t.value}
        </a>
      );
    }
    last = t.end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
