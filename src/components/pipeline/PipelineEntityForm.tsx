import { useState, useEffect } from "react";
import { usePipeline } from "./PipelineContext";
import { PipelineField } from "@/hooks/usePipelineConfig";
import { PipelineRecord } from "@/hooks/usePipelineData";
import { AdminButton, AdminInput } from "@/components/admin";
import { AdminLabel, AdminTextarea, AdminCheckbox } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { PipelineStageSelect } from "./PipelineStageSelect";

const EMPTY_INITIAL_DATA: Partial<PipelineRecord> = {};

interface PipelineEntityFormProps {
  mode: "create" | "edit";
  initialData?: Partial<PipelineRecord>;
  onSubmit: (data: Partial<PipelineRecord>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PipelineEntityForm({ 
  mode, 
  initialData,
  onSubmit, 
  onCancel,
  isLoading 
}: PipelineEntityFormProps) {
  const { config, stages, formFields } = usePipeline();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const normalizedInitialData = initialData ?? EMPTY_INITIAL_DATA;

  // Initialize form data
  useEffect(() => {
    const initial: Record<string, unknown> = {};
    formFields.forEach(field => {
      initial[field.slug] = normalizedInitialData[field.slug] ?? field.default_value ?? "";
    });
    setFormData(initial);
  }, [formFields, normalizedInitialData]);

  const handleChange = (slug: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [slug]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // Group fields by field_group
  const headerFields = formFields.filter(f => f.field_group === "header");
  const detailFields = formFields.filter(f => f.field_group === "details");
  const metaFields = formFields.filter(f => f.field_group === "meta");

  const renderField = (field: PipelineField) => {
    const value = formData[field.slug];

    switch (field.field_type) {
      case "textarea":
        return (
          <div key={field.id} className="col-span-2">
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminTextarea
              id={field.slug}
              value={String(value || "")}
              onChange={(e) => handleChange(field.slug, e.target.value)}
              placeholder={field.placeholder || undefined}
              required={field.is_required}
              className="mt-1.5"
            />
          </div>
        );

      case "select":
        // Special case for pipeline_status
        if (field.slug === "pipeline_status") {
          return (
            <div key={field.id}>
              <AdminLabel htmlFor={field.slug}>
                {field.name}
              </AdminLabel>
              <div className="mt-1.5">
                <PipelineStageSelect
                  stages={stages}
                  value={String(value || "")}
                  onValueChange={(v) => handleChange(field.slug, v)}
                  className="w-full"
                />
              </div>
            </div>
          );
        }
        
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminSelect
              value={String(value || "")}
              onValueChange={(v) => handleChange(field.slug, v)}
            >
              <AdminSelectItem value="">Select...</AdminSelectItem>
              {field.options?.map(opt => (
                <AdminSelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </AdminSelectItem>
              ))}
            </AdminSelect>
          </div>
        );

      case "boolean":
        return (
          <div key={field.id} className="flex items-center gap-2">
            <AdminCheckbox
              id={field.slug}
              checked={Boolean(value)}
              onCheckedChange={(checked) => handleChange(field.slug, checked)}
            />
            <AdminLabel htmlFor={field.slug} className="mb-0">
              {field.name}
            </AdminLabel>
          </div>
        );

      case "number":
      case "currency":
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminInput
              id={field.slug}
              type="number"
              value={value !== undefined && value !== "" ? String(value) : ""}
              onChange={(e) => handleChange(field.slug, e.target.value ? Number(e.target.value) : null)}
              placeholder={field.placeholder || undefined}
              required={field.is_required}
              min={field.min_value ?? undefined}
              max={field.max_value ?? undefined}
              className="mt-1.5"
            />
          </div>
        );

      case "date":
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminInput
              id={field.slug}
              type="date"
              value={String(value || "")}
              onChange={(e) => handleChange(field.slug, e.target.value)}
              required={field.is_required}
              className="mt-1.5"
            />
          </div>
        );

      case "email":
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminInput
              id={field.slug}
              type="email"
              value={String(value || "")}
              onChange={(e) => handleChange(field.slug, e.target.value)}
              placeholder={field.placeholder || "email@example.com"}
              required={field.is_required}
              className="mt-1.5"
            />
          </div>
        );

      case "url":
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminInput
              id={field.slug}
              type="url"
              value={String(value || "")}
              onChange={(e) => handleChange(field.slug, e.target.value)}
              placeholder={field.placeholder || "https://"}
              required={field.is_required}
              className="mt-1.5"
            />
          </div>
        );

      case "phone":
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminInput
              id={field.slug}
              type="tel"
              value={String(value || "")}
              onChange={(e) => handleChange(field.slug, e.target.value)}
              placeholder={field.placeholder || "(555) 555-5555"}
              required={field.is_required}
              className="mt-1.5"
            />
          </div>
        );

      default: // text
        return (
          <div key={field.id}>
            <AdminLabel htmlFor={field.slug}>
              {field.name}
              {field.is_required && <span className="text-[hsl(var(--admin-error))] ml-1">*</span>}
            </AdminLabel>
            <AdminInput
              id={field.slug}
              type="text"
              value={String(value || "")}
              onChange={(e) => handleChange(field.slug, e.target.value)}
              placeholder={field.placeholder || undefined}
              required={field.is_required}
              maxLength={field.max_length ?? undefined}
              className="mt-1.5"
            />
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header Fields */}
      {headerFields.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {headerFields.map(renderField)}
        </div>
      )}

      {/* Status Field (from meta) */}
      {metaFields.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {metaFields.map(renderField)}
        </div>
      )}

      {/* Detail Fields */}
      {detailFields.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {detailFields.map(renderField)}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[hsl(var(--admin-border))]">
        <AdminButton type="button" variant="adminOutline" onClick={onCancel}>
          Cancel
        </AdminButton>
        <AdminButton type="submit" variant="admin" disabled={isLoading}>
          {isLoading ? "Saving..." : mode === "create" ? `Add ${config?.name_singular}` : "Save Changes"}
        </AdminButton>
      </div>
    </form>
  );
}
