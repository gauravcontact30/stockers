import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { listAiCalls } from "../../../lib/ai-telemetry";
import { buildAiUsageReport } from "../../../lib/ai-usage-report";
import { dayBefore, daysBetween, istDay } from "../../../lib/analytics";
import { aiConfigured, aiModel } from "../../../lib/openrouter";
import { userFromRequest } from "../../../lib/store";

/** The windows the dashboard offers. Anything else is snapped into range. */
export const RANGE_OPTIONS = [1, 7, 30] as const;

const DEFAULT_DAYS = 1;

/**
 * How far back this will look, whatever is asked for.
 *
 * Shorter than the analytics window on purpose: model calls are recorded per call rather than
 * throttled per visitor, so a busy month is a great many more rows than a month of traffic, and
 * this is a panel that re-reads on a timer.
 */
export const MAX_DAYS = 30;

/** Reads the requested window, refusing to be talked into an unbounded one. */
export function rangeFrom(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), MAX_DAYS);
}

/**
 * What the model has been doing: spend, latency, and how often a reader got the composed read
 * instead of the written one.
 *
 * Admin-only, and checked here on the server rather than only in the UI that links to it. Nothing
 * in the report is a secret — no prompts, no completions, no key — but it is a detailed map of what
 * this deployment runs, what it costs and where it is failing, which is not something to hand to
 * anyone who knows the URL.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user || !(user.role === "admin" || isSuperAdminEmail(user.email))) {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  const days = rangeFrom(new URL(request.url).searchParams.get("days"));
  const today = istDay();
  const fromDay = dayBefore(today, days - 1);

  // `listAiCalls` does not throw: a store it cannot read comes back as this process's own records,
  // clearly labelled, which is a real answer rather than a consolation. So there is no catch here —
  // there is no failure for it to handle.
  const { calls, backend, processLocal, held } = await listAiCalls(fromDay);

  return NextResponse.json(
    {
      ...buildAiUsageReport({
        calls,
        fromDay,
        today,
        days,
        window: daysBetween(fromDay, today),
        backend,
        processLocal,
        held,
      }),
      // What the deployment is configured to do, beside what it actually did. Without this an empty
      // report is ambiguous: no key and no traffic look identical from a list of zero calls.
      configured: aiConfigured(),
      model: aiConfigured() ? aiModel() : null,
    },
    // One admin's view of what the whole deployment is spending. Never stored, and never by a
    // shared cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
