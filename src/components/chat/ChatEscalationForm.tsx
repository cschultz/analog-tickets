import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const emailSchema = z.string().trim().email("Please enter a valid email").max(255);

interface ChatEscalationFormProps {
  sessionId: string;
  onSubmitted: () => void;
}

export const ChatEscalationForm = ({ sessionId, onSubmitted }: ChatEscalationFormProps) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = emailSchema.safeParse(email);
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: dbError } = await supabase
        .from("chat_logs")
        .update({
          user_email: validation.data,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);

      if (dbError) throw dbError;

      await supabase.functions.invoke("send-chat-escalation", {
        body: {
          sessionId,
          email: validation.data,
        },
      });

      setIsSubmitted(true);
      onSubmitted();
      toast.success("We'll be in touch soon!");
    } catch (err) {
      console.error("Escalation form error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mx-2 my-3">
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle className="h-5 w-5" />
          <p className="text-sm font-medium">Got it! the organizers will reach out soon.</p>
        </div>
      </div>
    );
  }

  return (
    <form 
      onSubmit={handleSubmit}
      className="bg-muted/50 border border-border/50 rounded-xl p-4 mx-2 my-3 space-y-3"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">If you'd rather talk to a real human, I can connect you with the organizers.</p>
        <p className="text-xs text-muted-foreground">Just leave your email and I'll introduce you—they'll reach out and help with anything you're figuring out.</p>
      </div>
      
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className="h-9 text-sm"
            maxLength={255}
            autoComplete="email"
            name="email"
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
        <Button 
          type="submit" 
          disabled={isSubmitting || !email.trim()}
          className="h-9 px-3"
          size="sm"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </form>
  );
};
