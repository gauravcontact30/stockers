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
