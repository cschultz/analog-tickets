import { lazy, Suspense, memo } from "react";
import { useAdminEvent } from "@/hooks/useAdminEvent";
import { 
  AdminPageHeader, 
  AdminTabs,
  AdminTabsList,
  AdminTabsTrigger,
  AdminTabsContent
} from "@/components/admin";
import { 
  FolderSync,
  Palette,
  Sparkles,
  Loader2
} from "lucide-react";
import { useState } from "react";

// Lazy load tab content components
const ContentStudio = lazy(() => import("@/components/social/ContentStudio").then(m => ({ default: m.ContentStudio })));
const SocialPhotoSources = lazy(() => import("@/components/social/SocialPhotoSources").then(m => ({ default: m.SocialPhotoSources })));
const BrandVoiceEditor = lazy(() => import("@/components/social/BrandVoiceEditor").then(m => ({ default: m.BrandVoiceEditor })));
const BrandVoiceHistory = lazy(() => import("@/components/social/BrandVoiceHistory").then(m => ({ default: m.BrandVoiceHistory })));
const SocialCaptionExamples = lazy(() => import("@/components/social/SocialCaptionExamples").then(m => ({ default: m.SocialCaptionExamples })));

// Loading fallback for lazy components
const TabLoader = memo(() => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
  </div>
));
TabLoader.displayName = 'TabLoader';

export default function SocialPublishing() {
  const { selectedEvent } = useAdminEvent();
  const [activeTab, setActiveTab] = useState("studio");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["studio"]));

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setVisitedTabs(prev => new Set([...prev, tab]));
  };

  const shouldRenderTab = (tabId: string) => activeTab === tabId || visitedTabs.has(tabId);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Social Publishing"
        subtitle="Curate content, manage sources, and configure brand voice"
      />

      <AdminTabs value={activeTab} onValueChange={handleTabChange}>
        <AdminTabsList>
          <AdminTabsTrigger value="studio">
            <Palette className="h-4 w-4 mr-2" />
            Content Studio
          </AdminTabsTrigger>
          <AdminTabsTrigger value="sources">
            <FolderSync className="h-4 w-4 mr-2" />
            Sources
          </AdminTabsTrigger>
          <AdminTabsTrigger value="voice">
            <Sparkles className="h-4 w-4 mr-2" />
            Voice
          </AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="studio" className="mt-6">
          {shouldRenderTab("studio") && (
            <Suspense fallback={<TabLoader />}>
              <ContentStudio eventId={selectedEvent?.id} />
            </Suspense>
          )}
        </AdminTabsContent>

        <AdminTabsContent value="sources" className="mt-6">
          {shouldRenderTab("sources") && (
            <Suspense fallback={<TabLoader />}>
              <SocialPhotoSources eventId={selectedEvent?.id} />
            </Suspense>
          )}
        </AdminTabsContent>

        <AdminTabsContent value="voice" className="mt-6">
          {shouldRenderTab("voice") && (
            <Suspense fallback={<TabLoader />}>
              <div className="space-y-6">
                <BrandVoiceEditor />
                <BrandVoiceHistory />
                <SocialCaptionExamples eventId={selectedEvent?.id} />
              </div>
            </Suspense>
          )}
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
