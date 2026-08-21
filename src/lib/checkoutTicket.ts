import { z } from "zod";

export const CHECKOUT_TICKET_STORAGE_KEY = "cosmico_checkout_ticket";

export interface CheckoutSelectedOption {
  id: string;
  name: string;
  duration: string;
  price: number;
}

export interface CheckoutTicketSelection {
  selectedTicket: string;
  selectedOption: CheckoutSelectedOption;
  ticketType: string;
  ticketName: string;
  ticketPrice: number;
  quantity: number;
  name: string;
  email: string;
  phone?: string;
  donation?: number;
  childCount?: number;
  youthTicketType?: string | null;
  youthCount?: number;
  accommodationWaitlist?: boolean;
}

const selectedOptionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  duration: z.string().trim(),
  price: z.number().finite().nonnegative(),
});

const checkoutTicketInputSchema = z.object({
  selectedTicket: z.string().trim().min(1).optional(),
  selectedOption: selectedOptionSchema.optional(),
  ticketType: z.string().trim().min(1).optional(),
  ticketName: z.string().trim().min(1).optional(),
  ticketPrice: z.number().finite().nonnegative().optional(),
  quantity: z.number().int().positive(),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  donation: z.number().finite().nonnegative().optional(),
  childCount: z.number().int().nonnegative().optional(),
  youthTicketType: z.string().trim().nullable().optional(),
  youthCount: z.number().int().nonnegative().optional(),
  accommodationWaitlist: z.boolean().optional(),
});

type CheckoutTicketInput = z.input<typeof checkoutTicketInputSchema>;

const splitTicketName = (ticketName?: string): { name: string; duration: string } => {
  if (!ticketName) return { name: "Selected ticket", duration: "" };
  const [name, ...rest] = ticketName.split(" — ");
  return {
    name: name?.trim() || "Selected ticket",
    duration: rest.join(" — ").trim(),
  };
};

export function createCheckoutTicketSelection(input: CheckoutTicketInput): CheckoutTicketSelection {
  const parsed = checkoutTicketInputSchema.parse(input);
  const selectedTicket = parsed.selectedTicket ?? parsed.ticketType;

  if (!selectedTicket) {
    throw new Error("Checkout ticket selection requires a selected ticket.");
  }

  const fallbackLabel = splitTicketName(parsed.ticketName);
  const selectedOption: CheckoutSelectedOption = parsed.selectedOption
    ? {
        id: parsed.selectedOption.id,
        name: parsed.selectedOption.name,
        duration: parsed.selectedOption.duration,
        price: parsed.selectedOption.price,
      }
    : {
        id: selectedTicket,
        name: fallbackLabel.name,
        duration: fallbackLabel.duration,
        price: parsed.ticketPrice ?? 0,
      };

  return {
    selectedTicket,
    selectedOption,
    ticketType: selectedTicket,
    ticketName: parsed.ticketName ?? [selectedOption.name, selectedOption.duration].filter(Boolean).join(" — "),
    ticketPrice: parsed.ticketPrice ?? selectedOption.price,
    quantity: parsed.quantity,
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone || undefined,
    donation: parsed.donation ?? 0,
    childCount: parsed.childCount ?? 0,
    youthTicketType: parsed.youthTicketType ?? null,
    youthCount: parsed.youthCount ?? 0,
    accommodationWaitlist: parsed.accommodationWaitlist ?? false,
  };
}

export function parseCheckoutTicketSelection(raw: string | null): CheckoutTicketSelection | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return createCheckoutTicketSelection(parsed);
  } catch {
    return null;
  }
}