/**
 * AdminSheet
 * 
 * Sheet (slide-over) component with Admin styling.
 * 
 * RULES:
 * - All styling uses Admin tokens
 * - Consistent with admin theme
 */

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const AdminSheet = SheetPrimitive.Root;

const AdminSheetTrigger = SheetPrimitive.Trigger;

const AdminSheetClose = SheetPrimitive.Close;

const AdminSheetPortal = SheetPrimitive.Portal;

const AdminSheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/60",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
AdminSheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  cn(
    "fixed z-50 gap-4 bg-[hsl(var(--admin-surface))] shadow-lg transition ease-in-out",
    "data-[state=closed]:duration-300 data-[state=open]:duration-500",
    "data-[state=open]:animate-in data-[state=closed]:animate-out"
  ),
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-[hsl(var(--admin-border))] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t border-[hsl(var(--admin-border))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r border-[hsl(var(--admin-border))] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l border-[hsl(var(--admin-border))] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

interface AdminSheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const AdminSheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  AdminSheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <AdminSheetPortal>
    <AdminSheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        sheetVariants({ side }),
        "admin-theme p-6",
        "font-['Inter',_-apple-system,_BlinkMacSystemFont,_sans-serif]",
        className
      )}
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      {...props}
    >
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-[hsl(var(--admin-surface))] transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--admin-border-strong))] focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-[hsl(var(--admin-hover))]">
        <X className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
      {children}
    </SheetPrimitive.Content>
  </AdminSheetPortal>
));
AdminSheetContent.displayName = SheetPrimitive.Content.displayName;

const AdminSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
AdminSheetHeader.displayName = "AdminSheetHeader";

const AdminSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
AdminSheetFooter.displayName = "AdminSheetFooter";

const AdminSheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-[hsl(var(--admin-text))]", className)}
    {...props}
  />
));
AdminSheetTitle.displayName = SheetPrimitive.Title.displayName;

const AdminSheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[hsl(var(--admin-text-muted))]", className)}
    {...props}
  />
));
AdminSheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  AdminSheet,
  AdminSheetPortal,
  AdminSheetOverlay,
  AdminSheetTrigger,
  AdminSheetClose,
  AdminSheetContent,
  AdminSheetHeader,
  AdminSheetFooter,
  AdminSheetTitle,
  AdminSheetDescription,
};
