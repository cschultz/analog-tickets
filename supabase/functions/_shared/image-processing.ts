/**
 * Image Processing Utilities
 * Handles downloading, resizing, and uploading images to Supabase Storage
 */

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
} from "https://deno.land/x/imagemagick_deno@0.0.14/mod.ts";

// Thumbnail: 400px for fast grid browsing
export const THUMBNAIL_SIZE = 400;
// Preview: 1080px for detail view and AI vision (Instagram max)
export const PREVIEW_SIZE = 1080;
// JPEG quality for both sizes
export const JPEG_QUALITY = 85;

let magickInitialized = false;

async function ensureMagickInitialized() {
  if (!magickInitialized) {
    await initializeImageMagick();
    magickInitialized = true;
    console.log("[IMAGE] ImageMagick initialized");
  }
}

export interface ResizeResult {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Resize an image to fit within maxDimension while maintaining aspect ratio
 */
export async function resizeImage(
  imageData: Uint8Array,
  maxDimension: number
): Promise<ResizeResult> {
  await ensureMagickInitialized();

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(imageData, (img) => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        let newWidth = originalWidth;
        let newHeight = originalHeight;

        // Only resize if larger than max dimension
        if (originalWidth > maxDimension || originalHeight > maxDimension) {
          if (originalWidth > originalHeight) {
            newWidth = maxDimension;
            newHeight = Math.round((originalHeight / originalWidth) * maxDimension);
          } else {
            newHeight = maxDimension;
            newWidth = Math.round((originalWidth / originalHeight) * maxDimension);
          }

          const geometry = new MagickGeometry(newWidth, newHeight);
          geometry.ignoreAspectRatio = false;
          img.resize(geometry);
        }

        img.quality = JPEG_QUALITY;

        img.write((data) => {
          resolve({
            data,
            width: newWidth,
            height: newHeight,
          });
        }, MagickFormat.Jpeg);
      });
    } catch (error) {
      console.error("[IMAGE] Resize error:", error);
      reject(error);
    }
  });
}

/**
 * Generate both thumbnail and preview from a single image download
 */
export async function generateImageVariants(
  imageData: Uint8Array
): Promise<{
  thumbnail: ResizeResult;
  preview: ResizeResult;
  originalWidth: number;
  originalHeight: number;
}> {
  await ensureMagickInitialized();

  return new Promise((resolve, reject) => {
    try {
      ImageMagick.read(imageData, (img) => {
        const originalWidth = img.width;
        const originalHeight = img.height;

        // Generate preview (1080px)
        let previewWidth = originalWidth;
        let previewHeight = originalHeight;
        
        if (originalWidth > PREVIEW_SIZE || originalHeight > PREVIEW_SIZE) {
          if (originalWidth > originalHeight) {
            previewWidth = PREVIEW_SIZE;
            previewHeight = Math.round((originalHeight / originalWidth) * PREVIEW_SIZE);
          } else {
            previewHeight = PREVIEW_SIZE;
            previewWidth = Math.round((originalWidth / originalHeight) * PREVIEW_SIZE);
          }
        }

        // Clone for preview
        img.quality = JPEG_QUALITY;
        
        // Create preview first
        const previewGeometry = new MagickGeometry(previewWidth, previewHeight);
        previewGeometry.ignoreAspectRatio = false;
        
        // We need to clone for thumbnail since resize is destructive
        let previewData: Uint8Array | null = null;
        let thumbnailData: Uint8Array | null = null;
        
        // Resize to preview size
        if (originalWidth > PREVIEW_SIZE || originalHeight > PREVIEW_SIZE) {
          img.resize(previewGeometry);
        }
        
        img.write((data) => {
          previewData = data;
          
          // Now resize further to thumbnail
          let thumbnailWidth = previewWidth;
          let thumbnailHeight = previewHeight;
          
          if (previewWidth > THUMBNAIL_SIZE || previewHeight > THUMBNAIL_SIZE) {
            if (previewWidth > previewHeight) {
              thumbnailWidth = THUMBNAIL_SIZE;
              thumbnailHeight = Math.round((previewHeight / previewWidth) * THUMBNAIL_SIZE);
            } else {
              thumbnailHeight = THUMBNAIL_SIZE;
              thumbnailWidth = Math.round((previewWidth / previewHeight) * THUMBNAIL_SIZE);
            }
            
            const thumbnailGeometry = new MagickGeometry(thumbnailWidth, thumbnailHeight);
            thumbnailGeometry.ignoreAspectRatio = false;
            img.resize(thumbnailGeometry);
          }
          
          img.write((data) => {
            thumbnailData = data;
            
            resolve({
              thumbnail: {
                data: thumbnailData,
                width: thumbnailWidth,
                height: thumbnailHeight,
              },
              preview: {
                data: previewData!,
                width: previewWidth,
                height: previewHeight,
              },
              originalWidth,
              originalHeight,
            });
          }, MagickFormat.Jpeg);
        }, MagickFormat.Jpeg);
      });
    } catch (error) {
      console.error("[IMAGE] Generate variants error:", error);
      reject(error);
    }
  });
}
