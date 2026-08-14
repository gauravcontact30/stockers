import type { Metadata } from "next";
import { DashboardClient } from "../components/dashboard-client";
import { pageMetadata } from "../lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "AI research dashboard",
  description: "The signed-in StockersAI workspace for Indian equity research, market screens, stock comparisons and AI analysis.",
  path: "/dashboard",
  indexable: false,
});

export default function DashboardPage() {
  return <DashboardClient />;
}
