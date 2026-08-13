// The analytics wiring inside the super admin shell: the sidebar entry that reaches it, the
// section that renders it, and the traffic strip on the overview.
//
// Scoped to that wiring rather than to the whole dashboard, because these are the joins that break
// silently — a section can disappear from the nav, or the overview can stop asking for traffic,
// without a single unit test noticing.

import { render, screen, waitFor } from "@testing-library/react";
import { SUPER_ADMIN_SECTIONS, SuperAdminDashboard } from "../../app/components/super-admin-dashboard";

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: jest.fn() }),
}));

const ROSTER = { users: [], summary: { total: 4, verified: 3, subscribed: 2, admins: 1, pro: 1, elite: 1 }, today: "2026-08-12" };

const COUNTS = {
  visitors: 8,
  views: 19,
  signins: 3,
  signups: 1,
  featureOpens: 11,
  blockedAttempts: 0,
  activeUsers: 4,
  guests: 4,
  actions: 26,
  sessions: 6,
};

const TRAFFIC = {
  today: COUNTS,
  totals: COUNTS,
  yesterday: COUNTS,
  trending: { key: "intel", label: "AI intelligence search", tier: "elite", opens: 11, users: 4, blocked: 0, share: 1, lastAt: "2026-08-12T10:00:00.000Z" },
  range: { from: "2026-08-12", to: "2026-08-12", days: 1 },
  funnel: { visitors: 8, signups: 1, activeUsers: 4, aiUsers: 3, payers: 1, signupRate: 0.125, payRate: 1 },
  daily: [],
  features: [],
  actions: [],
  pages: [],
  stocks: [],
  sources: [],
  devices: [],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  users: [],
  recent: [],
  backend: "file",
};

/** Answers each of the two calls the overview makes by the URL it was asked for. */
function serveDashboard({ traffic = TRAFFIC as unknown, trafficOk = true } = {}) {
  global.fetch = jest.fn(async (url: string) =>
    String(url).includes("/api/admin/analytics")
      ? ({ ok: trafficOk, json: async () => traffic }) as unknown as Response
      : ({ ok: true, json: async () => ROSTER }) as unknown as Response,
  ) as unknown as typeof fetch;
}

describe("Traffic & Usage in the super admin shell", () => {
  it("is offered in the navigation, pointing at its own page", () => {
    const section = SUPER_ADMIN_SECTIONS.find((entry) => entry.id === "analytics");

    expect(section).toMatchObject({ label: "Traffic & Usage", href: "/admin/analytics" });
  });

  it("renders the analytics panel on its own section", async () => {
    serveDashboard();

    render(<SuperAdminDashboard active="analytics" />);

    expect(screen.getAllByText("Traffic & Usage").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("From arriving to paying")).toBeInTheDocument());
  });

  it("puts today's figures on the overview, with a link to the full report", async () => {
    serveDashboard();

    render(<SuperAdminDashboard active="overview" />);

    // Waited on the figure rather than the heading: the heading is there before the request lands.
    await waitFor(() => expect(screen.getByText("8")).toBeInTheDocument());
    expect(screen.getByText("Today's traffic")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full report" })).toHaveAttribute("href", "/admin/analytics");
    expect(screen.getByText("AI intelligence search")).toBeInTheDocument();
  });

  it("leaves the strip waiting rather than shouting when traffic cannot be read", async () => {
    serveDashboard({ trafficOk: false });

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Today's traffic")).toBeInTheDocument());
    // The roster above it is the page's real content; a failed summary strip says "None yet"
    // rather than raising an error banner over the top of it.
    expect(screen.getByText("None yet")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load admin totals.")).not.toBeInTheDocument();
  });

  it("says so when today has no trending feature yet", async () => {
    serveDashboard({ traffic: { ...TRAFFIC, trending: null } });

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("None yet")).toBeInTheDocument());
  });
});
