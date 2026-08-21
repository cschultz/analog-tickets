import { COLORS } from "@/styles/may-theme";

/**
 * Editorial schematic of the Example Meadow shuttle system.
 * Not geographically precise — designed for clarity, not navigation.
 */
const ShuttleMap = () => {
  return (
    <svg
      viewBox="0 0 800 520"
      role="img"
      aria-label="Schematic map showing Example Meadow and the two offsite parking lots with shuttle loops"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* background */}
      <rect width="800" height="520" fill={COLORS.dustySky} />

      {/* faint grid hint */}
      <g opacity="0.06" stroke={COLORS.charcoal} strokeWidth="1">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`h${i}`} x1="0" x2="800" y1={i * 65} y2={i * 65} />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 60} x2={i * 60} y1="0" y2="520" />
        ))}
      </g>

      {/* compass */}
      <g transform="translate(740, 60)">
        <circle r="22" fill="none" stroke={COLORS.charcoal} strokeWidth="1" opacity="0.4" />
        <text textAnchor="middle" y="-26" fill={COLORS.charcoal} fontSize="11" fontFamily="Georgia, serif" opacity="0.7">N</text>
        <line x1="0" y1="-18" x2="0" y2="18" stroke={COLORS.charcoal} strokeWidth="1" opacity="0.4" />
        <polygon points="0,-20 -4,-10 4,-10" fill={COLORS.clay} />
      </g>

      {/* river / road accent (Alexander Valley Rd hint) */}
      <path
        d="M 80 460 Q 250 380 400 280 Q 560 180 720 90"
        fill="none"
        stroke={COLORS.charcoal}
        strokeWidth="2"
        strokeDasharray="2 8"
        opacity="0.25"
      />
      <text x="160" y="470" fill={COLORS.charcoal} fontSize="10" fontFamily="Georgia, serif" fontStyle="italic" opacity="0.5">
        Alexander Valley Rd
      </text>

      {/* shuttle loop 1: Eggstand → Example Meadow */}
      <path
        d="M 180 380 Q 280 280 400 260"
        fill="none"
        stroke={COLORS.clay}
        strokeWidth="2.5"
      />
      <path
        d="M 400 280 Q 280 320 180 400"
        fill="none"
        stroke={COLORS.clay}
        strokeWidth="2.5"
        opacity="0.55"
      />

      {/* shuttle loop 2: Acta Wine → Example Meadow */}
      <path
        d="M 620 160 Q 520 200 420 250"
        fill="none"
        stroke={COLORS.mustard}
        strokeWidth="2.5"
      />
      <path
        d="M 420 270 Q 520 240 620 180"
        fill="none"
        stroke={COLORS.mustard}
        strokeWidth="2.5"
        opacity="0.55"
      />

      {/* EXAMPLE MEADOW — center, large */}
      <g transform="translate(400, 260)">
        <circle r="28" fill={COLORS.charcoal} />
        <circle r="28" fill="none" stroke={COLORS.dustySky} strokeWidth="2" />
        <text textAnchor="middle" y="5" fill={COLORS.dustySky} fontSize="11" fontFamily="Georgia, serif" letterSpacing="1">
          WH
        </text>
        <text
          textAnchor="middle"
          y="-44"
          fill={COLORS.charcoal}
          fontSize="14"
          fontFamily="Georgia, serif"
          fontWeight="bold"
        >
          Example Meadow
        </text>
        <text textAnchor="middle" y="-28" fill={COLORS.charcoal} fontSize="10" fontFamily="Georgia, serif" opacity="0.7">
          The venue
        </text>
      </g>

      {/* EGGSTAND — Parking #1 (priority) */}
      <g transform="translate(180, 390)">
        <circle r="20" fill={COLORS.clay} />
        <text textAnchor="middle" y="4" fill={COLORS.dustySky} fontSize="13" fontFamily="Georgia, serif" fontWeight="bold">
          1
        </text>
        <text textAnchor="middle" y="44" fill={COLORS.charcoal} fontSize="12" fontFamily="Georgia, serif" fontWeight="bold">
          Eggstand Inc
        </text>
        <text textAnchor="middle" y="60" fill={COLORS.charcoal} fontSize="10" fontFamily="Georgia, serif" opacity="0.7">
          Parking 1 · fills first
        </text>
      </g>

      {/* ACTA WINE — Parking #2 */}
      <g transform="translate(640, 150)">
        <circle r="20" fill={COLORS.mustard} />
        <text textAnchor="middle" y="4" fill={COLORS.charcoal} fontSize="13" fontFamily="Georgia, serif" fontWeight="bold">
          2
        </text>
        <text textAnchor="middle" y="-32" fill={COLORS.charcoal} fontSize="12" fontFamily="Georgia, serif" fontWeight="bold">
          Acta Wine
        </text>
        <text textAnchor="middle" y="-16" fill={COLORS.charcoal} fontSize="10" fontFamily="Georgia, serif" opacity="0.7">
          Parking 2 · overflow
        </text>
      </g>

      {/* shuttle labels */}
      <text x="270" y="330" fill={COLORS.clay} fontSize="11" fontFamily="Georgia, serif" fontStyle="italic">
        ~5 min shuttle
      </text>
      <text x="490" y="220" fill={COLORS.charcoal} fontSize="11" fontFamily="Georgia, serif" fontStyle="italic" opacity="0.85">
        ~5 min shuttle
      </text>

      {/* legend */}
      <g transform="translate(40, 40)">
        <text fill={COLORS.charcoal} fontSize="9" fontFamily="Georgia, serif" letterSpacing="2" opacity="0.6">
          LEGEND
        </text>
        <g transform="translate(0, 18)">
          <line x1="0" y1="0" x2="22" y2="0" stroke={COLORS.clay} strokeWidth="2.5" />
          <text x="30" y="4" fill={COLORS.charcoal} fontSize="11" fontFamily="Georgia, serif">
            Shuttle loop — Lot 1
          </text>
        </g>
        <g transform="translate(0, 36)">
          <line x1="0" y1="0" x2="22" y2="0" stroke={COLORS.mustard} strokeWidth="2.5" />
          <text x="30" y="4" fill={COLORS.charcoal} fontSize="11" fontFamily="Georgia, serif">
            Shuttle loop — Lot 2
          </text>
        </g>
      </g>
    </svg>
  );
};

export default ShuttleMap;
