// Food partners — FICTIONAL DEMO DATA (Cosmico).
// Vendors, founders, handles and websites are invented placeholders for the
// open-source demo. Imagery is retained demo asset filler, not a depiction of
// the fictional vendors below.
// Each vendor gets a landing page at /eat/:slug

export interface FoodVendor {
  slug: string;
  name: string;
  logo?: string;
  founderPhoto?: string;
  detailPhoto?: string;
  founderNames: string;
  servingWithNames?: string;
  instagram?: string;
  website?: string;
  blurb: string;
  shortDescriptor?: string;
  pronoun?: 'him' | 'her' | 'them';
}

// Example Valley Pizza Co
import sonomaPizzaLogo from "@/assets/may/foodvendors/sonoma-pizza-logo.png";
import sonomaPizzaFounder from "@/assets/may/foodvendors/sonoma-pizza-founder.jpg";
import sonomaPizzaHero from "@/assets/may/foodvendors/sonoma-pizza-hero.jpg";

// Bazaar Example Valley
import bazaarSonomaLogo from "@/assets/may/foodvendors/bazaar-sonoma-logo.png";
import bazaarSonomaFounder from "@/assets/may/foodvendors/bazaar-sonoma-founder.jpg";
import bazaarSonomaHero from "@/assets/may/foodvendors/bazaar-sonoma-hero.jpg";

// Tidepool Oysters
import nelliesOystersLogo from "@/assets/may/foodvendors/nellies-oysters-logo.png";
import nelliesOystersFounder from "@/assets/may/foodvendors/nellies-oysters-founder.jpg";
import nelliesOystersHero from "@/assets/may/foodvendors/nellies-oysters-hero.jpg";

// Field Day Ca
import fieldDayLogo from "@/assets/may/field-day-logo.jpg";
import fieldDayDinner from "@/assets/may/dinner-long-table.jpg";

export const foodVendors: FoodVendor[] = [
  {
    slug: "commons-pizza",
    name: "Commons Pizza",
    logo: sonomaPizzaLogo,
    founderPhoto: sonomaPizzaHero,
    detailPhoto: sonomaPizzaFounder,
    founderNames: "Demo Founder A & Demo Founder B",
    shortDescriptor: "Wood-fired sourdough pizza. Demo vendor.",
    instagram: "example_commonspizza",
    website: "https://example.org/commons-pizza",
    blurb: "Fictional demo vendor. Long-fermented dough, seasonal toppings, blistered crusts. This copy is placeholder text for the Cosmico demo event.",
  },
  {
    slug: "night-market",
    name: "Night Market Kitchen",
    logo: bazaarSonomaLogo,
    founderPhoto: bazaarSonomaFounder,
    detailPhoto: bazaarSonomaHero,
    founderNames: "Demo Founder C & Demo Founder D",
    shortDescriptor: "Regional dumplings and noodles. Demo vendor.",
    instagram: "example_nightmarket",
    website: "https://example.org/night-market",
    blurb: "Fictional demo vendor. A pop-up turned imaginary restaurant, included so the demo site shows a second food partner. Placeholder copy only.",
  },
  {
    slug: "tidepool-oysters",
    name: "Tidepool Oysters",
    logo: nelliesOystersLogo,
    founderPhoto: nelliesOystersFounder,
    detailPhoto: nelliesOystersHero,
    founderNames: "Demo Founder E",
    shortDescriptor: "Oysters, raw or grilled. Demo vendor.",
    instagram: "example_tidepool",
    blurb: "Fictional demo vendor. Shucking at the imaginary market stall all weekend. Placeholder copy only.",
  },
  {
    slug: "long-table",
    name: "Long Table Supper",
    logo: fieldDayLogo,
    founderPhoto: fieldDayDinner,
    detailPhoto: fieldDayDinner,
    founderNames: "Long Table Supper",
    shortDescriptor: "Opening-night long-table dinner. Demo vendor.",
    instagram: "example_longtable",
    blurb: "Fictional demo vendor. Opens the demo weekend with a long-table dinner under open skies. Placeholder copy only.",
  },
];

export const getFoodVendorBySlug = (slug: string): FoodVendor | undefined => {
  return foodVendors.find(v => v.slug === slug);
};
