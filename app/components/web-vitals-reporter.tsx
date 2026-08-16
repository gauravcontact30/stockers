"use client";

import { useReportWebVitals } from "next/web-vitals";

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

const ENDPOINT = "/api/analytics/web-vitals";
const METRIC_NAMES = new Set(["TTFB", "FCP", "LCP", "FID", "CLS", "INP"]);

const reportWebVitals: ReportWebVitalsCallback = (metric) => {
  if (!METRIC_NAMES.has(metric.name)) return;

  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType,
    path: window.location.pathname,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(ENDPOINT, blob)) return;
  }

  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
};

export function WebVitalsReporter() {
  useReportWebVitals(reportWebVitals);
  return null;
}
