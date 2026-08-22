import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { path = "" } = await req.json();

    // Use list_folder endpoint to get contents
    const response = await dropboxFetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: path || "",
        recursive: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
        include_mounted_folders: true,
        include_non_downloadable_files: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Dropbox API error:", errorText);
      throw new Error(`Dropbox API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter to only folders and format the response
    const folders = data.entries
      .filter((entry: any) => entry[".tag"] === "folder")
      .map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        path: folder.path_display,
        path_lower: folder.path_lower,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    // Count images in current path for display
    const imageCount = data.entries.filter((entry: any) => {
      if (entry[".tag"] !== "file") return false;
      const name = entry.name.toLowerCase();
      return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp");
    }).length;

    return new Response(
      JSON.stringify({ 
        folders, 
        imageCount,
        hasMore: data.has_more,
        currentPath: path || "/",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error listing Dropbox folders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
