import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizedHtmlProps } from "../sanitizeHtml";

describe("sanitizeHtml", () => {
  it("returns empty string for nullish input", () => {
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
    expect(sanitizeHtml("")).toBe("");
  });

  it("preserves safe formatting", () => {
    const html =
      '<h2>Title</h2><p class="lead" style="color:red">Hello <strong>world</strong><br/><em>ok</em></p><ul><li>a</li></ul>';
    const out = sanitizeHtml(html);
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<strong>world</strong>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain('class="lead"');
    expect(out).toContain("color:red");
  });

  it("preserves tables, links and images used by email templates", () => {
    const out = sanitizeHtml(
      '<table><tr><td colspan="2"><a href="https://example.test">x</a><img src="https://example.test/a.png" alt="a"></td></tr></table>',
    );
    expect(out).toContain('href="https://example.test"');
    expect(out).toContain('src="https://example.test/a.png"');
    expect(out).toContain("colspan");
  });

  it("strips script tags and their content", () => {
    const out = sanitizeHtml('<p>hi</p><script>alert("xss")</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain("alert");
    expect(out).toContain("<p>hi</p>");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)"><div onclick="steal()">c</div>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toContain("alert(1)");
  });

  it("strips javascript: and data: URLs", () => {
    const out = sanitizeHtml(
      '<a href="javascript:alert(1)">a</a><a href="data:text/html,<script>1</script>">b</a><img src="data:text/html;base64,PHNjcmlwdD4=">',
    );
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out.toLowerCase()).not.toContain("data:text/html");
  });

  it("strips iframes, objects, embeds and svg", () => {
    const out = sanitizeHtml(
      '<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"><svg><script>1</script></svg>',
    );
    expect(out).not.toMatch(/<iframe|<object|<embed|<svg/i);
  });

  it("strips forms and inputs", () => {
    const out = sanitizeHtml(
      '<form action="https://evil.test"><input name="p"><button>go</button></form><p>keep</p>',
    );
    expect(out).not.toMatch(/<form|<input|<button/i);
    expect(out).toContain("<p>keep</p>");
  });

  it("strips style and link tags", () => {
    const out = sanitizeHtml('<style>body{display:none}</style><link rel="stylesheet" href="x"><p>y</p>');
    expect(out).not.toMatch(/<style|<link/i);
    expect(out).toContain("<p>y</p>");
  });

  it("exposes React-ready sanitized props", () => {
    const props = sanitizedHtmlProps('<p>ok</p><script>bad()</script>');
    expect(props.dangerouslySetInnerHTML.__html).toContain("<p>ok</p>");
    expect(props.dangerouslySetInnerHTML.__html).not.toContain("bad()");
  });
});
