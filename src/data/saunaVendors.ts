// Wellness partners — FICTIONAL DEMO DATA (Cosmico).
// Vendors, founders, handles and websites are invented placeholders for the
// open-source demo.
// Each vendor gets a landing page at /sauna/:slug
// (URL kept as /sauna for now; UI framing is "Wellness")

export type WellnessDiscipline = 'sauna' | 'sound-bath';

export interface SaunaVendor {
  slug: string;
  name: string;
  discipline?: WellnessDiscipline; // defaults to 'sauna'
  logo?: string;
  founderPhoto?: string;
  detailPhoto?: string;
  founderNames: string;
  servingWithNames?: string;
  instagram?: string;
  website?: string;
  blurb: string;
  pronoun?: 'him' | 'her' | 'them';
}

// Riverbank (demo)
import fjordHero from "@/assets/may/saunavendors/fjord-hero.jpg";
import fjordDetail from "@/assets/may/saunavendors/fjord-detail.jpg";
import fjordFounder from "@/assets/may/saunavendors/fjord-founder.jpg";
import fjordLogo from "@/assets/may/saunavendors/fjord-logo.png";

// Sunhouse Sauna
import sundropHero from "@/assets/may/saunavendors/sundrop-hero.jpg";
import sundropDetail from "@/assets/may/saunavendors/sundrop-detail.jpg";
import sundropFounder from "@/assets/may/saunavendors/sundrop-founder.jpg";
import sundropLogo from "@/assets/may/saunavendors/sundrop-logo.png";

// Still Hour Sound — Sound Meditation
import andersonFounder from "@/assets/may/saunavendors/anderson-pugash-founder.jpg";
import andersonDetail from "@/assets/may/saunavendors/anderson-pugash-detail.jpg";

export const saunaVendors: SaunaVendor[] = [
  {
    slug: "riverbank-sauna",
    name: "Riverbank Sauna",
    discipline: "sauna",
    logo: fjordLogo,
    founderPhoto: fjordFounder,
    detailPhoto: fjordDetail,
    founderNames: "Demo Host One",
    instagram: "example_riverbank",
    website: "https://example.org/riverbank-sauna",
    blurb: "Fictional demo vendor. Hot sauna in the morning, cold plunge after. Placeholder copy for the Cosmico demo event.",
  },
  {
    slug: "sunhouse-sauna",
    name: "Sunhouse Sauna",
    discipline: "sauna",
    logo: sundropLogo,
    founderPhoto: sundropFounder,
    detailPhoto: sundropDetail,
    founderNames: "Demo Host Two",
    instagram: "example_sunhouse",
    website: "https://example.org/sunhouse-sauna",
    blurb: "Fictional demo vendor. A sauna village with an outdoor lounge, invented for the demo lineup. Placeholder copy only.",
  },
  {
    slug: "still-hour",
    name: "Still Hour Sound",
    discipline: "sound-bath",
    founderPhoto: andersonFounder,
    detailPhoto: andersonDetail,
    founderNames: "Demo Host Three",
    instagram: "example_stillhour",
    website: "https://example.org/still-hour",
    blurb: "Fictional demo vendor. Gongs, bowls, and a long communal drift between music sets. Placeholder copy only.",
    pronoun: "him",
  },
];

export const getSaunaVendorBySlug = (slug: string): SaunaVendor | undefined => {
  return saunaVendors.find(v => v.slug === slug);
};
