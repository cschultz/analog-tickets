/**
 * MediaLinksBlock
 * 
 * Editable text block for pasting media links (Dropbox, Google Drive, etc.).
 * Preserves formatting/spacing. URLs are rendered as clickable links that open in new tabs.
 */

import { useState, useCallback, useRef } from "react";
import { AdminButton } from "@/components/admin";
import { Pencil, Check, X, Link2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MediaLinksBlockProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  disabled?: boolean;
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function renderLinkedText(text: string) {
  if (!text.trim()) {
    return (
      <p className="text-xs text-[hsl(var(--admin-muted-foreground))] italic">
        No media links yet. Click edit to add links to external folders.
      </p>
    );
  }

  return text.split("\n").map((line, i) => (
    <div key={i} className="min-h-[1.25em]">
      {line === "" ? (
        <br />
      ) : (
        linkifyLine(line)
      )}
    </div>
  ));
}

function linkifyLine(line: string) {
  const parts = line.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0; // reset regex state
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[hsl(var(--admin-info))] hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function MediaLinksBlock({ value, onSave, disabled }: MediaLinksBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = () => {
    setDraft(value);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [draft, onSave]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * When pasting rich text (e.g. from a browser), extract hyperlinks from the
   * HTML clipboard and inline them as plain text so URLs aren't lost.
   */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html) return; // plain-text paste – let default behaviour handle it

    // Parse the HTML and convert <a href="...">label</a> → "label URL"
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node as HTMLElement;

      // Line-break elements
      if (el.tagName === "BR") return "\n";

      let inner = Array.from(el.childNodes).map(walk).join("");

      if (el.tagName === "A") {
        const href = el.getAttribute("href");
        if (href && !inner.includes(href)) {
          // Append the URL if it's not already visible in the text
          inner = inner.trim() ? `${inner.trim()} ${href}` : href;
        }
      }

      // Block-level elements get line breaks
      const block = /^(DIV|P|LI|TR|H[1-6]|BLOCKQUOTE)$/;
      if (block.test(el.tagName)) inner = inner + "\n";

      return inner;
    };

    const plainWithLinks = walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();

    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    setDraft(before + plainWithLinks + after);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = start + plainWithLinks.length;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
      }
    });
  }, [draft]);

  return (
    <div className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-card))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--admin-border)/0.5)]">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-[hsl(var(--admin-muted-foreground))]" />
          <span className="text-xs font-medium text-[hsl(var(--admin-foreground))]">Media Links</span>
        </div>
        {!isEditing ? (
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={handleEdit}
            disabled={disabled}
            className="h-6 px-2 text-[10px]"
          >
            <Pencil className="w-3 h-3 mr-1" />
            Edit
          </AdminButton>
        ) : (
          <div className="flex items-center gap-1">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
              className="h-6 px-2 text-[10px]"
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </AdminButton>
            <AdminButton
              variant="admin"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="h-6 px-2 text-[10px]"
            >
              <Check className="w-3 h-3 mr-1" />
              Save
            </AdminButton>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {isEditing ? (
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste links to external folders here...&#10;&#10;e.g.&#10;Photos: https://dropbox.com/...&#10;Videos: https://drive.google.com/..."
            className="min-h-[120px] text-xs font-mono bg-[hsl(var(--admin-bg))] border-[hsl(var(--admin-border))] text-[hsl(var(--admin-foreground))] placeholder:text-[hsl(var(--admin-muted-foreground))] whitespace-pre-wrap"
            style={{ whiteSpace: "pre-wrap" }}
          />
        ) : (
          <div className="text-xs text-[hsl(var(--admin-foreground))] whitespace-pre-wrap leading-relaxed">
            {renderLinkedText(value)}
          </div>
        )}
      </div>
    </div>
  );
}
