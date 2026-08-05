import { NextResponse } from "next/server";
import { companyLogoUrl } from "../../../lib/indian-stocks";
import { anticipatedIpos, openIpoPipeline, type OpenIpo } from "../../../lib/open-ipos";

export const dynamic = "force-dynamic";

type IpoStatus = "upcoming" | "open" | "listing_soon" | "listed";

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function computeStatus(ipo: OpenIpo, today: string): IpoStatus {
  if (!ipo.openDate) return "upcoming";
  if (today < ipo.openDate) return "upcoming";
  if (ipo.closeDate && today > ipo.closeDate) {
    if (ipo.listingDate && today > ipo.listingDate) return "listed";
    return "listing_soon";
  }
  return "open";
}

export async function GET() {
  const today = todayIST();

  const ipos = openIpoPipeline
    .map((ipo) => ({
      ...ipo,
      logo: companyLogoUrl(ipo.domain),
      status: computeStatus(ipo, today),
    }))
    // Once a company has actually listed, it belongs in a live-quote screen, not the open/upcoming pipeline.
    .filter((ipo) => ipo.status !== "listed")
    .sort((a, b) => {
      const order: Record<IpoStatus, number> = { open: 0, listing_soon: 1, upcoming: 2, listed: 3 };
      return order[a.status] - order[b.status];
    });

  const anticipated = anticipatedIpos.map((ipo) => ({
    ...ipo,
    logo: companyLogoUrl(ipo.domain),
  }));

  return NextResponse.json({
    ipos,
    anticipated,
    asOfDate: "2026-08-01",
    generatedAt: new Date().toISOString(),
    source:
      "Manually curated snapshot of public IPO trackers (Groww, Chittorgarh, Business Standard, BusinessToday) — not a live IPO calendar feed.",
  });
}
