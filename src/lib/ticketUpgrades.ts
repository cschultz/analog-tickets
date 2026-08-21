export const MY_TICKETS_UPGRADE_MATRIX = {
  tier_1_ga_friday: ["tier_1_ga_2day", "tier_1_vip_3day"],
  tier_1_ga_saturday: ["tier_1_ga_2day", "tier_1_vip_3day"],
  tier_1_ga_2day: ["tier_1_vip_3day"],
  "2day_ga": ["tier_1_vip_3day"],
  "friday_ga": ["tier_1_ga_2day", "tier_1_vip_3day"],
  "saturday_ga": ["tier_1_ga_2day", "tier_1_vip_3day"],
  ga_friday: ["tier_1_ga_2day", "tier_1_vip_3day"],
  ga_saturday: ["tier_1_ga_2day", "tier_1_vip_3day"],
  ga_2day: ["tier_1_vip_3day"],
  ga_2_day: ["tier_1_vip_3day"],
  early_bird_ga_friday: ["tier_1_ga_2day", "tier_1_vip_3day"],
  early_bird_ga_saturday: ["tier_1_ga_2day", "tier_1_vip_3day"],
  early_bird_ga_2day: ["tier_1_vip_3day"],
} as const;

export type MyTicketsUpgradeableTicketType = keyof typeof MY_TICKETS_UPGRADE_MATRIX;
export type MyTicketsUpgradeDestination = (typeof MY_TICKETS_UPGRADE_MATRIX)[MyTicketsUpgradeableTicketType][number];

export function getEligibleMyTicketsUpgradeDestinations(ticketType: string | null | undefined): readonly MyTicketsUpgradeDestination[] {
  if (!ticketType || !(ticketType in MY_TICKETS_UPGRADE_MATRIX)) {
    return [];
  }

  return MY_TICKETS_UPGRADE_MATRIX[ticketType as MyTicketsUpgradeableTicketType];
}

export function hasEligibleMyTicketsUpgradeDestinations(ticketType: string | null | undefined) {
  return getEligibleMyTicketsUpgradeDestinations(ticketType).length > 0;
}