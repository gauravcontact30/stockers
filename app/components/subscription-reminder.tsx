"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CharacterArt, characterFor, speechScript } from "./reminder-characters";
import { playCall } from "./reminder-sound";
import { patternStyle, themeFor } from "./reminder-themes";
import { speak, stopSpeaking } from "./reminder-voice";
import { useSubscription, type SubscriptionStatus } from "./subscription-provider";

/** How often the reminder comes back after being dismissed. */
export const REMIND_EVERY_MS = 15 * 60_000;

/**
 * The reminder now fires on one day only: the last day before access lapses.
 *
 * It used to appear from two trial days out and then on every page for anyone expired — including
 * signed-out visitors, for whom it was really a conversion prompt. That is a lot of interrupting
 * for a message whose entire useful content is "this is about to stop working". One day's notice
 * is when a reader can still act on it, and it is the only day the message is urgent.
 */
const WARN_AT_DAYS_LEFT = 1;

/**
 * How many times it may appear during that day, ever.
 *
 * Counted across reloads rather than per page view, because a reader who opens the dashboard five
 * times in an afternoon has not agreed to be interrupted five times. Three is enough to be seen
 * and few enough not to be resented.
 */
export const MAX_REMINDERS = 3;

/** Where the count lives, so it survives a reload. Keyed by the day it is counting for. */
export const REMINDER_COUNT_KEY = "stockers-reminder-count";

/**
 * Today, on the exchange's clock, as YYYY-MM-DD.
 *
 * Defined here rather than imported from the server's copy in `../lib/nse-client`: that module now
 * reaches the shared cache and so pulls `next/cache` with it, which has no business in a browser
 * bundle. The subscription dates it is compared against are IST dates, so the reader's own
 * timezone must not enter into it — a subscriber in London does not lose a day.
 */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
/** Long enough for the character's call to finish before the voice starts over the top of it. */
const VOICE_DELAY_MS = 700;

/**
 * The headline and body, built once so the rendered text and the spoken line cannot drift.
 *
 * The three states say three different things, and conflating them was a real error: a paying
 * subscriber a day from renewal was told their *free trial* was nearly up, which is both wrong and
 * insulting to someone who has already paid.
 */
export function reminderCopy(status: SubscriptionStatus): { headline: string; body: string } {
  if (status.state === "active") {
    return {
      headline: "Your subscription ends tomorrow",
      body: "Renew today and nothing changes — the boards, the screeners and the AI desk carry straight on.",
    };
  }

  if (status.state === "expired") {
    return {
      headline: "Your free trial has ended",
      body: "You've used all five open market days. Everything still works — subscribe to keep it that way and support the AI running behind it.",
    };
  }

  const days = `${status.marketDaysLeft} open market ${status.marketDaysLeft === 1 ? "day" : "days"}`;
  return {
    headline: "Your free trial is nearly up",
    body: `You have ${days} left on your trial.`,
  };
}

/** What the eyebrow over the headline calls this — a trial ending is not a subscription ending. */
export function reminderKicker(status: SubscriptionStatus): string {
  return status.state === "active" ? "Subscription ending" : "Trial ending";
}

/** Radiating wedges only read as a spotlight if they turn; the other patterns are still. */
export function patternSpinClass(pattern: string): string {
  return pattern === "starburst" ? "animate-ray-spin" : "";
}

/**
 * Routes the reminder must never appear on.
 *
 * A signed-out visitor is reported as `expired` (see accessStatusFor), which is what makes the
 * reminder a conversion prompt on the marketing pages. On the auth routes that same rule was
 * actively harmful: the modal is `fixed inset-0`, so two seconds after the sign-up page loaded it
 * covered the form and swallowed the click on "Create account" — a new visitor could not sign up
 * at all without first finding the dismiss button. Nagging someone to subscribe while they are
 * part-way through creating the account is also simply the wrong moment to do it.
 */
const REMINDER_FREE_ROUTES = ["/signin", "/signup"];

export function isReminderFreeRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return REMINDER_FREE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Whole days from `today` until `until`, both as YYYY-MM-DD in IST.
 *
 * Null when either date is missing or unparseable, which is treated as "no warning to give" rather
 * than as zero — zero would mean "expires today" and interrupt someone on no evidence at all.
 */
export function daysUntil(until: string | null | undefined, today: string): number | null {
  if (!until || !today) return null;

  const end = Date.parse(`${until}T00:00:00Z`);
  const start = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(start)) return null;

  return Math.round((end - start) / 86_400_000);
}

/**
 * Whether this status warrants interrupting the user at all.
 *
 * One day, and one day only. A paid subscriber is warned when their last covered day is tomorrow;
 * a trial user when they have a single market day left. Everyone else — admins, subscribers with
 * time on the clock, people who already lapsed, and signed-out visitors who never subscribed — is
 * left alone. An expired account cannot be warned about something that has already happened, and
 * nagging a stranger to renew a subscription they never had was never a reminder at all.
 */
export function shouldRemind(status: SubscriptionStatus | null, today: string): boolean {
  if (!status) return false;
  if (status.isAdmin) return false;
  if (!status.signedIn) return false;

  if (status.state === "active") {
    return daysUntil(status.subscribedUntil, today) === WARN_AT_DAYS_LEFT;
  }

  return status.state === "trial" && status.marketDaysLeft === WARN_AT_DAYS_LEFT;
}

/**
 * How many times the reminder has already been shown for this expiry, from the browser.
 *
 * Keyed by the date it is counting toward, so the next subscription period starts a fresh three
 * rather than inheriting a spent count. Unreadable or hand-edited storage counts as zero — the
 * failure mode of showing the reminder is far milder than that of suppressing it forever.
 */
export function remindersShown(raw: string | null, key: string): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { key?: unknown; count?: unknown };
    if (parsed.key !== key) return 0;
    return typeof parsed.count === "number" && parsed.count > 0 ? Math.floor(parsed.count) : 0;
  } catch {
    return 0;
  }
}

/** What the count is keyed by: the day access lapses, or the trial's last day. */
export function reminderKey(status: SubscriptionStatus | null): string {
  if (!status) return "";
  return status.state === "active" ? (status.subscribedUntil ?? "") : `trial:${status.marketDaysLeft}`;
}

export function SubscriptionReminder() {
  const { status, renew } = useSubscription();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  // How many appearances this expiry has already had, read once on mount. Held in state rather
  // than read during render so the server and the first client render agree.
  const [alreadyShown, setAlreadyShown] = useState<number | null>(null);
  const countKey = reminderKey(status);

  useEffect(() => {
    if (!countKey) return;
    setAlreadyShown(remindersShown(window.localStorage.getItem(REMINDER_COUNT_KEY), countKey));
  }, [countKey]);

  /**
   * Two separate questions, and conflating them cost the reader the third reminder.
   *
   * `eligible` asks whether this reader should ever be interrupted — the right day, the right
   * account, not an auth page. `allowanceLeft` asks whether another appearance may be *scheduled*.
   * The appearance currently on screen must not be judged by the second: the count is written the
   * moment the modal opens, so a single test would hide the third reminder in the same render that
   * counted it, and only two of the three were ever seen.
   */
  const eligible = shouldRemind(status, todayIST()) && !isReminderFreeRoute(pathname);
  const allowanceLeft = alreadyShown !== null && alreadyShown < MAX_REMINDERS;
  const relevant = eligible && allowanceLeft;

  // Six characters against five themes: the pair only repeats every thirtieth appearance, so a
  // returning reminder is a different character *and* a different-looking panel.
  const character = characterFor(round);
  const theme = themeFor(round);

  /**
   * Records one appearance, and does it the moment the modal is shown rather than when it is
   * dismissed — someone who closes the tab on the third reminder has still been reminded three
   * times, and should not meet a fourth tomorrow morning.
   */
  const countOne = useCallback(() => {
    /* istanbul ignore next -- the effect that calls this only runs once a status has produced a key. */
    if (!countKey) return;
    setAlreadyShown((shown) => {
      /* istanbul ignore next -- same: the count has always been read before an appearance is scheduled. */
      const next = (shown ?? 0) + 1;
      window.localStorage.setItem(REMINDER_COUNT_KEY, JSON.stringify({ key: countKey, count: next }));
      return next;
    });
  }, [countKey]);

  useEffect(() => {
    if (!relevant) return;

    // First appearance is delayed so the page has a chance to load and be read before the
    // reminder interrupts, then it returns on a fixed cadence until the allowance is spent.
    const first = window.setTimeout(() => {
      setVisible(true);
      countOne();
    }, 2000);

    const timer = window.setInterval(() => {
      setRound((value) => value + 1);
      setVisible(true);
      countOne();
    }, REMIND_EVERY_MS);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [relevant, countOne]);

  const copy = status ? reminderCopy(status) : null;
  const script = copy ? speechScript(character, copy.headline, copy.body) : "";

  // Each appearance plays the character's call, then reads the modal aloud in that character's
  // voice. Browsers refuse audio until the user has interacted with the page, so both are
  // best-effort and the "Hear it" button below is the reliable path.
  useEffect(() => {
    if (!visible || muted || !script) return;

    playCall(character.call);
    const timer = window.setTimeout(() => speak(script, character.voice, round), VOICE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      stopSpeaking();
    };
  }, [visible, muted, script, character.call, character.voice, round]);

  const close = useCallback(() => {
    stopSpeaking();
    setVisible(false);
    setError(null);
  }, []);

  if (!eligible || !status || !visible) return null;

  // Recomputed here rather than reusing the pre-guard value so it narrows to non-null; it's a
  // pure function of the status, so both calls always agree.
  const { headline, body } = reminderCopy(status);

  const handleRenew = async () => {
    setBusy(true);
    setError(null);
    const result = await renew();
    setBusy(false);
    if (result.ok) {
      setVisible(false);
      return;
    }
    setError(result.error);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="renewal-title"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in ${theme.backdrop}`}
    >
      <div
        data-theme={theme.key}
        data-character={character.key}
        className={`relative w-full max-w-lg overflow-hidden ${theme.shell} ${theme.entrance} ${theme.body}`}
      >
        {/* The character's banner: their own gradient, this theme's pattern over the top. */}
        <div className={`relative bg-gradient-to-br ${character.accent} px-6 pb-6 pt-8`}>
          {theme.wash && <div className={`pointer-events-none absolute inset-0 ${theme.wash}`} aria-hidden="true" />}
          <div
            className={`pointer-events-none absolute inset-0 opacity-25 ${patternSpinClass(theme.pattern)}`}
            style={patternStyle(theme.pattern)}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={close}
            aria-label="Dismiss reminder"
            // h-10 w-10: this is the only way out of a modal that covers the screen, so it needs to
            // be comfortably tappable rather than the 8x8 square it was.
            className={`absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-black transition hover:rotate-90 ${theme.control}`}
          >
            ✕
          </button>

          <div className="relative flex items-end gap-3">
            <div className={theme.motion}>
              <CharacterArt character={character} />
            </div>

            {/* Speech bubble with a tail pointing back at the character */}
            <div className={`relative mb-6 flex-1 px-4 py-3 ${theme.bubble}`}>
              <p className="text-[10px] font-black uppercase tracking-wide opacity-60">{character.name}</p>
              <p className="mt-0.5 text-sm font-extrabold leading-snug">{character.shout}</p>
              <span
                className={`absolute -left-2 bottom-4 h-4 w-4 rotate-45 ${theme.tail}`}
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="relative mt-2 flex flex-wrap items-center gap-2">
            <span className={`animate-shout inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${theme.chip}`}>
              {character.noise}
            </span>
            <button
              type="button"
              onClick={() => {
                setMuted(false);
                playCall(character.call);
                // Clicking is a user gesture, so this is the path that always works even when
                // the browser refused the automatic attempt on page load.
                window.setTimeout(() => speak(script, character.voice, round), VOICE_DELAY_MS);
              }}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${theme.control}`}
            >
              🔊 Hear it
            </button>
            <button
              type="button"
              onClick={() => {
                setMuted((value) => !value);
                stopSpeaking();
              }}
              aria-pressed={muted}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${theme.control}`}
            >
              {muted ? "🔇 Muted" : "🔔 Voice on"}
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className={`text-xs font-black uppercase tracking-[0.3em] ${theme.eyebrow}`}>
            {reminderKicker(status)}
          </p>
          {/* Headline and body come from reminderCopy, which is also what gets read aloud — so
              the voiceover can never say something different from what is on screen. */}
          <h2 id="renewal-title" className={`mt-1.5 text-2xl font-extrabold ${theme.heading}`}>
            {headline}
          </h2>

          <p className={`mt-2 text-sm ${theme.text}`}>{body}</p>

          <p className={`mt-2 text-xs ${theme.muted}`}>
            Nothing is locked right now — this is a reminder, not a wall. It reappears every 15 minutes.
          </p>

          {/* Fixed light amber rather than a per-theme colour: an error has to stay legible, and a
              pale box reads on every panel above. */}
          {error && (
            <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {status.signedIn ? (
              <button
                type="button"
                onClick={handleRenew}
                disabled={busy}
                className={`rounded-full px-5 py-2 text-sm font-black transition hover:-translate-y-0.5 disabled:opacity-60 ${theme.primary}`}
              >
                {busy ? "Renewing…" : "Renew for 30 days"}
              </button>
            ) : (
              <Link href="/signup" className={`rounded-full px-5 py-2 text-sm font-black transition hover:-translate-y-0.5 ${theme.primary}`}>
                Create an account
              </Link>
            )}
            <Link href="/#pricing" className={`rounded-full px-5 py-2 text-sm font-bold transition ${theme.secondary}`}>
              See plans
            </Link>
            <button type="button" onClick={close} className={`rounded-full px-4 py-2 text-sm font-medium transition ${theme.dismiss}`}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A compact trial/subscription state chip for the header.
 *
 * Nothing is shown to an admin. The chip exists to tell a reader where they stand with the paywall
 * — days left, subscribed, expired — and an administrator stands outside it entirely, so the chip
 * had nothing useful to say to them and simply announced the role in the public header.
 */
export function SubscriptionBadge() {
  const { status } = useSubscription();
  if (!status || status.state === "admin") return null;

  const styles: Record<string, string> = {
    active: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
    trial: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
    expired: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400",
  };

  const labels: Record<string, string> = {
    active: "Subscribed",
    trial: `Trial · ${status.marketDaysLeft} market ${status.marketDaysLeft === 1 ? "day" : "days"} left`,
    expired: status.signedIn ? "Trial ended" : "Free preview",
  };

  return (
    <span
      className={`hidden shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:inline-flex ${styles[status.state]}`}
    >
      {labels[status.state]}
    </span>
  );
}
