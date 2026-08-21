// Artist images are stored in src/assets/may/artists/
// Named as lowercase kebab-case: "Artist Name" -> "artist-name.jpg"
const artistImages = import.meta.glob('/src/assets/may/artists/*.{jpg,jpeg,png,webp}', { 
  eager: true, 
  import: 'default' 
}) as Record<string, string>;

/**
 * Convert artist name to expected image filename
 * "Starboro" -> "starboro"
 * "Fire-Breathing Panther" -> "fire-breathing-panther"
 */
function getArtistImageKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .trim();
}

/**
 * Find the artist image from the imported assets
 */
export function getArtistImageUrl(artistName: string): string | null {
  if (!artistName) return null;
  
  const key = getArtistImageKey(artistName);
  
  // Try to find matching image
  for (const [path, url] of Object.entries(artistImages)) {
    const filename = path.split('/').pop()?.replace(/\.(jpg|jpeg|png|webp)$/i, '') || '';
    if (filename.toLowerCase() === key) {
      return url;
    }
  }
  
  return null;
}

/**
 * Hook-style export for convenience
 */
export function useArtistImage(artistName: string): string | null {
  return getArtistImageUrl(artistName);
}
