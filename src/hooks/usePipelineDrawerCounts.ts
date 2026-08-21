import { usePipeline } from "@/components/pipeline/PipelineContext";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

interface DrawerCounts {
  contacts: number;
  contracts: number;
  documents: number;
  assets: number;
  emails: number;
  isLoading: boolean;
}

export function usePipelineDrawerCounts(): DrawerCounts {
  const { config, selectedRecord } = usePipeline();

  // Determine table names based on entity type
  const slug = config?.slug || "vendor";
  const contactsTable = slug === "artist" 
    ? "artist_contacts"
    : slug === "artisan"
    ? "artisan_contacts"
    : slug === "partner"
    ? "partner_contacts"
    : "vendor_contacts";

  const foreignKey = slug === "artist"
    ? "artist_id"
    : slug === "artisan"
    ? "artisan_id"
    : slug === "partner"
    ? "partner_id"
    : "vendor_id";

  const sourceArtistId = slug === "artist" && selectedRecord?.source_artist_id
    ? String(selectedRecord.source_artist_id)
    : null;

  const effectiveContactRecordId = sourceArtistId || selectedRecord?.id;

  // Contacts count
  const { data: contactCount = 0, isLoading: loadingContacts } = useAuthQuery({
    queryKey: ["drawer-contact-count", slug, effectiveContactRecordId],
    queryFn: async () => {
      if (!effectiveContactRecordId) return 0;
      
      const { count, error } = await supabase
        .from(contactsTable as "vendor_contacts" | "artist_contacts" | "artisan_contacts" | "partner_contacts")
        .select("*", { count: "exact", head: true })
        .eq(foreignKey as never, effectiveContactRecordId as never);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!effectiveContactRecordId && !!config?.has_contacts,
  });

  // Contracts count
  const { data: contractCount = 0, isLoading: loadingContracts } = useAuthQuery({
    queryKey: ["drawer-contract-count", slug, selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id) return 0;
      
      const { count, error } = await supabase
        .from("contracts")
        .select("*", { count: "exact", head: true })
        .eq("entity_type", slug)
        .eq("entity_id", selectedRecord.id as string);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedRecord?.id && !!config?.has_contracts,
  });

  // Documents count - check entity-specific tables
  const documentsTable = slug === "artist" 
    ? "artist_documents"
    : slug === "artisan"
    ? "artisan_documents"
    : slug === "partner"
    ? "partner_documents"
    : slug === "vendor"
    ? "vendor_documents"
    : null;

  const { data: documentCount = 0, isLoading: loadingDocuments } = useAuthQuery({
    queryKey: ["drawer-document-count", slug, selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id || !documentsTable) return 0;
      
      const { count, error } = await supabase
        .from(documentsTable as "artist_documents" | "vendor_documents" | "artisan_documents" | "partner_documents")
        .select("*", { count: "exact", head: true })
        .eq(foreignKey as never, selectedRecord.id as never);

      if (error) return 0; // Table might not exist
      return count || 0;
    },
    enabled: !!selectedRecord?.id && !!config?.has_documents && !!documentsTable,
  });

  // Assets count (artist only)
  const { data: assetCount = 0, isLoading: loadingAssets } = useAuthQuery({
    queryKey: ["drawer-asset-count", slug, selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id || slug !== "artist") return 0;
      
      const { count, error } = await supabase
        .from("artist_assets")
        .select("*", { count: "exact", head: true })
        .eq("artist_id", selectedRecord.id as string);

      if (error) return 0;
      return count || 0;
    },
    enabled: !!selectedRecord?.id && slug === "artist",
  });

  // Email count - from email recipients
  const { data: emailCount = 0, isLoading: loadingEmails } = useAuthQuery({
    queryKey: ["drawer-email-count", slug, selectedRecord?.id],
    queryFn: async () => {
      if (!selectedRecord?.id || slug !== "artist") return 0;
      
      const { count, error } = await supabase
        .from("artist_email_recipients")
        .select("*", { count: "exact", head: true })
        .eq("artist_id", selectedRecord.id as string);

      if (error) return 0;
      return count || 0;
    },
    enabled: !!selectedRecord?.id && !!config?.has_email && slug === "artist",
  });

  return {
    contacts: contactCount,
    contracts: contractCount,
    documents: documentCount,
    assets: assetCount,
    emails: emailCount,
    isLoading: loadingContacts || loadingContracts || loadingDocuments || loadingAssets || loadingEmails,
  };
}
