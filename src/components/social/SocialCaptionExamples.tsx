import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle, AdminButton, AdminInput, AdminLabel, AdminBadge } from "@/components/admin";
import { AdminDialog, AdminDialogContent, AdminDialogHeader, AdminDialogTitle, AdminDialogTrigger } from "@/components/admin/AdminDialog";
import { Plus, Trash2, Sparkles, Quote, Info, Instagram, Loader2, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AdminScrollArea, AdminCheckbox } from "@/components/admin";

interface CaptionExample {
  id: string;
  example_caption: string;
  photo_context: string | null;
  created_at: string;
}

interface InstagramCaption {
  instagram_post_id: string;
  caption: string;
  word_count: number;
  has_emoji: boolean;
  has_hashtag: boolean;
  timestamp: string;
  permalink: string;
  media_type: string;
}

export function SocialCaptionExamples({ eventId }: { eventId?: string }) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    example_caption: "",
    photo_context: "",
  });

  // Import flow state
  const [isImporting, setIsImporting] = useState(false);
  const [importStats, setImportStats] = useState<any>(null);
  const [previewCaptions, setPreviewCaptions] = useState<InstagramCaption[]>([]);
  const [selectedCaptions, setSelectedCaptions] = useState<Set<string>>(new Set());
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchLimit, setFetchLimit] = useState(100);

  const { data: examples = [], isLoading } = useQuery({
    queryKey: ["social-caption-examples", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from("social_caption_examples")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CaptionExample[];
    },
    enabled: !!eventId,
  });

  const existingCaptions = new Set(examples.map(e => e.example_caption));

  const createMutation = useMutation({
    mutationFn: async (data: Omit<CaptionExample, "id" | "created_at">) => {
      const { error } = await supabase
        .from("social_caption_examples")
        .insert({
          ...data,
          event_id: eventId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-caption-examples", eventId] });
      toast.success("Example added");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add example");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("social_caption_examples")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-caption-examples", eventId] });
      toast.success("Example removed");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove example");
    },
  });

  const handleFetchFromInstagram = async () => {
    if (!eventId) {
      toast.error("Event ID is required");
      return;
    }

    setIsImporting(true);
    setImportStats(null);
    setPreviewCaptions([]);
    setSelectedCaptions(new Set());

    try {
      // Fetch without importing - just preview
      const { data, error } = await supabase.functions.invoke('fetch-instagram-captions', {
        body: { limit: fetchLimit, importToVoice: false, eventId }
      });

      if (error) throw error;

      if (data.success) {
        setImportStats(data.stats);
        // Filter out already imported captions and sort by recency (most recent first)
        const newCaptions = (data.captions as InstagramCaption[])
          .filter(c => !existingCaptions.has(c.caption))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        setPreviewCaptions(newCaptions);
        setIsPreviewMode(true);
        
        // Pre-select captions that match voice criteria (short, no hashtags)
        const autoSelect = new Set<string>();
        newCaptions.forEach(c => {
          if (c.word_count <= 15 && !c.has_hashtag) {
            autoSelect.add(c.instagram_post_id);
          }
        });
        setSelectedCaptions(autoSelect);
        
        toast.success(`Found ${newCaptions.length} new captions to review`);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Import error:', err);
      toast.error(err.message || 'Failed to fetch from Instagram');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportSelected = async () => {
    if (!eventId || selectedCaptions.size === 0) return;
    
    setIsSaving(true);
    
    try {
      const captionsToImport = previewCaptions
        .filter(c => selectedCaptions.has(c.instagram_post_id))
        .map(c => ({
          event_id: eventId,
          example_caption: c.caption,
          photo_context: `Imported from Instagram. Original: ${c.permalink}`
        }));
      
      const { error } = await supabase
        .from('social_caption_examples')
        .insert(captionsToImport);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["social-caption-examples", eventId] });
      toast.success(`Imported ${captionsToImport.length} captions`);
      setIsPreviewMode(false);
      setPreviewCaptions([]);
      setSelectedCaptions(new Set());
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Failed to save captions');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCaption = (id: string) => {
    setSelectedCaptions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCaptions(new Set(previewCaptions.map(c => c.instagram_post_id)));
  };

  const selectNone = () => {
    setSelectedCaptions(new Set());
  };

  const resetForm = () => {
    setFormData({
      example_caption: "",
      photo_context: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.example_caption.trim()) {
      toast.error("Please enter an example caption");
      return;
    }

    const words = formData.example_caption.trim().split(/\s+/);
    if (words.length > 9) {
      toast.error("Captions should be 3-9 words maximum");
      return;
    }

    createMutation.mutate({
      example_caption: formData.example_caption.trim(),
      photo_context: formData.photo_context.trim() || null,
    });
  };

  // Preview mode UI
  if (isPreviewMode) {
    return (
      <div className="space-y-4">
        <AdminCard>
          <AdminCardHeader className="flex flex-row items-center justify-between">
            <AdminCardTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5" />
              Select Captions to Import
            </AdminCardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[hsl(var(--admin-text-muted))]">
                {selectedCaptions.size} of {previewCaptions.length} selected
              </span>
              <AdminButton size="sm" variant="adminGhost" onClick={selectAll}>
                Select All
              </AdminButton>
              <AdminButton size="sm" variant="adminGhost" onClick={selectNone}>
                Clear
              </AdminButton>
            </div>
          </AdminCardHeader>
          <AdminCardContent>
            {importStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4 pb-4 border-b border-[hsl(var(--admin-border))]">
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Posts Fetched</p>
                  <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">{importStats.total_posts_fetched}</p>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">With Captions</p>
                  <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">{importStats.posts_with_captions}</p>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">Avg Words</p>
                  <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">{importStats.avg_word_count}</p>
                </div>
                <div>
                  <p className="text-[hsl(var(--admin-text-muted))]">New to Import</p>
                  <p className="text-lg font-semibold text-[hsl(var(--admin-accent))]">{previewCaptions.length}</p>
                </div>
              </div>
            )}

            <AdminScrollArea className="h-[600px] pr-4">
              <div className="space-y-2">
                {previewCaptions.map((caption) => (
                  <div
                    key={caption.instagram_post_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCaptions.has(caption.instagram_post_id)
                        ? 'border-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-accent)/0.1)]'
                        : 'border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-hover))]'
                    }`}
                    onClick={() => toggleCaption(caption.instagram_post_id)}
                  >
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <AdminCheckbox
                          checked={selectedCaptions.has(caption.instagram_post_id)}
                          onCheckedChange={() => toggleCaption(caption.instagram_post_id)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[hsl(var(--admin-text))] text-sm">
                          "{caption.caption}"
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <AdminBadge intent={caption.word_count <= 9 ? "success" : caption.word_count <= 15 ? "warning" : "danger"} size="sm">
                            {caption.word_count} words
                          </AdminBadge>
                          {caption.has_hashtag && (
                            <AdminBadge intent="warning" size="sm">has #</AdminBadge>
                          )}
                          {caption.has_emoji && (
                            <AdminBadge intent="neutral" size="sm">has emoji</AdminBadge>
                          )}
                          <span className="text-xs text-[hsl(var(--admin-text-subtle))]">
                            {new Date(caption.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: "America/Los_Angeles" })}
                          </span>
                          <span className="text-xs text-[hsl(var(--admin-text-subtle))]">
                            {caption.media_type}
                          </span>
                          <a
                            href={caption.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[hsl(var(--admin-accent))] hover:underline flex items-center gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AdminScrollArea>
          </AdminCardContent>
        </AdminCard>

        <div className="flex items-center justify-between">
          <AdminButton 
            variant="adminOutline" 
            onClick={() => {
              setIsPreviewMode(false);
              setPreviewCaptions([]);
              setSelectedCaptions(new Set());
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </AdminButton>
          <AdminButton 
            variant="admin" 
            onClick={handleImportSelected}
            disabled={selectedCaptions.size === 0 || isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Import {selectedCaptions.size} Selected
          </AdminButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Guidelines Card */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Caption Guidelines
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="space-y-3 text-sm text-[hsl(var(--admin-text-muted))]">
            <p>AI-generated captions will follow these rules:</p>
            <ul className="space-y-1.5 pl-4">
              <li>• <strong>3-9 words maximum</strong> — brevity is key</li>
              <li>• <strong>Calm, zen tone</strong> — evocative, not descriptive</li>
              <li>• <strong>No emojis, hashtags, or hype</strong></li>
              <li>• <strong>Silence is allowed</strong> — if the photo speaks for itself, no caption</li>
              <li>• <strong>If unsure, skip</strong> — AI will return no caption rather than force one</li>
            </ul>
            <p className="pt-2">
              Add examples below to train the AI on the organizer's voice and style.
            </p>
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Import Stats */}
      {importStats && !isPreviewMode && (
        <AdminCard>
          <AdminCardContent className="py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[hsl(var(--admin-text-muted))]">Posts Fetched</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">{importStats.total_posts_fetched}</p>
              </div>
              <div>
                <p className="text-[hsl(var(--admin-text-muted))]">With Captions</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">{importStats.posts_with_captions}</p>
              </div>
              <div>
                <p className="text-[hsl(var(--admin-text-muted))]">Avg Words</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-text))]">{importStats.avg_word_count}</p>
              </div>
              <div>
                <p className="text-[hsl(var(--admin-text-muted))]">Imported</p>
                <p className="text-lg font-semibold text-[hsl(var(--admin-accent))]">{importStats.imported_to_voice}</p>
              </div>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}

      {/* Examples Card */}
      <AdminCard>
        <AdminCardHeader className="flex flex-row items-center justify-between">
          <AdminCardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Voice Examples ({examples.length})
          </AdminCardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <AdminInput
                type="number"
                value={fetchLimit}
                onChange={(e) => setFetchLimit(Math.min(500, Math.max(10, parseInt(e.target.value) || 100)))}
                className="w-20 h-8 text-sm"
                min={10}
                max={500}
              />
              <span className="text-xs text-[hsl(var(--admin-text-muted))]">posts</span>
            </div>
            <AdminButton 
              size="sm" 
              variant="adminOutline" 
              onClick={handleFetchFromInstagram}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Instagram className="h-4 w-4 mr-1" />
              )}
              {isImporting ? "Fetching..." : "Import from Instagram"}
            </AdminButton>
            <AdminDialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <AdminDialogTrigger asChild>
                <AdminButton size="sm" variant="admin">
                <Plus className="h-4 w-4 mr-1" />
                Add Example
              </AdminButton>
            </AdminDialogTrigger>
            <AdminDialogContent>
              <AdminDialogHeader>
                <AdminDialogTitle>Add Caption Example</AdminDialogTitle>
              </AdminDialogHeader>
              <div className="space-y-4 mt-4">
                <p className="text-sm text-[hsl(var(--admin-text-muted))]">
                  Add real captions that capture the organizer's voice. The AI will learn from these examples.
                </p>

                <div>
                  <AdminLabel required>Caption (3-9 words)</AdminLabel>
                  <AdminInput
                    value={formData.example_caption}
                    onChange={(e) => setFormData({ ...formData, example_caption: e.target.value })}
                    placeholder="e.g., Golden hour between the oaks"
                    className="mt-1"
                  />
                  <p className="text-xs text-[hsl(var(--admin-text-subtle))] mt-1">
                    {formData.example_caption.trim().split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>

                <div>
                  <AdminLabel>Photo Context (optional)</AdminLabel>
                  <AdminInput
                    value={formData.photo_context}
                    onChange={(e) => setFormData({ ...formData, photo_context: e.target.value })}
                    placeholder="e.g., Landscape at sunset, crowd dancing, campfire at night"
                    className="mt-1"
                  />
                  <p className="text-xs text-[hsl(var(--admin-text-subtle))] mt-1">
                    Helps the AI understand when to use this style
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <AdminButton variant="adminGhost" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </AdminButton>
                  <AdminButton variant="admin" onClick={handleSubmit}>
                    Add Example
                  </AdminButton>
                </div>
              </div>
            </AdminDialogContent>
          </AdminDialog>
          </div>
        </AdminCardHeader>
        <AdminCardContent>
          {isLoading ? (
            <div className="py-8 text-center text-[hsl(var(--admin-text-muted))]">Loading...</div>
          ) : examples.length === 0 ? (
            <div className="py-12 text-center text-[hsl(var(--admin-text-muted))]">
              <Quote className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No voice examples yet</p>
              <p className="text-sm mt-1 max-w-xs mx-auto">
                Add 5-10 example captions that capture the organizer's writing style for best results
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {examples.map((example) => (
                <div
                  key={example.id}
                  className="p-4 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-[hsl(var(--admin-text))] font-medium">
                        "{example.example_caption}"
                      </p>
                      {example.photo_context && (
                        <p className="text-sm text-[hsl(var(--admin-text-muted))] mt-1">
                          Context: {example.photo_context}
                        </p>
                      )}
                    </div>
                    <AdminButton
                      size="icon"
                      variant="adminGhost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        if (confirm("Remove this example?")) {
                          deleteMutation.mutate(example.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </AdminButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>
    </div>
  );
}
