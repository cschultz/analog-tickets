import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, Ticket, X } from "lucide-react";
import analogLogoWordmark from "@/assets/analog-logo-wordmark.webp";
import { COLORS, typography } from "@/styles/may-theme";

interface MayHeaderProps {
  /** If true, header starts transparent and becomes solid on scroll */
  transparentOnTop?: boolean;
  /** Force light or dark text regardless of scroll state */
  forceLightText?: boolean;
  /** If true, shows only the logo (no nav, no CTA, no mobile menu) */
  minimal?: boolean;
}

const MayHeader = ({ transparentOnTop = false, forceLightText = false, minimal = false }: MayHeaderProps) => {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { scrollY } = useScroll();
  
  useMotionValueEvent(scrollY, "change", (latest) => {
    setHasScrolled(latest > 100);
  });

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { label: 'Story', path: '/story' },
    { label: 'Lineup', path: '/lineup' },
    { label: 'Schedule', path: '/schedule' },
    { label: 'Wine Camp', path: '/winecamp' },
    { label: 'Stay', path: '/stay' },
    { label: 'Experience', path: '/experience' },
  ];
  
  // Determine text color based on scroll state and props
  const getTextColor = () => {
    if (forceLightText) return COLORS.dustySky;
    if (!transparentOnTop) return COLORS.charcoal;
    return hasScrolled ? COLORS.charcoal : COLORS.dustySky;
  };

  const getBgColor = () => {
    if (!transparentOnTop) return COLORS.dustySky;
    return hasScrolled ? COLORS.dustySky : 'transparent';
  };

  const textColor = getTextColor();
  const bgColor = getBgColor();

  return (
    <>
      <motion.header 
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 py-4"
        style={{ backgroundColor: bgColor }}
      >
        {/* Header logo */}
        <Link to="/" className="relative z-10">
          <img 
            src={analogLogoWordmark} 
            alt="Analog" 
            className="h-7 md:h-9 w-auto transition-all duration-300"
            style={{ 
              filter: textColor === COLORS.dustySky 
                ? 'brightness(0) invert(1)' 
                : 'brightness(0) saturate(0)',
            }}
          />
        </Link>

        {/* Desktop Navigation - hidden in minimal mode */}
        {!minimal && (
          <nav className="hidden md:flex items-center gap-10">
            {navItems.map((item) => (
              <Link 
                key={item.label}
                to={item.path}
                className="transition-opacity hover:opacity-70"
                style={{ 
                  ...typography.caption,
                  color: textColor,
                  letterSpacing: '0.1em',
                  fontSize: '12px',
                }}
              >
                {item.label.toUpperCase()}
              </Link>
            ))}
          </nav>
        )}

        {/* Desktop CTA Button - hidden in minimal mode */}
        {!minimal && (
          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/my-tickets"
              className="inline-flex items-center gap-2 border-r pr-4 transition-opacity hover:opacity-75"
              style={{
                borderColor: `${textColor}20`,
                color: textColor,
                opacity: 0.8,
              }}
            >
              <Ticket size={14} strokeWidth={1.8} />
              <span
                style={{
                  ...typography.caption,
                  letterSpacing: '0.08em',
                  fontSize: '11px',
                }}
              >
                My Tickets
              </span>
            </Link>

            <Link to="/tickets">
              <Button 
                size="sm"
                className="px-5 py-2 uppercase hover:opacity-90 transition-opacity"
                style={{ 
                  ...typography.button,
                  backgroundColor: COLORS.clay,
                  color: COLORS.charcoal,
                  borderRadius: '0',
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  fontSize: '13px',
                }}
              >
                Tickets
              </Button>
            </Link>
          </div>
        )}

        {/* Mobile Menu Button - hidden in minimal mode */}
        {!minimal && (
          <button
            className="md:hidden relative z-10 p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X size={24} style={{ color: COLORS.charcoal }} />
            ) : (
              <Menu size={24} style={{ color: textColor }} />
            )}
          </button>
        )}
      </motion.header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex flex-col"
          style={{ backgroundColor: COLORS.dustySky }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex-1 flex flex-col items-center px-6 pt-24 pb-10">
            <Link
              to="/my-tickets"
              className="w-full max-w-sm rounded-2xl border px-5 py-4 transition-opacity hover:opacity-85"
              style={{
                backgroundColor: COLORS.white,
                borderColor: `${COLORS.charcoal}12`,
                boxShadow: `0 12px 28px -24px ${COLORS.charcoal}40`,
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${COLORS.denim}10`, color: COLORS.denim }}
                  >
                    <Ticket size={18} />
                  </div>
                  <div className="min-w-0">
                    <p
                      style={{
                        ...typography.caption,
                        color: COLORS.boulder,
                        fontSize: '10px',
                        letterSpacing: '0.12em',
                      }}
                    >
                      QUICK ACCESS
                    </p>
                    <p
                      style={{
                        ...typography.subhead,
                        color: COLORS.charcoal,
                        fontSize: '16px',
                        lineHeight: 1.15,
                      }}
                    >
                      My Tickets
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    ...typography.button,
                    color: COLORS.charcoal,
                    fontSize: '12px',
                  }}
                >
                  Open →
                </span>
              </div>
            </Link>

            <div className="flex flex-col items-center justify-center gap-8 pt-10">
            {navItems.map((item) => (
              <Link 
                key={item.label}
                to={item.path}
                className="transition-opacity hover:opacity-70"
                style={{ 
                  ...typography.headline,
                  color: COLORS.charcoal,
                  fontSize: '2rem',
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </Link>
            ))}
            <Link to="/tickets">
              <Button 
                className="mt-8 px-8 py-4 text-sm uppercase"
                style={{ 
                  ...typography.button,
                  backgroundColor: COLORS.charcoal,
                  color: COLORS.dustySky,
                  borderRadius: '0',
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                }}
              >
                Get Tickets
              </Button>
            </Link>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default MayHeader;
