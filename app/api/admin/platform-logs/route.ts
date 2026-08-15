import { NextResponse } from "next/server";
import { isSuperAdminEmail } from "../../../lib/admin-access";
import { dayBefore, istDay, listEvents } from "../../../lib/analytics";
import { listAiCalls } from "../../../lib/ai-telemetry";
import { buildPlatformLogReport } from "../../../lib/platform-log-report";
import { listPlatformLogs, PLATFORM_LOG_RETENTION_DAYS } from "../../../lib/platform-logs";
import { listUsers, userFromRequest } from "../../../lib/store";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;
export const MAX_DAYS = PLATFORM_LOG_RETENTION_DAYS;

export function rangeFrom(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), MAX_DAYS);
}

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user || !(user.role === "admin" || isSuperAdminEmail(user.email))) {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  const days = rangeFrom(new URL(request.url).searchParams.get("days"));
  const today = istDay();
  const fromDay = dayBefore(today, days - 1);

  try {
    const [platform, analyticsEvents, ai, users] = await Promise.all([
      listPlatformLogs(fromDay),
      listEvents(fromDay),
      listAiCalls(fromDay),
      listUsers(),
    ]);

    return NextResponse.json(
      buildPlatformLogReport({
        platformLogs: platform.logs,
        analyticsEvents,
        aiCalls: ai.calls,
        users,
        today,
        fromDay,
        days,
        backend: platform.backend,
        processLocal: platform.processLocal,
        held: platform.held,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("platform logs report failed", error);
    return NextResponse.json({ error: "Couldn't read platform logs." }, { status: 500 });
  }
}
