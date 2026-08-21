import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";

interface RecordProgress {
  hasContact: boolean;
  hasContract: boolean;
  hasDocument: boolean;
  hasEmail: boolean;
}

interface UseRecordProgressOptions {
  entityType: string;
  recordIds: string[];
  enabled?: boolean;
}

export function useRecordProgress({ entityType, recordIds, enabled = true }: UseRecordProgressOptions) {
  return useAuthQuery({
    queryKey: ["record-progress", entityType, recordIds.join(",")],
    queryFn: async (): Promise<Record<string, RecordProgress>> => {
      if (recordIds.length === 0) return {};

      const result: Record<string, RecordProgress> = {};
      
      // Initialize all records with false
      for (const id of recordIds) {
        result[id] = {
          hasContact: false,
          hasContract: false,
          hasDocument: false,
          hasEmail: false,
        };
      }

      // Determine contact table and foreign key
      const contactsTable = entityType === "artist" 
        ? "artist_contacts"
        : entityType === "artisan"
        ? "artisan_contacts"
        : entityType === "partner"
        ? "partner_contacts"
        : "vendor_contacts";

      const foreignKey = entityType === "artist"
        ? "artist_id"
        : entityType === "artisan"
        ? "artisan_id"
        : entityType === "partner"
        ? "partner_id"
        : "vendor_id";

      // Fetch contacts
      try {
        const { data: contacts } = await supabase
          .from(contactsTable as "vendor_contacts" | "artist_contacts" | "artisan_contacts" | "partner_contacts")
          .select("*")
          .in(foreignKey as never, recordIds as never[]);

        for (const c of contacts || []) {
          const record = c as unknown as Record<string, unknown>;
          const id = record[foreignKey] as string | undefined;
          if (id && result[id]) {
            result[id].hasContact = true;
          }
        }
      } catch (e) {
        // Table might not exist
      }

      // Fetch contracts (unified table)
      try {
        const { data: contracts } = await supabase
          .from("contracts")
          .select("entity_id")
          .eq("entity_type", entityType)
          .in("entity_id", recordIds);

        for (const c of contracts || []) {
          if (c.entity_id && result[c.entity_id]) {
            result[c.entity_id].hasContract = true;
          }
        }
      } catch (e) {
        // Ignore
      }

      // Fetch documents (entity-specific)
      const documentsTable = entityType === "artist"
        ? "artist_documents"
        : entityType === "artisan"
        ? "artisan_documents"
        : entityType === "partner"
        ? "partner_documents"
        : entityType === "vendor"
        ? "vendor_documents"
        : null;

      if (documentsTable) {
        try {
          const { data: docs } = await supabase
            .from(documentsTable as "artist_documents" | "vendor_documents" | "artisan_documents" | "partner_documents")
            .select("*")
            .in(foreignKey as never, recordIds as never[]);

          for (const d of docs || []) {
            const record = d as unknown as Record<string, unknown>;
            const id = record[foreignKey] as string | undefined;
            if (id && result[id]) {
              result[id].hasDocument = true;
            }
          }
        } catch (e) {
          // Table might not exist
        }
      }

      // Fetch emails (for artists)
      if (entityType === "artist") {
        try {
          const { data: emails } = await supabase
            .from("artist_email_recipients")
            .select("artist_id")
            .in("artist_id", recordIds);

          for (const e of emails || []) {
            if (e.artist_id && result[e.artist_id]) {
              result[e.artist_id].hasEmail = true;
            }
          }
        } catch (err) {
          // Ignore
        }
      }

      return result;
    },
    enabled: enabled && recordIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
}
