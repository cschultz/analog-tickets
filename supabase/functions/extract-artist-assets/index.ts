import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dropboxFetch } from "../_shared/dropbox-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supported file extensions
const SUPPORTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', // Images
  '.mp3', '.wav', '.flac', '.m4a', '.aac', // Audio
  '.mp4', '.mov', '.avi', '.webm', // Video
  '.pdf', '.doc', '.docx', '.txt', // Documents
  '.zip', '.rar' // Archives
];

// Detect link type
function detectLinkType(url: string): 'dropbox' | 'google_drive' | 'direct_url' | 'unknown' {
  if (url.includes('dropbox.com') || url.includes('dl.dropboxusercontent.com')) {
    return 'dropbox';
  }
  if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
    return 'google_drive';
  }
  // Check if it's a direct file URL
  const lowerUrl = url.toLowerCase();
  if (SUPPORTED_EXTENSIONS.some(ext => lowerUrl.includes(ext))) {
    return 'direct_url';
  }
  return 'unknown';
}

// Extract Google Drive file ID from various URL formats
function extractGoogleDriveFileId(url: string): string | null {
  // Format: https://drive.google.com/file/d/FILE_ID/view
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  
  // Format: https://drive.google.com/open?id=FILE_ID
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  
  // Format: https://drive.google.com/uc?export=download&id=FILE_ID
  const ucMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];
  
  return null;
}

// Convert Dropbox share link to direct download
function getDropboxDirectUrl(url: string): string {
  // Replace ?dl=0 or ?dl=1 with ?dl=1 for direct download
  let directUrl = url.replace(/\?dl=0/, '?dl=1');
  if (!directUrl.includes('?dl=1')) {
    directUrl = directUrl + (directUrl.includes('?') ? '&dl=1' : '?dl=1');
  }
  // Also handle www.dropbox.com -> dl.dropboxusercontent.com
  return directUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
}

// Extract filename from URL or Content-Disposition
function extractFilename(url: string, headers: Headers): string {
  // Try Content-Disposition first
  const disposition = headers.get('content-disposition');
  if (disposition) {
    const filenameMatch = disposition.match(/filename[*]?=['"]?(?:UTF-8'')?([^'";]+)/i);
    if (filenameMatch) {
      return decodeURIComponent(filenameMatch[1]);
    }
  }
  
  // Fall back to URL path
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.includes('.')) {
      return decodeURIComponent(lastSegment);
    }
  } catch {
    // Ignore URL parsing errors
  }
  
  // Generate a filename
  const timestamp = Date.now();
  return `asset-${timestamp}`;
}

// Download file from URL
async function downloadFile(url: string, linkType: string): Promise<{ data: ArrayBuffer; filename: string; mimeType: string } | null> {
  try {
    let fetchUrl = url;
    let response: Response;
    
    if (linkType === 'dropbox') {
      fetchUrl = getDropboxDirectUrl(url);
      // Use authenticated Dropbox fetch for private links
      if (url.includes('dl.dropboxusercontent.com') || !url.includes('?')) {
        response = await dropboxFetch(fetchUrl);
      } else {
        response = await fetch(fetchUrl, { redirect: 'follow' });
      }
    } else if (linkType === 'google_drive') {
      const fileId = extractGoogleDriveFileId(url);
      if (!fileId) {
        console.error('Could not extract Google Drive file ID from:', url);
        return null;
      }
      // Use the export URL for direct download
      fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      response = await fetch(fetchUrl, { redirect: 'follow' });
    } else {
      response = await fetch(fetchUrl, { redirect: 'follow' });
    }
    
    if (!response.ok) {
      console.error(`Failed to download ${url}: ${response.status}`);
      return null;
    }
    
    const data = await response.arrayBuffer();
    const filename = extractFilename(fetchUrl, response.headers);
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    
    return { data, filename, mimeType };
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
    return null;
  }
}

// Extract URLs from email body
function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  const matches = text.match(urlPattern) || [];
  
  // Filter to supported link types
  return matches.filter(url => {
    const linkType = detectLinkType(url);
    return linkType !== 'unknown';
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      artist_id, 
      urls, 
      attachments,
      source_email_id 
    } = await req.json();

    if (!artist_id) {
      return new Response(
        JSON.stringify({ error: "artist_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { success: boolean; filename?: string; error?: string; source_type: string }[] = [];

    // Process provided URLs
    if (urls && Array.isArray(urls)) {
      for (const url of urls) {
        const linkType = detectLinkType(url);
        if (linkType === 'unknown') {
          results.push({ success: false, error: `Unsupported URL: ${url}`, source_type: 'unknown' });
          continue;
        }

        console.log(`Processing ${linkType} URL: ${url}`);
        const file = await downloadFile(url, linkType);
        
        if (!file) {
          results.push({ success: false, error: `Failed to download: ${url}`, source_type: linkType });
          continue;
        }

        // Upload to Supabase Storage
        const filePath = `${artist_id}/${Date.now()}-${file.filename}`;
        const { error: uploadError } = await supabase.storage
          .from('artist-assets')
          .upload(filePath, file.data, {
            contentType: file.mimeType,
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          results.push({ success: false, error: uploadError.message, source_type: linkType });
          continue;
        }

        // Create database record
        const { error: dbError } = await supabase
          .from('artist_assets')
          .insert({
            artist_id,
            file_name: file.filename,
            file_path: filePath,
            file_size: file.data.byteLength,
            mime_type: file.mimeType,
            source_type: linkType,
            source_url: url,
            source_email_id
          });

        if (dbError) {
          console.error('DB error:', dbError);
          results.push({ success: false, error: dbError.message, source_type: linkType });
        } else {
          results.push({ success: true, filename: file.filename, source_type: linkType });
        }
      }
    }

    // Process attachments (base64 from Resend or file_path from storage)
    if (attachments && Array.isArray(attachments)) {
      for (const attachment of attachments) {
        const { filename, content, content_type, file_path: storedPath } = attachment;
        
        if (!filename) {
          results.push({ success: false, error: 'Invalid attachment - missing filename', source_type: 'email_attachment' });
          continue;
        }

        try {
          let fileData: Uint8Array;
          let mimeType = content_type || 'application/octet-stream';

          if (storedPath) {
            // Attachment already uploaded to email-attachments bucket - copy to artist-assets
            console.log(`Copying from email-attachments: ${storedPath}`);
            const { data: downloadData, error: downloadError } = await supabase.storage
              .from('email-attachments')
              .download(storedPath);

            if (downloadError || !downloadData) {
              console.error(`Failed to download from storage: ${storedPath}`, downloadError);
              results.push({ success: false, error: `Failed to read stored file: ${storedPath}`, source_type: 'email_attachment' });
              continue;
            }

            const arrayBuffer = await downloadData.arrayBuffer();
            fileData = new Uint8Array(arrayBuffer);
            mimeType = downloadData.type || mimeType;
          } else if (content) {
            // Decode base64 content
            const binaryString = atob(content);
            fileData = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              fileData[i] = binaryString.charCodeAt(i);
            }
          } else {
            results.push({ success: false, error: 'Invalid attachment - missing content or file_path', source_type: 'email_attachment' });
            continue;
          }

          const filePath = `${artist_id}/${Date.now()}-${filename}`;
          const { error: uploadError } = await supabase.storage
            .from('artist-assets')
            .upload(filePath, fileData, {
              contentType: mimeType,
              upsert: false
            });

          if (uploadError) {
            results.push({ success: false, error: uploadError.message, source_type: 'email_attachment' });
            continue;
          }

          const { error: dbError } = await supabase
            .from('artist_assets')
            .insert({
              artist_id,
              file_name: filename,
              file_path: filePath,
              file_size: fileData.length,
              mime_type: mimeType,
              source_type: 'email_attachment',
              source_email_id
            });

          if (dbError) {
            results.push({ success: false, error: dbError.message, source_type: 'email_attachment' });
          } else {
            results.push({ success: true, filename, source_type: 'email_attachment' });
          }
        } catch (e) {
          console.error(`Error processing attachment ${filename}:`, e);
          results.push({ success: false, error: `Failed to process attachment: ${filename}`, source_type: 'email_attachment' });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Processed ${successCount} assets successfully, ${failCount} failed`,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error extracting artist assets:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
