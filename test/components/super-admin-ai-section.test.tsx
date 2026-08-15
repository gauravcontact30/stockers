// The AI Operations wiring inside the super admin shell: the sidebar entry that reaches it and the
// section that renders it.
//
// Scoped to that wiring rather than to the panel itself, which has its own suite. These are the
// joins that break silently — a section can disappear from the nav without a single unit test
// noticing, and this one is the only place the deployment's model dependency is visible at all.

import { render, screen, waitFor } from "@testing-library/react";
import { SUPER_ADMIN_SECTIONS, SuperAdminDashboard } from "../../app/components/super-admin-dashboard";

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/ai",
  useRouter: () => ({ push: jest.fn() }),
}));

const REPORT = {
  days: 7,
  today: "2026-08-15",
  counts: { ok: 18, unusable: 1, failed: 1, unconfigured: 0, total: 20 },
  fallbackRate: 10,
  latency: { p50: 850, p95: 2_100, max: 2_600 },
  promptTokens: 9_000,
  completionTokens: 2_500,
  costUsd: 0.031,
  costedCalls: 19,
  features: [],
  models: [],
  daily: [{ day: "2026-08-15", counts: { ok: 18, unusable: 1, failed: 1, unconfigured: 0, total: 20 }, costUsd: 0.031, p50: 850 }],
  recentFailures: [],
  backend: "supabase",
  processLocal: false,
  held: 20,
  configured: true,
  model: "openai/gpt-4.1-mini",
};

function serve() {
  global.fetch = jest.fn(async (url: string) =>
    String(url).includes("/api/admin/ai-usage")
      ? (({ ok: true, json: async () => REPORT }) as unknown as Response)
      : (({ ok: true, json: async () => ({}) }) as unknown as Response),
  ) as unknown as typeof fetch;
}

describe("AI Operations in the super admin shell", () => {
  it("is offered in the navigation, pointing at its own page", () => {
    const section = SUPER_ADMIN_SECTIONS.find((entry) => entry.id === "ai");

    expect(section).toMatchObject({ label: "AI Operations", href: "/admin/ai" });
  });

  it("describes itself by what an operator would come looking for", () => {
    const section = SUPER_ADMIN_SECTIONS.find((entry) => entry.id === "ai");

    expect(section?.description).toContain("composed read");
  });

  it("renders the panel on its own section", async () => {
    serve();

    render(<SuperAdminDashboard active="ai" />);

    expect(screen.getAllByText("AI Operations").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("The model is answering, with 10% falling back")).toBeInTheDocument());
  });

  it("reaches it from the quick actions on the overview", async () => {
    serve();

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Quick actions")).toBeInTheDocument());

    // The sidebar, the compact tab strip and the quick-action card all offer it; every one of them
    // has to point at the same page.
    const links = screen.getAllByRole("link", { name: /AI Operations/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/admin/ai");
  });
});
