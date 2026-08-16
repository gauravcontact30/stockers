import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "../../../lib/request-security";
import { recordPlatformLog, type PlatformLogSeverity } from "../../../lib/platform-logs";
import { userFromRequest } from "../../../lib/store";

const WEB_VITAL_DURATION_METRICS = new Set(["TTFB", "FCP", "LCP", "FID", "INP"]);

const webVitalsSchema = z.object({
  id: z.string().trim().min(4).max(128),
  name: z.enum(["TTFB", "FCP", "LCP", "FID", "CLS", "INP"]),
  value: z.number().finite().nonnegative().max(300_000),
  delta: z.number().finite().min(-300_000).max(300_000),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigationType: z.string().trim().min(1).max(40).optional(),
  path: z.string().trim().min(1).max(160).optional(),
});

function severityForRating(rating: "good" | "needs-improvement" | "poor"): PlatformLogSeverity {
  if (rating === "poor") return "error";
  if (rating === "needs-improvement") return "warning";
  return "star";
}

function durationForMetric(name: string, value: number): number | null {
  return WEB_VITAL_DURATION_METRICS.has(name) ? value : null;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin Web Vitals collection is not allowed." }, { status: 403 });
  }

  let parsed: z.infer<typeof webVitalsSchema>;
  try {
    parsed = webVitalsSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  const user = await userFromRequest(request).catch(() => null);
  const value = Math.round(parsed.value * 100) / 100;
  const delta = Math.round(parsed.delta * 100) / 100;

  recordPlatformLog({
    category: "system",
    severity: severityForRating(parsed.rating),
    source: "Browser Web Vitals",
    useCase: "System Performance: Core Web Vitals",
    operation: `web-vitals.${parsed.name.toLowerCase()}`,
    message: `${parsed.name} reported as ${parsed.rating}.`,
    durationMs: durationForMetric(parsed.name, value),
    userId: user?.id ?? null,
    path: parsed.path ?? new URL(request.url).pathname,
    method: "WEB_VITAL",
    metadata: {
      metricId: parsed.id,
      metricName: parsed.name,
      value,
      delta,
      rating: parsed.rating,
      navigationType: parsed.navigationType ?? "unknown",
    },
  });

  return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
