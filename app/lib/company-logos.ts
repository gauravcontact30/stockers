// Real company logos, keyed by the ticker the exchange itself publishes.
//
// The old approach guessed a website from the ticker (`SBIN` → `sbin.com`, `IDEA` → `idea.com`)
// and asked a favicon service for it. That guess is wrong more often than it is right: most of
// those domains belong to some other business entirely, so the icon beside a stock was regularly
// another company's logo — worse than showing none at all. So the guessing is gone.
//
// Instead the ticker is looked up in a logo store keyed by the listed symbol itself, which means
// the mark beside RELIANCE is Reliance's own or nothing. Names the store doesn't carry fall back
// to a monogram in <CompanyLogo>; for the long tail of small caps that is the expected outcome,
// not a failure.

const LOGO_HOST = "https://images.dhan.co/symbol";

// Series markers a ticker can pick up on its way through a feed. `-BE`/`-BZ` are NSE surveillance
// series and `.NS`/`.BO` are Yahoo's exchange suffixes; none of them are part of the symbol.
// Note that a bare hyphen is *not* a suffix marker — BAJAJ-AUTO and BAJAJ-AUTO alone is the whole
// ticker — so only these exact endings are trimmed.
const SERIES_SUFFIXES = ["-EQ", "-BE", "-BZ", "-SM", "-ST", "-RT", "-IQ"];
const EXCHANGE_SUFFIXES = [".NS", ".BO", ".NSE", ".BSE"];

/** The bare exchange ticker: upper case, no exchange suffix, no series marker. */
export function normaliseTicker(symbol: string): string {
  let ticker = symbol.trim().toUpperCase();

  for (const suffix of EXCHANGE_SUFFIXES) {
    if (ticker.endsWith(suffix)) {
      ticker = ticker.slice(0, -suffix.length);
      break;
    }
  }

  for (const suffix of SERIES_SUFFIXES) {
    if (ticker.endsWith(suffix)) {
      ticker = ticker.slice(0, -suffix.length);
      break;
    }
  }

  return ticker.trim();
}

// What a listed ticker can actually look like: letters, digits, and the `&`/`-` that names like
// M&M and BAJAJ-AUTO carry. Anything else — most obviously a company name with spaces in it, as
// an unlisted IPO candidate has — is not a ticker and there is nothing to look up.
const TICKER_SHAPE = /^[A-Z0-9&-]{1,20}$/;

/**
 * The logo URL for a listed ticker, or null when there is no ticker to look one up by.
 *
 * A non-null URL is not a promise that a logo exists — the store answers 404/403 for anything it
 * doesn't carry, and the component treats that as "draw the monogram instead".
 */
export function stockLogoUrl(symbol: string | null | undefined): string | null {
  if (!symbol) return null;

  const ticker = normaliseTicker(symbol);
  if (!TICKER_SHAPE.test(ticker)) return null;

  return `${LOGO_HOST}/${encodeURIComponent(ticker)}.png`;
}

/**
 * Verified websites for tickers the symbol store does not carry.
 *
 * Every entry was checked against the live favicon service before being added: the store answers
 * 403 for these, so without a domain they draw a monogram however well known the company is.
 * `LEAPIND` is the general case — a company that listed days ago arrives from the exchange feed
 * rather than the tracked catalogue, so there is nowhere else for its domain to live.
 */
export const CHECKED_LOGO_DOMAINS: Record<string, string> = {
  BDL: "bdl-india.in",
  ENRIN: "siemens-energy.com",
  LEAPIND: "leapindia.net",
  LGEINDIA: "lg.com",
  PIRAMALFIN: "piramalfinance.com",
  PNGJL: "pngjewellers.com",
  PWL: "pw.live",
  SOLARINDS: "solargroup.com",
  TBZ: "tbztheoriginal.com",
  VAML: "vedantalimited.com",
};

export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * The best real logo we have for a listed company: the ticker store's mark, or its website's.
 *
 * The order used to be the other way round, on the reasoning that a hand-checked domain is the
 * more trustworthy source. Measured against the live services it is not: Google's favicon endpoint
 * has no mark for roughly a third of the checked domains — dabur.com, biocon.com, hcltech.com and
 * ~77 others — and answers 404 with a generic grey globe, while the symbol store returned the real
 * logo for every one of those tickers. Domain-first therefore replaced correct logos with a
 * placeholder, and callers that render this URL directly had no second chance.
 *
 * So the store leads. It is keyed by the symbol the exchange itself publishes, so a hit cannot be
 * another business's logo, and the website favicon sits behind it for the handful of tickers the
 * store has never carried. Null means we have neither and the caller should draw a monogram.
 */
export function stockIcon(symbol: string | null | undefined, domain?: string | null): string | null {
  // The store is asked for a URL, not for a promise that it has one, so the tickers it is known to
  // answer 403 for have to be taken out first — otherwise they resolve to a store URL that renders
  // as a broken image for any caller without a fallback chain.
  const checked = symbol ? CHECKED_LOGO_DOMAINS[normaliseTicker(symbol)] : undefined;
  if (checked) return faviconUrl(checked);

  return stockLogoUrl(symbol) ?? (domain ? faviconUrl(domain) : null);
}
