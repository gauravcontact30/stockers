"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CharacterArt, characterFor, speechScript } from "./reminder-characters";
import { playCall } from "./reminder-sound";
import { patternStyle, themeFor } from "./reminder-themes";
import { speak, stopSpeaking } from "./reminder-voice";
import { useSubscription, type SubscriptionStatus } from "./subscription-provider";

/** How often the reminder comes back after being dismissed. */
export const REMIND_EVERY_MS = 15 * 60_000;
/** Show the trial warning only once it is nearly up, so early days aren't interrupted. */
const WARN_AT_DAYS_LEFT = 2;
/** Long enough for the character's call to finish before the voice starts over the top of it. */
const VOICE_DELAY_MS = 700;

/** The headline and body, built once so the rendered text and the spoken line cannot drift. */
export function reminderCopy(status: SubscriptionStatus): { headline: string; body: string } {
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

/**
 * Whether this status warrants interrupting the user at all.
 *
 * Nothing is locked while the paywall is off, so this is purely a nudge — admins and users with a
 * live subscription are never nagged.
 */
export function shouldRemind(status: SubscriptionStatus | null): boolean {
  if (!status) return false;
  if (status.isAdmin) return false;
  if (status.state === "active") return false;
  if (status.state === "expired") return true;
  return status.state === "trial" && status.marketDaysLeft <= WARN_AT_DAYS_LEFT;
}

export function SubscriptionReminder() {
  const { status, renew } = useSubscription();
  const [visible, setVisible] = useState(false);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const relevant = shouldRemind(status);
  // Six characters against five themes: the pair only repeats every thirtieth appearance, so a
  // returning reminder is a different character *and* a different-looking panel.
  const character = characterFor(round);
  const theme = themeFor(round);

  useEffect(() => {
    if (!relevant) return;

    // First appearance is delayed so the page has a chance to load and be read before the
    // reminder interrupts, then it returns on a fixed cadence.
    const first = window.setTimeout(() => setVisible(true), 2000);
    const timer = window.setInterval(() => {
      setRound((value) => value + 1);
      setVisible(true);
    }, REMIND_EVERY_MS);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [relevant]);

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

  if (!relevant || !status || !visible) return null;

  const expired = status.state === "expired";
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
            className={`pointer-events-none absolute inset-0 opacity-25 ${
              // Radiating wedges only read as a spotlight if they turn.
              theme.pattern === "starburst" ? "animate-ray-spin" : ""
            }`}
            style={patternStyle(theme.pattern)}
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={close}
            aria-label="Dismiss reminder"
            className={`absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-black transition hover:rotate-90 ${theme.control}`}
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
            {expired ? "Subscription reminder" : "Trial ending"}
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

/** A compact trial/subscription state chip for the header. */
export function SubscriptionBadge() {
  const { status } = useSubscription();
  if (!status) return null;

  const styles: Record<string, string> = {
    admin: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300",
    active: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
    trial: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400",
    expired: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400",
  };

  const labels: Record<string, string> = {
    admin: "Admin",
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
