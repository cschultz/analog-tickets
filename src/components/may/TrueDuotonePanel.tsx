import { motion } from "framer-motion";
import { heavyGrain, halftonePatternDense } from "@/styles/may-theme";

// hex (#RRGGBB) → 0-1 RGB triplet for SVG color matrix
const hexToRgb01 = (hex: string) => {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
};

let duotoneIdCounter = 0;

interface TrueDuotonePanelProps {
  image: string;
  alt: string;
  shadowColor: string;
  highlightColor: string;
  className?: string;
  objectPosition?: string;
  contrast?: number;
  brightness?: number;
  grainOpacity?: number;
}

/**
 * Brand-standard true duotone via feColorMatrix.
 * Maps shadows → shadowColor, highlights → highlightColor.
 * Preserves photographic depth and faces (unlike a flat overlay).
 */
const TrueDuotonePanel = ({
  image,
  alt,
  shadowColor,
  highlightColor,
  className = "",
  objectPosition = "center center",
  contrast = 1.15,
  brightness = 1.0,
  grainOpacity = 0.18,
}: TrueDuotonePanelProps) => {
  const id = `duotone-${++duotoneIdCounter}`;
  const s = hexToRgb01(shadowColor);
  const h = hexToRgb01(highlightColor);

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: shadowColor }}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues={`${s.r} ${h.r}`} />
              <feFuncG type="table" tableValues={`${s.g} ${h.g}`} />
              <feFuncB type="table" tableValues={`${s.b} ${h.b}`} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      <img
        src={image}
        alt={alt}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: `url(#${id}) contrast(${contrast}) brightness(${brightness})`,
          objectPosition,
        }}
      />

      {/* Film grain — analog texture */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ ...heavyGrain, opacity: grainOpacity, mixBlendMode: "overlay" }}
      />
      {/* Halftone — print feel */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          backgroundImage: halftonePatternDense,
          backgroundSize: "3px 3px",
          mixBlendMode: "multiply",
          opacity: 0.12,
        }}
      />
    </motion.div>
  );
};

export default TrueDuotonePanel;
