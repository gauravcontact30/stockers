import { NextResponse } from "next/server";
import { companyLogoUrl } from "../../../lib/indian-stocks";
import { anticipatedIpos } from "../../../lib/open-ipos";
import { getIpoFeed } from "../../../lib/nse-ipos";

export const dynamic = "force-dynamic";

// A company's website isn't published by NSE, so the logo is guessed from the company name. This
// misses often; the card falls back to an initial when the favicon 404s.
function domainGuess(company: string): string {
  const slug = company
    .toLowerCase()
    .replace(/\b(limited|ltd|private|pvt|india|industries|enterprises|ventures)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return `${slug}.com`;
}

export async function GET() {
  const feed = await getIpoFeed();

  const ipos = feed.ipos.map((ipo) => ({
    ...ipo,
    id: ipo.symbol,
    logo: companyLogoUrl(domainGuess(ipo.company)),
  }));

  // Still curated: no public feed lists companies that haven't filed a window yet.
  const anticipated = anticipatedIpos.map((ipo) => ({ ...ipo, logo: companyLogoUrl(ipo.domain) }));

  return NextResponse.json({
    ipos,
    anticipated,
    counts: feed.counts,
    today: feed.today,
    live: feed.live,
    generatedAt: feed.fetchedAt,
    source: feed.live
      ? "Live IPO calendar and subscription figures from NSE India"
      : "NSE IPO feed unreachable right now",
  });
}
