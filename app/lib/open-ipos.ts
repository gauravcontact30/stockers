// A manually curated snapshot of India's open/upcoming mainboard IPO pipeline, captured
// 2026-08-01 from public IPO trackers (Groww, Chittorgarh, Business Standard, BusinessToday).
// There is no live IPO calendar API wired into this app, so this is a point-in-time snapshot,
// not a live feed — dates, price bands, and the roster itself need periodic manual refreshing
// to stay current. Status (open / upcoming / listing awaited) is computed at request time from
// these dates rather than hardcoded, so at least the label stays accurate as days pass.
export type OpenIpo = {
  id: string;
  company: string;
  sector: string;
  domain: string;
  exchange: string;
  summary: string;
  priceBandMin?: number;
  priceBandMax?: number;
  issueSizeCr?: number;
  openDate?: string; // YYYY-MM-DD, IST
  closeDate?: string;
  listingDate?: string; // tentative
};

export const openIpoPipeline: OpenIpo[] = [
  {
    id: "juniper-green-energy",
    company: "Juniper Green Energy",
    sector: "Power & Utilities",
    domain: "junipergreenenergy.com",
    exchange: "NSE, BSE",
    summary:
      "Renewable energy independent power producer with a roughly 7.9 GW solar, wind, hybrid and battery-storage portfolio, selling power under 20-25 year PPAs.",
    priceBandMin: 214,
    priceBandMax: 225,
    issueSizeCr: 1800,
    openDate: "2026-07-30",
    closeDate: "2026-08-03",
  },
  {
    id: "ardee-industries",
    company: "Ardee Industries",
    sector: "Metals & Mining",
    domain: "ardeeindustries.com",
    exchange: "NSE, BSE",
    summary:
      "Recycles end-of-life batteries and non-ferrous scrap into high-purity lead and lead alloys for the energy-storage, e-mobility, and automotive industries.",
    priceBandMin: 50,
    priceBandMax: 53,
    issueSizeCr: 426,
    openDate: "2026-08-05",
    closeDate: "2026-08-07",
    listingDate: "2026-08-12",
  },
];

// Widely-reported IPO candidates without a confirmed filing window yet.
export type AnticipatedIpo = {
  company: string;
  sector: string;
  domain: string;
  note: string;
};

export const anticipatedIpos: AnticipatedIpo[] = [
  {
    company: "NSE (National Stock Exchange of India)",
    sector: "Capital Markets",
    domain: "nseindia.com",
    note: "India's largest stock exchange — a long-anticipated listing pending final regulatory clearances.",
  },
  {
    company: "Reliance Jio",
    sector: "Telecom",
    domain: "jio.com",
    note: "Reliance's telecom arm has been widely flagged as a future listing candidate.",
  },
  {
    company: "Zepto",
    sector: "Retail",
    domain: "zeptonow.com",
    note: "Quick-commerce delivery platform reported to be preparing for an Indian listing.",
  },
  {
    company: "Razorpay",
    sector: "NBFC & Financial Services",
    domain: "razorpay.com",
    note: "Payments platform that has been redomiciling to India ahead of a potential IPO.",
  },
  {
    company: "Truhome Finance",
    sector: "NBFC & Financial Services",
    domain: "truhomefinance.com",
    note: "Affordable-housing finance company (formerly Tata Capital Housing Finance) reported to be IPO-bound.",
  },
];
