import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import Tickets from "@/modules/ticketing/pages/Tickets";
import { render, screen, waitFor } from "@/test/test-utils";

const mocks = vi.hoisted(() => ({
  trackTicketSelectMock: vi.fn(),
  trackPageViewMock: vi.fn(),
  trackDetailsExpandedMock: vi.fn(),
  trackEmailCaptureMock: vi.fn(),
  trackCheckoutSubmitMock: vi.fn(),
  funnelCheckoutStartMock: vi.fn(),
  funnelTicketsMock: vi.fn(),
  trackGA4ViewItemMock: vi.fn(),
  trackGA4ViewItemListMock: vi.fn(),
  trackGA4SelectItemMock: vi.fn(),
  trackGA4AddToCartMock: vi.fn(),
  initScrollDepthTrackingMock: vi.fn(() => vi.fn()),
  supabaseFromMock: vi.fn((table: string) => {
    if (table === "ticket_inventory") {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      };
    }

    if (table === "lodging_settings") {
      return {
        select: vi.fn(() => ({
          limit: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { lodging_enabled: false }, error: null }),
          })),
        })),
      };
    }

    return {
      select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }),
}));

vi.mock("@/hooks/useUTMTracking", () => ({
  useUTMCapture: vi.fn(),
}));

vi.mock("@/hooks/useCanonicalUrl", () => ({
  useCanonicalUrl: vi.fn(),
}));

vi.mock("@/hooks/useCheckoutFees", () => ({
  useCheckoutFees: () => ({ fees: [], totalFees: 0 }),
}));

vi.mock("@/hooks/usePaymentPlan", () => ({
  usePaymentPlan: () => ({ breakdown: { available: false } }),
  formatCentsToDollars: (value: number) => `$${(value / 100).toFixed(2)}`,
}));

vi.mock("@/hooks/useCheckoutErrorReporting", () => ({
  useCheckoutErrorReporting: () => ({ reportError: vi.fn() }),
}));

vi.mock("@/hooks/useCartIntentTracking", () => ({
  useCartIntentTracking: () => ({
    trackPageView: mocks.trackPageViewMock,
    trackTicketSelect: mocks.trackTicketSelectMock,
    trackQuantityChange: vi.fn(),
    trackDetailsExpanded: mocks.trackDetailsExpandedMock,
    trackEmailCapture: mocks.trackEmailCaptureMock,
    trackCheckoutSubmit: mocks.trackCheckoutSubmitMock,
  }),
}));

vi.mock("@/hooks/useExitIntent", () => ({ useExitIntent: vi.fn() }));
vi.mock("@/hooks/useHighIntentDetection", () => ({ useHighIntentDetection: vi.fn() }));
vi.mock("@/hooks/useIdleHesitation", () => ({ useIdleHesitation: vi.fn() }));
vi.mock("@/hooks/useScrollDepthTrigger", () => ({ useScrollDepthTrigger: vi.fn() }));
vi.mock("@/hooks/useRealtimeFieldCapture", () => ({ useRealtimeFieldCapture: vi.fn() }));

vi.mock("@/components/may/EmailCapture", () => ({
  default: () => <div data-testid="email-capture" />,
}));

vi.mock("@/components/checkout/CheckoutProgress", () => ({
  CheckoutProgress: ({ currentStep }: { currentStep: number }) => <div data-testid="checkout-progress">{currentStep}</div>,
}));

vi.mock("@/components/checkout/FeeBreakdown", () => ({
  FeeBreakdown: () => <div data-testid="fee-breakdown" />,
}));

vi.mock("@/components/AnalyticsTracking", () => ({
  trackGA4ViewItem: mocks.trackGA4ViewItemMock,
  trackGA4AddToCart: mocks.trackGA4AddToCartMock,
  trackGA4BeginCheckout: vi.fn(),
  trackGA4ViewItemList: mocks.trackGA4ViewItemListMock,
  trackGA4SelectItem: mocks.trackGA4SelectItemMock,
  setGoogleUserData: vi.fn(),
  initScrollDepthTracking: mocks.initScrollDepthTrackingMock,
  getFbCookies: vi.fn(() => ({ fbp: null, fbc: null })),
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  Funnel: {
    tickets: mocks.funnelTicketsMock,
    checkoutStart: mocks.funnelCheckoutStartMock,
    ticketSelected: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.supabaseFromMock,
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe("Tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    Object.defineProperty(window, "requestIdleCallback", {
      writable: true,
      value: vi.fn(() => 1),
    });

    Object.defineProperty(window, "cancelIdleCallback", {
      writable: true,
      value: vi.fn(),
    });
  });

  it("does not fire resolved-selection effects until a matching selectedOption exists", async () => {
    localStorage.setItem(
      "cosmico_ticket_form",
      JSON.stringify({
        selectedTicket: "not_a_real_ticket",
        quantity: 1,
        name: "",
        email: "",
        phone: "",
        agreedToPolicy: false,
        accommodationWaitlist: false,
        childCount: 0,
        youthTicketType: null,
        youthCount: 0,
      }),
    );

    render(<Tickets />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Please reselect your pass before continuing");
    expect(mocks.funnelCheckoutStartMock).not.toHaveBeenCalled();
    expect(mocks.trackTicketSelectMock).not.toHaveBeenCalled();
    expect(mocks.trackGA4SelectItemMock).not.toHaveBeenCalled();
    expect(mocks.trackGA4AddToCartMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button", { name: /weekend pass/i })[0]);

    await waitFor(() => {
      expect(mocks.funnelCheckoutStartMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket_type: "tier_1_ga_2day",
          ticket_price: 239,
          quantity: 1,
        }),
      );
    });

    expect(mocks.trackTicketSelectMock).toHaveBeenCalledWith("tier_1_ga_2day", 1);
    expect(mocks.trackGA4SelectItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          item_id: "tier_1_ga_2day",
          price: 239,
        }),
      }),
    );
  });
});