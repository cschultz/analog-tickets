import { Link } from "react-router-dom";
import { LogIn, Instagram, Facebook, Youtube, MessageCircle } from "lucide-react";
import analogLogoWordmark from "@/assets/analog-logo-wordmark.webp";
import { COLORS, typography } from "@/styles/may-theme";
import FilmGrainOverlay from "./FilmGrainOverlay";
import EmailCapture from "./EmailCapture";
import { useAuth } from "@/hooks/useAuth";
import DemoSiteNotice from "@/components/DemoSiteNotice";
import { configuredSocialLinks, NEWSLETTER_LINK, PRODUCER } from "@/platform/externalLinks";

const MayFooter = () => {
  const { user, isAdmin } = useAuth();
  const navItems: { label: string; path: string }[] = [
    { label: 'Tickets', path: '/tickets' },
    { label: 'Manage My Tickets', path: '/my-tickets' },
    { label: 'Story', path: '/story' },
    { label: 'Lineup', path: '/lineup' },
    { label: 'Wine Camp', path: '/wine-camp' },
    { label: 'Dinner', path: '/fielddayca' },
    { label: 'Stay', path: '/stay' },
    { label: 'Experience', path: '/experience' },
  ];
  const siteLinks = [
    { label: 'Schedule', path: '/schedule' },
    { label: 'Getting Here', path: '/getting-here' },
    { label: 'FAQ', path: '/faq' },
    { label: 'Get Involved', path: '/get-involved' },
    { label: 'Mixtape 🎧', path: '/mixtape' },
    { label: 'Terms', path: '/terms' },
    { label: 'Privacy', path: '/privacy' },
    { label: 'Contact', path: '/contact' },
    { label: 'Bring Your Crew 🥚', path: '/bringyourcrew' },
    { label: 'Ticket Giveaway', path: '/win' },
  ];

  const handleOpenChat = () => {
    window.dispatchEvent(new CustomEvent('openSupportChat'));
  };
  const socialIcons: Record<string, typeof Instagram> = {
    Instagram,
    Facebook,
    YouTube: Youtube,
  };
  // Operator-configured only; a fresh remix renders no social icons.
  const socialLinks = configuredSocialLinks()
    .filter((s) => socialIcons[s.label])
    .map((s) => ({ icon: socialIcons[s.label], url: s.url as string, label: s.label }));

  return (
    <footer className="relative" style={{ backgroundColor: COLORS.charcoal }}>
      <div
        className="relative z-10 px-8 py-6 md:px-12 lg:px-16 border-b"
        style={{ backgroundColor: COLORS.charcoal, color: COLORS.dustySky, borderColor: `${COLORS.boulder}40` }}
      >
        <DemoSiteNotice className="max-w-3xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        
        {/* Left Panel: Logo and Info */}
        <div 
          className="relative p-8 md:p-12 lg:p-16 flex flex-col justify-between min-h-[300px]"
          style={{ backgroundColor: COLORS.dustySky }}
        >
          <FilmGrainOverlay opacity={0.5} />
          
          <Link to="/" className="relative z-10 inline-block group">
            <img 
              src={analogLogoWordmark} 
              alt="Analog" 
              className="h-10 md:h-12 w-auto transition-all duration-300 group-hover:opacity-70 group-hover:scale-[1.02]" 
              style={{ filter: 'brightness(0) saturate(0)' }} 
            />
          </Link>
          
          <div className="relative z-10 mt-8">
            <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '14px', lineHeight: 1.7, maxWidth: '280px', opacity: 0.8 }}>
              An annual reunion for presence, creativity, and connection.
            </p>
          </div>
          
          {/* Email Capture - Tertiary Location */}
          <div className="relative z-10 mt-6">
            <EmailCapture
              variant="compact"
              buttonText="Join"
              showPhone={false}
              showFirstName={false}
            />
          </div>
          
          {PRODUCER.name && (
            <div className="relative z-10 mt-6">
              <p style={{ ...typography.body, color: COLORS.charcoal, fontSize: '12px', lineHeight: 1.6, maxWidth: '320px', opacity: 0.7 }}>
                Cosmico is produced by{' '}
                {PRODUCER.url ? (
                  <a
                    href={PRODUCER.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-70 transition-opacity"
                    style={{ color: COLORS.charcoal }}
                  >
                    {PRODUCER.name}
                  </a>
                ) : (
                  PRODUCER.name
                )}
                {PRODUCER.description ? `, ${PRODUCER.description}` : '.'}
              </p>
            </div>
          )}
          
          <div className="relative z-10 mt-6">
          <p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.1em', fontSize: '10px' }}>
              © {new Date().getFullYear()} COSMICO
            </p>
          </div>
        </div>
        
        {/* Right Panel: Navigation */}
        <div 
          className="relative p-8 md:p-12 lg:p-16 flex flex-col justify-between min-h-[300px]"
          style={{ backgroundColor: COLORS.charcoal }}
        >
          <FilmGrainOverlay opacity={0.5} />
          
          <div className="relative z-10">
            <p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.15em', fontSize: '11px' }}>
              NAVIGATE
            </p>
          </div>
          
          <nav className="relative z-10 mt-8 flex flex-col gap-3">
          {navItems.map((item) => (
              <Link 
                key={item.path}
                to={item.path}
                className="transition-opacity hover:opacity-70"
                style={{ 
                  ...typography.body, 
                  color: COLORS.dustySky,
                  fontSize: '15px',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          
          <div className="relative z-10 mt-6">
            <Link
              to="/my-tickets"
              className="inline-flex items-center justify-center px-5 py-3 mb-5 uppercase transition-opacity hover:opacity-90"
              style={{
                backgroundColor: COLORS.clay,
                color: COLORS.charcoal,
                borderRadius: '0',
                ...typography.button,
                letterSpacing: '0.05em',
                fontSize: '12px',
              }}
            >
              My Tickets
            </Link>
            <p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.15em', fontSize: '10px', marginBottom: '8px' }}>
              MORE
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {siteLinks.map((link) => (
                <Link 
                  key={link.path}
                  to={link.path}
                  className="transition-opacity hover:opacity-70"
                  style={{ 
                    ...typography.caption, 
                    color: COLORS.boulder,
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            
            {/* Social Media Icons */}
            <div className="flex items-center gap-4 mt-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-70"
                  aria-label={social.label}
                >
                  <social.icon className="w-4 h-4" style={{ color: COLORS.boulder }} />
                </a>
              ))}
              {NEWSLETTER_LINK.url && (
              <a
                href={NEWSLETTER_LINK.url}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-70"
                aria-label={NEWSLETTER_LINK.label}
              >
                <svg 
                  className="w-4 h-4" 
                  style={{ color: COLORS.boulder }} 
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                >
                  <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24l9.54-5.645L20.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
                </svg>
              </a>
              )}
            </div>
            
            {/* Need Help link */}
            <button
              onClick={handleOpenChat}
              className="flex items-center gap-1.5 mt-4 transition-opacity hover:opacity-70"
              style={{ 
                ...typography.caption, 
                color: COLORS.boulder,
                fontSize: '11px',
                letterSpacing: '0.05em',
              }}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Need Help?
            </button>
          </div>
          
          <div className="relative z-10 mt-8 flex items-center justify-between">
            <p style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.1em', fontSize: '10px' }}>
              MAY 14–16, 2027 · EXAMPLE VALLEY, CA
            </p>
            
            {isAdmin ? (
              <Link 
                to="/admin"
                className="transition-opacity hover:opacity-70"
                style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.1em', fontSize: '10px' }}
              >
                ADMIN
              </Link>
            ) : user ? (
              <Link 
                to="/admin-setup"
                className="transition-opacity hover:opacity-70"
                style={{ ...typography.caption, color: COLORS.boulder, letterSpacing: '0.1em', fontSize: '10px' }}
              >
                SETUP
              </Link>
            ) : (
              <Link 
                to="/auth"
                className="transition-opacity hover:opacity-70"
                aria-label="Sign In"
              >
                <LogIn className="w-4 h-4" style={{ color: COLORS.boulder }} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MayFooter;
