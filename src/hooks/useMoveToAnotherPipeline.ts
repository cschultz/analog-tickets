import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PipelineConfig } from "./usePipelineConfig";
import { PipelineRecord } from "./usePipelineData";

type PipelineTableName = "vendors" | "artists" | "artisans" | "partners" | "winecamp_attendees" | "volunteers" | "street_team";

// Common fields that exist across all pipeline tables
const COMMON_FIELDS = ["name", "email", "phone", "notes", "pipeline_status", "event_id"];

// Field mapping between tables (source field -> target field)
const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  // company_name in some tables maps to business_name in artisans
  company_name: { artisans: "business_name" },
  business_name: { vendors: "company_name", partners: "company_name" },
  // category/craft_type mappings
  category: { artisans: "craft_type" },
  craft_type: { vendors: "category", partners: "category" },
};

function mapFieldValue(sourceField: string, targetTable: string): string | null {
  // Check if there's a specific mapping for this field to the target table
  const fieldMappings = FIELD_MAPPINGS[sourceField];
  if (fieldMappings && fieldMappings[targetTable]) {
    return fieldMappings[targetTable];
  }
  
  // Return the same field name if it's a common field
  if (COMMON_FIELDS.includes(sourceField)) {
    return sourceField;
  }
  
  // For other fields, check if target might have same field
  return sourceField;
}

export function useMoveToAnotherPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      record,
      sourceConfig,
      targetConfig,
    }: {
      record: PipelineRecord;
      sourceConfig: PipelineConfig;
      targetConfig: PipelineConfig;
    }) => {
      const sourceTable = sourceConfig.table_name as PipelineTableName;
      const targetTable = targetConfig.table_name as PipelineTableName;

      // Build the insert data with mapped fields
      const insertData: Record<string, unknown> = {
        event_id: record.event_id,
        pipeline_status: "lead", // Always start as lead in new pipeline
      };

      // Map common and compatible fields
      const fieldsToMap = ["name", "email", "phone", "notes", "instagram_url", "website_url"];
      
      for (const field of fieldsToMap) {
        if (record[field] !== undefined && record[field] !== null) {
          const targetField = mapFieldValue(field, targetTable);
          if (targetField) {
            insertData[targetField] = record[field];
          }
        }
      }

      // Tables that have company_name or business_name
      const TABLES_WITH_COMPANY: PipelineTableName[] = ["vendors", "partners"];
      const TABLES_WITH_BUSINESS: PipelineTableName[] = ["artisans"];

      const companyValue = record.company_name || record.business_name;
      if (companyValue) {
        if (TABLES_WITH_BUSINESS.includes(targetTable)) {
          insertData.business_name = companyValue;
        } else if (TABLES_WITH_COMPANY.includes(targetTable)) {
          insertData.company_name = companyValue;
        }
        // skip for tables that have neither (street_team, artists, winecamp_attendees)
      }

      // Tables that have category or craft_type
      const TABLES_WITH_CATEGORY: PipelineTableName[] = ["vendors", "volunteers"];
      const TABLES_WITH_CRAFT: PipelineTableName[] = ["artisans"];

      const categoryValue = record.category || record.craft_type;
      if (categoryValue) {
        if (TABLES_WITH_CRAFT.includes(targetTable)) {
          insertData.craft_type = categoryValue;
        } else if (TABLES_WITH_CATEGORY.includes(targetTable)) {
          insertData.category = categoryValue;
        }
        // skip for tables that have neither (street_team, artists, partners, winecamp_attendees)
      }

      // Insert into target table
      const { data: newRecord, error: insertError } = await supabase
        .from(targetTable)
        .insert(insertData as never)
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create record in ${targetConfig.name}: ${insertError.message}`);
      }

      // Delete from source table
      const { error: deleteError } = await supabase
        .from(sourceTable)
        .delete()
        .eq("id", record.id);

      if (deleteError) {
        // Try to rollback - delete the newly created record
        await supabase.from(targetTable).delete().eq("id", newRecord.id);
        throw new Error(`Failed to remove from ${sourceConfig.name}: ${deleteError.message}`);
      }

      return { newRecord, targetConfig };
    },
    onSuccess: ({ targetConfig }) => {
      // Invalidate both pipeline queries
      queryClient.invalidateQueries({ queryKey: ["pipeline-data"] });
      toast.success(`Moved to ${targetConfig.name}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
