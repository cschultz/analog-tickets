import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Pencil, Trash2, Star, Download, Copy, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminButton,
  AdminInput,
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent,
  AdminBadge,
  AdminEmptyState,
} from "@/components/admin/AdminUI";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { AdminLabel, AdminTextarea } from "@/components/admin/AdminFormPrimitives";
import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { toast } from "sonner";
import { getPrimaryEventId } from "@/platform/config/eventIds";

const EVENT_ID = getPrimaryEventId();
const COVER_BUCKET = "event-photo-covers";
const MAX_COVERS = 5;

type PhotoLink = {
  id: string;
  photographer_name: string;
  instagram_handle: string | null;
  description: string | null;
  posting_credit_note: string | null;
  url: string;
  cover_images: string[];
  sort_order: number;
  is_published: boolean;
};

type Reflection = {
  id: string;
  email: string;
  ticket_holder_name: string | null;
  reflection_text: string;
  is_favorite: boolean;
  submitted_at: string;
  updated_at: string;
};

const emptyLink: Omit<PhotoLink, "id"> = {
  photographer_name: "",
  instagram_handle: "",
  description: "",
  posting_credit_note: "",
  url: "",
  cover_images: [],
  sort_order: 0,
  is_published: true,
};

export default function EventPhotos() {
  const qc = useQueryClient();
  const [editingLink, setEditingLink] = useState<PhotoLink | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<Omit<PhotoLink, "id">>(emptyLink);
  const [coverText, setCoverText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reflectionSearch, setReflectionSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ["event_photo_links", EVENT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_photo_links")
        .select("*")
        .eq("event_id", EVENT_ID)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as PhotoLink[];
    },
  });

  const { data: reflections = [], isLoading: reflLoading } = useQuery({
    queryKey: ["event_reflections", EVENT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_reflections")
        .select("*")
        .eq("event_id", EVENT_ID)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Reflection[];
    },
  });

  const openNew = () => {
    setIsNew(true);
    setEditingLink(null);
    setForm({ ...emptyLink, sort_order: links.length });
    setCoverText("");
  };

  const openEdit = (link: PhotoLink) => {
    setIsNew(false);
    setEditingLink(link);
    setForm({
      photographer_name: link.photographer_name,
      instagram_handle: link.instagram_handle ?? "",
      description: link.description ?? "",
      posting_credit_note: link.posting_credit_note ?? "",
      url: link.url,
      cover_images: link.cover_images || [],
      sort_order: link.sort_order,
      is_published: link.is_published,
    });
    setCoverText((link.cover_images || []).join("\n"));
  };

  const closeDialog = () => {
    setIsNew(false);
    setEditingLink(null);
  };

  const normalizeHandle = (h: string) => {
    const v = h.trim();
    if (!v) return null;
    return v.startsWith("@") ? v : `@${v}`;
  };

  const saveLink = async () => {
    if (!form.photographer_name.trim() || !form.url.trim()) {
      toast.error("Photographer name and URL are required.");
      return;
    }
    // Merge typed URLs + uploaded covers (form.cover_images)
    const typed = coverText.split("\n").map((s) => s.trim()).filter(Boolean);
    const covers = Array.from(new Set([...form.cover_images, ...typed])).slice(0, MAX_COVERS);
    const payload = {
      event_id: EVENT_ID,
      photographer_name: form.photographer_name.trim(),
      instagram_handle: normalizeHandle(form.instagram_handle ?? ""),
      description: form.description?.trim() || null,
      posting_credit_note: form.posting_credit_note?.trim() || null,
      url: form.url.trim(),
      cover_images: covers,
      sort_order: form.sort_order,
      is_published: form.is_published,
    };
    if (isNew) {
      const { error } = await supabase.from("event_photo_links").insert(payload);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Photographer added.");
    } else if (editingLink) {
      const { error } = await supabase
        .from("event_photo_links")
        .update(payload)
        .eq("id", editingLink.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Saved.");
    }
    qc.invalidateQueries({ queryKey: ["event_photo_links", EVENT_ID] });
    closeDialog();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("event_photo_links").delete().eq("id", deleteId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Deleted.");
      qc.invalidateQueries({ queryKey: ["event_photo_links", EVENT_ID] });
    }
    setDeleteId(null);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUploadCovers = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const slug = (form.photographer_name.trim() || "photographer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const remaining = MAX_COVERS - form.cover_images.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) {
      toast.error(`Max ${MAX_COVERS} cover images.`);
      return;
    }
    setUploading(true);
    const uploadedUrls: string[] = [];
    for (const file of toUpload) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${EVENT_ID}/${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(COVER_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error(`Upload failed: ${error.message}`);
        continue;
      }
      const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }
    setForm((f) => ({ ...f, cover_images: [...f.cover_images, ...uploadedUrls].slice(0, MAX_COVERS) }));
    setUploading(false);
    if (uploadedUrls.length > 0) toast.success(`Uploaded ${uploadedUrls.length} image${uploadedUrls.length > 1 ? "s" : ""}.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeCover = (idx: number) => {
    setForm((f) => ({ ...f, cover_images: f.cover_images.filter((_, i) => i !== idx) }));
  };


  const toggleFavorite = async (r: Reflection) => {
    const { error } = await supabase
      .from("event_reflections")
      .update({ is_favorite: !r.is_favorite })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["event_reflections", EVENT_ID] });
  };

  const copyQuote = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied.");
  };

  const exportCSV = () => {
    const rows = [
      ["Submitted", "Email", "Name", "Favorite", "Reflection"],
      ...filteredReflections.map((r) => [
        new Date(r.submitted_at).toISOString(),
        r.email,
        r.ticket_holder_name ?? "",
        r.is_favorite ? "yes" : "",
        r.reflection_text.replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analog-commons-2026-reflections.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredReflections = reflections.filter((r) => {
    if (favoritesOnly && !r.is_favorite) return false;
    const q = reflectionSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      r.email.toLowerCase().includes(q) ||
      (r.ticket_holder_name ?? "").toLowerCase().includes(q) ||
      r.reflection_text.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Event Photos"
        subtitle="Manage photographer galleries and view attendee reflections"
        icon={Camera}
      />

      <AdminTabs defaultValue="links">
        <AdminTabsList className="grid w-full grid-cols-2 max-w-md">
          <AdminTabsTrigger value="links">Photographer Links</AdminTabsTrigger>
          <AdminTabsTrigger value="reflections">
            Reflections{" "}
            <AdminBadge className="ml-2">{reflections.length}</AdminBadge>
          </AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="links" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <AdminButton variant="admin" onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" /> Add photographer
            </AdminButton>
          </div>

          {linksLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : links.length === 0 ? (
            <AdminEmptyState
              icon={<Camera className="w-7 h-7" />}
              title="No photographers yet"
              description="Add a photographer's gallery link to get started."
            />
          ) : (
            <div className="grid gap-3">
              {links.map((link) => (
                <AdminCard key={link.id}>
                  <AdminCardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex gap-1 flex-shrink-0">
                        {(link.cover_images || []).slice(0, 3).map((src, i) => (
                          <div
                            key={i}
                            className="w-12 h-12 rounded bg-muted bg-cover bg-center"
                            style={{ backgroundImage: `url(${src})` }}
                          />
                        ))}
                        {(!link.cover_images || link.cover_images.length === 0) && (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <Camera className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-base">{link.photographer_name}</h3>
                          {link.instagram_handle && (
                            <span className="text-xs text-muted-foreground">{link.instagram_handle}</span>
                          )}
                          {!link.is_published && <AdminBadge>Hidden</AdminBadge>}
                        </div>
                        {link.description && (
                          <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
                        )}
                        {link.posting_credit_note && (
                          <p className="text-xs mt-1 px-2 py-1 rounded bg-[hsl(var(--admin-warning)/0.12)] text-[hsl(var(--admin-warning))] inline-block">
                            Posting note: {link.posting_credit_note}
                          </p>
                        )}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline mt-1 block truncate max-w-full"
                        >
                          {link.url}
                        </a>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <AdminButton variant="ghost" size="sm" onClick={() => openEdit(link)}>
                          <Pencil className="w-4 h-4" />
                        </AdminButton>
                        <AdminButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(link.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </AdminButton>
                      </div>
                    </div>
                  </AdminCardContent>
                </AdminCard>
              ))}
            </div>
          )}
        </AdminTabsContent>

        <AdminTabsContent value="reflections" className="mt-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <AdminInput
              placeholder="Search reflections, names, emails…"
              value={reflectionSearch}
              onChange={(e) => setReflectionSearch(e.target.value)}
              className="max-w-sm"
            />
            <AdminButton
              variant={favoritesOnly ? "admin" : "outline"}
              size="sm"
              onClick={() => setFavoritesOnly((v) => !v)}
            >
              <Star className="w-4 h-4 mr-2" />
              Favorites only
            </AdminButton>
            <AdminButton variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </AdminButton>
          </div>

          {reflLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : filteredReflections.length === 0 ? (
            <AdminEmptyState
              icon={<Camera className="w-7 h-7" />}
              title="No reflections yet"
              description="Reflections appear here as attendees submit them."
            />
          ) : (
            <div className="grid gap-3">
              {filteredReflections.map((r) => (
                <AdminCard key={r.id}>
                  <AdminCardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(r)}
                        className="flex-shrink-0 mt-1"
                        aria-label="Toggle favorite"
                      >
                        <Star
                          className={`w-5 h-5 transition-colors ${
                            r.is_favorite
                              ? "fill-[hsl(var(--admin-warning))] text-[hsl(var(--admin-warning))]"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <span className="font-medium text-foreground">
                            {r.ticket_holder_name || r.email}
                          </span>
                          <span>·</span>
                          <span>{r.email}</span>
                          <span>·</span>
                          <span>{new Date(r.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {r.reflection_text}
                        </p>
                      </div>
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        onClick={() => copyQuote(r.reflection_text)}
                      >
                        <Copy className="w-4 h-4" />
                      </AdminButton>
                    </div>
                  </AdminCardContent>
                </AdminCard>
              ))}
            </div>
          )}
        </AdminTabsContent>
      </AdminTabs>

      <AdminDialog open={isNew || !!editingLink} onOpenChange={(o) => !o && closeDialog()}>
        <AdminDialogContent className="max-w-lg">
          <AdminDialogHeader>
            <AdminDialogTitle>{isNew ? "Add photographer" : "Edit photographer"}</AdminDialogTitle>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div>
              <AdminLabel>Photographer name</AdminLabel>
              <AdminInput
                value={form.photographer_name}
                onChange={(e) => setForm({ ...form, photographer_name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <AdminLabel>Instagram handle (optional)</AdminLabel>
              <AdminInput
                value={form.instagram_handle ?? ""}
                onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })}
                placeholder="@boatrightphotos"
              />
            </div>
            <div>
              <AdminLabel>Description (optional, shown publicly)</AdminLabel>
              <AdminTextarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="A few words about the gallery…"
                rows={2}
              />
            </div>
            <div>
              <AdminLabel>Posting credit note (internal — staff only)</AdminLabel>
              <AdminTextarea
                value={form.posting_credit_note ?? ""}
                onChange={(e) => setForm({ ...form, posting_credit_note: e.target.value })}
                placeholder="e.g. Tag @boatrightphotos when posting any of these photos."
                rows={2}
              />
            </div>
            <div>
              <AdminLabel>Gallery URL (Dropbox / Drive)</AdminLabel>
              <AdminInput
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div>
              <AdminLabel>Cover images (up to {MAX_COVERS})</AdminLabel>
              {form.cover_images.length > 0 && (
                <div className="grid grid-cols-5 gap-2 mb-2">
                  {form.cover_images.map((src, i) => (
                    <div key={i} className="relative group aspect-square rounded overflow-hidden bg-muted">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <AdminButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCover(i)}
                        className="absolute top-1 right-1 h-6 w-6 p-0 bg-background/80 hover:bg-background"
                      >
                        <X className="w-3 h-3" />
                      </AdminButton>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadCovers(e.target.files)}
                />
                <AdminButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || form.cover_images.length >= MAX_COVERS}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? "Uploading…" : "Upload images"}
                </AdminButton>
                <span className="text-xs text-muted-foreground">
                  {form.cover_images.length}/{MAX_COVERS}
                </span>
              </div>
              <AdminTextarea
                value={coverText}
                onChange={(e) => setCoverText(e.target.value)}
                placeholder="…or paste external image URLs (one per line)"
                rows={2}
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <AdminLabel>Sort order</AdminLabel>
                <AdminInput
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: parseInt(e.target.value || "0", 10) })
                  }
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    className="rounded"
                  />
                  Published
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <AdminButton variant="outline" onClick={closeDialog}>
                Cancel
              </AdminButton>
              <AdminButton variant="admin" onClick={saveLink}>
                {isNew ? "Add" : "Save"}
              </AdminButton>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>

      <AdminConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete photographer link?"
        description="This will remove the gallery link from /photos. Cannot be undone."
        actionLabel="Delete"
        actionType="destructive"
        icon="delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
