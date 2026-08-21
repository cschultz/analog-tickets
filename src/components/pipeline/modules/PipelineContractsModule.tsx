import { usePipeline } from "../PipelineContext";
import { EntityContractManager } from "@/components/contracts/EntityContractManager";

export function PipelineContractsModule() {
  const { config, selectedRecord } = usePipeline();

  if (!config?.has_contracts || !selectedRecord) return null;

  return (
    <EntityContractManager
      entityType={config.slug as "vendor" | "artisan" | "partner" | "artist"}
      entityId={selectedRecord.id as string}
      entityName={(selectedRecord.name as string) || "Unknown"}
      entityEmail={selectedRecord.email as string | null}
    />
  );
}
