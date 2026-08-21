import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface TagChipProps {
  label: string;
  color?: "default" | "blue" | "green" | "amber" | "red" | "purple" | "pink";
  onRemove?: () => void;
  className?: string;
}

const colorStyles = {
  default: "bg-[hsl(0,0%,94%)] text-[hsl(0,0%,35%)]",
  blue: "bg-[hsl(215,100%,96%)] text-[hsl(215,100%,40%)]",
  green: "bg-[hsl(142,72%,95%)] text-[hsl(142,60%,30%)]",
  amber: "bg-[hsl(38,95%,95%)] text-[hsl(38,80%,35%)]",
  red: "bg-[hsl(0,72%,96%)] text-[hsl(0,60%,40%)]",
  purple: "bg-[hsl(280,80%,96%)] text-[hsl(280,70%,40%)]",
  pink: "bg-[hsl(330,80%,96%)] text-[hsl(330,70%,40%)]",
};

export function TagChip({ label, color = "default", onRemove, className }: TagChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium",
        colorStyles[color],
        onRemove && "pr-1",
        className
      )}
    >
      {label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 hover:bg-black/10 rounded"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

interface TagListProps {
  tags: string[];
  color?: TagChipProps["color"];
  onRemove?: (tag: string) => void;
  maxVisible?: number;
  className?: string;
}

export function TagList({ 
  tags, 
  color = "default", 
  onRemove, 
  maxVisible = 3,
  className 
}: TagListProps) {
  const visibleTags = tags.slice(0, maxVisible);
  const remaining = tags.length - maxVisible;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {visibleTags.map((tag) => (
        <TagChip
          key={tag}
          label={tag}
          color={color}
          onRemove={onRemove ? () => onRemove(tag) : undefined}
        />
      ))}
      {remaining > 0 && (
        <span className="px-2 py-0.5 text-xs font-medium text-[hsl(var(--admin-text-tertiary))]">
          +{remaining}
        </span>
      )}
    </div>
  );
}
