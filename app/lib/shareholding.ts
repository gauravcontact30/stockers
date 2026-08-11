// Who actually owns a listed company, from the company's own quarterly filing.
//
// Every listed entity files a shareholding pattern with the exchanges each quarter under SEBI's
// LODR regulations, and NSE publishes both an index of those filings and the filings themselves as
// XBRL. That is the only source for this that is not an estimate: the categories below —
// promoters, foreign portfolio investors, domestic institutions, government, individual
// shareholders — are the filing's own buckets, and the percentages are the ones the company
// certified, not a split inferred from price or volume.
//
// Two calls per company: the index (which quarters exist, and the promoter/public headline for
// each) and one XBRL file (~500 KB) for the quarter being shown. Filings change once a quarter, so
// the answer is cached for a day.

import { revalidatingBy } from "./cache";
import { CACHE_TAGS } from "./cache";

const INDEX_URL = (symbol: string) =>
  `https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
/** Quarters kept for the trend line. Two years is enough to see a promoter stake move. */
const HISTORY_QUARTERS = 8;

/** The buckets the board reports, in the order it draws them. */
export type OwnerGroup = "promoters" | "fii" | "dii" | "government" | "retail" | "bodies" | "others";

export type OwnerSlice = {
  key: OwnerGroup;
  label: string;
  /** Percent of total shares, 0-100. */
  percent: number;
  /** How many shareholders sit in this bucket, where the filing reports it. */
  holders: number | null;
  /** The filing's own sub-categories behind this bucket. */
  detail: { label: string; percent: number; holders: number | null }[];
};

export type OwnershipQuarter = {
  quarter: string;
  promoter: number;
  publicHeld: number;
};

export type Ownership = {
  symbol: string;
  company: string;
  /** The quarter the split is as of, as filed, e.g. "30-JUN-2026". */
  quarter: string;
  groups: OwnerSlice[];
  /** Retail / institutional / promoter and so on — disjoint, and summing to 100. */
  investorTypes: { key: OwnerGroup; label: string; percent: number }[];
  /** Everything held from outside India: FPIs, FDI, NRIs and foreign nationals. */
  foreignPercent: number;
  /** Every shareholder on the register, which is dominated by individuals. */
  totalHolders: number | null;
  history: OwnershipQuarter[];
  filedOn: string | null;
  source: string;
};

type IndexRow = {
  date?: string;
  name?: string;
  symbol?: string;
  pr_and_prgrp?: string;
  public_val?: string;
  xbrl?: string;
  submissionDate?: string;
  broadcastDate?: string;
};

/**
 * The filing's category members, grouped the way a reader thinks about ownership.
 *
 * These are leaf categories only. The filing also carries its own totals (InstitutionsForeign,
 * InstitutionsDomestic, and so on) and those are deliberately not summed here — adding a total to
 * its own parts would double every figure.
 */
const GROUP_MEMBERS: Record<Exclude<OwnerGroup, "others">, { member: string; label: string }[]> = {
  promoters: [
    { member: "IndividualsOrHinduUndividedFamily", label: "Promoter individuals & HUF" },
    { member: "OtherIndianShareholders", label: "Promoter bodies (Indian)" },
    // A public sector undertaking's promoter is the President of India or a state government, and
    // the filing puts that inside the promoter block rather than under the public "Governments"
    // heading — which is why the totals below, not these leaves, decide each bucket's size.
    { member: "CentralGovernmentOrStateGovernmentS", label: "Government of India / state governments" },
    { member: "Foreign", label: "Promoter bodies (foreign)" },
  ],
  fii: [
    { member: "InstitutionsForeignPortfolioInvestorCategoryOne", label: "FPIs — Category I" },
    { member: "InstitutionsForeignPortfolioInvestorCategoryTwo", label: "FPIs — Category II" },
    { member: "ForeignDirectInvestment", label: "Foreign direct investment" },
    { member: "OtherInstitutionsForeign", label: "Other foreign institutions" },
  ],
  dii: [
    { member: "MutualFundsOrUTI", label: "Mutual funds & UTI" },
    { member: "InsuranceCompanies", label: "Insurance companies" },
    { member: "ProvidentFundsOrPensionFunds", label: "Provident & pension funds" },
    { member: "Banks", label: "Banks" },
    { member: "AlternativeInvestmentFunds", label: "Alternative investment funds" },
    { member: "SovereignWealthFundsDomestic", label: "Sovereign wealth funds" },
    { member: "NBFCsRegisteredWithRBI", label: "NBFCs" },
    { member: "OtherFinancialInstitutions", label: "Other financial institutions" },
  ],
  government: [
    { member: "CentralGovernmentOrPresidentOfIndia", label: "Central government" },
    { member: "StateGovernmentsOrGovernors", label: "State governments" },
    {
      member: "ShareholdingByCompaniesOrBodiesCorporateWhereCentralOrStateGovernmentIsPromoter",
      label: "Government-promoted bodies",
    },
  ],
  retail: [
    { member: "ResidentIndividualShareholdersHoldingNominalShareCapitalUpToRsTwoLakh", label: "Small investors (up to ₹2 lakh)" },
    {
      member: "ResidentIndividualShareholdersHoldingNominalShareCapitalInExcessOfRsTwoLakh",
      label: "Large individual investors (over ₹2 lakh)",
    },
    { member: "NonResidentIndians", label: "Non-resident Indians" },
    { member: "ForeignNationals", label: "Foreign nationals" },
  ],
  bodies: [
    { member: "BodiesCorporate", label: "Bodies corporate" },
    { member: "ForeignCompanies", label: "Foreign companies" },
    { member: "OtherNonInstitutions", label: "Trusts, HUFs, clearing members and others" },
    { member: "InvestorEducationAndProtectionFund", label: "Investor Education & Protection Fund" },
    { member: "AssociateCompaniesOrSubsidiaries", label: "Associate companies & subsidiaries" },
    { member: "DirectorsAndDirectorsRelatives", label: "Directors & their relatives" },
    { member: "KeyManagerialPersonnel", label: "Key managerial personnel" },
    { member: "RelativesOfPromotersOtherThanPromoterGroup", label: "Relatives of promoters" },
    { member: "CustodianOrDRHolder", label: "Custodian / depository receipts" },
  ],
};

const GROUP_LABEL: Record<OwnerGroup, string> = {
  promoters: "Promoters & insiders",
  fii: "Foreign institutional investors",
  dii: "Domestic institutional investors",
  government: "Government",
  retail: "Retail & individual investors",
  bodies: "Corporate bodies & trusts",
  others: "Unclassified in the filing",
};

/** Held from outside India, wherever it sits in the table above. */
const FOREIGN_MEMBERS = [
  "InstitutionsForeignPortfolioInvestorCategoryOne",
  "InstitutionsForeignPortfolioInvestorCategoryTwo",
  "ForeignDirectInvestment",
  "OtherInstitutionsForeign",
  "NonResidentIndians",
  "ForeignNationals",
];

function toPercent(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  // The filing states shares of one; a hundredth of a percent is as fine as it reports.
  return Math.round(parsed * 100 * 100) / 100;
}

/**
 * Every category fact in one filing, keyed by the filing's own category name.
 *
 * XBRL puts the category on the *context* rather than the fact, so the contexts are read first and
 * each fact is then resolved through its contextRef. Parsed with regular expressions rather than an
 * XML library on purpose: this is one known document shape from one filer, the file is half a
 * megabyte, and pulling in a DOM parser to read forty numbers out of it is not a trade worth making.
 */
export function parseShareholdingXbrl(xml: string): {
  percent: Map<string, number>;
  holders: Map<string, number>;
} {
  const categoryOf = new Map<string, string>();
  for (const context of xml.matchAll(/<xbrli:context id="([^"]+)"[\s\S]*?<\/xbrli:context>/g)) {
    const member = context[0].match(/explicitMember dimension="[^"]*CategoryOfShareholdersAxis">([^<]+)</);
    if (!member) continue;
    categoryOf.set(context[1], member[1].split(":").pop()!.replace(/Member$/, ""));
  }

  const read = (tag: string, transform: (raw: string) => number | null) => {
    const found = new Map<string, number>();
    const pattern = new RegExp(`<in-bse-shp:${tag} contextRef="([^"]+)"[^>]*>([^<]*)</in-bse-shp:${tag}>`, "g");
    for (const fact of xml.matchAll(pattern)) {
      const category = categoryOf.get(fact[1]);
      if (!category) continue;
      const value = transform(fact[2]);
      if (value !== null) found.set(category, value);
    }
    return found;
  };

  return {
    percent: read("ShareholdingAsAPercentageOfTotalNumberOfShares", toPercent),
    holders: read("NumberOfShareholders", (raw) => {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }),
  };
}

/**
 * The filing's own totals for the buckets that have one.
 *
 * These decide each bucket's size rather than the sum of the leaves below it, because the leaf
 * list can never be exhaustive: SEBI's taxonomy carries category members for cases most companies
 * never use, and a member nobody has seen yet would silently vanish from a bucket that was summed
 * leaf by leaf. Summing the certified totals instead means an unrecognised member is still counted
 * — it just goes unlabelled in the breakdown.
 */
const GROUP_TOTAL: Partial<Record<OwnerGroup, string>> = {
  promoters: "ShareholdingOfPromoterAndPromoterGroup",
  fii: "InstitutionsForeign",
  dii: "InstitutionsDomestic",
  government: "Governments",
};

const round = (value: number) => Math.round(value * 100) / 100;

/** One bucket's total and the sub-categories behind it, dropping the ones that hold nothing. */
function sliceFor(
  key: Exclude<OwnerGroup, "others">,
  percent: Map<string, number>,
  holders: Map<string, number>,
  total: number,
): OwnerSlice {
  const detail = GROUP_MEMBERS[key]
    .map((entry) => ({
      label: entry.label,
      percent: percent.get(entry.member) ?? 0,
      holders: holders.get(entry.member) ?? null,
    }))
    .filter((entry) => entry.percent > 0)
    .sort((a, b) => b.percent - a.percent);

  // Whatever the labelled leaves do not reach is shown as its own row rather than being dropped:
  // the breakdown then always adds up to the bucket above it.
  const labelled = detail.reduce((sum, entry) => sum + entry.percent, 0);
  const unlabelled = round(total - labelled);
  if (unlabelled >= 0.01) detail.push({ label: "Other, as filed", percent: unlabelled, holders: null });

  const totalMember = GROUP_TOTAL[key];
  const holderCount =
    (totalMember ? holders.get(totalMember) : undefined) ??
    GROUP_MEMBERS[key].reduce<number | null>((sum, entry) => {
      const value = holders.get(entry.member);
      if (value === undefined) return sum;
      return (sum ?? 0) + value;
    }, null);

  return { key, label: GROUP_LABEL[key], percent: round(total), holders: holderCount, detail };
}

async function fetchIndex(symbol: string): Promise<IndexRow[]> {
  const response = await fetch(INDEX_URL(symbol), {
    headers: HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) return [];

  const rows = (await response.json()) as unknown;
  return Array.isArray(rows) ? (rows as IndexRow[]) : [];
}

async function fetchXbrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { ...HEADERS, Accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Build the board's answer for one company.
 *
 * Separated from the fetching so it can be exercised against a filing without the network.
 */
export function buildOwnership(
  symbol: string,
  rows: IndexRow[],
  xml: string | null,
): Ownership | null {
  const latest = rows[0];
  if (!latest?.date) return null;

  const { percent, holders } = xml ? parseShareholdingXbrl(xml) : { percent: new Map(), holders: new Map() };

  const at = (member: string) => percent.get(member) ?? 0;

  // Retail has no certified total of its own — "Non-institutions" also holds bodies corporate and
  // the IEPF — so it is the one bucket summed from its leaves.
  const retail = GROUP_MEMBERS.retail.reduce((sum, entry) => sum + at(entry.member), 0);
  const fii = at(GROUP_TOTAL.fii!);
  const dii = at(GROUP_TOTAL.dii!);
  const government = at(GROUP_TOTAL.government!);
  const promoters = at(GROUP_TOTAL.promoters!);
  // Everything public that is not an institution, the government or an individual: corporate
  // bodies, trusts, clearing members, the IEPF and anything else the filing lists there.
  const bodies = Math.max(0, at("PublicShareholding") - fii - dii - government - retail);

  const totals: Record<Exclude<OwnerGroup, "others">, number> = { promoters, fii, dii, government, retail, bodies };
  const named = (Object.keys(GROUP_MEMBERS) as Exclude<OwnerGroup, "others">[]).map((key) =>
    sliceFor(key, percent, holders, totals[key]),
  );

  // Whatever the named buckets do not account for — non-promoter non-public holdings, mostly
  // custodian-held depository receipts. Shown honestly rather than hidden inside whichever bucket
  // happens to be nearest.
  const accounted = named.reduce((sum, slice) => sum + slice.percent, 0);
  const remainder = round(100 - accounted);
  const groups = [...named];
  if (remainder >= 0.01) {
    groups.push({ key: "others", label: GROUP_LABEL.others, percent: remainder, holders: null, detail: [] });
  }

  groups.sort((a, b) => b.percent - a.percent);

  const by = (key: OwnerGroup) => groups.find((group) => group.key === key)?.percent ?? 0;
  const foreignPercent =
    Math.round(FOREIGN_MEMBERS.reduce((sum, member) => sum + (percent.get(member) ?? 0), 0) * 100) / 100;

  return {
    symbol: symbol.toUpperCase(),
    company: latest.name?.trim() || symbol.toUpperCase(),
    quarter: latest.date,
    groups: groups.filter((group) => group.percent > 0),
    // Disjoint by construction: every filing category lands in exactly one of these.
    investorTypes: [
      { key: "retail" as OwnerGroup, label: "Retail & individuals", percent: by("retail") },
      { key: "dii" as OwnerGroup, label: "Institutional (FII + DII)", percent: round(by("fii") + by("dii")) },
      { key: "promoters" as OwnerGroup, label: "Promoters & insiders", percent: by("promoters") },
      { key: "government" as OwnerGroup, label: "Government", percent: by("government") },
      { key: "bodies" as OwnerGroup, label: "Corporate bodies & other", percent: round(by("bodies") + by("others")) },
    ].filter((type) => type.percent > 0),
    foreignPercent,
    totalHolders: holders.get("ShareholdingPattern") ?? holders.get("PublicShareholding") ?? null,
    history: rows
      .slice(0, HISTORY_QUARTERS)
      .map((row) => ({
        quarter: row.date ?? "",
        promoter: Number(row.pr_and_prgrp),
        publicHeld: Number(row.public_val),
      }))
      .filter((entry) => entry.quarter && Number.isFinite(entry.promoter) && Number.isFinite(entry.publicHeld))
      .reverse(),
    filedOn: latest.submissionDate?.trim() || latest.broadcastDate?.trim() || null,
    source: "NSE — quarterly shareholding pattern filed under SEBI LODR",
  };
}

/**
 * The ownership split for one NSE-listed symbol, or null when nothing is filed for it.
 *
 * Null is a normal answer, not an error: a BSE-only scrip has no NSE filing to read, and a company
 * that listed after the last quarter-end has not filed one yet.
 */
export const getOwnership = revalidatingBy<string, Ownership | null>({
  // Versioned: entries persist for a day and survive a deploy, so an answer written under an
  // older shape would otherwise keep being served to code that expects the newer one. Bump this
  // whenever the Ownership type changes rather than waiting a day for the old entries to lapse.
  key: "shareholding:v2",
  ttlMs: TTL_MS,
  // A miss is retried sooner than a hit is refreshed: an empty answer is as likely to be a refused
  // request as a company with nothing filed.
  ttlFor: (value) => (value ? TTL_MS : 60 * 60 * 1000),
  tags: [CACHE_TAGS.nse],
  persist: true,
  capacity: 300,
  keyOf: (symbol) => symbol.toUpperCase(),
  load: async (symbol) => {
    const rows = await fetchIndex(symbol);
    if (!rows.length) return null;

    const xml = rows[0]?.xbrl ? await fetchXbrl(rows[0].xbrl) : null;
    return buildOwnership(symbol, rows, xml);
  },
});
