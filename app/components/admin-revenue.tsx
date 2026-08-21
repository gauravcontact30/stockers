"use client";

// What the app has been paid — the ledger that was being written and never read.
//
// Lifted out of `./super-admin-dashboard`, where it was a four-tile strip inside an already long
// file, for the reason every other `admin-*` panel here lives on its own: the overview composes
// panels, it does not implement them.
//
// The figures come from `../lib/payments-format`, which is pure and computes them once on the
// server's shape of the data. Nothing in here does arithmetic on money beyond dividing paise by a
// hundred to print it — a percentage of a total, at most. Read that file before adding a figure;
// a number derived twice in two places is a number that will disagree with itself.

import {
  compactPaise,
  formatPaise,
  EXPIRY_WINDOW_DAYS,
  TREND_DAYS,
  TREND_MONTHS,
  type LedgerState,
  type PayingAccount,
  type RevenueSlice,
  type RevenueSummary,
} from "../lib/payments-format";
import { TIER_CHROME } from "./plan-pill";
import { DataTable } from "./data-table";
import { PieChart } from "./pie-chart";
import { RevenueTrend } from "./revenue-trend";
import { StatTile, deltaOf } from "./stat-tile";

const CARD = "rounded-2xl border border-slate-200 p-4 dark:border-slate-800";
const EYEBROW = "text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";

/** IST, spelled out, for a date the ledger stored as a calendar day. */
function formatDay(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The plan name as its tier badge, when the ledger's name is one we still sell.
 *
 * The `plan` column is deliberately free text — a plan renamed in the price list must not
 * invalidate what was already charged — so a name that no longer matches a tier is printed as
 * itself rather than forced into the nearest badge.
 */
function PlanBadge({ plan }: { plan: string }) {
  const tier = plan.trim().toLowerCase();
  const chrome = tier === "starter" || tier === "pro" || tier === "elite" ? TIER_CHROME[tier].pill : null;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
        chrome ?? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {plan}
    </span>
  );
}

/** One figure in the headline band: bigger than a caption, quieter than the hero beside it. */
function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div>
      <dt className={EYEBROW}>{label}</dt>
      <dd className="mt-1">
        <p className={`text-xl font-bold leading-tight ${tone ?? "text-slate-900 dark:text-white"}`}>{value}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{note}</p>
      </dd>
    </div>
  );
}

/**
 * A ranked list as bars.
 *
 * Bars rather than a donut because the job here is ranking rather than part-to-whole, and the eye
 * ranks lengths from a shared baseline far better than it ranks arcs. One hue for every row: these
 * are the same kind of thing in a different quantity, and colouring by rank would spend the only
 * free channel restating the bar length.
 */
function RankedBars({
  rows,
  empty,
}: {
  rows: { key: string; label: React.ReactNode; paise: number; note: string }[];
  empty: string;
}) {
  const top = rows.reduce((running, row) => Math.max(running, row.paise), 0);

  if (rows.length === 0 || top <= 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{empty}</p>;
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{row.label}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900 dark:text-white">{formatPaise(row.paise)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-grid)" }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.max((row.paise / top) * 100, 2)}%`, background: "var(--viz-1)" }} />
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{row.note}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * The headline band: recurring revenue, and the three figures that qualify it.
 *
 * MRR leads because it is the only number here that describes the business rather than the record —
 * "all time" only ever goes up, and a month-to-date figure on the 2nd says nothing. It is an
 * estimate off the ledger and labelled as one; the caveats sit under it rather than in a tooltip,
 * because a revenue figure with an unstated assumption is worse than no figure.
 */
function Headline({ summary, today }: { summary: RevenueSummary; today: string }) {
  const month = deltaOf(summary.monthPaise, summary.previousMonthToDatePaise, "the same point last month");
  const monthTone =
    month.direction === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : month.direction === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-white";

  return (
    <div className="grid gap-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/10 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Recurring revenue a month</p>
        {/* Proportional figures, not tabular: at this size equal-width digits read as loose. */}
        <p className="mt-1 text-4xl font-bold leading-none text-slate-900 dark:text-white sm:text-5xl">{formatPaise(summary.mrrPaise)}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-white">{formatPaise(summary.arrPaise)}</span> a year at this run rate, across{" "}
          {plural(summary.activeSubscriptions, "live subscription")}. A year paid up front counts as a twelfth of itself a month.
        </p>
        {summary.mrrUnrecognisedCycles > 0 && (
          <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {plural(summary.mrrUnrecognisedCycles, "live subscription")} bill on a cycle this figure cannot spread over a month, and are not in it.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-3">
        <Figure
          label="Booked today"
          value={formatPaise(summary.todayPaise)}
          note={`${plural(summary.todayCount, "payment")} · ${formatPaise(summary.yesterdayPaise)} yesterday`}
        />
        <Figure label="Month to date" value={formatPaise(summary.monthPaise)} note={month.text} tone={monthTone} />
        <Figure
          label="Up for renewal"
          value={formatPaise(summary.renewalDuePaise)}
          note={
            summary.expiringSoon > 0
              ? `${plural(summary.expiringSoon, "subscription")} lapse within ${EXPIRY_WINDOW_DAYS} days`
              : `Nothing lapses within ${EXPIRY_WINDOW_DAYS} days`
          }
          tone={summary.expiringSoon > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
        />
        <div className="col-span-2 sm:col-span-3">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Every figure is IST and current to {formatDay(today)}. Last month closed at {formatPaise(summary.previousMonthPaise)}
            {summary.bestDay ? `; the best single day on record is ${formatDay(summary.bestDay.key)} at ${formatPaise(summary.bestDay.paise)}` : ""}.
          </p>
        </div>
      </dl>
    </div>
  );
}

/** The plan and cycle splits, side by side. Part-to-whole, so donuts — and only two of them. */
function Splits({ summary }: { summary: RevenueSummary }) {
  const asSlices = (slices: RevenueSlice[]) =>
    slices.map((slice) => ({
      key: slice.key,
      label: slice.label,
      // Rupees rather than paise: the centre readout and the legend are money, and a legend
      // reading "4900000" for ₹49,000 is a number nobody can parse at a glance.
      value: Math.round(slice.paise / 100),
      meta: `${plural(slice.count, "payment")} · ${compactPaise(slice.paise)}`,
    }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={CARD}>
        <p className={`mb-3 ${EYEBROW}`}>Revenue by plan</p>
        <PieChart slices={asSlices(summary.byPlan)} total="Rupees billed" unit="rupees" empty="No payment has been recorded yet." />
      </div>
      <div className={CARD}>
        <p className={`mb-3 ${EYEBROW}`}>Revenue by billing cycle</p>
        <PieChart slices={asSlices(summary.byCycle)} total="Rupees billed" unit="rupees" empty="No payment has been recorded yet." />
      </div>
    </div>
  );
}

/** Who pays the most, and what the discount codes actually moved. */
function Concentration({ summary }: { summary: RevenueSummary }) {
  const topShare = summary.allTimePaise > 0 ? Math.round((summary.topAccounts.reduce((sum, account) => sum + account.paise, 0) / summary.allTimePaise) * 100) : 0;
  const codeShare = summary.allTimePaise > 0 ? Math.round((summary.discountedPaise / summary.allTimePaise) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={CARD}>
        <p className={EYEBROW}>Largest paying accounts</p>
        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {summary.topAccounts.length > 0
            ? `These ${summary.topAccounts.length} are ${topShare}% of everything billed. Concentration is a risk, not a win.`
            : "Nobody has paid yet."}
        </p>
        <RankedBars
          rows={summary.topAccounts.map((account: PayingAccount) => ({
            key: account.userId,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <PlanBadge plan={account.plan} />
                {/* The ledger holds an id, not an address — the roster is where a name lives. */}
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{account.userId.slice(0, 12)}</span>
              </span>
            ),
            paise: account.paise,
            note: `${plural(account.count, "payment")} · ${account.cycle} · ${
              account.subscribedUntil ? `paid to ${formatDay(account.subscribedUntil)}` : "no paid-through date"
            }`,
          }))}
          empty="No account has paid yet."
        />
      </div>

      <div className={CARD}>
        <p className={EYEBROW}>Promo and referral codes</p>
        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {summary.discounted > 0
            ? `${summary.discounted} of ${summary.paymentCount} payments carried a code, worth ${formatPaise(summary.discountedPaise)} — ${codeShare}% of revenue.`
            : "No payment has carried a promo or referral code."}
        </p>
        <RankedBars
          rows={summary.byCode.slice(0, 6).map((slice) => ({
            key: slice.key,
            label: <span className="font-mono uppercase">{slice.label}</span>,
            paise: slice.paise,
            note: `${plural(slice.count, "payment")} · ${
              summary.discountedPaise > 0 ? Math.round((slice.paise / summary.discountedPaise) * 100) : 0
            }% of code-driven revenue`,
          }))}
          empty="No code has been used yet."
        />
      </div>
    </div>
  );
}

export function AdminRevenue({ ledger }: { ledger: LedgerState | null }) {
  if (!ledger) return <p className="text-sm text-slate-500 dark:text-slate-400">Reading the ledger…</p>;

  if (!ledger.available) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        {ledger.message}
      </p>
    );
  }

  const { summary, today } = ledger;

  return (
    <div className="flex flex-col gap-5">
      <Headline summary={summary} today={today} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label={`Last ${TREND_DAYS} days`}
          value={compactPaise(summary.last30Paise)}
          delta={{ now: summary.last30Paise, before: summary.previous30Paise, period: `the ${TREND_DAYS} before` }}
          tone="border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10"
        />
        <StatTile
          label="Payments booked"
          value={summary.last30Count}
          hint={`${summary.paymentCount} all time`}
          tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        />
        <StatTile
          label="All time"
          value={compactPaise(summary.allTimePaise)}
          hint={plural(summary.paymentCount, "payment")}
          tone="border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10"
        />
        <StatTile
          label="Average payment"
          value={formatPaise(summary.averagePaise)}
          hint="Across the whole ledger"
          tone="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        />
        <StatTile
          label="Value per account"
          value={formatPaise(summary.perAccountPaise)}
          hint={plural(summary.payingAccounts, "paying account")}
          tone="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10"
        />
        <StatTile
          label="Renewed at least once"
          value={summary.repeatAccounts}
          hint={
            summary.payingAccounts > 0
              ? `${Math.round((summary.repeatAccounts / summary.payingAccounts) * 100)}% of payers came back`
              : "Nobody has paid yet"
          }
          tone="border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10"
        />
      </div>

      <div className={CARD}>
        <RevenueTrend
          ranges={[
            { id: "daily", label: "Daily", window: `the last ${TREND_DAYS} days`, points: summary.daily },
            { id: "monthly", label: "Monthly", window: `the last ${TREND_MONTHS} months`, points: summary.monthly },
          ]}
          empty="No payment has been recorded in this window."
        />
      </div>

      <Splits summary={summary} />
      <Concentration summary={summary} />

      {summary.recent.length > 0 && (
        <DataTable
          rows={summary.recent}
          columns={[
            {
              key: "paidAt",
              header: "Paid",
              cell: (row) =>
                new Date(row.paidAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }),
              sortValue: (row) => row.paidAt,
              className: "whitespace-nowrap",
            },
            { key: "plan", header: "Plan", cell: (row) => <PlanBadge plan={row.plan} />, sortValue: (row) => row.plan },
            { key: "cycle", header: "Cycle", cell: (row) => row.cycle, sortValue: (row) => row.cycle },
            {
              key: "account",
              header: "Account",
              cell: (row) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{row.userId.slice(0, 12)}</span>,
              sortValue: (row) => row.userId,
              className: "whitespace-nowrap",
            },
            {
              key: "amount",
              header: "Amount",
              align: "right",
              cell: (row) => formatPaise(row.amountPaise),
              sortValue: (row) => row.amountPaise,
              className: "tabular-nums font-semibold text-slate-900 dark:text-white",
            },
            { key: "code", header: "Code", cell: (row) => row.promoCode ?? row.referralCode ?? "—" },
            { key: "until", header: "Paid up to", cell: (row) => row.subscribedUntil ?? "—", sortValue: (row) => row.subscribedUntil, className: "whitespace-nowrap" },
          ]}
          rowKey={(row) => row.paymentId}
          caption="The most recent payments"
          searchFields={(row) => [row.plan, row.cycle, row.promoCode, row.referralCode, row.paymentId, row.userId]}
          searchPlaceholder="Search plan, cycle, code or account"
          pageSize={5}
          minWidth={760}
          empty="No payment matches these filters."
        />
      )}
    </div>
  );
}
