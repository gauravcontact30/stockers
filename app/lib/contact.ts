// The contact form's shape and its rules.
//
// Separate from the route that uses them because the form needs the list of topics and the route
// needs the validation, and a client component importing a route module would drag `node:fs` — by
// way of the mailer — into the browser bundle.

/** The subjects the form offers. An enquiry has to be one of these, not free text. */
export const TOPICS = ["Support", "Billing", "Privacy", "Partnership", "Other"] as const;
export type Topic = (typeof TOPICS)[number];

export const LIMITS = { name: 80, email: 160, message: 4000 } as const;

/** Short enough not to be a chore, long enough that "hi" cannot reach the desk. */
export const MIN_MESSAGE = 20;

/**
 * Deliberately permissive: one @, something either side, a dot in the domain.
 *
 * A stricter pattern rejects real addresses — plus-addressing, new TLDs, unusual local parts — and
 * the only thing that actually proves an address works is mail arriving at it.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EnquiryInput = { name: string; email: string; topic: Topic; message: string };

/** What a rejected payload was rejected for. `honeypot` is a bot, and is answered as a success. */
export type EnquiryRejection = { error: string; honeypot?: true };

/** The enquiry we are willing to send on, or the reason we will not. */
export function parseEnquiry(value: unknown): { enquiry: EnquiryInput } | EnquiryRejection {
  const raw = value as Partial<Record<keyof EnquiryInput | "company", unknown>> | null | undefined;

  // The honeypot. It is hidden from people and left empty by them; a bot fills every field it
  // finds. Reported separately so the route can answer it with an ordinary success.
  if (typeof raw?.company === "string" && raw.company.trim() !== "") {
    return { error: "Rejected.", honeypot: true };
  }

  const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, LIMITS.name) : "";
  const email = typeof raw?.email === "string" ? raw.email.trim().slice(0, LIMITS.email) : "";
  const message = typeof raw?.message === "string" ? raw.message.trim().slice(0, LIMITS.message) : "";
  const topic = TOPICS.includes(raw?.topic as Topic) ? (raw?.topic as Topic) : "Other";

  if (!name) return { error: "Please tell us your name." };
  if (!EMAIL_SHAPE.test(email)) return { error: "That email address doesn't look right." };
  if (message.length < MIN_MESSAGE) {
    return { error: `Please give us a little more detail — at least ${MIN_MESSAGE} characters.` };
  }

  return { enquiry: { name, email, topic, message } };
}

// One sender, a few messages an hour. Held in memory: this is a speed bump against a script, not a
// security boundary, and a restart clearing it costs nothing.
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

export function withinRateLimit(key: string, now = Date.now()): boolean {
  const hits = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(key, hits);
    return false;
  }

  hits.push(now);
  recent.set(key, hits);
  return true;
}

/** Drops the rate-limit window. For tests, which must not inherit each other's counts. */
export function resetRateLimit(): void {
  recent.clear();
}
