import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { ChatEscalationForm } from "@/components/chat/ChatEscalationForm";
import { linkify } from "@/lib/linkify";

interface Message {
  role: "user" | "assistant";
  content: string;
  showEscalation?: boolean;
}

export const SupportChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return sessionStorage.getItem('supportChatDismissed') === 'true';
  });
  const [isVisible, setIsVisible] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey—this is Analog. Happy to help with any questions about the Reunion.\n\nAnd if you'd prefer something a little more… analog, I can connect you with the organizers anytime.\n\nWhat can I help with?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [escalationSubmitted, setEscalationSubmitted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isAuthRoute = location.pathname === "/auth";
  const isCheckoutSurface = ["/tickets", "/checkout", "/my-tickets"].some((route) =>
    location.pathname === route || location.pathname.startsWith(`${route}/`)
  );
  const launcherWrapperClass = isCheckoutSurface
    ? "fixed bottom-[5.75rem] right-3 md:bottom-6 md:right-6 z-30 flex items-center gap-2 pointer-events-none"
    : "fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 pointer-events-none";
  const launcherButtonClass = isCheckoutSurface
    ? "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:text-foreground/80 pointer-events-auto md:h-auto md:w-auto md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:shadow-none md:px-0 md:py-0 md:text-sm md:text-muted-foreground md:hover:text-foreground"
    : "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pointer-events-auto";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Delay appearance of chat widget
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 5000); // 5 second delay
    return () => clearTimeout(timer);
  }, []);

  // Persist dismissed state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('supportChatDismissed', isDismissed.toString());
  }, [isDismissed]);

  // Listen for custom event to reopen chat (optionally with a prefilled assistant message)
  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      setIsDismissed(false);
      setIsVisible(true);
      setIsOpen(true);

      const detail = (e as CustomEvent<{ assistantMessage?: string }>).detail;
      const injected = detail?.assistantMessage?.trim();
      if (injected) {
        setMessages((prev) => {
          // Avoid duplicating the same notice if reopened multiple times
          if (prev.some((m) => m.role === "assistant" && m.content === injected)) return prev;
          return [...prev, { role: "assistant", content: injected }];
        });
      }
    };

    window.addEventListener('openSupportChat', handleOpenChat as EventListener);
    return () => window.removeEventListener('openSupportChat', handleOpenChat as EventListener);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("support-chat", {
        body: {
          messages: [...messages, userMessage],
          sessionId,
        },
      });

      if (error) throw error;

      if (data?.message) {
        const shouldShowEscalation = data.needsFollowup === true && !escalationSubmitted;
        setMessages((prev) => [
          ...prev,
          { 
            role: "assistant", 
            content: data.message,
            showEscalation: shouldShowEscalation,
          },
        ]);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      toast.error("Failed to send message. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I'm having trouble responding right now. Please try again or contact us directly at hello@example.org",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Never render on auth pages and don't render if dismissed or not yet visible
  if (isAuthRoute || isDismissed || !isVisible) {
    return null;
  }

  if (!isOpen) {
    return (
      <div className={launcherWrapperClass}>
        <button
          onClick={() => setIsOpen(true)}
          className={launcherButtonClass}
          aria-label="Open support chat"
        >
          <MessageCircle className="h-4 w-4" />
          <span className={isCheckoutSurface ? "sr-only md:not-sr-only" : ""}>Need Help?</span>
        </button>
        
        {!isCheckoutSurface && (
          <button
            onClick={() => setIsDismissed(true)}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors pointer-events-auto"
            aria-label="Dismiss chat"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className="fixed bottom-[5.75rem] right-3 md:bottom-6 md:right-6 w-[calc(100vw-1.5rem)] max-w-[380px] h-[min(26rem,calc(100vh-8rem))] md:h-[600px] shadow-2xl flex flex-col z-40 rounded-2xl border-2">
      <CardHeader className="border-b py-4 px-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base md:text-lg">Cosmico</CardTitle>
            <p className="text-[10px] text-muted-foreground/70 italic">a fictional demo gathering</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDismissed(true)}
            className="h-8 w-8"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Ask us anything about tickets, the event, or registration
        </p>
      </CardHeader>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx}>
              <div
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{linkify(msg.content)}</p>
                </div>
              </div>
              {msg.showEscalation && !escalationSubmitted && (
                <ChatEscalationForm 
                  sessionId={sessionId} 
                  onSubmitted={() => setEscalationSubmitted(true)}
                />
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <CardFooter className="border-t p-4 shrink-0">
        <div className="w-full space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              className="h-11"
            />
            <Button 
              onClick={sendMessage} 
              disabled={isLoading || !input.trim()} 
              size="icon"
              className="h-11 w-11 shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            💡 Mention your name and email to get a direct follow-up
          </p>
        </div>
      </CardFooter>
    </Card>
  );
};
