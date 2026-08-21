import { useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLORS, heavyGrain, halftonePatternDense } from '@/styles/may-theme';

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

interface ArtistThumbnailProps {
  artistName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Small circular thumbnail for artist row
 */
export function ArtistThumbnail({ artistName, size = 'md', className }: ArtistThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = getArtistImageUrl(artistName);
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  if (!imageUrl || hasError) {
    return (
      <div 
        className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0',
          sizeClasses[size],
          className
        )}
        style={{ backgroundColor: `${COLORS.denim}20` }}
      >
        <User className="w-1/2 h-1/2" style={{ color: COLORS.denim, opacity: 0.5 }} />
      </div>
    );
  }
  
  return (
    <div 
      className={cn(
        'rounded-full overflow-hidden flex-shrink-0',
        sizeClasses[size],
        className
      )}
    >
      <img 
        src={imageUrl} 
        alt={artistName}
        className="w-full h-full object-cover"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

interface ArtistDuotoneImageProps {
  artistName: string;
  color?: string;
  className?: string;
}

/**
 * Larger duotone-treated image for expanded artist view
 */
export function ArtistDuotoneImage({ artistName, color = COLORS.artistOverlay, className }: ArtistDuotoneImageProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = getArtistImageUrl(artistName);
  
  if (!imageUrl || hasError) {
    return (
      <div 
        className={cn(
          'relative w-full aspect-square flex items-center justify-center',
          className
        )}
        style={{ backgroundColor: `${color}20` }}
      >
        <User className="w-16 h-16" style={{ color, opacity: 0.3 }} />
      </div>
    );
  }
  
  return (
    <div 
      className={cn('relative w-full aspect-square overflow-hidden', className)}
      style={{ backgroundColor: color }}
    >
      {/* Base image with grayscale */}
      <img 
        src={imageUrl} 
        alt={artistName}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ 
          filter: 'grayscale(100%) contrast(1.0) brightness(1.3)', 
          mixBlendMode: 'multiply' 
        }}
        onError={() => setHasError(true)}
      />
      
      {/* Color overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          backgroundColor: color, 
          mixBlendMode: 'multiply', 
          opacity: 0.18 
        }} 
      />
      
      {/* Gradient overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          background: `linear-gradient(180deg, ${COLORS.dustySky}20 0%, transparent 50%, ${color}15 100%)`, 
          mixBlendMode: 'overlay' 
        }} 
      />
      
      {/* Halftone pattern */}
      <div 
        className="absolute inset-0 pointer-events-none z-10"
        style={{ 
          backgroundImage: halftonePatternDense, 
          backgroundSize: '3px 3px', 
          mixBlendMode: 'multiply', 
          opacity: 0.25 
        }} 
      />
      
      {/* Film grain */}
      <div 
        className="absolute inset-0 pointer-events-none z-10"
        style={{ ...heavyGrain, opacity: 0.2 }} 
      />
    </div>
  );
}
