import { ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";

import type { AddonAvailabilityState } from "@/lib/addons";
import { isWineCampIncludedTicketType } from "@/lib/addons";
import { COLORS, typography } from "@/styles/may-theme";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface WineCampCardStateInput {
  userTicketTypes: string[];
  primaryTicketType?: string | null;
  availability: AddonAvailabilityState;
  soldOut: boolean;
  upgradeAvailable: boolean;
}

export function getWineCampCardState({
  userTicketTypes,
  primaryTicketType,
  availability,
  soldOut,
  upgradeAvailable,
}: WineCampCardStateInput) {
  const bookingHasWineCampIncluded = userTicketTypes.some((ticketType) => isWineCampIncludedTicketType(ticketType));
  const isIncludedInWallet = bookingHasWineCampIncluded && !availability.isIncluded;
  const isIncluded = availability.isIncluded || isIncludedInWallet;
  const isUnavailable = !availability.isEligible && !isIncluded;
  const showFridayExplanation = isUnavailable && !!primaryTicketType?.toLowerCase().includes("friday");
  const showUpgrade = isUnavailable && upgradeAvailable && !bookingHasWineCampIncluded && !soldOut;

  return {
    bookingHasWineCampIncluded,
    isIncludedInWallet,
    isIncluded,
    isUnavailable,
    showFridayExplanation,
    showUpgrade,
  };
}

function getWineCampUnavailableDetail(primaryTicketType?: string | null, fallbackReason?: string | null) {
  const normalizedTicketType = primaryTicketType?.toLowerCase() ?? "";

  if (normalizedTicketType.includes("friday")) {
    return "Unavailable for this ticket: Wine Camp runs Saturday only, and your current ticket is Friday-only.";
  }

  if (normalizedTicketType.includes("saturday")) {
    return "Unavailable for this ticket: Saturday-only admission does not include Wine Camp. It’s included with 2-Day GA, VIP 3-Day, Crew, and Patron tickets.";
  }

  return fallbackReason ?? "Wine Camp isn’t available for this ticket.";
}

interface WineCampCardStateProps extends WineCampCardStateInput {
  onUpgrade?: () => void;
}

function WineCampEligibilityTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
            aria-label="Wine Camp eligibility details"
            style={{ ...typography.caption, color: COLORS.boulder, fontSize: '10px', letterSpacing: '0.06em' }}
          >
            <Info className="h-3.5 w-3.5" />
            Wine Camp ticket details
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[260px]">
          <p style={{ ...typography.body, fontSize: '12px', lineHeight: 1.55 }}>
            Runs Saturday only. Included with 2-Day GA, VIP 3-Day, Crew, and Patron tickets.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function WineCampCardState(props: WineCampCardStateProps) {
  const state = getWineCampCardState(props);

  if (state.isIncluded) {
    return (
      <div className="mt-4 space-y-3">
        <p style={{ ...typography.body, color: COLORS.forest, fontSize: '12px', lineHeight: 1.55 }}>
          {state.isIncludedInWallet
            ? "Wine Camp happens Saturday and is already included with a qualifying weekend ticket in this wallet."
            : "Included with your current ticket."}
        </p>
        <Link
          to="/winecamp"
          className="inline-flex items-center gap-2 hover:opacity-70 transition-opacity"
          style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em' }}
        >
          View details
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <WineCampEligibilityTooltip />
      </div>
    );
  }

  if (!state.isUnavailable) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', lineHeight: 1.55 }}>
        {getWineCampUnavailableDetail(props.primaryTicketType, props.availability.unavailableReason)}
      </p>

      {state.showFridayExplanation ? (
        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px', lineHeight: 1.55 }}>
          Friday-only tickets don&apos;t include Wine Camp because it takes place on Saturday.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          to="/almost-here#venue-map"
          className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em' }}
        >
          Venue map
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          to="/faq#wine-camp-eligibility"
          className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ ...typography.caption, color: COLORS.clay, fontSize: '11px', letterSpacing: '0.08em' }}
        >
          Wine Camp FAQ
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {state.showUpgrade ? (
        <button
          type="button"
          onClick={props.onUpgrade}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: COLORS.clay, color: COLORS.white, ...typography.button, fontSize: '11px' }}
        >
          Upgrade
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <WineCampEligibilityTooltip />
    </div>
  );
}

export default WineCampCardState;