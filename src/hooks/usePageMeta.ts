import { useEffect } from "react";
import { useEventIdentity } from "@/platform/config/EventConfigProvider";

interface PageMeta {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
}

/**
 * Applies per-page document metadata.
 *
 * Page titles and descriptions remain page-owned copy — this hook does not
 * rewrite them. Only the identity-level fields (`og:site_name`) come from the
 * event contract.
 */
export function usePageMeta({ title, description, ogImage, ogType = "website", ogUrl }: PageMeta) {
  const identity = useEventIdentity();

  useEffect(() => {
    // Title
    document.title = title;

    // Helper to set/create a meta tag
    const setMeta = (property: string, content: string | undefined) => {
      if (!content) return;
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setNameMeta = (name: string, content: string | undefined) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setNameMeta("description", description);
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:type", ogType);
    setMeta("og:image", ogImage);
    setMeta("og:url", ogUrl ?? (typeof window !== "undefined" ? window.location.href : undefined));
    setMeta("og:site_name", identity.name);

    // Twitter card
    setNameMeta("twitter:card", ogImage ? "summary_large_image" : "summary");
    setNameMeta("twitter:title", title);
    setNameMeta("twitter:description", description);
    if (ogImage) setNameMeta("twitter:image", ogImage);
  }, [title, description, ogImage, ogType, ogUrl, identity.name]);
}
