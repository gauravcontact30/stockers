export type EtfMeta = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  category: string;
  amc: string;
  domain: string;
  popular: boolean;
};

export type EtfCategoryMeta = {
  key: string;
  name: string;
  description: string;
};

export const etfCategories: EtfCategoryMeta[] = [
  { key: "broad", name: "Equity - Broad Market", description: "ETFs tracking headline indices like the Nifty 50 and Nifty Next 50." },
  { key: "sectoral", name: "Equity - Sectoral", description: "ETFs tracking a single sector such as banking, PSU banks, or IT." },
  { key: "gold", name: "Gold", description: "Gold-backed ETFs used as an inflation hedge and portfolio diversifier." },
  { key: "silver", name: "Silver", description: "Silver-backed ETFs tracking domestic silver prices." },
  { key: "debt", name: "Debt & Liquid", description: "Low-volatility ETFs used for parking cash and short-term liquidity." },
  { key: "thematic", name: "Thematic & PSU", description: "Theme-based ETFs such as public-sector-enterprise baskets." },
  { key: "international", name: "International", description: "ETFs offering exposure to overseas indices like the Nasdaq 100." },
];

const categoryName = (key: string) => etfCategories.find((c) => c.key === key)!.name;

// [symbol, name, categoryKey, amc, domain, popular, yahooSymbolOverride?]
type RawEtf = [string, string, string, string, string, boolean, string?];

const raw: RawEtf[] = [
  ["NIFTYBEES", "Nippon India ETF Nifty BeES", "broad", "Nippon India Mutual Fund", "nipponindiaim.com", true, "NIFTYBEES.BO"],
  ["JUNIORBEES", "Nippon India ETF Junior BeES", "broad", "Nippon India Mutual Fund", "nipponindiaim.com", true, "JUNIORBEES.BO"],
  ["SETFNIF50", "SBI ETF Nifty 50", "broad", "SBI Mutual Fund", "sbimf.com", false],
  ["NIFTYIETF", "ICICI Prudential Nifty ETF", "broad", "ICICI Prudential AMC", "icicipruamc.com", false, "NIFTYIETF.BO"],
  ["BANKBEES", "Nippon India ETF Bank BeES", "sectoral", "Nippon India Mutual Fund", "nipponindiaim.com", true, "BANKBEES.BO"],
  ["PSUBNKBEES", "Nippon India ETF PSU Bank BeES", "sectoral", "Nippon India Mutual Fund", "nipponindiaim.com", false, "PSUBNKBEES.BO"],
  ["PSUBANK", "Kotak Nifty PSU Bank ETF", "sectoral", "Kotak Mutual Fund", "kotakmf.com", false],
  ["ITBEES", "Nippon India ETF Nifty IT", "sectoral", "Nippon India Mutual Fund", "nipponindiaim.com", false],
  ["GOLDBEES", "Nippon India ETF Gold BeES", "gold", "Nippon India Mutual Fund", "nipponindiaim.com", true],
  ["HDFCGOLD", "HDFC Gold ETF", "gold", "HDFC Mutual Fund", "hdfcfund.com", false],
  ["GOLD1", "Kotak Gold ETF", "gold", "Kotak Mutual Fund", "kotakmf.com", false],
  ["SILVERIETF", "ICICI Prudential Silver ETF", "silver", "ICICI Prudential AMC", "icicipruamc.com", false],
  ["LIQUIDBEES", "Nippon India ETF Liquid BeES", "debt", "Nippon India Mutual Fund", "nipponindiaim.com", true],
  ["CPSEETF", "CPSE ETF", "thematic", "ICICI Prudential AMC", "icicipruamc.com", false],
  ["ICICIB22", "Bharat 22 ETF", "thematic", "ICICI Prudential AMC", "icicipruamc.com", true],
  ["MON100", "Motilal Oswal Nasdaq 100 ETF", "international", "Motilal Oswal AMC", "motilaloswalamc.com", true],
];

export const indianETFs: EtfMeta[] = raw.map(([symbol, name, categoryKey, amc, domain, popular, yahooOverride]) => ({
  symbol,
  yahooSymbol: yahooOverride ?? `${symbol}.NS`,
  name,
  category: categoryName(categoryKey),
  amc,
  domain,
  popular,
}));
