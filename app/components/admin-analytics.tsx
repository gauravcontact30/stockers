"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActivityRow,
  AnalyticsReport,
  AnalyticsTotals,
  AnalyticsUserRow,
  DailyPoint,
  FeatureUsage,
  Funnel,
  RankedRow,
} from "../lib/analytics-report";
import { AI_FEATURES, TIER_LABEL, tierForPlan, type PlanTier } from "../lib/plan-tiers";
import { AdminLiveUsers } from "./admin-live-users";
import { DataTable, type Column } from "./data-table";
import { deltaOf } from "./stat-tile";
import { PieChart, type Slice } from "./pie-chart";
import { LockIcon, TIER_CHROME } from "./plan-pill";
import { authHeaders } from "./subscription-provider";

/**
 * What the audience does, for the super admin.
 *
 * Every figure comes from `/api/admin/analytics`, which refuses anyone who is not an admin — this
 * component renders the answer, it does not decide who may see it.
 *
 * The page is arranged as one argument, top to bottom: how many people came today and whether that
 * is more than yesterday; how far they got down the funnel; how that has moved over the window;
 * what they actually did; what they did it to; and finally who they were. A reader should be able
 * to stop at any point and have a complete, smaller answer.
 *
 * ---------------------------------------------------------------------------
 * On the charts
 * ---------------------------------------------------------------------------
 *
 * The composition questions — what share of traffic is phone, which features carry the AI usage,
 * where arrivals come from — are part-to-whole, and each is drawn as an interactive donut. A donut
 * is weak at ranking two similar slices, so none of them is the only place a number appears: every
 * chart carries a percentage on each slice it can fit, a legend with the exact count, and a
 * sortable, searchable, paged table of the same series directly underneath.
 *
 * Two things are deliberately *not* donuts. Traffic over the window and the shape of the day are
 * time series — a donut of Tuesday against Wednesday is meaningless — so they stay as bars. The
 * funnel is an ordered sequence of stages rather than parts of a whole, so it uses the ordinal
 * ramp: one hue, darkening down the steps.
 *
 * The palette is fixed and measured, not chosen by eye — see the chart block in `app/globals.css`
 * for the colourblind-separation figures. Slots follow the entity, so filtering a chart never
 * repaints the slices that survive.
 */

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/** The trend chart shows one of these at a time — never two scales on one pair of axes. */
const METRICS: { key: keyof Omit<DailyPoint, "day">; label: string; hint: string }[] = [
  { key: "visitors", label: "Visitors", hint: "Distinct people per day" },
  { key: "views", label: "Page views", hint: "Pages opened per day" },
  { key: "actions", label: "Interactions", hint: "Things people did, beyond arriving" },
  { key: "featureOpens", label: "AI opens", hint: "AI features delivered" },
  { key: "signins", label: "Sign-ins", hint: "Successful logins" },
  { key: "signups", label: "Sign-ups", hint: "New accounts" },
];

/** Above this many days the per-bar date labels collide, so the axis drops to first/last only. */
const LABELLED_BARS = 14;

const CARD = "rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const TABLE_WRAP = "overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800";
const THEAD = "bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400";
const TH = "px-4 py-3 font-bold";
const TD = "px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400";
const NUM = `${TD} tabular-nums`;
const PILL_ON = "border-transparent bg-rose-600 text-white";
const PILL_OFF =
  "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

export function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

/** "8 Aug" — enough to read a bar, short enough to fit under one. */
export function formatDayShort(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "8 Aug 2026, 4:35 pm" — the exact instant, in the timezone every other date here is in. */
export function formatMoment(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "9 am", "3 pm" — the hour labels under the busiest-hours chart. */
export function formatHour(hour: number): string {
  if (hour === 0) return "12 am";
  if (hour === 12) return "12 pm";
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/**
 * Today against yesterday, as a direction and a size.
 *
 * A bare number on a dashboard is unreadable — 214 visitors is either very good or very bad and
 * the tile cannot say which. The arithmetic itself is in `./stat-tile`, beside the other tile that
 * prints it.
 */
function Delta({ now, before }: { now: number; before: number }) {
  const delta = deltaOf(now, before);
  const tone =
    delta.direction === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : delta.direction === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-400 dark:text-slate-500";

  return <p className={`mt-1 text-[11px] font-semibold ${tone}`}>{delta.text}</p>;
}

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint: React.ReactNode; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      {hint}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {children}
    </p>
  );
}

function SectionHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{blurb}</p>
    </div>
  );
}

/**
 * The path from arriving to paying.
 *
 * Stage sizes over the window, not a cohort walked through time — nobody arrives, signs up and
 * subscribes inside one visit, and a funnel that implied they did would be a lie told in a nice
 * shape. The labels say so.
 */
export function FunnelStrip({ funnel }: { funnel: Funnel }) {
  // `rate` marks the stages whose hint is already the step-over-step figure, so the drop line
  // below is not printed twice under the same number.
  const steps = [
    { label: "Visitors", value: funnel.visitors, hint: "Distinct people", rate: false },
    { label: "Sign-ups", value: funnel.signups, hint: `${formatPercent(funnel.signupRate)} of visitors`, rate: true },
    { label: "Signed in", value: funnel.activeUsers, hint: "Accounts seen", rate: false },
    { label: "Used AI", value: funnel.aiUsers, hint: "Opened a feature", rate: false },
    { label: "Paid", value: funnel.payers, hint: `${formatPercent(funnel.payRate)} of sign-ups`, rate: true },
  ];
  const peak = Math.max(1, ...steps.map((step) => step.value));

  return (
    <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700"
        >
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{formatNumber(step.value)}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{step.label}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            {/* The ordinal ramp, not a categorical hue: these stages have a real order, so one hue
                darkening down the steps says "sequence" where five colours would say "five
                unrelated things". */}
            <div
              className="h-full rounded-r-[4px] transition-[width] duration-300"
              style={{ width: `${(step.value / peak) * 100}%`, background: `var(--viz-step-${index + 1})` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{step.hint}</p>
          {/* The drop from the step immediately before — the number a funnel is actually read for,
              and one that no amount of staring at five bars will give you. Skipped where the hint
              above already states a rate, so the same percentage never appears twice on one tile. */}
          {index > 0 && !step.rate && (
            <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {steps[index - 1].value > 0
                ? `${formatPercent(step.value / steps[index - 1].value)} of ${steps[index - 1].label.toLowerCase()}`
                : "no prior stage"}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A ranked series as donut slices. `users` rides along as the legend's secondary figure. */
export function slicesFromRanked(rows: RankedRow[], peopleNoun = "people"): Slice[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.count,
    meta: `${formatNumber(row.users)} ${peopleNoun}`,
  }));
}

/**
 * A composition panel: the donut, and the same series as a searchable table.
 *
 * The pairing is the point rather than a courtesy. A donut answers "what is the split" instantly
 * and "is A bigger than B" badly; the table answers the second exactly, sorts on any column, and
 * is the accessible reading of the chart for anyone who cannot separate the hues.
 */
export function CompositionPanel({
  rows,
  total,
  unit,
  heading,
  countHeader,
  empty,
  peopleNoun = "people",
}: {
  rows: RankedRow[];
  total: string;
  unit: string;
  heading: string;
  countHeader: string;
  empty: string;
  peopleNoun?: string;
}) {
  const columns: Column<RankedRow>[] = [
    {
      key: "label",
      header: heading,
      cell: (row) => <span className="font-semibold text-slate-900 dark:text-white">{row.label}</span>,
      sortValue: (row) => row.label,
    },
    { key: "count", header: countHeader, align: "right", cell: (row) => formatNumber(row.count), sortValue: (row) => row.count, className: "tabular-nums" },
    { key: "users", header: "People", align: "right", cell: (row) => formatNumber(row.users), sortValue: (row) => row.users, className: "tabular-nums" },
    {
      key: "share",
      header: "Share",
      align: "right",
      cell: (row) => formatPercent(row.share),
      sortValue: (row) => row.share,
      className: "tabular-nums",
    },
  ];

  if (rows.length === 0) return <Empty>{empty}</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <PieChart slices={slicesFromRanked(rows, peopleNoun)} total={total} unit={unit} empty={empty} />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.key}
        caption={`${heading} by ${countHeader.toLowerCase()}`}
        searchFields={(row) => [row.label]}
        searchPlaceholder={`Search ${heading.toLowerCase()}`}
        pageSize={6}
        minWidth={420}
        empty={empty}
      />
    </div>
  );
}

/**
 * Every measure by the name it is charted under.
 *
 * Total rather than a lookup with a fallback: the fallback would be a branch that can only fire if
 * a measure is added to `DailyPoint` and forgotten here, and a compile error is a better way to
 * find that out than a chart quietly labelled "Visitors".
 */
const METRIC_LABEL = Object.fromEntries(METRICS.map((option) => [option.key, option.label])) as Record<
  keyof Omit<DailyPoint, "day">,
  string
>;

const METRIC_HINT = Object.fromEntries(METRICS.map((option) => [option.key, option.hint])) as Record<
  keyof Omit<DailyPoint, "day">,
  string
>;

/** One metric per day. One series, so the title names it and no legend is needed. */
export function DailyTraffic({ daily, metric }: { daily: DailyPoint[]; metric: keyof Omit<DailyPoint, "day"> }) {
  const label = METRIC_LABEL[metric];
  const peak = Math.max(1, ...daily.map((point) => point[metric]));
  const labelled = daily.length <= LABELLED_BARS;

  return (
    <div>
      <div className="flex h-44 items-end gap-[2px]" role="img" aria-label={`${label} per day, peaking at ${formatNumber(peak)}`}>
        {daily.map((point) => (
          <div key={point.day} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              // A floor of 2px so a day with a single visitor is still visibly different from a
              // day with none, which at this height would otherwise both round to nothing.
              style={{ height: `${Math.max(point[metric] > 0 ? 2 : 0, (point[metric] / peak) * 100)}%` }}
              className="w-full rounded-t-[4px] bg-rose-500/85 transition group-hover:bg-rose-600 dark:bg-rose-500/70 dark:group-hover:bg-rose-400"
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white group-hover:block dark:bg-slate-700">
              {formatDayShort(point.day)}: {formatNumber(point[metric])} {label.toLowerCase()}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {labelled ? (
          daily.map((point) => (
            <span key={point.day} className="flex-1 text-center">
              {formatDayShort(point.day)}
            </span>
          ))
        ) : (
          <>
            <span>{formatDayShort(daily[0].day)}</span>
            <span>{formatDayShort(daily[daily.length - 1].day)}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** When the audience is actually here, by hour of the IST day. */
export function HourlyShape({ hours }: { hours: { hour: number; count: number }[] }) {
  const peak = Math.max(1, ...hours.map((slot) => slot.count));
  const busiest = hours.reduce((best, slot) => (slot.count > best.count ? slot : best), hours[0]);

  return (
    <div>
      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={`Interactions by hour, busiest at ${formatHour(busiest.hour)}`}>
        {hours.map((slot) => (
          <div key={slot.hour} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              style={{ height: `${Math.max(slot.count > 0 ? 3 : 0, (slot.count / peak) * 100)}%` }}
              className="w-full rounded-t-[4px] bg-sky-500/85 transition group-hover:bg-sky-600 dark:bg-sky-500/70 dark:group-hover:bg-sky-400"
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white group-hover:block dark:bg-slate-700">
              {formatHour(slot.hour)}: {formatNumber(slot.count)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <span>12 am</span>
        <span>12 pm</span>
        <span>11 pm</span>
      </div>
    </div>
  );
}

/**
 * One "what was most X" table.
 *
 * Pages, interactions, stocks, sources and devices all answer the same question of different
 * columns, so they share one component — five near-identical tables is where the fifth one quietly
 * stops matching the other four.
 */
export function RankedTable({
  rows,
  heading,
  unit,
  empty,
}: {
  rows: RankedRow[];
  heading: string;
  unit: string;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;

  const peak = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className={TABLE_WRAP}>
      <table className="w-full min-w-[420px] border-collapse text-left text-sm">
        <caption className="sr-only">{heading}</caption>
        <thead className={THEAD}>
          <tr>
            <th scope="col" className={TH}>{heading}</th>
            <th scope="col" className={TH}>{unit}</th>
            <th scope="col" className={TH}>People</th>
            <th scope="col" className={`${TH} w-1/3`}>Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-200 dark:border-slate-800">
              <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.label}</td>
              <td className={NUM}>{formatNumber(row.count)}</td>
              <td className={NUM}>{formatNumber(row.users)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-full min-w-[60px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-r-[4px] bg-violet-500 dark:bg-violet-400" style={{ width: `${(row.count / peak) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                    {formatPercent(row.share)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * AI features: what share of usage each carries, and how much demand each was refused.
 *
 * The donut splits delivered opens. "Blocked" deliberately stays out of it — a refusal is not a
 * slice of what was delivered, and folding the two together would report the paywall's failures as
 * successes. It gets its own column in the table, which is where the comparison belongs.
 */
export function FeatureRanking({ features }: { features: FeatureUsage[] }) {
  if (features.length === 0) return <Empty>No AI feature has been opened in this window yet.</Empty>;

  const columns: Column<FeatureUsage>[] = [
    {
      key: "label",
      header: "Feature",
      cell: (feature) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{feature.label}</p>
          <p className="text-[11px] capitalize text-slate-400 dark:text-slate-500">{feature.tier} tier</p>
        </div>
      ),
      sortValue: (feature) => feature.label,
    },
    { key: "opens", header: "Opens", align: "right", cell: (f) => formatNumber(f.opens), sortValue: (f) => f.opens, className: "tabular-nums" },
    { key: "users", header: "People", align: "right", cell: (f) => formatNumber(f.users), sortValue: (f) => f.users, className: "tabular-nums" },
    {
      key: "blocked",
      header: "Blocked",
      align: "right",
      cell: (feature) => (
        <span className={feature.blocked > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
          {formatNumber(feature.blocked)}
        </span>
      ),
      sortValue: (feature) => feature.blocked,
      className: "tabular-nums",
    },
    { key: "share", header: "Share", align: "right", cell: (f) => formatPercent(f.share), sortValue: (f) => f.share, className: "tabular-nums" },
    { key: "lastAt", header: "Last opened", cell: (f) => formatMoment(f.lastAt), sortValue: (f) => f.lastAt },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PieChart
        slices={features
          .filter((feature) => feature.opens > 0)
          .map((feature) => ({
            key: feature.key,
            label: feature.label,
            value: feature.opens,
            meta: `${formatNumber(feature.users)} people`,
          }))}
        total="AI opens"
        unit="opens"
        empty="No AI feature has been delivered in this window yet."
      />
      <DataTable
        rows={features}
        columns={columns}
        rowKey={(feature) => feature.key}
        caption="AI features by use"
        searchFields={(feature) => [feature.label, feature.tier]}
        searchPlaceholder="Search features"
        filters={[
          {
            key: "tier",
            label: "Tier",
            options: [
              { value: "starter", label: "Starter" },
              { value: "pro", label: "Pro" },
              { value: "elite", label: "Elite" },
            ],
            test: (feature, value) => feature.tier === value,
          },
          {
            key: "blocked",
            label: "Refusals",
            options: [
              { value: "yes", label: "Had refusals" },
              { value: "no", label: "None refused" },
            ],
            test: (feature, value) => (value === "yes" ? feature.blocked > 0 : feature.blocked === 0),
          },
        ]}
        pageSize={8}
        minWidth={720}
        empty="No AI feature matches these filters."
      />
    </div>
  );
}

/** Matches an account against the admin's search: name, address, mobile or top feature. */
export function matchesUser(user: AnalyticsUserRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${user.name} ${user.email} ${user.mobile ?? ""} ${user.plan ?? NO_PLAN} ${user.topFeature ?? ""}`.toLowerCase().includes(needle);
}

/**
 * The audience, one row per account, with the contact details a support request needs.
 *
 * Searchable across name, address, mobile, plan and what they use most — so an admin looking up
 * "who was the Pro user asking about dividends" can get there from any fragment they remember,
 * with the typeahead offering the values that are actually present.
 */
export function EngagementTable({ users }: { users: AnalyticsUserRow[] }) {
  const columns: Column<AnalyticsUserRow>[] = [
    {
      key: "user",
      header: "User",
      cell: (user) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
        </div>
      ),
      sortValue: (user) => user.name,
    },
    { key: "mobile", header: "Mobile", cell: (user) => user.mobile ?? "-", className: "whitespace-nowrap" },
    { key: "plan", header: "Plan", cell: (user) => <PlanCell plan={user.plan} absent={NO_PLAN} />, sortValue: (user) => user.plan },
    { key: "visits", header: "Visits", align: "right", cell: (u) => formatNumber(u.visits), sortValue: (u) => u.visits, className: "tabular-nums" },
    { key: "actions", header: "Actions", align: "right", cell: (u) => formatNumber(u.actions), sortValue: (u) => u.actions, className: "tabular-nums" },
    { key: "opens", header: "AI opens", align: "right", cell: (u) => formatNumber(u.featureOpens), sortValue: (u) => u.featureOpens, className: "tabular-nums" },
    { key: "topFeature", header: "Top AI feature", cell: (user) => user.topFeature ?? "-", sortValue: (user) => user.topFeature },
    { key: "topAction", header: "Most often", cell: (user) => user.topAction ?? "-", sortValue: (user) => user.topAction },
    { key: "device", header: "Device", cell: (user) => user.device ?? "-", sortValue: (user) => user.device },
    {
      key: "lastSeen",
      header: "Last seen",
      cell: (user) => formatMoment(user.lastSeen),
      sortValue: (user) => user.lastSeen,
      className: "whitespace-nowrap",
    },
  ];

  return (
    <DataTable
      rows={users}
      columns={columns}
      rowKey={(user) => user.id}
      caption="Signed-in accounts active in this window"
      searchFields={(user) => [user.name, user.email, user.mobile, user.plan ?? NO_PLAN, user.topFeature, user.topAction]}
      searchPlaceholder="Search name, email, mobile, plan or feature"
      searchLabel="Search accounts"
      filters={[
        {
          key: "plan",
          label: "Plan",
          options: [
            { value: "Starter", label: "Starter" },
            { value: "Pro", label: "Pro" },
            { value: "Elite", label: "Elite" },
            { value: "none", label: NO_PLAN },
          ],
          test: (user, value) => (value === "none" ? user.plan === null : user.plan === value),
        },
        {
          key: "device",
          label: "Device",
          options: [
            { value: "mobile", label: "Mobile" },
            { value: "tablet", label: "Tablet" },
            { value: "desktop", label: "Desktop" },
          ],
          test: (user, value) => user.device === value,
        },
        {
          key: "ai",
          label: "AI use",
          options: [
            { value: "yes", label: "Has used AI" },
            { value: "no", label: "Never used AI" },
          ],
          test: (user, value) => (value === "yes" ? user.featureOpens > 0 : user.featureOpens === 0),
        },
        {
          key: "verified",
          label: "Email",
          options: [
            { value: "yes", label: "Verified" },
            { value: "no", label: "Unverified" },
          ],
          test: (user, value) => user.emailVerified === (value === "yes"),
        },
      ]}
      pageSize={10}
      minWidth={1080}
      empty="No signed-in account matches this search."
    />
  );
}

const EVENT_LABEL: Record<ActivityRow["type"], string> = {
  visit: "Page visit",
  signin: "Signed in",
  signup: "Signed up",
  feature: "AI feature",
  action: "Interaction",
};

/** What one row of the feed was, in the admin's words rather than the event's. */
export function activityLabel(row: ActivityRow): string {
  if (row.blocked) return "AI feature (blocked)";
  return row.action ?? EVENT_LABEL[row.type];
}

/** What it was done to: the stock, the section, the feature or the page. */
export function activityDetail(row: ActivityRow): string {
  return row.label ?? row.feature ?? row.path ?? "-";
}

/**
 * Every AI feature's tier, keyed by the label the feed carries.
 *
 * The feed stores the feature's admin-facing label rather than its slug — that is what makes the
 * row readable without a lookup table on the server — so the tier is recovered here from the same
 * `AI_FEATURES` list the paywall itself is driven by. Labels are unique across the three tiers, and
 * a label this build does not know resolves to no tier rather than to the wrong one.
 */
const TIER_BY_FEATURE_LABEL: Record<string, PlanTier> = Object.fromEntries(
  AI_FEATURES.map((feature) => [feature.label, feature.tier]),
);

/** The plan an activity belongs to: the AI feature's own tier, or null for everything else. */
export function activityTier(row: ActivityRow): PlanTier | null {
  return row.feature ? (TIER_BY_FEATURE_LABEL[row.feature] ?? null) : null;
}

const PILL = "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold";

/** What an account with no purchased plan is called, everywhere it has to be named. */
export const NO_PLAN = "No plan";

/** The quiet chrome for the two rows that are on no tier: a guest, and a trial-or-lapsed account. */
const NEUTRAL_PILL = "border-dashed border-slate-300 bg-transparent text-slate-500 dark:border-slate-600 dark:text-slate-400";

/**
 * The chrome for a row that is not an AI feature — deliberately quiet.
 *
 * The plan palette (sky, emerald, violet) is spent on the AI rows, which is the whole point of
 * colouring this column: a reader scanning the feed should be able to pick out Elite usage from
 * across the room. Giving a page visit its own hue would put five more colours in the way of that,
 * so browsing is slate and the two account events share one tone that no tier uses.
 */
const EVENT_CHROME: Record<ActivityRow["type"], string> = {
  visit: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  action: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  signin: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300",
  signup: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300",
  // Only reachable for a feature key this build no longer knows, which is neither a tier nor a
  // plain interaction — amber says "something the paywall touched" without claiming a plan.
  feature: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
};

/** A refusal, whatever tier it was aimed at. Amber outranks the plan colour: it did not happen. */
const BLOCKED_CHROME = "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300";

/**
 * One activity, as a pill tinted by the plan it belongs to.
 *
 * The tier is written into the pill as well as painted on it — colour alone is not a label, and an
 * admin reading this feed in a screenshot or with a colour-vision deficiency needs the word.
 */
function ActivityPill({ row }: { row: ActivityRow }) {
  const tier = activityTier(row);
  const chrome = row.blocked ? BLOCKED_CHROME : tier ? TIER_CHROME[tier].pill : EVENT_CHROME[row.type];

  return (
    <span
      className={`${PILL} ${chrome}`}
      title={tier ? (row.blocked ? `${TIER_LABEL[tier]} feature, refused` : `${TIER_LABEL[tier]} AI feature`) : EVENT_LABEL[row.type]}
    >
      {row.blocked && <LockIcon className="h-3 w-3 shrink-0" />}
      {activityLabel(row)}
      {tier && <span className="font-bold uppercase tracking-wider opacity-70">· {TIER_LABEL[tier]}</span>}
    </span>
  );
}

/** The account's own plan, in the same three colours — or the pill a signed-out arrival gets. */
function PlanCell({ plan, absent = "Guest" }: { plan: string | null; absent?: string }) {
  if (!plan) return <span className={`${PILL} ${NEUTRAL_PILL}`}>{absent}</span>;

  const tier = tierForPlan(plan);
  return <span className={`${PILL} ${TIER_CHROME[tier].pill}`}>{TIER_LABEL[tier]}</span>;
}

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  const columns: Column<ActivityRow>[] = [
    { key: "at", header: "When", cell: (row) => formatMoment(row.at), sortValue: (row) => row.at, className: "whitespace-nowrap" },
    {
      key: "who",
      header: "Who",
      cell: (row) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.email ?? "No account"}</p>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    { key: "mobile", header: "Mobile", cell: (row) => row.mobile ?? "-", className: "whitespace-nowrap" },
    {
      key: "plan",
      header: "Plan",
      cell: (row) => <PlanCell plan={row.plan} />,
      // Guests sort last rather than first: "" would put every signed-out arrival at the top of an
      // ascending sort, which is the one grouping this column is never asked for.
      sortValue: (row) => row.plan,
    },
    {
      key: "what",
      header: "What they did",
      cell: (row) => <ActivityPill row={row} />,
      sortValue: (row) => activityLabel(row),
      className: "whitespace-nowrap",
    },
    { key: "detail", header: "Detail", cell: (row) => activityDetail(row), sortValue: (row) => activityDetail(row) },
    { key: "device", header: "Device", cell: (row) => row.device ?? "-", sortValue: (row) => row.device },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      caption="The most recent activity across the site"
      // The tier rides along in the search pool as well as on the pill, so an admin can type "elite"
      // and get every Elite feature touch back — the typeahead only ever offers values that are
      // genuinely on screen, so the suggestion is never a dead end.
      searchFields={(row) => {
        const tier = activityTier(row);
        return [row.name, row.email, row.mobile, activityLabel(row), activityDetail(row), row.plan, tier && TIER_LABEL[tier]];
      }}
      searchPlaceholder="Search who, what, which stock or which plan"
      searchLabel="Search activity"
      filters={[
        {
          key: "type",
          label: "Event",
          options: [
            { value: "action", label: "Interactions" },
            { value: "visit", label: "Page visits" },
            { value: "feature", label: "AI features" },
            { value: "signin", label: "Sign-ins" },
            { value: "signup", label: "Sign-ups" },
          ],
          test: (row, value) => row.type === value,
        },
        {
          key: "plan",
          label: "Plan",
          options: [
            { value: "Starter", label: "Starter" },
            { value: "Pro", label: "Pro" },
            { value: "Elite", label: "Elite" },
            { value: "guest", label: "Not signed in" },
          ],
          test: (row, value) => (value === "guest" ? row.plan === null : row.plan === value),
        },
        {
          key: "tier",
          label: "AI feature",
          options: [
            { value: "starter", label: "Starter features" },
            { value: "pro", label: "Pro features" },
            { value: "elite", label: "Elite features" },
          ],
          test: (row, value) => activityTier(row) === value,
        },
        {
          key: "blocked",
          label: "Outcome",
          options: [
            { value: "blocked", label: "Blocked by paywall" },
            { value: "ok", label: "Delivered" },
          ],
          test: (row, value) => row.blocked === (value === "blocked"),
        },
      ]}
      pageSize={5}
      minWidth={1020}
      empty="Nothing of this kind has been recorded in this window yet."
    />
  );
}

function TodayTiles({ today, yesterday }: { today: AnalyticsTotals; yesterday: AnalyticsTotals }) {
  const tiles: { label: string; key: keyof AnalyticsTotals; tone: string }[] = [
    { label: "Visitors", key: "visitors", tone: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" },
    { label: "Page views", key: "views", tone: "border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10" },
    { label: "Interactions", key: "actions", tone: "border-teal-200 bg-teal-50 dark:border-teal-500/25 dark:bg-teal-500/10" },
    { label: "Sign-ins", key: "signins", tone: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" },
    { label: "Sign-ups", key: "signups", tone: "border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10" },
    { label: "AI opens", key: "featureOpens", tone: "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <StatTile
          key={tile.key}
          label={tile.label}
          value={formatNumber(today[tile.key])}
          hint={<Delta now={today[tile.key]} before={yesterday[tile.key]} />}
          tone={tile.tone}
        />
      ))}
    </div>
  );
}

/** The daily series as a table — the accessible twin of the bar chart above it. */
function DailyTable({ daily }: { daily: DailyPoint[] }) {
  const columns: Column<DailyPoint>[] = [
    { key: "day", header: "Day", cell: (point) => point.day, sortValue: (point) => point.day, className: "whitespace-nowrap" },
    ...METRICS.map(
      (option): Column<DailyPoint> => ({
        key: option.key,
        header: option.label,
        align: "right",
        cell: (point) => formatNumber(point[option.key]),
        sortValue: (point) => point[option.key],
        className: "tabular-nums",
      }),
    ),
  ];

  return (
    <DataTable
      rows={daily}
      columns={columns}
      rowKey={(point) => point.day}
      caption="Every measure by day"
      searchFields={(point) => [point.day]}
      searchPlaceholder="Jump to a date"
      filters={[
        {
          key: "activity",
          label: "Days",
          options: [
            { value: "busy", label: "With traffic" },
            { value: "quiet", label: "With none" },
          ],
          test: (point, value) => (value === "busy" ? point.visitors > 0 : point.visitors === 0),
        },
      ]}
      pageSize={10}
      minWidth={640}
      initialSort={{ column: "day", direction: "desc" }}
      empty="No day matches these filters."
    />
  );
}

export function AdminAnalytics() {
  const [days, setDays] = useState(1);
  const [metric, setMetric] = useState<keyof Omit<DailyPoint, "day">>("visitors");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics?days=${days}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't load analytics.");
        return;
      }
      setReport(data as AnalyticsReport);
    } catch {
      setError("Couldn't reach the analytics service.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount and on range change; every setState runs after the await, not synchronously in this callback.
    load();
  }, [load]);

  /** Plan mix across the accounts seen in the window — a composition the report does not pre-rank. */
  const planMix = useMemo((): RankedRow[] => {
    const users = report?.users ?? [];
    const counts = new Map<string, number>();
    // Accounts that have bought nothing are a real slice of the mix rather than a gap in it — on a
    // trial-first product they are usually the largest one, and dropping them would make every
    // paid share look bigger than it is.
    for (const user of users) {
      const plan = user.plan ?? NO_PLAN;
      counts.set(plan, (counts.get(plan) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([plan, count]) => ({ key: plan, label: plan, count, users: count, share: users.length > 0 ? count / users.length : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [report]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDays(range.days)}
              aria-pressed={days === range.days}
              className={`h-9 rounded-full border px-3.5 text-xs font-semibold transition ${days === range.days ? PILL_ON : PILL_OFF}`}
            >
              {range.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading && !report && <p className="text-sm text-slate-500 dark:text-slate-400">Loading analytics...</p>}

      {report && (
        // While a new range loads, the page holds its previous render at reduced opacity rather
        // than blanking to a skeleton — no layout jump, and the figures never flash away.
        <div className={`flex flex-col gap-5 transition-opacity ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
          <section>
            <SectionHead title={`Today — ${report.range.to}`} blurb="Every figure compared with the same figure yesterday, so a number reads as good or bad on its own." />
            <TodayTiles today={report.today} yesterday={report.yesterday} />
          </section>

          <section className={CARD}>
            <SectionHead
              title="From arriving to paying"
              blurb={`Stage sizes across ${report.range.from} to ${report.range.to} — how many people reached each step, not one group followed through time.`}
            />
            <FunnelStrip funnel={report.funnel} />
          </section>

          {/* Above the window chart, and deliberately so: everything below this point is history,
              and this is the only thing on the page that is true of this minute. An admin opening
              Traffic & Usage asks "is anyone on the site" before they ask "how did last week go". */}
          <section className={CARD}>
            <SectionHead
              title="On the site right now"
              blurb="Live, from a heartbeat each open tab sends — not from the event log below, which cannot tell somebody still reading from somebody who left."
            />
            <AdminLiveUsers />
          </section>

          <section className={CARD}>
            <SectionHead title="Over the window" blurb={METRIC_HINT[metric]} />
            {/* Grouped and named: the table below this chart has a sortable "Interactions" column
                header, so without a group these two controls would be indistinguishable to anyone
                navigating by role. */}
            <div role="group" aria-label="Chart measure" className="mb-4 flex flex-wrap gap-1.5">
              {METRICS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMetric(option.key)}
                  aria-pressed={metric === option.key}
                  className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${metric === option.key ? PILL_ON : PILL_OFF}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <DailyTraffic daily={report.daily} metric={metric} />

            <div className="mt-5">
              <DailyTable daily={report.daily} />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className={CARD}>
              <SectionHead
                title="What people do"
                blurb="Every interaction the app reports. Hover or click a slice to hold it; the table below sorts and searches the same figures."
              />
              <CompositionPanel
                rows={report.actions}
                total="Interactions"
                unit="interactions"
                heading="Interaction"
                countHeader="Times"
                empty="Nobody has interacted with anything in this window yet."
              />
            </section>

            <section className={CARD}>
              <SectionHead
                title="Companies they look into"
                blurb="Detail sheets opened and picker selections, counted together — the audience's real shortlist."
              />
              <CompositionPanel
                rows={report.stocks}
                total="Company opens"
                unit="opens"
                heading="Stock"
                countHeader="Opens"
                empty="No company has been opened in this window yet."
              />
            </section>

            <section className={CARD}>
              <SectionHead
                title="Most-visited pages"
                blurb="Where the traffic actually lands. Query strings are stripped before anything is stored."
              />
              <CompositionPanel
                rows={report.pages}
                total="Page views"
                unit="views"
                heading="Page"
                countHeader="Views"
                empty="No page view has been recorded in this window yet."
              />
            </section>

            <section className={CARD}>
              <SectionHead
                title="Where they come from"
                blurb="The referring host only — never the full URL somebody arrived from."
              />
              <CompositionPanel
                rows={report.sources}
                total="Arrivals"
                unit="visits"
                heading="Source"
                countHeader="Visits"
                empty="No arrival has been recorded in this window yet."
              />
            </section>

            <section className={CARD}>
              <SectionHead title="What they are on" blurb="Phone, tablet or desktop, by everything recorded." />
              <CompositionPanel
                rows={report.devices}
                total="Events"
                unit="events"
                heading="Device"
                countHeader="Events"
                empty="Nothing recorded yet."
              />
            </section>

            <section className={CARD}>
              <SectionHead
                title="Plan mix"
                blurb="The accounts active in this window, by the plan they are on — who the audience actually is, not who signed up."
              />
              <CompositionPanel
                rows={planMix}
                total="Active accounts"
                unit="accounts"
                heading="Plan"
                countHeader="Accounts"
                peopleNoun="accounts"
                empty="No signed-in account has been active in this window yet."
              />
            </section>
          </div>

          <section className={CARD}>
            <SectionHead title="When they are here" blurb="Everything recorded, by hour of the IST day. Hover a bar for its figure." />
            <HourlyShape hours={report.hours} />
          </section>

          <section className={CARD}>
            <SectionHead
              title="AI features by use"
              blurb="Counted on the server, so it cannot be moved from a browser. Repeat opens by one person inside ten minutes count once. 'Blocked' is demand the paywall held back."
            />
            <FeatureRanking features={report.features} />
          </section>

          <section className={CARD}>
            <SectionHead
              title="Who is using it"
              blurb="Signed-in accounts active in this window, most recent first — with the contact details a support request needs."
            />
            <EngagementTable users={report.users} />
          </section>

          <section className={CARD}>
            <SectionHead
              title="Recent activity"
              blurb={`The latest events, newest first, from the ${report.backend === "supabase" ? "Supabase" : "local JSON"} store. Each AI touch is pilled in its plan's colour — sky for Starter, emerald for Pro, violet for Elite — and amber where the paywall refused it.`}
            />
            <ActivityFeed rows={report.recent} />
          </section>
        </div>
      )}
    </div>
  );
}
