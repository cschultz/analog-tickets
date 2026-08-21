// Wine Camp participating wineries — FICTIONAL DEMO DATA (Cosmico).
// Every producer, person, handle and website below is invented for the
// open-source demo. `example.org` is a placeholder domain and never resolves
// to a real business. Replace this file with your own event's data.
// Each winery gets a landing page at /winecamp/:slug

export interface Winery {
  slug: string;
  name: string;
  logo?: string;
  winemakerPhoto?: string;
  bottlePhoto?: string;
  winemakerNames: string;
  tasteWithNames?: string;
  instagram?: string;
  website?: string;
  blurb: string;
  pronoun?: 'him' | 'her' | 'them';
}

// Placeholder imagery. The binaries are retained from the demo asset set and
// are not tied to the fictional producers described below.
import rymeCellarsPortrait from "@/assets/may/wineries/ryme-cellars-portrait.jpg";
import rymeBottle from "@/assets/may/wineries/ryme-bottle.jpg";
import bloodrootPortrait from "@/assets/may/wineries/bloodroot-portrait.webp";
import bloodrootBottle from "@/assets/may/wineries/bloodroot-bottle.jpg";
import extradimensionalPortrait from "@/assets/may/wineries/extradimensional-portrait.jpg";
import extradimensionalBottle from "@/assets/may/wineries/extradimensional-bottle.jpg";
import liocoPortrait from "@/assets/may/wineries/lioco-portrait.jpg";
import liocoBottle from "@/assets/may/wineries/lioco-bottle.jpg";
import rootdownPortrait from "@/assets/may/wineries/rootdown-portrait.jpg";
import rootdownBottle from "@/assets/may/wineries/rootdown-bottle.jpg";
import keepWinesPortrait from "@/assets/may/wineries/keep-wines-portrait.jpg";
import keepWinesBottle from "@/assets/may/wineries/keep-wines-bottle.jpg";
import trailmarkerPortrait from "@/assets/may/wineries/trailmarker-portrait.jpg";
import trailmarkerBottle from "@/assets/may/wineries/trailmarker-bottle.jpg";
import arnotRobertsPortrait from "@/assets/may/wineries/arnot-roberts-portrait.jpg";
import arnotRobertsBottle from "@/assets/may/wineries/arnot-roberts-bottle.webp";
import mariettaCellarsPortrait from "@/assets/may/wineries/marietta-cellars-portrait.jpg";
import mariettaCellarsBottle from "@/assets/may/wineries/marietta-cellars-bottle.jpg";
import actaPortrait from "@/assets/may/wineries/acta-portrait.jpg";
import actaBottle from "@/assets/may/wineries/acta-bottle.jpg";
import belongPortrait from "@/assets/may/wineries/belong-portrait.jpg";
import belongBottle from "@/assets/may/wineries/belong-bottle.jpg";
import dujuPortrait from "@/assets/may/wineries/duju-portrait.jpg";
import dujuBottle from "@/assets/may/wineries/duju-bottle.png";

// Placeholder logos from the demo asset set.
import rymeLogo from "@/assets/may/wineries/logos/ryme-logo.png";
import bloodrootLogo from "@/assets/may/wineries/logos/bloodroot-logo.png";
import extradimensionalLogo from "@/assets/may/wineries/logos/extradimensional-logo.png";
import liocoLogo from "@/assets/may/wineries/logos/lioco-logo.png";
import rootdownLogo from "@/assets/may/wineries/logos/rootdown-logo.png";
import keepWinesLogo from "@/assets/may/wineries/logos/keep-wines-logo.png";
import trailmarkerLogo from "@/assets/may/wineries/logos/trailmarker-logo.png";
import arnotRobertsLogo from "@/assets/may/wineries/logos/arnot-roberts-logo.png";
import mariettaLogo from "@/assets/may/wineries/logos/marietta-logo.png";
import actaLogo from "@/assets/may/wineries/logos/acta-logo.png";
import belongLogo from "@/assets/may/wineries/logos/belong-logo.png";
import dujuLogo from "@/assets/may/wineries/logos/duju-logo.png";

export const wineries: Winery[] = [
  {
    slug: "meadowlark",
    name: "Meadowlark Cellars",
    logo: rymeLogo,
    winemakerPhoto: rymeCellarsPortrait,
    bottlePhoto: rymeBottle,
    winemakerNames: "Demo Winemaker One",
    instagram: "example_meadowlark",
    website: "https://example.org/meadowlark",
    blurb: "Fictional demo producer. A small two-person cellar in the invented town of Example Valley, working with cool-climate fruit and neutral vessels. All copy here is placeholder text for the Cosmico demo event.",
  },
  {
    slug: "stonefruit",
    name: "Stonefruit Wines",
    logo: bloodrootLogo,
    winemakerPhoto: bloodrootPortrait,
    bottlePhoto: bloodrootBottle,
    winemakerNames: "Demo Winemaker Two",
    instagram: "example_stonefruit",
    website: "https://example.org/stonefruit",
    blurb: "Fictional demo producer. Bright, low-intervention bottlings made for long tables. Replace this blurb with your own partner copy.",
  },
  {
    slug: "ripple",
    name: "Ripple Wine Co.",
    logo: extradimensionalLogo,
    winemakerPhoto: extradimensionalPortrait,
    bottlePhoto: extradimensionalBottle,
    winemakerNames: "Demo Winemaker Three",
    tasteWithNames: "Demo Host A & Demo Host B",
    instagram: "example_ripple",
    website: "https://example.org/ripple",
    blurb: "Fictional demo producer. A one-person, all-vibes operation invented purely to populate the demo Wine Camp page.",
  },
  {
    slug: "tidewater",
    name: "Tidewater Wine",
    logo: liocoLogo,
    winemakerPhoto: liocoPortrait,
    bottlePhoto: liocoBottle,
    winemakerNames: "Demo Winemaker Four",
    tasteWithNames: "Demo Host C",
    instagram: "example_tidewater",
    website: "https://example.org/tidewater",
    blurb: "Fictional demo producer. Lean, restrained wines from imaginary coastal sites. Placeholder copy only.",
  },
  {
    slug: "dryfield",
    name: "Dryfield Cellars",
    logo: rootdownLogo,
    winemakerPhoto: rootdownPortrait,
    bottlePhoto: rootdownBottle,
    winemakerNames: "Demo Winemaker Five",
    instagram: "example_dryfield",
    website: "https://example.org/dryfield",
    blurb: "Fictional demo producer. Old-vine field blends from an invented valley floor. Placeholder copy only.",
  },
  {
    slug: "northfence",
    name: "North Fence Wines",
    logo: keepWinesLogo,
    winemakerPhoto: keepWinesPortrait,
    bottlePhoto: keepWinesBottle,
    winemakerNames: "Demo Winemaker Six",
    instagram: "example_northfence",
    website: "https://example.org/northfence",
    blurb: "Fictional demo producer. Overlooked varieties, native ferments, no fining or filtering. Placeholder copy only.",
  },
  {
    slug: "trailhead",
    name: "Trailhead Wine Co.",
    logo: trailmarkerLogo,
    winemakerPhoto: trailmarkerPortrait,
    bottlePhoto: trailmarkerBottle,
    winemakerNames: "Demo Winemaker Seven",
    instagram: "example_trailhead",
    blurb: "Fictional demo producer. High acid, low alcohol, imaginary vineyards. Placeholder copy only.",
  },
  {
    slug: "twin-oaks",
    name: "Twin Oaks",
    logo: arnotRobertsLogo,
    winemakerPhoto: arnotRobertsPortrait,
    bottlePhoto: arnotRobertsBottle,
    winemakerNames: "Demo Winemaker Eight & Demo Winemaker Nine",
    tasteWithNames: "Demo Host D & Demo Host E",
    instagram: "example_twinoaks",
    website: "https://example.org/twin-oaks",
    blurb: "Fictional demo producer. Two friends, a shared cellar, and entirely invented back story. Placeholder copy only.",
  },
  {
    slug: "clay-hollow",
    name: "Clay Hollow Cellars",
    logo: mariettaLogo,
    winemakerPhoto: mariettaCellarsPortrait,
    bottlePhoto: mariettaCellarsBottle,
    winemakerNames: "Demo Winemaker Ten",
    instagram: "example_clayhollow",
    website: "https://example.org/clay-hollow",
    blurb: "Fictional demo producer. Value-first house reds for the demo event. Placeholder copy only.",
  },
  {
    slug: "longshadow",
    name: "Longshadow Wine",
    logo: actaLogo,
    winemakerPhoto: actaPortrait,
    bottlePhoto: actaBottle,
    winemakerNames: "Demo Winemaker Eleven",
    tasteWithNames: "Demo Host F",
    instagram: "example_longshadow",
    website: "https://example.org/longshadow",
    blurb: "Fictional demo producer. Estate-grown, structured, and completely made up. Placeholder copy only.",
  },
  {
    slug: "driftline",
    name: "Driftline Wine Co.",
    logo: belongLogo,
    winemakerPhoto: belongPortrait,
    bottlePhoto: belongBottle,
    winemakerNames: "Demo Winemaker Twelve & Demo Winemaker Thirteen",
    instagram: "example_driftline",
    website: "https://example.org/driftline",
    blurb: "Fictional demo producer. Sun-faded labels, high-elevation fruit, invented origin story. Placeholder copy only.",
  },
  {
    slug: "sunmark",
    name: "Sunmark Zero-Proof",
    logo: dujuLogo,
    winemakerPhoto: dujuPortrait,
    bottlePhoto: dujuBottle,
    winemakerNames: "Demo Founder One",
    instagram: "example_sunmark",
    website: "https://example.org/sunmark",
    blurb: "Fictional demo producer. A non-alcoholic sparkling option so the demo lineup shows a zero-proof partner. Placeholder copy only.",
    pronoun: "her",
  },
];

export const getWineryBySlug = (slug: string): Winery | undefined => {
  return wineries.find(w => w.slug === slug);
};
