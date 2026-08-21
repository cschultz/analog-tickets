/**
 * Brand Voice Editor
 * 
 * Admin UI for viewing and editing the editorial voice guidelines
 * used by caption generation AI.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminInput, AdminButton } from "@/components/admin";
import { AdminTextarea, AdminLabel, AdminSwitch, AdminFormField } from "@/components/admin/AdminFormPrimitives";
import { toast } from "sonner";
import { Save, Sparkles, Plus, X, History, Eye, EyeOff } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";

interface BrandVoice {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  tone_description: string;
  message_pillars: string[];
  writing_rules: string[];
  anti_patterns: string[];
  caption_length_guidance: string | null;
  hashtag_guidance: string | null;
  emoji_guidance: string | null;
  system_prompt: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export function BrandVoiceEditor() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [toneDescription, setToneDescription] = useState("");
  const [messagePillars, setMessagePillars] = useState<string[]>([]);
  const [writingRules, setWritingRules] = useState<string[]>([]);
  const [antiPatterns, setAntiPatterns] = useState<string[]>([]);
  const [captionLengthGuidance, setCaptionLengthGuidance] = useState("");
  const [hashtagGuidance, setHashtagGuidance] = useState("");
  const [emojiGuidance, setEmojiGuidance] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch active brand voice
  const { data: brandVoice, isLoading } = useAuthQuery({
    queryKey: ["brand-voice-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_brand_voice")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) throw error;
      return data as BrandVoice | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Load data into form when fetched
  useEffect(() => {
    if (brandVoice) {
      setName(brandVoice.name);
      setToneDescription(brandVoice.tone_description);
      setMessagePillars(brandVoice.message_pillars || []);
      setWritingRules(brandVoice.writing_rules || []);
      setAntiPatterns(brandVoice.anti_patterns || []);
      setCaptionLengthGuidance(brandVoice.caption_length_guidance || "");
      setHashtagGuidance(brandVoice.hashtag_guidance || "");
      setEmojiGuidance(brandVoice.emoji_guidance || "");
      setSystemPrompt(brandVoice.system_prompt);
      setNotes(brandVoice.notes || "");
    }
  }, [brandVoice]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Compile the system prompt from components
      const compiledPrompt = compileSystemPrompt({
        toneDescription,
        messagePillars,
        writingRules,
        antiPatterns,
        captionLengthGuidance,
        hashtagGuidance,
        emojiGuidance,
      });

      const updateData = {
        name,
        tone_description: toneDescription,
        message_pillars: messagePillars,
        writing_rules: writingRules,
        anti_patterns: antiPatterns,
        caption_length_guidance: captionLengthGuidance || null,
        hashtag_guidance: hashtagGuidance || null,
        emoji_guidance: emojiGuidance || null,
        system_prompt: compiledPrompt,
        notes: notes || null,
      };

      if (brandVoice?.id) {
        const { error } = await supabase
          .from("social_brand_voice")
          .update(updateData)
          .eq("id", brandVoice.id);
        if (error) throw error;
      } else {
        // Create new with is_active = true
        const { error } = await supabase
          .from("social_brand_voice")
          .insert({ ...updateData, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-voice-active"] });
      toast.success("Brand voice saved");
      setIsEditing(false);
    },
    onError: (error) => {
      console.error("Failed to save brand voice:", error);
      toast.error("Failed to save brand voice");
    },
  });

  // Helper to add/remove items from arrays
  const addItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    if (value.trim()) {
      setter(prev => [...prev, value.trim()]);
    }
  };

  const removeItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number) => {
    setter(prev => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--admin-primary))]" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
            <AdminCardTitle className="text-base font-semibold">Brand Voice</AdminCardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </AdminButton>
                <AdminButton
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  <Save className="h-3 w-3 mr-1" />
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </AdminButton>
              </>
            ) : (
              <AdminButton
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit Voice
              </AdminButton>
            )}
          </div>
        </div>
        <AdminCardDescription className="text-xs">
          Editorial guidelines used by AI caption generation • v{brandVoice?.version || 1}
        </AdminCardDescription>
      </AdminCardHeader>

      <AdminCardContent className="space-y-6">
        {/* Name */}
        <AdminFormField label="Voice Name">
          <AdminInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isEditing}
            placeholder="e.g., Cosmico Editorial Voice v1"
          />
        </AdminFormField>

        {/* Tone Description */}
        <AdminFormField 
          label="Tone Description" 
          hint="Describe the overall voice and personality"
        >
          <AdminTextarea
            value={toneDescription}
            onChange={(e) => setToneDescription(e.target.value)}
            disabled={!isEditing}
            rows={3}
            placeholder="warm, grounded, human; confident without hype..."
          />
        </AdminFormField>

        {/* Message Pillars */}
        <div className="space-y-2">
          <AdminLabel>Message Pillars</AdminLabel>
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            Core themes to align captions with
          </p>
          <div className="flex flex-wrap gap-2">
            {messagePillars.map((pillar, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[hsl(var(--admin-accent)/0.1)] text-[hsl(var(--admin-accent))]"
              >
                {pillar}
                {isEditing && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => removeItem(setMessagePillars, index)}
                    onKeyDown={(e) => e.key === 'Enter' && removeItem(setMessagePillars, index)}
                    className="cursor-pointer hover:text-[hsl(var(--admin-error))]"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </span>
            ))}
            {isEditing && (
              <AddItemInput
                placeholder="Add pillar..."
                onAdd={(value) => addItem(setMessagePillars, value)}
              />
            )}
          </div>
        </div>

        {/* Writing Rules */}
        <div className="space-y-2">
          <AdminLabel>Writing Rules</AdminLabel>
          <div className="space-y-1.5">
            {writingRules.map((rule, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))]"
              >
                <span className="text-xs text-[hsl(var(--admin-text-muted))]">•</span>
                <span className="flex-1 text-sm">{rule}</span>
                {isEditing && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => removeItem(setWritingRules, index)}
                    onKeyDown={(e) => e.key === 'Enter' && removeItem(setWritingRules, index)}
                    className="cursor-pointer text-[hsl(var(--admin-text-muted))] hover:text-[hsl(var(--admin-error))]"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </div>
            ))}
            {isEditing && (
              <AddItemInput
                placeholder="Add writing rule..."
                onAdd={(value) => addItem(setWritingRules, value)}
                fullWidth
              />
            )}
          </div>
        </div>

        {/* Anti-Patterns */}
        <div className="space-y-2">
          <AdminLabel>Anti-Patterns (Avoid)</AdminLabel>
          <div className="flex flex-wrap gap-2">
            {antiPatterns.map((pattern, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[hsl(var(--admin-error)/0.1)] text-[hsl(var(--admin-error))]"
              >
                {pattern}
                {isEditing && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => removeItem(setAntiPatterns, index)}
                    onKeyDown={(e) => e.key === 'Enter' && removeItem(setAntiPatterns, index)}
                    className="cursor-pointer hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </span>
            ))}
            {isEditing && (
              <AddItemInput
                placeholder="Add anti-pattern..."
                onAdd={(value) => addItem(setAntiPatterns, value)}
              />
            )}
          </div>
        </div>

        {/* Quick Guidelines */}
        <div className="grid gap-4 sm:grid-cols-3">
          <AdminFormField label="Caption Length">
            <AdminInput
              value={captionLengthGuidance}
              onChange={(e) => setCaptionLengthGuidance(e.target.value)}
              disabled={!isEditing}
              placeholder="90–140 words"
            />
          </AdminFormField>
          <AdminFormField label="Hashtag Guidance">
            <AdminInput
              value={hashtagGuidance}
              onChange={(e) => setHashtagGuidance(e.target.value)}
              disabled={!isEditing}
              placeholder="4–8 hashtags"
            />
          </AdminFormField>
          <AdminFormField label="Emoji Guidance">
            <AdminInput
              value={emojiGuidance}
              onChange={(e) => setEmojiGuidance(e.target.value)}
              disabled={!isEditing}
              placeholder="0–2 max"
            />
          </AdminFormField>
        </div>

        {/* System Prompt (Advanced) */}
        <div className="space-y-2 pt-4 border-t border-[hsl(var(--admin-border))]">
          <div className="flex items-center justify-between">
            <AdminLabel>Full System Prompt</AdminLabel>
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            >
              {showSystemPrompt ? (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Show
                </>
              )}
            </AdminButton>
          </div>
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            Auto-compiled from the fields above. Edit directly for advanced customization.
          </p>
          {showSystemPrompt && (
            <AdminTextarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={!isEditing}
              rows={16}
              className="font-mono text-xs"
            />
          )}
        </div>

        {/* Notes */}
        {isEditing && (
          <AdminFormField label="Notes" hint="Internal notes about this version">
            <AdminTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g., Updated for Fall 2025 campaign"
            />
          </AdminFormField>
        )}
      </AdminCardContent>
    </AdminCard>
  );
}

// Helper component for adding items to arrays
function AddItemInput({ 
  placeholder, 
  onAdd,
  fullWidth = false,
}: { 
  placeholder: string;
  onAdd: (value: string) => void;
  fullWidth?: boolean;
}) {
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
  };

  return (
    <div className={`flex items-center gap-1 ${fullWidth ? 'w-full' : ''}`}>
      <AdminInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`h-7 text-xs ${fullWidth ? 'flex-1' : 'w-36'}`}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
      />
      <AdminButton
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="h-7 w-7 p-0"
      >
        <Plus className="h-3 w-3" />
      </AdminButton>
    </div>
  );
}

// Compile system prompt from structured fields
function compileSystemPrompt(fields: {
  toneDescription: string;
  messagePillars: string[];
  writingRules: string[];
  antiPatterns: string[];
  captionLengthGuidance: string;
  hashtagGuidance: string;
  emojiGuidance: string;
}): string {
  const toneLines = fields.toneDescription
    .split(";")
    .map(t => `- ${t.trim()}`)
    .join("\n");

  const pillarLines = fields.messagePillars
    .map(p => `- ${p}`)
    .join("\n");

  const ruleLines = fields.writingRules
    .map(r => `- ${r}`)
    .join("\n");

  const antiLines = fields.antiPatterns
    .map(a => `- "${a}"`)
    .join(", ");

  return `You are the editorial voice for Cosmico (fka Cosmico): a gathering built for presence, connection, creativity, and natural rhythm.

Tone:
${toneLines}

Message pillars (choose and honor one):
${pillarLines}

Writing rules:
${ruleLines}

Avoid (anti-patterns):
${antiLines}

Output JSON ONLY with keys:
- caption: string (include line breaks as \\n)
- first_comment: string (either ${fields.hashtagGuidance || "4–8 hashtags"} OR one gentle question)
- alt_text: string (1–2 sentences)
- format_recommendation: "4:5" | "1:1" | "crop_sensitive"
- warnings: string[] (empty if none)`;
}
