import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export formatTicketType from centralized config
export { formatTicketType, getTicketLabel, getTicketShortLabel, getTicketOrder } from "@/config/ticketTypes";
