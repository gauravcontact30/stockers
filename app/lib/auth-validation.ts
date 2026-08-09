// The rules a sign-up or sign-in has to satisfy, written once.
//
// Both the form and the route import these. That matters more than saving a few lines: when the
// browser and the server hold their own copies of "what counts as a valid mobile number", they
// drift, and the failure is the worst kind — a form that accepts an input and a server that
// rejects it, leaving the visitor staring at a field the page just told them was fine.
//
// Every rule returns the message a person should read, not a code. There is no error-message
// catalogue to keep in step with a list of enum values, and no way to raise an error that has no
// wording.

export type PlanName = "Starter" | "Pro" | "Elite";

export const PLAN_NAMES: PlanName[] = ["Starter", "Pro", "Elite"];

export function isPlanName(value: unknown): value is PlanName {
  return typeof value === "string" && (PLAN_NAMES as string[]).includes(value);
}

/**
 * The fields a sign-up form has. Sign-in uses the email and password rules only.
 *
 * No plan is chosen here. Signing up starts a free trial for everyone, and asking someone to pick
 * between three priced tiers before they have seen a single board is asking them to decide with
 * nothing to decide on. The plan is chosen at checkout, where the prices and what they buy are
 * both on screen.
 */
export type SignupFields = {
  name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
};

/** Field name to the message for it. An empty object means the form is good to send. */
export type FieldErrors = Partial<Record<keyof SignupFields, string>>;

/**
 * Permissive on shape, strict on structure: one @, something either side, a dot in the domain.
 *
 * Anything tighter starts rejecting real addresses — plus-addressing, long new TLDs, unusual local
 * parts — and the only thing that truly proves an address works is mail arriving at it.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An Indian mobile number: ten digits beginning 6, 7, 8 or 9.
 *
 * TRAI allocates mobile series in that range only, so a "number" starting 1-5 is a typo or a
 * landline and an SMS to it will never arrive. Written to accept how people actually type: an
 * optional +91 or 0 prefix, and spaces or dashes anywhere.
 */
export function normaliseMobile(value: string): string {
  const digits = value.replace(/[\s()+-]/g, "");
  if (/^91\d{10}$/.test(digits)) return digits.slice(2);
  if (/^0\d{10}$/.test(digits)) return digits.slice(1);
  return digits;
}

export function isMobile(value: string): boolean {
  return /^[6-9]\d{9}$/.test(normaliseMobile(value));
}

export const MIN_PASSWORD = 8;

/**
 * What a password has to be.
 *
 * Raised from six characters to eight with a letter and a digit. Six is below every current
 * guideline, and this account can hold a paid subscription — but the rule stops there rather than
 * demanding a symbol and mixed case, because those requirements push people toward one predictable
 * pattern and a passphrase beats them all.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[a-zA-Z]/.test(password)) return "Include at least one letter.";
  if (!/\d/.test(password)) return "Include at least one number.";
  return null;
}

/** Everything wrong with a sign-up, field by field. */
export function validateSignup(fields: SignupFields): FieldErrors {
  const errors: FieldErrors = {};

  const name = fields.name.trim();
  if (!name) errors.name = "Please enter your name.";
  else if (name.length < 2) errors.name = "That looks too short to be a name.";
  else if (name.length > 80) errors.name = "Please use 80 characters or fewer.";

  const email = fields.email.trim();
  if (!email) errors.email = "Please enter your email address.";
  else if (!EMAIL_SHAPE.test(email)) errors.email = "That doesn't look like an email address.";

  const mobile = fields.mobile.trim();
  if (!mobile) errors.mobile = "Please enter your mobile number.";
  else if (!isMobile(mobile)) errors.mobile = "Enter a 10-digit Indian mobile number starting 6, 7, 8 or 9.";

  const problem = passwordProblem(fields.password);
  if (!fields.password) errors.password = "Please choose a password.";
  else if (problem) errors.password = problem;

  if (!fields.confirmPassword) errors.confirmPassword = "Please repeat your password.";
  else if (fields.password !== fields.confirmPassword) errors.confirmPassword = "The two passwords don't match.";

  return errors;
}

/**
 * Everything wrong with a sign-in.
 *
 * Deliberately thinner than the sign-up rules. An existing account may have been created under an
 * older, looser policy, and refusing to let someone type their own working password because it
 * would not pass today's rule would lock them out of an account they own. Only emptiness and a
 * plainly malformed address are caught here; the server decides whether the pair is right.
 */
export function validateSignin(fields: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};

  const email = fields.email.trim();
  if (!email) errors.email = "Please enter your email address.";
  else if (!EMAIL_SHAPE.test(email)) errors.email = "That doesn't look like an email address.";

  if (!fields.password) errors.password = "Please enter your password.";

  return errors;
}

/** The first message, in the order the fields appear — what a summary should lead with. */
export const FIELD_ORDER: (keyof SignupFields)[] = ["name", "email", "mobile", "password", "confirmPassword"];

export function firstError(errors: FieldErrors): string | null {
  for (const field of FIELD_ORDER) {
    const message = errors[field];
    if (message) return message;
  }
  return null;
}

export function countErrors(errors: FieldErrors): number {
  return Object.values(errors).filter(Boolean).length;
}
