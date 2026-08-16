"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { syncSessionCookie, useSubscription } from "./subscription-provider";
import {
  countErrors,
  validateSignin,
  validateSignup,
  type FieldErrors,
  type SignupFields,
} from "../lib/auth-validation";
import { readPendingSubscription, savePendingSubscription, type PendingSubscription } from "./razorpay-checkout";
import { SignupSuccessModal } from "./signup-success-modal";

type AuthMode = "signin" | "signup";
type MfaChallenge = { challengeToken: string; mode: "sms" | "totp" };

type AuthFormProps = { mode: AuthMode };

function readStoredAuthSession(): { token: string; user: unknown } | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem("stockers-auth");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { token?: unknown; user?: unknown };
    if (typeof parsed.token === "string" && parsed.token.startsWith("stockers.") && parsed.user && typeof parsed.user === "object") {
      return { token: parsed.token, user: parsed.user };
    }
  } catch {
    // Cleared below.
  }

  window.localStorage.removeItem("stockers-auth");
  document.cookie = "stockers_session=; path=/; max-age=0; samesite=lax";
  return null;
}

function checkoutTargetFromLocation(): PendingSubscription | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan");
  const cycle = params.get("cycle");
  if (
    params.get("subscribe") === "1" &&
    (plan === "starter" || plan === "pro" || plan === "elite") &&
    (cycle === "monthly" || cycle === "yearly")
  ) {
    return { plan, cycle, promoCode: params.get("promo") ?? "", referralCode: params.get("ref") ?? "" };
  }

  return readPendingSubscription();
}

/**
 * The sign-up and sign-in form.
 *
 * Validation is field-level and shared with the server: `../lib/auth-validation` holds the rules,
 * both sides import them, and neither can quietly accept what the other rejects. Three things
 * follow from that and are worth stating, because the old form did none of them:
 *
 *   * Each field carries its own message under it, so "Please enter a valid email address" appears
 *     beside the email box rather than under the submit button with no clue which box it means.
 *   * A field is only marked once the visitor has finished with it, or once they have tried to
 *     submit. Turning an input red while someone is still typing their address into it is telling
 *     them they are wrong before they have had a chance to be right.
 *   * A server rejection lands on the field it belongs to. The routes send `errors` keyed by field
 *     alongside the sentence, so "this email is already registered" marks the email input.
 */

const FIELD_BASE =
  "w-full rounded-2xl border bg-slate-50 px-4 py-3 text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:bg-slate-950 dark:text-white";
const FIELD_OK = "border-slate-200 dark:border-slate-700";
const FIELD_BAD = "border-rose-400 ring-1 ring-rose-300 dark:border-rose-500/60";

/** One labelled input with its own error slot, so the message is always beside its field. */
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-slate-600 dark:text-slate-300">
      <span className="mb-2 block font-medium">{label}</span>
      {children}
      {/* The hint only shows while the field is clean — once there is a message, that is the thing
          worth reading and two lines of small print under one input is one too many. */}
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-400 dark:text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { refresh } = useSubscription();

  const [fields, setFields] = useState<SignupFields>({
    name: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
  });

  /** Which fields the visitor has finished with. Nothing is marked before they have. */
  const [touched, setTouched] = useState<Partial<Record<keyof SignupFields, boolean>>>({});
  /** Set on the first submit attempt: from then on every problem is shown at once. */
  const [submitted, setSubmitted] = useState(false);
  /** What the server said, keyed by field. Cleared as soon as that field is edited again. */
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkoutTarget] = useState<PendingSubscription | null>(() => checkoutTargetFromLocation());
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  /** The sign-up confirmation dialog, and the two things it reports back to the reader. */
  const [signupDone, setSignupDone] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [trialEndsOn, setTrialEndsOn] = useState<string | null>(null);

  /**
   * Leaves the dialog for the sign-in page, carrying the new address in the query.
   *
   * `replace` rather than `push`: the sign-up form is not somewhere the browser's back button
   * should return to now that the account exists, and a second submit of the same form would only
   * ever produce "an account already exists for this email".
   *
   * Any pending checkout is deliberately left in storage rather than acted on here. It is read
   * again after sign-in by `PendingSubscriptionCheckout`, which is where a purchase belongs — a
   * reader who arrived from a plan button still lands at checkout, one step later than before.
   */
  const continueToSignIn = () => {
    setSignupDone(false);
    router.replace(`/signin?${new URLSearchParams({ email: signupEmail, welcome: "1" }).toString()}`);
  };

  // If the visitor already has a session, skip the form and send them straight to the dashboard.
  useEffect(() => {
    // React effects never run during server-side rendering, so `window` is always defined by
    // the time this callback executes; the guard is defensive only and unreachable in practice.
    /* istanbul ignore next */
    if (typeof window === "undefined") {
      return;
    }
    const existing = readStoredAuthSession();
    if (existing) {
      router.replace("/overview");
    }
  }, [router]);

  useEffect(() => {
    if (checkoutTarget) {
      savePendingSubscription(
        checkoutTarget.plan,
        checkoutTarget.cycle,
        checkoutTarget.promoCode,
        checkoutTarget.referralCode,
      );
    }
  }, [checkoutTarget]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const reset = params.get("reset");
    const social = params.get("social");
    const socialError = params.get("error");

    if (email) setFields((current) => ({ ...current, email }));
    if (reset) {
      setRecoveryOpen(true);
      setResetToken(reset);
    }
    if (socialError) {
      const provider = social ? `${social} ` : "";
      setSuccess(false);
      setMessage(
        socialError === "social_config_missing"
          ? `${provider}login is not configured yet. Add the provider client ID and secret on the server.`
          : `${provider}login could not be completed. Please try again.`,
      );
    }
  }, []);

  const localErrors: FieldErrors =
    mode === "signup" ? validateSignup(fields) : validateSignin({ email: fields.email, password: fields.password });

  /**
   * The message to show for a field: the server's if it has one, otherwise our own.
   *
   * A server error may be deliberately blank. Sign-in sends one for the email field so that both
   * inputs are outlined while only one carries the sentence — saying which of the two was wrong
   * would tell anyone who asks whether a given address has an account here.
   */
  const errorFor = (field: keyof SignupFields): string | undefined => {
    const fromServer = serverErrors[field];
    if (fromServer !== undefined) return fromServer.trim() || undefined;
    if (!submitted && !touched[field]) return undefined;
    return localErrors[field];
  };

  /** Whether to outline a field. Broader than `errorFor`, which is only about the sentence. */
  const invalidFor = (field: keyof SignupFields): boolean =>
    serverErrors[field] !== undefined || Boolean(errorFor(field));

  const set = (field: keyof SignupFields) => (value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    // A field the visitor is fixing should stop being marked by a stale answer from the server.
    setServerErrors((current) => {
      if (current[field] === undefined) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setMessage(null);
  };

  const blur = (field: keyof SignupFields) => () => setTouched((current) => ({ ...current, [field]: true }));

  const finishSignin = (data: { token: string; user: unknown }) => {
    localStorage.setItem("stockers-auth", JSON.stringify({ token: data.token, user: data.user }));
    syncSessionCookie();
    void refresh();
    setSuccess(true);
    setMessage(
      checkoutTarget
        ? "Signed in! Redirecting to complete your subscription..."
        : "Signed in! Redirecting to your dashboard...",
    );
    router.push(
      checkoutTarget
        ? `/pricing?${new URLSearchParams({
            subscribe: "1",
            plan: checkoutTarget.plan,
            cycle: checkoutTarget.cycle,
            ...(checkoutTarget.promoCode ? { promo: checkoutTarget.promoCode } : {}),
            ...(checkoutTarget.referralCode ? { ref: checkoutTarget.referralCode } : {}),
          }).toString()}`
        : "/overview",
    );
  };

  const requestPasswordReset = async () => {
    setMessage(null);
    setSuccess(false);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.email.trim() }),
      });
      const data = await response.json();
      setSuccess(response.ok);
      setMessage(data.message || data.error || "Unable to request a reset link.");
    } catch {
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetPasswordNow = async () => {
    setMessage(null);
    setSuccess(false);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken.trim(),
          password: resetPassword,
          confirmPassword: resetConfirmPassword,
        }),
      });
      const data = await response.json();
      setSuccess(response.ok);
      setMessage(data.message || data.error || "Unable to reset password.");
      if (response.ok) {
        setRecoveryOpen(false);
        setResetPassword("");
        setResetConfirmPassword("");
      }
    } catch {
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyMfa = async () => {
    if (!mfaChallenge) return;
    setMessage(null);
    setSuccess(false);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: mfaChallenge.challengeToken, code: mfaCode.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Unable to verify the security code.");
        setLoading(false);
        return;
      }
      finishSignin(data);
    } catch {
      setMessage("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setMessage(null);
    setServerErrors({});

    const problems = countErrors(localErrors);
    if (problems > 0) {
      // The summary says how much is wrong; the fields themselves say what. Repeating one field's
      // message up here as well would just be the same sentence twice on a one-error form.
      setMessage(
        problems === 1
          ? "One field needs your attention — it's marked below."
          : `${problems} fields need your attention — they're marked below.`,
      );
      return;
    }

    setLoading(true);

    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/signin";
    const payload =
      mode === "signup"
        ? {
            name: fields.name.trim(),
            email: fields.email.trim(),
            mobile: fields.mobile.trim(),
            password: fields.password,
            confirmPassword: fields.confirmPassword,
          }
        : { email: fields.email.trim(), password: fields.password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Field-keyed errors mark their own inputs; the sentence goes in the summary.
        if (data.errors && typeof data.errors === "object") setServerErrors(data.errors as FieldErrors);
        setMessage(data.error || "Unable to complete request.");
        setLoading(false);
        return;
      }

      /**
       * A new account stops here and is sent to sign in; only an actual sign-in opens a session.
       *
       * Sign-up used to store the token, sync the cookie and push straight to the dashboard. That
       * is convenient and it is also why nobody ever read what they had been given: the trial, its
       * length and its end date all went past in a redirect. Confirming the account in a dialog and
       * then asking for the password once is a beat slower and leaves the reader knowing what they
       * have — and it means the password they just chose gets used once while they still remember
       * choosing it.
       *
       * Nothing is stored for a sign-up: no token, no cookie, no status refetch. The account exists
       * on the server and the next sign-in is an ordinary one.
       */
      if (mode === "signup") {
        setLoading(false);
        setSuccess(true);
        setSignupEmail(fields.email.trim());
        setTrialEndsOn(typeof data.trialEndsOn === "string" ? data.trialEndsOn : null);
        setSignupDone(true);
        return;
      }

      if (data.mfaRequired && typeof data.challengeToken === "string") {
        const challengeMode = data.mode === "totp" ? "totp" : "sms";
        setMfaChallenge({ challengeToken: data.challengeToken, mode: challengeMode });
        setSuccess(false);
        setMessage(
          challengeMode === "sms"
            ? "Password accepted. Enter the SMS code to finish signing in."
            : "Password accepted. Enter your authenticator app code to finish signing in.",
        );
        setLoading(false);
        return;
      }

      localStorage.setItem("stockers-auth", JSON.stringify({ token: data.token, user: data.user }));

      // Storing the token is not the same as being signed in as far as the server is concerned.
      // Gated endpoints read the session from the `stockers_session` cookie, and the subscription
      // provider only fetches its status when it mounts — which it did on first page load, before
      // this account existed. Without these two lines a brand-new user landed on the dashboard
      // with the server still reporting `signedIn: false, state: expired`: every gate treated them
      // as lapsed and the renewal reminder began nagging them seconds after they signed up.
      // The cookie write is synchronous, so by the next line the server already recognises this
      // session — that is the part the redirect must not race. The status refetch is deliberately
      // not awaited: making the visitor wait on a round-trip before the dashboard appears buys
      // nothing, since the provider re-renders whenever it resolves.
      syncSessionCookie();
      void refresh();

      // Only a sign-in reaches this far — a sign-up returned above, into its own dialog — so there
      // is no longer an "Account created" branch to choose between here.
      setSuccess(true);
      setMessage(
        checkoutTarget
          ? "Signed in! Redirecting to complete your subscription..."
          : "Signed in! Redirecting to your dashboard...",
      );
      router.push(
        checkoutTarget
          ? `/pricing?${new URLSearchParams({
              subscribe: "1",
              plan: checkoutTarget.plan,
              cycle: checkoutTarget.cycle,
              ...(checkoutTarget.promoCode ? { promo: checkoutTarget.promoCode } : {}),
              ...(checkoutTarget.referralCode ? { ref: checkoutTarget.referralCode } : {}),
            }).toString()}`
          : "/overview",
      );
    } catch {
      setMessage("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  const signup = mode === "signup";

  return (
    <>
    {/* Rendered outside the form on purpose: the dialog portals to the body, and a submit control
        inside a <form> would submit it again. */}
    <SignupSuccessModal
      open={signupDone}
      email={signupEmail}
      trialEndsOn={trialEndsOn}
      onContinue={continueToSignIn}
    />
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] transition-colors dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-2xl"
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
          {signup ? "Create your account" : "Welcome back"}
        </p>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {signup ? "Join StockersAI" : "Sign in to StockersAI"}
        </h2>
      </div>

      {signup && (
        <Field label="Full name" error={errorFor("name")}>
          <input
            value={fields.name}
            onChange={(event) => set("name")(event.target.value)}
            onBlur={blur("name")}
            aria-invalid={invalidFor("name")}
            className={`${FIELD_BASE} ${invalidFor("name") ? FIELD_BAD : FIELD_OK}`}
            placeholder="Aarav Sharma"
            autoComplete="name"
          />
        </Field>
      )}

      <Field label="Email address" error={errorFor("email")}>
        <input
          type="email"
          value={fields.email}
          onChange={(event) => set("email")(event.target.value)}
          onBlur={blur("email")}
          aria-invalid={invalidFor("email")}
          className={`${FIELD_BASE} ${invalidFor("email") ? FIELD_BAD : FIELD_OK}`}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>

      {signup && (
        <Field
          label="Mobile number"
          error={errorFor("mobile")}
          hint="We use it for payment and subscription alerts only."
        >
          <div className="flex items-stretch gap-2">
            <span className="flex shrink-0 items-center rounded-2xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              value={fields.mobile}
              onChange={(event) => set("mobile")(event.target.value)}
              onBlur={blur("mobile")}
              aria-invalid={invalidFor("mobile")}
              className={`${FIELD_BASE} ${invalidFor("mobile") ? FIELD_BAD : FIELD_OK}`}
              placeholder="98765 43210"
              autoComplete="tel-national"
              maxLength={15}
            />
          </div>
        </Field>
      )}

      <Field label="Password" error={errorFor("password")} hint={signup ? "At least 8 characters, with a letter and a number." : undefined}>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={fields.password}
            onChange={(event) => set("password")(event.target.value)}
            onBlur={blur("password")}
            aria-invalid={invalidFor("password")}
            className={`${FIELD_BASE} pr-16 ${invalidFor("password") ? FIELD_BAD : FIELD_OK}`}
            placeholder="••••••••"
            autoComplete={signup ? "new-password" : "current-password"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-3 text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      {!signup && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setRecoveryOpen((open) => !open);
              setMessage(null);
            }}
            className="text-sm font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200"
          >
            Forgot password?
          </button>
        </div>
      )}

      {!signup && recoveryOpen && (
        <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
          <Field label="Reset token" hint="Paste the token from your email link, or use the link directly.">
            <input
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              className={`${FIELD_BASE} border-sky-200 dark:border-sky-500/40`}
              placeholder="Reset token"
              autoComplete="one-time-code"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              className={`${FIELD_BASE} border-sky-200 dark:border-sky-500/40`}
              placeholder="New password"
              autoComplete="new-password"
            />
            <input
              type="password"
              value={resetConfirmPassword}
              onChange={(event) => setResetConfirmPassword(event.target.value)}
              className={`${FIELD_BASE} border-sky-200 dark:border-sky-500/40`}
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={loading}
              onClick={requestPasswordReset}
              className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/30 dark:bg-slate-950 dark:text-sky-300"
            >
              Email reset link
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={resetPasswordNow}
              className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              Update password
            </button>
          </div>
        </div>
      )}

      {!signup && mfaChallenge && (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <Field label={mfaChallenge.mode === "sms" ? "SMS code" : "Authenticator code"}>
            <input
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${FIELD_BASE} border-amber-200 tracking-[0.4em] dark:border-amber-500/40`}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </Field>
          <button
            type="button"
            disabled={loading}
            onClick={verifyMfa}
            className="w-full rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-60"
          >
            Verify and sign in
          </button>
        </div>
      )}

      {signup && (
        <Field label="Confirm password" error={errorFor("confirmPassword")}>
          <input
            type={showPassword ? "text" : "password"}
            value={fields.confirmPassword}
            onChange={(event) => set("confirmPassword")(event.target.value)}
            onBlur={blur("confirmPassword")}
            aria-invalid={invalidFor("confirmPassword")}
            className={`${FIELD_BASE} ${invalidFor("confirmPassword") ? FIELD_BAD : FIELD_OK}`}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>
      )}

      {message && (
        <p
          role="alert"
          className={
            success
              ? "rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          }
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Working..." : signup ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {signup ? (
          <>
            Already have an account?{" "}
            <a href="/signin" className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
              Sign in
            </a>
          </>
        ) : (
          <>
            New to StockersAI?{" "}
            <a href="/signup" className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
              Create an account
            </a>
          </>
        )}
      </p>
    </form>
    </>
  );
}
