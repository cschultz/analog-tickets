import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[0.04em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#FF6E4A] text-white hover:bg-[#E85A38] shadow-[0_4px_16px_rgba(255,110,74,0.2)] hover:shadow-[0_6px_20px_rgba(255,110,74,0.3)] rounded-full",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full",
        outline: "border-[1.5px] border-[#A7DCE3] bg-transparent text-[#A7DCE3] hover:bg-[#F2F4F5]/30 rounded-full",
        secondary: "border-[1.5px] border-[#A7DCE3] bg-transparent text-[#A7DCE3] hover:bg-[#F2F4F5]/30 rounded-full",
        ghost: "hover:bg-[#F2F4F5]/50 hover:text-[#0A2339] rounded-full",
        link: "text-[#FF6E4A] underline-offset-4 hover:underline hover:text-[#A7DCE3] normal-case tracking-normal",
        coral: "bg-[#FF6E4A] text-white hover:bg-[#E85A38] shadow-[0_4px_16px_rgba(255,110,74,0.2)] hover:shadow-[0_6px_20px_rgba(255,110,74,0.3)] rounded-full",
        aqua: "border-[1.5px] border-[#A7DCE3] bg-transparent text-[#A7DCE3] hover:bg-[#F2F4F5]/30 rounded-full",
        coralDark: "bg-[#FF6E4A] text-white hover:bg-[#E85A38] shadow-[0_4px_16px_rgba(255,110,74,0.2)] hover:shadow-[0_6px_20px_rgba(255,110,74,0.3)] rounded-full",
        aquaDark: "border-[1.5px] border-white bg-transparent text-white hover:bg-white/20 rounded-full",
        // Admin variants - clean black & white
        admin: "bg-[hsl(0,0%,9%)] text-white hover:bg-[hsl(0,0%,15%)] rounded-md shadow-sm",
        adminOutline: "border border-[hsl(0,0%,85%)] bg-[hsl(var(--admin-surface))] text-[hsl(0,0%,9%)] hover:bg-[hsl(0,0%,96%)] rounded-md",
        adminGhost: "bg-transparent text-[hsl(0,0%,9%)] hover:bg-[hsl(0,0%,96%)] rounded-md",
        adminDestructive: "bg-[hsl(0,84%,60%)] text-white hover:bg-[hsl(0,84%,50%)] rounded-md",
      },
      size: {
        default: "h-auto py-[14px] px-[26px] text-sm",
        sm: "h-auto py-2 px-4 text-xs rounded-full",
        lg: "h-auto py-[14px] px-[26px] text-base rounded-full",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
