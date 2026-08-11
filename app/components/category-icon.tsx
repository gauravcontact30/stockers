/**
 * A drawn mark for each exchange category.
 *
 * The categories are BSE's own industry buckets, and there is no logo for an industry the way
 * there is for a company — so these are glyphs that say what the industry *is*: a car for auto, a
 * flask for chemicals, a pylon for power. Drawn inline rather than pulled from an icon package:
 * twenty-three marks at one weight is less code than a dependency, and they inherit `currentColor`
 * so each one takes the tint of the category tile it sits in.
 *
 * Matching is by keyword rather than exact name so a category BSE renames slightly — "Automobile
 * and Auto Components" to "Automobiles", say — keeps its icon instead of silently falling back.
 */

/** A glyph is the paths inside the 24x24 box, not a component — see CategoryIcon below. */
type Glyph = React.ReactNode;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function frame(paths: React.ReactNode): Glyph {
  return paths;
}

const Car = frame(
  <>
    <path d="M4 15h16v-3l-2-4H6l-2 4v3Z" {...stroke} />
    <path d="M7 15v2m10-2v2M4.5 12h15" {...stroke} />
  </>,
);

const Gear = frame(
  <>
    <circle cx="12" cy="12" r="3" {...stroke} />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" {...stroke} />
  </>,
);

const Flask = frame(
  <>
    <path d="M10 3h4M11 3v6L6 18a2 2 0 0 0 1.8 3h8.4A2 2 0 0 0 18 18l-5-9V3" {...stroke} />
    <path d="M8.5 14h7" {...stroke} />
  </>,
);

const Crane = frame(
  <>
    <path d="M4 21h16M6 21V7l12-2v4M6 11h12" {...stroke} />
    <path d="M14 9v4" {...stroke} />
  </>,
);

const Bricks = frame(
  <>
    <path d="M3 9h18M3 15h18M3 5h18v14H3z" {...stroke} />
    <path d="M9 5v4M15 9v6M9 15v4" {...stroke} />
  </>,
);

const Tv = frame(
  <>
    <rect x="3" y="5" width="18" height="12" rx="2" {...stroke} />
    <path d="M8 21h8" {...stroke} />
  </>,
);

const Cart = frame(
  <>
    <path d="M3 4h2l2.4 10.2A2 2 0 0 0 9.3 16h7.6a2 2 0 0 0 2-1.6L20 7H6" {...stroke} />
    <circle cx="10" cy="20" r="1.2" {...stroke} />
    <circle cx="17" cy="20" r="1.2" {...stroke} />
  </>,
);

const Server = frame(
  <>
    <rect x="3.5" y="4" width="17" height="6" rx="1.5" {...stroke} />
    <rect x="3.5" y="14" width="17" height="6" rx="1.5" {...stroke} />
    <path d="M7 7h.01M7 17h.01" {...stroke} />
  </>,
);

const Grid = frame(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...stroke} />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...stroke} />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...stroke} />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" {...stroke} />
  </>,
);

const Basket = frame(
  <>
    <path d="M3.5 9h17l-1.7 9.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L3.5 9Z" {...stroke} />
    <path d="M8.5 9 12 3.5 15.5 9" {...stroke} />
  </>,
);

const Bank = frame(
  <>
    <path d="M3.5 9.5 12 4l8.5 5.5M5 10v8m4-8v8m6-8v8m4-8v8M3.5 20.5h17" {...stroke} />
  </>,
);

const Tree = frame(
  <>
    <path d="M12 3 6.5 11h3L5 17h14l-4.5-6h3L12 3Z" {...stroke} />
    <path d="M12 17v4" {...stroke} />
  </>,
);

const Cross = frame(
  <>
    <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6v-6Z" {...stroke} />
  </>,
);

const Chip = frame(
  <>
    <rect x="7" y="7" width="10" height="10" rx="1.5" {...stroke} />
    <path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5" {...stroke} />
  </>,
);

const Play = frame(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...stroke} />
    <path d="m10.5 9.5 4.5 2.5-4.5 2.5v-5Z" {...stroke} />
  </>,
);

const Pickaxe = frame(
  <>
    <path d="M4 20 14 10M3.5 9.5c3-3.5 7-4.5 10-3.5M20.5 14.5c-3 3.5-7 4.5-10 3.5" {...stroke} />
    <path d="m13 7 4 4" {...stroke} />
  </>,
);

const Droplet = frame(
  <>
    <path d="M12 3.5c3.5 4 6 6.8 6 9.8a6 6 0 0 1-12 0c0-3 2.5-5.8 6-9.8Z" {...stroke} />
  </>,
);

const Bolt = frame(
  <>
    <path d="M13.5 3 5.5 13.5H11L10 21l8.5-10.5H13l.5-7.5Z" {...stroke} />
  </>,
);

const Building = frame(
  <>
    <path d="M4.5 20.5V6l7-2.5v17M11.5 9.5h8v11M4.5 20.5h16" {...stroke} />
    <path d="M14.5 13h2M14.5 16.5h2M7 8.5h2M7 12h2M7 15.5h2" {...stroke} />
  </>,
);

const Briefcase = frame(
  <>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" {...stroke} />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" {...stroke} />
  </>,
);

const Antenna = frame(
  <>
    <path d="M12 10.5v10M8.5 7a5 5 0 0 1 7 0M5.5 4a9 9 0 0 1 13 0" {...stroke} />
    <circle cx="12" cy="9.5" r="1.4" {...stroke} />
  </>,
);

const Spool = frame(
  <>
    <path d="M7 3.5h10l-1.5 4h-7L7 3.5ZM8.5 7.5h7l1.5 13H7l1.5-13Z" {...stroke} />
    <path d="M9 12h6M8.5 16h7" {...stroke} />
  </>,
);

const Bulb = frame(
  <>
    <path d="M9 17h6M10 20h4M12 3.5a5.5 5.5 0 0 1 3.5 9.7V17h-7v-3.8A5.5 5.5 0 0 1 12 3.5Z" {...stroke} />
  </>,
);

/** Keyword to glyph, most specific first — the first keyword found in the name wins. */
const MATCHES: [string, Glyph][] = [
  ["auto", Car],
  ["capital goods", Gear],
  ["chemical", Flask],
  ["construction material", Bricks],
  ["construction", Crane],
  ["consumer durable", Tv],
  ["consumer service", Cart],
  ["data cent", Server],
  ["diversified", Grid],
  ["consumer goods", Basket],
  ["fmcg", Basket],
  ["financial", Bank],
  ["forest", Tree],
  ["health", Cross],
  ["pharma", Cross],
  ["information technology", Chip],
  ["media", Play],
  ["metal", Pickaxe],
  ["mining", Pickaxe],
  ["oil", Droplet],
  ["gas", Droplet],
  ["power", Bolt],
  ["realty", Building],
  ["service", Briefcase],
  ["telecom", Antenna],
  ["textile", Spool],
  ["utilities", Bulb],
];

/** What a category with no keyword match gets: a neutral mark, never a wrong one. */
const Fallback = frame(
  <>
    <circle cx="12" cy="12" r="8.5" {...stroke} />
    <path d="M12 8v4l2.5 2.5" {...stroke} />
  </>,
);

export function glyphFor(category: string): Glyph {
  const name = category.toLowerCase();
  for (const [keyword, glyph] of MATCHES) {
    if (name.includes(keyword)) return glyph;
  }
  return Fallback;
}

/** The category's own mark, taking the colour of whatever it sits in. */
export function CategoryIcon({ category, className = "h-5 w-5" }: { category: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {glyphFor(category)}
    </svg>
  );
}
