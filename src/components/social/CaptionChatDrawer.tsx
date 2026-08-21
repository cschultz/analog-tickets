/**
 * CaptionChatDrawer - Interactive chat for caption brainstorming
 * 
 * Features:
 * - Photo preview + context
 * - Streaming chat with GPT-5.2
 * - "Use this caption" action to save approved_caption
 * - Regenerate button for quick iterations
 */

import { useState, useRef, useEffect, memo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Send, Loader2, MessageSquare, Copy, Check, Sparkles, Image as ImageIcon, RefreshCw,
  Eye, EyeOff
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  AdminSheet,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetTitle,
  AdminSheetDescription,
  AdminButton,
  AdminScrollArea,
  AdminTextarea,
} from "@/components/admin";
import { getFunctionUrl } from "@/platform/config/env";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PhotoContext {
  id: string;
  file_name?: string;
  theme?: string;
  tags?: string[];
  quality_notes?: string;
  photographer_name?: string;
  thumbnail_url?: string;   // 400px for fast grid browsing
  preview_url?: string;     // 1080px for AI vision (preferred)
  public_image_url?: string;
  temporary_url?: string;
  storage_url?: string;     // Legacy - same as preview_url
  caption_suggestions?: string[];
}

interface CaptionChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: PhotoContext | null;
  onCaptionSelected: (caption: string) => void;
}

const CHAT_URL = getFunctionUrl("caption-chat");

// Quick prompt chips
const QUICK_PROMPTS = [
  { label: "Write a caption", prompt: "Write a caption for this image" },
  { label: "Something quieter", prompt: "Write something quieter and more contemplative" },
  { label: "More poetic", prompt: "Make it more poetic" },
  { label: "Shorter", prompt: "Make it much shorter, just a few words" },
];

// Memoized message component
const ChatMessageBubble = memo(({ 
  message, 
  index, 
  copiedIndex, 
  onCopy, 
  onUseCaption,
  extractCaptions,
}: { 
  message: ChatMessage; 
  index: number;
  copiedIndex: number | null;
  onCopy: (text: string, index: number) => void;
  onUseCaption: (text: string) => void;
  extractCaptions: (content: string) => string[];
}) => {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-[hsl(var(--admin-primary))] text-white">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Get the cleaned caption for the "Use this" button
  const cleanedCaption = extractCaptions(message.content)[0];

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text))]">
        <div className="space-y-2">
          <div className="prose prose-sm max-w-none text-[hsl(var(--admin-text))]">
            <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
          </div>
          
          {message.content && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[hsl(var(--admin-border)/.5)]">
              <button
                onClick={() => onCopy(message.content, index)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-border))] transition-colors"
              >
                {copiedIndex === index ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy all
              </button>
              
              {cleanedCaption && (
                <button
                  onClick={() => onUseCaption(cleanedCaption)}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[hsl(var(--admin-success)/.1)] text-[hsl(var(--admin-success))] hover:bg-[hsl(var(--admin-success)/.2)] transition-colors"
                >
                  <Check className="h-3 w-3 shrink-0" />
                  Use this
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
ChatMessageBubble.displayName = 'ChatMessageBubble';

// Loading dots animation
const TypingIndicator = memo(() => (
  <div className="flex justify-start">
    <div className="bg-[hsl(var(--admin-hover))] rounded-2xl px-4 py-3">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-[hsl(var(--admin-text-muted))] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-[hsl(var(--admin-text-muted))] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-[hsl(var(--admin-text-muted))] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  </div>
));
TypingIndicator.displayName = 'TypingIndicator';

export function CaptionChatDrawer({
  open,
  onOpenChange,
  photo,
  onCaptionSelected,
}: CaptionChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset chat when photo changes
  useEffect(() => {
    if (open && photo) {
      setMessages([]);
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, photo?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Prioritize preview_url (1080px in Supabase) for display and AI vision
  const imageUrl = photo?.preview_url || photo?.storage_url || photo?.thumbnail_url || photo?.public_image_url || photo?.temporary_url;
  
  // For AI vision, ONLY use our Supabase Storage URLs (never Dropbox temporary URLs)
  const visionUrl = photo?.preview_url || photo?.storage_url || 
    (photo?.public_image_url && !photo.public_image_url.includes("dropbox") ? photo.public_image_url : undefined);

  const sendMessage = useCallback(async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading || !photo) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated. Please log in again.");
      }

      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          photoContext: {
            theme: photo.theme,
            tags: photo.tags,
            quality_notes: photo.quality_notes,
            photographer_name: photo.photographer_name,
            imageUrl: messages.length === 0 ? visionUrl : undefined,
          },
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to start chat");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error("Caption chat error:", error);
      toast.error(error instanceof Error ? error.message : "Chat failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, photo, messages, imageUrl]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success("Copied to clipboard");
  }, []);

  const useCaption = useCallback((text: string) => {
    onCaptionSelected(text);
    toast.success("Caption selected");
    onOpenChange(false);
  }, [onCaptionSelected, onOpenChange]);

  const handleRegenerate = useCallback(() => {
    sendMessage("Give me another option, different from the previous ones");
  }, [sendMessage]);

  // Extract the full caption as a single block (poems/multi-line should stay together)
  const extractCaptions = useCallback((content: string): string[] => {
    if (!content || content.length < 20) return [];
    
    // Clean the content - remove markdown formatting but preserve line breaks
    let cleaned = content
      .replace(/^\*\*.*?\*\*\s*/gm, "")  // Remove bold headers
      .replace(/^#+\s+.*$/gm, "")         // Remove markdown headers
      .replace(/^Here'?s?\s+.*?:?\s*$/gim, "")  // Remove "Here's a caption:" type intros
      .replace(/^Option\s+\d+.*?:?\s*$/gim, "") // Remove "Option 1:" type labels
      .trim();
    
    // If the cleaned content looks like a coherent caption, return it as one
    if (cleaned.length > 20 && cleaned.length < 1500) {
      return [cleaned];
    }
    
    return [];
  }, []);

  return (
    <AdminSheet open={open} onOpenChange={onOpenChange}>
      <AdminSheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <AdminSheetHeader className="p-4 border-b border-[hsl(var(--admin-border))]">
          <AdminSheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Caption Writer
          </AdminSheetTitle>
          <AdminSheetDescription>
            Write the caption. One confident voice.
          </AdminSheetDescription>
        </AdminSheetHeader>

        {/* Photo Preview */}
        {photo && (
          <div className="p-4 border-b border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-hover))]">
            <div className="flex gap-3">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={photo.file_name || "Photo"}
                  className="w-20 h-20 object-cover rounded-lg"
                />
              ) : (
                <div className="w-20 h-20 bg-[hsl(var(--admin-surface))] rounded-lg flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-[hsl(var(--admin-text-muted))]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[hsl(var(--admin-text))] truncate">
                  {photo.file_name || "Untitled"}
                </p>
                {photo.theme && (
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                    Theme: {photo.theme}
                  </p>
                )}
                {photo.tags?.length ? (
                  <p className="text-xs text-[hsl(var(--admin-text-muted))] truncate">
                    Tags: {photo.tags.join(", ")}
                  </p>
                ) : null}
                {/* Vision status indicator */}
                {visionUrl ? (
                  <p className="text-xs text-[hsl(var(--admin-success))] mt-1 flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    AI can see this image
                  </p>
                ) : (
                  <p className="text-xs text-[hsl(var(--admin-warning))] mt-1 flex items-center gap-1">
                    <EyeOff className="h-3 w-3" />
                    Vision unavailable (image not synced)
                  </p>
                )}
              </div>
            </div>
            {/* Existing suggestions */}
            {photo.caption_suggestions?.length ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-[hsl(var(--admin-text-muted))] mb-1">
                  AI Suggestions:
                </p>
                <div className="flex flex-wrap gap-1">
                  {photo.caption_suggestions.slice(0, 3).map((s, i) => (
                    <AdminButton
                      key={i}
                      variant="adminGhost"
                      size="sm"
                      onClick={() => useCaption(s)}
                      className="text-xs h-auto py-1 px-2 truncate max-w-[200px]"
                      title={s}
                    >
                      {s.slice(0, 40)}...
                    </AdminButton>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Chat Messages */}
        <AdminScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[hsl(var(--admin-surface))] flex items-center justify-center">
                <Sparkles className="h-5 w-5 opacity-60" />
              </div>
              <p className="text-sm font-medium text-[hsl(var(--admin-text))]">Write the caption</p>
              <p className="text-xs mt-1 max-w-[200px] mx-auto">
                One confident voice. No explaining.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {QUICK_PROMPTS.slice(0, 2).map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[hsl(var(--admin-border))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <ChatMessageBubble
                  key={i}
                  message={msg}
                  index={i}
                  copiedIndex={copiedIndex}
                  onCopy={copyToClipboard}
                  onUseCaption={useCaption}
                  extractCaptions={extractCaptions}
                />
              ))}
              
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <TypingIndicator />
              )}
            </div>
          )}
        </AdminScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]">
          {/* Quick prompts when there's history */}
          {messages.length > 0 && !isLoading && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[hsl(var(--admin-border))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Another option
              </button>
              {QUICK_PROMPTS.slice(2).map((qp) => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  className="text-xs px-2.5 py-1 rounded-full border border-[hsl(var(--admin-border))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <AdminTextarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write the caption. Don't explain it."
              className="flex-1 min-h-[44px] max-h-[120px] resize-none bg-[hsl(var(--admin-background))] border-[hsl(var(--admin-border))]"
              rows={1}
              disabled={isLoading}
            />
            <AdminButton
              variant="adminOutline"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </AdminButton>
          </div>
          <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-2">
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </AdminSheetContent>
    </AdminSheet>
  );
}
