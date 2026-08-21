import { Instagram, Mail, LogIn } from "lucide-react";
import analogLogo from "@/assets/analog-logo-cream.webp";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePublishedEvent } from "@/hooks/usePublishedEvent";
import DemoSiteNotice from "@/components/DemoSiteNotice";
import { configuredSocialLinks } from "@/platform/externalLinks";

const Footer = () => {
  const { user, isAdmin, loading } = useAuth();
  const { data: activeEvent } = usePublishedEvent();

  // Build subtitle from active event, with fallback
  const eventSubtitle = activeEvent 
    ? `${activeEvent.title}${activeEvent.venue_name ? ` • ${activeEvent.venue_name}` : ""}`
    : "Cosmico";
  
  return (
    <footer className="bg-[#1C1713] text-[#C7A97A] border-t border-[#C7A97A]/20">
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <img 
              src={analogLogo} 
              alt="Analog" 
              className="h-16 w-auto mb-2"
            />
            <p className="text-sm text-[#C7A97A] text-caption">
              {eventSubtitle}
            </p>
          </div>

          {/* May Event Navigation */}
          <nav className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-sm">
            <Link 
              to="/may/story"
              className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-300"
            >
              Our Story
            </Link>
            <Link 
              to="/may/lineup"
              className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-300"
            >
              Lineup
            </Link>
            <Link 
              to="/may/stay"
              className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-300"
            >
              Stay
            </Link>
            <Link 
              to="/may/experience"
              className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-300"
            >
              Experience
            </Link>
          </nav>

          <div className="flex items-center gap-6">
            {configuredSocialLinks().some((s) => s.label === "Instagram") && (
              <a
                href={configuredSocialLinks().find((s) => s.label === "Instagram")!.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-400"
                aria-label="Instagram"
              >
                <Instagram className="w-6 h-6" />
              </a>
            )}
            <a 
              href="mailto:hello@example.org" 
              className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-400"
              aria-label="Email"
            >
              <Mail className="w-6 h-6" />
            </a>
            {isAdmin ? (
              <Link 
                to="/admin"
                className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-400 text-sm"
              >
                Admin
              </Link>
            ) : loading ? (
              <span className="text-[#C7A97A]/50 text-sm">Loading...</span>
            ) : user ? (
              <Link 
                to="/admin-setup"
                className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-400 text-sm"
              >
                Setup
              </Link>
            ) : (
              <Link 
                to="/auth"
                className="text-[#C7A97A] hover:text-[#A98255] transition-all duration-400"
                aria-label="Sign In"
              >
                <LogIn className="w-6 h-6" />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[#C7A97A]/20">
          <DemoSiteNotice className="max-w-3xl mx-auto text-center" />
        </div>

        <div className="mt-8 pt-8 border-t border-[#C7A97A]/20 text-center text-sm text-[#C7A97A] text-caption">
          <p>© {new Date().getFullYear()} Analog. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
