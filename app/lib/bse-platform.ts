// The BSE segment a scrip is listed and traded on, derived from the group letter the exchange
// carries on every listing.
//
// This sits in its own module with no imports on purpose. The board that renders the badge is a
// client component, and everything else in ./bse-market reaches the network and Next's cache — so
// importing the mapping from there would pull the whole server data layer into the browser bundle.

/**
 * A BSE platform, as the exchange itself segments its listings. These are not categories invented
 * here: SME companies trade on the BSE SME platform, exclusively-listed companies sit in the X
 * group, and T and Z are surveillance buckets a company is moved into rather than lists it chooses.
 */
export type BsePlatform = "Main Board" | "SME" | "X Group" | "Trade-to-Trade" | "Z Group";

export const BSE_PLATFORMS: BsePlatform[] = ["Main Board", "SME", "X Group", "Trade-to-Trade", "Z Group"];

const PLATFORM_FOR_GROUP: Record<string, BsePlatform> = {
  A: "Main Board",
  B: "Main Board",
  P: "Main Board",
  M: "SME",
  MS: "SME",
  MT: "SME",
  X: "X Group",
  XT: "X Group",
  T: "Trade-to-Trade",
  TS: "Trade-to-Trade",
  Z: "Z Group",
  ZP: "Z Group",
};

/** What each segment means for the reader, which is what the badge's tooltip says. */
export const PLATFORM_NOTE: Record<BsePlatform, string> = {
  "Main Board": "BSE main board listing",
  SME: "BSE SME platform listing",
  "X Group": "Exclusively listed on BSE",
  "Trade-to-Trade": "Trade-to-trade: delivery only, no intraday",
  "Z Group": "Z group: listing-compliance surveillance",
};

/**
 * Null rather than a default for a group letter this does not know — a guessed segment is worse
 * than an absent one, since the segment is what tells a reader how the scrip may be traded.
 */
export function bsePlatform(group: string | null | undefined): BsePlatform | null {
  return PLATFORM_FOR_GROUP[(group ?? "").trim().toUpperCase()] ?? null;
}
