/**
 * Pipeline Components
 * 
 * Shared foundation for all production pipelines (Artists, Vendors, Artisans, Partners, Volunteers, WineCamp)
 * 
 * NOTE: Custom fields are now managed via the unified pipeline system using:
 * - `pipeline_fields` table (via usePipelineConfig.ts and usePipelineAdmin.ts)
 * - `FieldListEditor` component (src/components/pipeline/inline/FieldListEditor.tsx)
 */

export { PipelineShell } from "./PipelineShell";
export type { PipelineSection } from "./PipelineShell";

export { SavedViewsDropdown } from "./SavedViewsDropdown";

export { RecordDrawer } from "./RecordDrawer";
export type { RecordDrawerProps } from "./RecordDrawer";
