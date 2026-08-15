// Every AI feature the dashboard holds, on the landing page, below the hero.
//
// The landing page was good at proving the *data* — ten boards of real exchange figures — and said
// almost nothing about the thing being sold. A visitor could scroll the whole page and still not
// know what "AI research" meant here, because the AI lives behind a sign-in and the page never
// enumerated it. This section is that enumeration: eighteen features, what each one does in a
// sentence, the plan it belongs to, and a link straight into it.
//
// ---------------------------------------------------------------------------
// Where the content comes from, and what Supabase decides
// ---------------------------------------------------------------------------
//
// The feature list itself is `AI_FEATURES` in ../lib/plan-tiers — key, label, tier and blurb, all
// already written and already the single source the paywall, the sidebar and the admin switch list
// read from. Duplicating it into a table would give the marketing page its own copy to drift from
// the product, which is the failure worth avoiding here.
//
// What the database decides is *availability*. `public.feature_locks` in `stockersai_db` holds one
// row per switched-off feature — the admin's kill switch, written from the Feature Locks panel —
// and a locked feature must not be advertised on the landing page while it is unreachable in the
// dashboard. So the list is filtered against a live read of that table, and switching a feature off
// in the admin removes it from here too.
//
// `readFeatureLocks` degrades to "nothing is locked" when the database cannot be reached, which is
// the right direction for this page: a blip should cost the section its filtering, not its content.
//
// Cached with the `ai` tag, so the admin's own purge — which already drops that family — is what
// brings a lock change through rather than a deploy.

import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { AI_FEATURES, TIER_LABEL, type PlanTier } from "../lib/plan-tiers";
import { CACHE_TAGS } from "../lib/cache";
import { readFeatureLocks } from "../lib/subscription";
import { DASHBOARD_SECTION_ROUTES } from "../lib/section-routes";
import { TIER_CHROME } from "./plan-pill";

/** The order the tiers are shown in, cheapest first, matching the pricing table's own order. */
const TIER_ORDER: PlanTier[] = ["starter", "pro", "elite"];

const TIER_INTRO: Record<PlanTier, string> = {
  starter: "The standing boards and calendars — the session as the exchanges published it, read back to you.",
  pro: "The screeners and the research desk, where the AI takes a position rather than reporting one.",
  elite: "The deep reads: filings, ownership, comparisons and a search box you can ask in plain English.",
};

/**
 * Where a feature lives once you are signed in.
 *
 * The feature keys and the dashboard section ids are the same strings by design, so this is a
 * lookup rather than a second mapping to keep in step. `news` is the one that is not a dashboard
 * section at all — it is the public `/news` page — so it is named here explicitly rather than
 * silently linking nowhere.
 */
const sectionPathByFeature = new Map(DASHBOARD_SECTION_ROUTES.map((route) => [route.id, route.path]));

export function featureHref(key: string): string {
  if (key === "news") return "/news";
  return sectionPathByFeature.get(key) ?? "/overview";
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M5 12h13" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/** One feature: what it is, which plan holds it, and the way into it. */
function FeatureCard({ feature }: { feature: (typeof AI_FEATURES)[number] }) {
  const tier = feature.tier as PlanTier;

  return (
    <li>
      <Link
        href={featureHref(feature.key)}
        className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_20px_44px_-30px_rgba(5,150,105,0.75)] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/40"
      >
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{feature.label}</h4>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${TIER_CHROME[tier].pill}`}
          >
            {TIER_LABEL[tier]}
          </span>
        </div>

        <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{feature.blurb}</p>

        {/* Says where it goes rather than "learn more": the destination is behind a sign-in, and a
            reader deserves to know that before they click rather than after. */}
        <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600 transition group-hover:gap-2.5 dark:text-emerald-400">
          Open in dashboard
          <ArrowIcon />
        </span>
      </Link>
    </li>
  );
}

export async function AiFeaturesPayload() {
  "use cache";
  cacheLife("market");
  cacheTag(CACHE_TAGS.ai);

  const locks = await readFeatureLocks();
  // A feature the admin has switched off is unreachable in the dashboard, so advertising it here
  // would be an invitation to a locked door.
  const live = AI_FEATURES.filter((feature) => !locks[feature.key]);

  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    features: live.filter((feature) => feature.tier === tier),
  })).filter((group) => group.features.length > 0);

  // Everything switched off at once is not a state worth drawing an empty section for.
  if (byTier.length === 0) return null;

  return (
    <section
      id="ai-features"
      className="scroll-mt-28 rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-violet-600 dark:text-violet-400">
          Inside the dashboard
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Every AI feature, and what each one actually does
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {live.length} AI surfaces across the three plans. Every one opens on real BSE and NSE data —
          the same figures the boards on this page are built from. Sign in to open any of them; a new
          account gets all three tiers free for the length of the trial.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {byTier.map(({ tier, features }) => (
          <div key={tier}>
            <div className={`flex flex-col gap-1 border-l-2 pl-4 ${TIER_CHROME[tier].card.split(" ")[0]}`}>
              <div className="flex items-center gap-2">
                <h3 className={`text-lg font-semibold ${TIER_CHROME[tier].accent}`}>{TIER_LABEL[tier]}</h3>
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {features.length} {features.length === 1 ? "feature" : "features"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{TIER_INTRO[tier]}</p>
            </div>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <FeatureCard key={feature.key} feature={feature} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6 dark:border-slate-800">
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(5,150,105,0.9)] transition hover:from-emerald-500 hover:to-teal-500"
        >
          Start the free trial
        </Link>
        <Link
          href="/pricing"
          className="inline-flex items-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Compare the plans
        </Link>
      </div>
    </section>
  );
}
