import { filmGrain } from '@/styles/may-theme';

interface FilmGrainOverlayProps {
  opacity?: number;
}

const FilmGrainOverlay = ({ opacity = 0.5 }: FilmGrainOverlayProps) => (
  <>
    {/* Vertical gradient - lighter at top */}
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.08) 100%)',
        mixBlendMode: 'overlay',
      }}
    />
    {/* Dense film grain */}
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        ...filmGrain,
        opacity: opacity,
        mixBlendMode: 'overlay',
      }}
    />
  </>
);

export default FilmGrainOverlay;
