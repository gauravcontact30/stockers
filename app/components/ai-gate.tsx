"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { FEATURE_BY_KEY, featureTier, starsFor, TIER_LABEL, type FeatureKey, type PlanTier } from "../lib/plan-tiers";
import { track } from "../lib/track";
import { LockIcon, PlanPill, PlanRibbon } from "./plan-pill";
import { SubscribeModal } from "./subscribe-modal";
import { useSubscription } from "./subscription-provider";

/**
 * The admin's per-feature switch. Rendered only for admins â€” and backed by a server-side admin
 * check, so hiding it is a convenience, not the security boundary.
 */
export function FeatureLockToggle({ feature, label }: { feature: string; label: string }) {
  const { status, isLocked, setLock } = useSubscription();
  const [busy, setBusy] = useState(false);

  if (!status?.isAdmin) return null;

  const locked = isLocked(feature);
  const actionLabel = locked ? `Enable ${label}` : `Disable ${label}`;

  const toggle = async () => {
    setBusy(true);
    await setLock(feature, !locked);
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={locked}
      aria-label={actionLabel}
      title={actionLabel}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-60 ${
        locked
          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400"
          : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400"
      }`}
    >
      <LockIcon className="h-3.5 w-3.5" />
      <span className="sr-only">{busy ? "Saving..." : actionLabel}</span>
    </button>
  );
}

function StarRibbon({ tier, feature }: { tier: PlanTier; feature: string }) {
  const stars = starsFor(tier, feature);
  if (stars === 0) return null;
  return (
    <span
      aria-label={`${stars} star Rank ${4 - stars}`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: stars }, (_, index) => (
          <svg key={index} viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path d="m10 1.6 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L10 1.6Z" />
          </svg>
        ))}
      </span>
      <span>Rank {4 - stars}</span>
    </span>
  );
}

export function LockPanel({ feature, label }: { feature: string; label: string }) {
  const { status, isLocked } = useSubscription();
  // The plans open over the panel rather than at the end of a link to /#pricing. Being refused and
  // being able to do something about it are one step now, and the reader keeps their place.
  const [plansOpen, setPlansOpen] = useState(false);
  const lockedByAdmin = isLocked(feature);
  const signedIn = status?.signedIn ?? false;
  const requiredTier = featureTier(feature);
  const featureMeta = requiredTier && feature in FEATURE_BY_KEY ? FEATURE_BY_KEY[feature as FeatureKey] : null;
  const heldPlan = status?.planName ?? null;

  // Recorded where the refusal is actually seen, which is not the same as the server's count of
  // refused API calls: a panel that never fetches because the gate closed in front of it is still
  // a reader who walked into a wall, and the admin dashboard should be able to see them.
  useEffect(() => {
    track("paywall.hit", feature);
  }, [feature]);

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/95 p-6 text-center shadow-[0_20px_50px_-30px_rgba(15,23,42,0.6)] backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
      <p className="text-2xl" aria-hidden="true">
        Locked
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{label} is locked</p>
      {requiredTier && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <PlanPill tier={requiredTier} />
          <StarRibbon tier={requiredTier} feature={feature} />
        </div>
      )}

      {lockedByAdmin ? (
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
          An administrator has turned this feature off. It will come back on once they re-enable it.
        </p>
      ) : (
        <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
          {requiredTier
            ? `${TIER_LABEL[requiredTier]} is required for ${featureMeta?.label ?? label}.${heldPlan ? ` You are on ${heldPlan}.` : ""}`
            : "Subscribe to keep using the AI features."}
        </p>
      )}

      {!lockedByAdmin && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              // Which lock a reader was standing in front of when they went to look at the plans
              // is the closest thing the product has to a statement of intent to buy.
              track("paywall.plans", feature);
              setPlansOpen(true);
            }}
            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            {heldPlan ? "Upgrade plan" : "Choose a plan"}
          </button>
          {!signedIn && (
            <Link
              href="/signin"
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sign in
            </Link>
          )}
        </div>
      )}

      {/* Mounted unconditionally: the modal renders nothing until it is opened, and keeping it
          here means the plan the reader was refused is the one the dialog opens on. */}
      <SubscribeModal open={plansOpen} onClose={() => setPlansOpen(false)} feature={feature} />
    </div>
  );
}

/**
 * The shape a gated feature leaves behind when it is not the thing being rendered.
 *
 * The gate used to mount the real children behind a blur, and to mount them optimistically while
 * the subscription status was still in flight. Both meant a panel nobody was entitled to still ran
 * every fetch inside it: a visitor's console filled with 402s from the endpoints that had just
 * refused them, and what the blur actually covered was each panel's "couldn't reach the feed"
 * error rather than any data. Nothing was lost by stopping — the server refuses those calls
 * anyway, so a locked panel never had real figures under it to tease.
 */
function GatePlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-[32px] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="h-3 w-28 rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-6 w-2/3 rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
    </div>
  );
}

/**
 * Wraps an AI feature, showing a lock panel in its place when the caller may not use it.
 *
 * This is presentation only. Every gated endpoint refuses on the server too, so a user who
 * removes this from the DOM still gets a 402 from the API.
 *
 * The children are mounted only once the status says they may be — a panel is a live component
 * that fetches the moment it appears, so rendering one to a caller who is about to be refused is
 * a request that can only ever come back 402. `canUse` still answers optimistically when the
 * status request itself failed, so an outage on /api/subscription leaves a subscriber with their
 * features rather than a wall of locks.
 */
export function AiGate({ feature, label, children }: { feature: string; label: string; children: ReactNode }) {
  const { canUse, loading } = useSubscription();

  if (loading) return <GatePlaceholder />;
  if (canUse(feature)) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-[32px]">
      <div aria-hidden="true" className="pointer-events-none select-none opacity-35 blur-[2px]">
        <GatePlaceholder />
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 p-4 dark:bg-slate-950/55">
        <LockPanel feature={feature} label={label} />
      </div>
    </div>
  );
}

/**
 * One AI section on the landing page: the admin's lock switch above it (admins only) and, by
 * default, the subscription gate around it.
 *
 * @param gate set false for a section that is only partly AI â€” the market pulse keeps its
 * exchange data visible and has the server withhold just the AI narrative, so replacing the whole
 * card with a lock panel would hide real data the user is entitled to.
 */
export function GatedSection({
  feature,
  label,
  id,
  gate = true,
  children,
}: {
  feature: string;
  label: string;
  id?: string;
  gate?: boolean;
  children: ReactNode;
}) {
  const { status } = useSubscription();
  const requiredTier = featureTier(feature);

  return (
    <div id={id} className="scroll-mt-28">
      {status?.isAdmin && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
          <FeatureLockToggle feature={feature} label={label} />
        </div>
      )}
      {/* Deliberately not `overflow-hidden`: this wraps whole sections, and every menu inside one
          — the compare pickers most visibly — is absolutely positioned and taller than the space
          left below it, so clipping here cut the options off at the card's edge. Nothing needs the
          clip: the corner ribbon rounds and clips itself, the locked state has its own clipping
          wrapper in <AiGate>, and the cards inside carry their own radius. */}
      <div className="relative rounded-[32px]">
        {requiredTier && <PlanRibbon tier={requiredTier} />}
        {gate ? (
          <AiGate feature={feature} label={label}>
            {children}
          </AiGate>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

