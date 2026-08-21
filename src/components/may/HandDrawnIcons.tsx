// Hand-drawn brush-pen style icons for Cosmico
// Style: thin-medium brush strokes, analog, warm, imperfect, organic

interface IconProps {
  className?: string;
  size?: number;
}

export const RitualIcon = ({ className = "", size = 48 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 48 48" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Horizon line - slightly wobbly */}
    <path 
      d="M6 32 C10 31.5, 14 32.5, 18 32 C22 31.5, 26 32.5, 30 32 C34 31.5, 38 32, 42 32.5" 
      stroke="#1A1A1A" 
      strokeWidth="2" 
      strokeLinecap="round"
      fill="none"
      style={{ strokeLinejoin: 'round' }}
    />
    {/* Rising sun arc */}
    <path 
      d="M14 32 C14.5 26, 18 20, 24 19.5 C30 20, 33.5 26, 34 32" 
      stroke="#1A1A1A" 
      strokeWidth="2" 
      strokeLinecap="round"
      fill="none"
    />
    {/* Sun rays - uneven, organic */}
    <path d="M24 14 C24.5 12, 23.5 10, 24 8" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17 16 C15.5 14.5, 14.5 13, 13 12" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M31 16 C32.5 14.5, 33 13.5, 35 12.5" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M11 22 C9.5 21.5, 8 21, 6 21.5" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M37 22 C38.5 21.5, 40 21.5, 42 22" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const MusicIcon = ({ className = "", size = 48 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 48 48" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Sound wave curves - loose, organic, like music drifting */}
    <path 
      d="M8 24 C10 20, 12 28, 14 24 C16 20, 18 28, 20 24" 
      stroke="#1A1A1A" 
      strokeWidth="2" 
      strokeLinecap="round"
      fill="none"
    />
    <path 
      d="M16 18 C18.5 14, 21 22, 23.5 18 C26 14, 28.5 22, 31 18" 
      stroke="#1A1A1A" 
      strokeWidth="1.8" 
      strokeLinecap="round"
      fill="none"
    />
    <path 
      d="M16 30 C18.5 26, 21 34, 23.5 30 C26 26, 28.5 34, 31 30" 
      stroke="#1A1A1A" 
      strokeWidth="1.8" 
      strokeLinecap="round"
      fill="none"
    />
    <path 
      d="M28 24 C30 20, 32 28, 34 24 C36 20, 38 28, 40 24" 
      stroke="#1A1A1A" 
      strokeWidth="2" 
      strokeLinecap="round"
      fill="none"
    />
    {/* Small radiating curves */}
    <path 
      d="M22 12 C24 10, 26 10, 28 12" 
      stroke="#1A1A1A" 
      strokeWidth="1.5" 
      strokeLinecap="round"
      fill="none"
    />
    <path 
      d="M20 36 C23 38, 27 38, 30 36" 
      stroke="#1A1A1A" 
      strokeWidth="1.5" 
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

export const CommunityIcon = ({ className = "", size = 48 }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 48 48" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Left figure */}
    {/* Head - slightly imperfect circle */}
    <path 
      d="M14 14 C11 14.5, 9 17, 9.5 20 C10 23, 13 25, 16 24.5 C19 24, 20.5 21, 20 18 C19.5 15, 17 13.5, 14 14" 
      stroke="#1A1A1A" 
      strokeWidth="1.8" 
      strokeLinecap="round"
      fill="none"
    />
    {/* Shoulders */}
    <path 
      d="M6 38 C7 32, 10 28, 14.5 27 C19 28, 22 32, 23 38" 
      stroke="#1A1A1A" 
      strokeWidth="1.8" 
      strokeLinecap="round"
      fill="none"
    />
    
    {/* Center figure (slightly forward/overlapping) */}
    {/* Head */}
    <path 
      d="M24 11 C21 11.5, 19 14, 19.5 17 C20 20, 23 22, 26 21.5 C29 21, 30.5 18, 30 15 C29.5 12, 27 10.5, 24 11" 
      stroke="#1A1A1A" 
      strokeWidth="2" 
      strokeLinecap="round"
      fill="none"
    />
    {/* Shoulders */}
    <path 
      d="M15 40 C16.5 33, 20 28, 24.5 27 C29 28, 32.5 33, 34 40" 
      stroke="#1A1A1A" 
      strokeWidth="2" 
      strokeLinecap="round"
      fill="none"
    />
    
    {/* Right figure */}
    {/* Head */}
    <path 
      d="M34 14 C31 14.5, 29 17, 29.5 20 C30 23, 33 25, 36 24.5 C39 24, 40.5 21, 40 18 C39.5 15, 37 13.5, 34 14" 
      stroke="#1A1A1A" 
      strokeWidth="1.8" 
      strokeLinecap="round"
      fill="none"
    />
    {/* Shoulders */}
    <path 
      d="M26 38 C27 32, 30 28, 34.5 27 C39 28, 42 32, 43 38" 
      stroke="#1A1A1A" 
      strokeWidth="1.8" 
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);
