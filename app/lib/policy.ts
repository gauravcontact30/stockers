// The facts the four policy pages are written from.
//
// Kept in one file for two reasons. The first is ordinary: a support address that appears on four
// pages should be changed in one place. The second matters more — a policy page is a promise, and
// the promises here are checked against the code that has to keep them. The subscription lengths,
// the trial, the cookie and storage names and the list of third parties below are the real ones,
// imported from the modules that implement them wherever that is possible, so a policy cannot
// quietly drift out of step with the product it describes.
//
// The placeholders marked TODO are the ones only the business can fill in. They are deliberately
// obvious rather than plausible-looking: a policy page carrying an invented company address or a
// made-up registration number is worse than one that visibly still needs completing.

import { TRIAL_DAYS } from "./subscription";
import { CYCLE_DAYS } from "./razorpay";

/**
 * Who publishes the site.
 *
 * TODO before launch: replace with the registered legal entity, its address and its CIN/GSTIN.
 * Indian consumer rules and Razorpay's own merchant terms both require a real name and a real
 * postal address on these pages, not a brand name alone.
 */
export const COMPANY = {
  brand: "StockersAI",
  /** TODO: the registered company or proprietorship name. */
  legalName: "[Registered legal entity name]",
  /** TODO: full registered address including PIN code. */
  address: "[Registered address, city, state, PIN]",
  /** TODO: CIN for a company, or GSTIN / proprietor's PAN where that applies. */
  registration: "[CIN / GSTIN]",
} as const;

export const CONTACT = {
  support: "support@stockers.ai",
  privacy: "privacy@stockers.ai",
  /** India's IT Rules require a named grievance officer with a working address. TODO: name them. */
  grievanceOfficer: "[Grievance Officer name]",
  grievanceEmail: "grievance@stockers.ai",
  /** How long the business commits to acknowledging a complaint. */
  grievanceAcknowledgementDays: 2,
  grievanceResolutionDays: 30,
} as const;

/**
 * When each page was last revised.
 *
 * Stated per page rather than as one date for all four, because they will not change together and
 * a reader checking whether a policy moved deserves the truth about that page.
 */
export const POLICY_UPDATED = {
  returns: "9 August 2026",
  refunds: "9 August 2026",
  privacy: "9 August 2026",
  disclaimer: "9 August 2026",
} as const;

/** The subscription terms the refund policy is written against, taken from the code that enforces them. */
export const TERMS = {
  trialDays: TRIAL_DAYS,
  trialMarketDays: TRIAL_DAYS,
  monthlyDays: CYCLE_DAYS.monthly,
  yearlyDays: CYCLE_DAYS.yearly,
  /** How long after a charge a full refund is available, no reason required. */
  coolingOffDays: 7,
} as const;

/** Every third party that receives or supplies data, and what for. Named, not summarised as "partners". */
export const PROCESSORS: { name: string; role: string; data: string }[] = [
  {
    name: "Razorpay",
    role: "Payment gateway",
    data: "Your name, email address and payment instrument. Card and UPI details are entered on Razorpay's own checkout and never reach our servers — we receive only a payment identifier and whether it succeeded.",
  },
  {
    name: "Resend",
    role: "Transactional email",
    data: "Your name and email address, to send the address-verification message and account notices. No marketing mail is sent through it.",
  },
  {
    name: "OpenRouter",
    role: "AI model gateway",
    data: "The already-measured market figures a board has rendered, and the question you typed into a research or comparison tool. Your name, email and account identifiers are never included in a model request.",
  },
];

/** Where the market data comes from. The disclaimer leans on this being public, unofficial and unwarranted. */
export const DATA_SOURCES: { name: string; used: string }[] = [
  { name: "BSE India", used: "The scrip master, the daily Bhavcopy and sector classifications." },
  { name: "NSE India", used: "Sectoral indices, most-traded lists, corporate announcements, dividends and the IPO calendar." },
  { name: "Yahoo Finance", used: "Live and historical quotes for the tracked universe." },
  { name: "Google News", used: "Headlines from Indian financial publishers, linked back to the publisher." },
];

/** What the browser stores, and why. Named individually because a reader can go and look. */
export const CLIENT_STORAGE: { key: string; kind: "Cookie" | "Local storage"; purpose: string }[] = [
  {
    key: "stockers_session",
    kind: "Cookie",
    purpose: "Keeps you signed in so the server can recognise your account. Cleared when you sign out.",
  },
  {
    key: "stockers-auth",
    kind: "Local storage",
    purpose: "The same session token, held so a page reload does not sign you out.",
  },
  { key: "stockers-theme", kind: "Local storage", purpose: "Whether you chose the light or dark appearance." },
  { key: "stockers-watchlist", kind: "Local storage", purpose: "The tickers on your watchlist. This never leaves your browser." },
  {
    key: "stockers-intel-bookmarks",
    kind: "Local storage",
    purpose: "Research answers you saved. This never leaves your browser.",
  },
  {
    key: "stockers-sidebar-collapsed",
    kind: "Local storage",
    purpose: "Whether you left the dashboard sidebar open or collapsed.",
  },
];

/** What the account record holds. The privacy policy lists this rather than describing it vaguely. */
export const ACCOUNT_FIELDS: string[] = [
  "Your name and email address, as you entered them at sign-up.",
  "A scrypt hash of your password with a per-account salt. The password itself is never stored and cannot be recovered from the hash.",
  "Which plan you are on, when the account was created, and when the free trial started.",
  "The date your paid access runs until, and the identifier of the last payment credited to the account.",
  "Whether your email address has been verified, and the single-use token in the current verification link.",
];
