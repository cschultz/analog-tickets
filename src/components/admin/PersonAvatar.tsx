import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PersonAvatarProps {
  name: string;
  imageUrl?: string | null;
  email?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
}

const sizeStyles = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

// Generate a consistent color based on name
function getAvatarColor(name: string): string {
  const colors = [
    "bg-[hsl(215,80%,92%)] text-[hsl(215,70%,45%)]", // blue
    "bg-[hsl(142,72%,95%)] text-[hsl(142,60%,30%)]", // green
    "bg-[hsl(38,95%,95%)] text-[hsl(38,80%,35%)]", // amber
    "bg-[hsl(280,80%,96%)] text-[hsl(280,70%,40%)]", // purple
    "bg-[hsl(340,80%,96%)] text-[hsl(340,70%,45%)]", // pink
    "bg-[hsl(175,60%,95%)] text-[hsl(175,50%,35%)]", // teal
    "bg-[hsl(215,100%,96%)] text-[hsl(215,100%,40%)]", // blue
    "bg-[hsl(245,60%,96%)] text-[hsl(245,50%,45%)]", // indigo
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export function PersonAvatar({ 
  name, 
  imageUrl, 
  email,
  size = "md", 
  showTooltip = false,
  className 
}: PersonAvatarProps) {
  const avatar = (
    <Avatar className={cn(sizeStyles[size], "border border-[hsl(var(--admin-border))]", className)}>
      <AvatarImage src={imageUrl || undefined} alt={name} />
      <AvatarFallback className={cn("font-medium", getAvatarColor(name))}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!showTooltip) return avatar;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{avatar}</TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{name}</p>
          {email && <p className="text-xs text-[hsl(var(--admin-text-muted))]">{email}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PersonAvatarGroupProps {
  people: Array<{ name: string; imageUrl?: string | null; email?: string }>;
  max?: number;
  size?: PersonAvatarProps["size"];
  className?: string;
}

export function PersonAvatarGroup({ 
  people, 
  max = 3, 
  size = "sm",
  className 
}: PersonAvatarGroupProps) {
  const visible = people.slice(0, max);
  const remaining = people.length - max;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((person, i) => (
        <PersonAvatar
          key={i}
          name={person.name}
          imageUrl={person.imageUrl}
          email={person.email}
          size={size}
          showTooltip
          className="ring-2 ring-white"
        />
      ))}
      {remaining > 0 && (
        <div 
          className={cn(
            sizeStyles[size],
            "flex items-center justify-center rounded-full bg-[hsl(var(--admin-hover))] text-[hsl(var(--admin-text-tertiary))] font-medium ring-2 ring-white"
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

interface PersonBadgeProps {
  name: string;
  imageUrl?: string | null;
  onRemove?: () => void;
  className?: string;
}

export function PersonBadge({ name, imageUrl, onRemove, className }: PersonBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-[hsl(var(--admin-hover))] text-xs font-medium",
        className
      )}
    >
      <PersonAvatar name={name} imageUrl={imageUrl} size="xs" />
      <span className="text-[hsl(var(--admin-text))]">{name}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 p-0.5 hover:bg-black/10 rounded-full"
        >
          <span className="sr-only">Remove</span>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
