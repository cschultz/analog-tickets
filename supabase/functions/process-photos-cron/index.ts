import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

const BATCH_SIZE = 10;

/**
 * Cron-triggered photo processor.
 * Processes one batch per invocation; auto-unschedules when done.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Find the event with pending photos
    const { data: pendingEvent } = await supabase
      .from("social_photos")
      .select("event_id")
      .in("sync_status", ["pending", "failed"])
      .limit(1)
      .maybeSingle();

    if (!pendingEvent) {
      // No pending photos — unschedule the cron job
      console.log("[CRON] No pending photos. Unscheduling cron job.");
      try {
        await supabase.rpc("unschedule_photo_cron");
      } catch (e) {
        console.error("[CRON] Failed to unschedule:", e);
      }
      return new Response(JSON.stringify({ done: true, message: "No pending photos, cron unscheduled" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const eventId = pendingEvent.event_id;

    // Get batch
    const { data: photos, error: fetchError } = await supabase
      .from("social_photos")
      .select("id, dropbox_path, file_name, temporary_url, url_expires_at, event_id, public_image_url")
      .eq("event_id", eventId)
      .in("sync_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw new Error(fetchError.message);
    if (!photos || photos.length === 0) {
      return new Response(JSON.stringify({ done: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const photo of photos) {
      try {
        // Skip if already in storage
        if (photo.public_image_url?.includes("supabase.co/storage")) {
          await supabase
            .from("social_photos")
            .update({ storage_url: photo.public_image_url, sync_status: "complete", sync_error: null })
            .eq("id", photo.id);
          processed++;
          continue;
        }

        await supabase
          .from("social_photos")
          .update({ sync_status: "processing" })
          .eq("id", photo.id);

        // Get fresh download URL if needed
        let downloadUrl = photo.temporary_url;
        const urlExpired = !photo.url_expires_at || new Date(photo.url_expires_at) < new Date();

        if (!downloadUrl || urlExpired) {
          if (!photo.dropbox_path) throw new Error("No dropbox_path");
          const linkRes = await dropboxFetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: photo.dropbox_path }),
          });
          if (!linkRes.ok) {
            const statusCode = linkRes.status;
            if (statusCode === 409) {
              // File moved/deleted/locked in Dropbox — skip it, don't retry
              console.warn(`[CRON] ⚠ ${photo.file_name}: Dropbox 409 (file unavailable) — skipping`);
              await supabase
                .from("social_photos")
                .update({ sync_status: "complete", sync_error: `Dropbox 409: file unavailable at path`, storage_status: "skipped" })
                .eq("id", photo.id);
              processed++;
              continue;
            }
            throw new Error(`Dropbox link: ${statusCode}`);
          }
          const { link } = await linkRes.json();
          downloadUrl = link;

          await supabase
            .from("social_photos")
            .update({
              temporary_url: link,
              url_expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
            })
            .eq("id", photo.id);
        }

        // Download
        const imgRes = await fetch(downloadUrl);
        if (!imgRes.ok) throw new Error(`Download: ${imgRes.status}`);
        const imageData = new Uint8Array(await imgRes.arrayBuffer());

        // Content type
        const ext = (photo.file_name || "").toLowerCase();
        let contentType = "image/jpeg";
        if (ext.endsWith(".png")) contentType = "image/png";
        else if (ext.endsWith(".webp")) contentType = "image/webp";

        // Upload to storage
        const storagePath = `${eventId}/${photo.id}-${photo.file_name || "photo.jpg"}`;
        const { error: uploadError } = await supabase.storage
          .from("social-photos")
          .upload(storagePath, imageData, { contentType, upsert: true });

        if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from("social-photos")
          .getPublicUrl(storagePath);

        await supabase
          .from("social_photos")
          .update({
            public_image_url: urlData.publicUrl,
            storage_url: urlData.publicUrl,
            storage_path: storagePath,
            storage_status: "complete",
            sync_status: "complete",
            sync_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", photo.id);

        processed++;
        console.log(`[CRON] ✓ ${photo.file_name}`);
      } catch (err) {
        failed++;
        console.error(`[CRON] ✗ ${photo.file_name}:`, err);
        await supabase
          .from("social_photos")
          .update({ sync_status: "failed", sync_error: String(err) })
          .eq("id", photo.id);
      }
    }

    // Check remaining
    const { count: remaining } = await supabase
      .from("social_photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("sync_status", ["pending", "failed"]);

    console.log(`[CRON] Batch done: ${processed} ok, ${failed} failed, ${remaining} remaining`);

    // Auto-unschedule if done
    if ((remaining || 0) === 0) {
      console.log("[CRON] All photos processed! Unscheduling cron job.");
      try {
        await supabase.rpc("unschedule_photo_cron");
      } catch (e) {
        console.error("[CRON] Failed to unschedule:", e);
      }
    }

    return new Response(
      JSON.stringify({ processed, failed, remaining, done: (remaining || 0) === 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[CRON] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
