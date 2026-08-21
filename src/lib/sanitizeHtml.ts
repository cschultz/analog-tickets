import DOMPurify from "dompurify";

/**
 * Conservative allowlist for rendering stored/formatted HTML
 * (email bodies, templates, contract documents).
 *
 * Removes: scripts, styles, iframes/objects/embeds, forms and inputs,
 * event-handler attributes, and javascript:/data: URLs.
 * Keeps: normal rich-text formatting, links, images, tables and lists,
 * plus inline `style`/`class` so existing email templates still render.
 */
const ALLOWED_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "caption", "center", "code", "col",
  "colgroup", "dd", "div", "dl", "dt", "em", "figcaption", "figure", "font",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol",
  "p", "pre", "q", "s", "small", "span", "strike", "strong", "sub", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "title", "alt", "src", "width", "height",
  "align", "valign", "colspan", "rowspan", "border", "cellpadding",
  "cellspacing", "class", "style", "color", "bgcolor", "dir", "lang",
];

const FORBID_TAGS = [
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "select", "textarea", "link", "meta", "base", "svg", "math", "template",
  "audio", "video", "source", "portal", "frame", "frameset", "noscript",
];

const FORBID_ATTR = [
  "srcset", "formaction", "action", "xlink:href", "ping", "background",
];

// DOMPurify permits `data:` URIs on a few tags (img, audio, video) by default.
// Drop them outright: they can carry executable payloads and are never needed
// for the formatted text / email / contract content this app renders.
let hookInstalled = false;
function installDataUriHook() {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    for (const attr of ["src", "href", "xlink:href"]) {
      const value = (node as Element).getAttribute?.(attr);
      if (value && /^\s*data:/i.test(value)) (node as Element).removeAttribute(attr);
    }
  });
}

/**
 * Sanitize untrusted HTML before passing it to dangerouslySetInnerHTML.
 * Always returns a string (empty for nullish input).
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  installDataUriHook();
  return DOMPurify.sanitize(html, {

    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
  });
}

/** Convenience helper for React: `<div {...sanitizedHtmlProps(value)} />` */
export function sanitizedHtmlProps(html: string | null | undefined) {
  return { dangerouslySetInnerHTML: { __html: sanitizeHtml(html) } };
}
