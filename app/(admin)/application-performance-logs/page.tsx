import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSuperAdminPage } from "../../lib/super-admin-page-auth";

export const metadata: Metadata = {
  title: "Platform Logs | Super Admin | Stockers",
  description: "This legacy Super Admin logs path redirects to Platform Logs.",
  robots: { index: false, follow: false },
};

export default async function ApplicationPerformanceLogsPage() {
  await requireSuperAdminPage();
  redirect("/platform-logs");
}
