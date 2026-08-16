import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHackersMonitor } from "../../components/admin-hackers-monitor";
import { SuperAdminDashboard } from "../../components/super-admin-dashboard";
import { getSecurityThreatReport } from "../../lib/security-threats";
import { requireSuperAdminPage } from "../../lib/super-admin-page-auth";

export const metadata: Metadata = {
  title: "Super Admin - App Hackers | StockersAI",
  robots: { index: false, follow: false },
};

function LoadingThreatMonitor() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      Loading hacker activity...
    </div>
  );
}

async function ThreatMonitor() {
  const report = await getSecurityThreatReport();
  return <AdminHackersMonitor initialReport={report} />;
}

export default async function AppHackersPage() {
  await requireSuperAdminPage();

  return (
    <SuperAdminDashboard active="hackers">
      <Suspense fallback={<LoadingThreatMonitor />}>
        <ThreatMonitor />
      </Suspense>
    </SuperAdminDashboard>
  );
}
