// The two live surfaces on the super admin overview: the count of people on the site, and the
// system health card.
//
// Both exist because a figure that is only true at page load is worse than no figure — an admin
// reading "everything is answering" cannot tell a healthy deployment from a frozen tab. So what is
// tested here is that each one re-measures on a timer, says how old what it is showing is, and
// reports what it could not read rather than rendering a comfortable default.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { SuperAdminDashboard } from "../../app/components/super-admin-dashboard";

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ push: jest.fn() }),
}));

const ROSTER = { users: [], summary: { total: 4, verified: 3, subscribed: 2, admins: 1, pro: 1, elite: 1 }, today: "2026-08-14" };

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

const TRAFFIC = { today: COUNTS, yesterday: COUNTS, totals: COUNTS, trending: null, features: [] };

function healthReport(overrides: Record<string, unknown> = {}) {
  return {
    backend: "supabase",
    worst: "ok",
    projectUrl: "https://project.supabase.co",
    checkedAt: "2026-08-14T10:00:00.000Z",
    checks: [
      {
        key: "store",
        label: "Account store",
        state: "ok",
        detail: "Supabase is reachable and the `users` table answers.",
        consequence: "Sign-up, sign-in and the admin roster all read from Postgres.",
        latencyMs: 142,
      },
      {
        key: "mail",
        label: "Email",
        state: "degraded",
        detail: "RESEND_API_KEY is not set.",
        consequence: "Verification links are not sent.",
        latencyMs: null,
      },
    ],
    stats: {
      uptimeSeconds: 5_400,
      memoryMb: 212,
      heapUsedMb: 96,
      heapTotalMb: 140,
      nodeVersion: "v22.19.0",
      environment: "production",
      probeMs: 310,
      slowestMs: 142,
      counts: { ok: 1, degraded: 1, off: 0, total: 2 },
    },
    ...overrides,
  };
}

function presenceReport(online = 3, signedIn = 2) {
  return {
    available: true,
    at: "2026-08-14T10:00:00.000Z",
    windowSeconds: 150,
    retentionMinutes: 60,
    summary: { online, signedIn, guests: online - signedIn, tabs: online + 1, recent: online + 2 },
    pages: [],
    devices: [],
    rows: [],
  };
}

/** Answers each of the overview's reads by the URL it was asked for. */
function serveOverview({
  health = healthReport() as unknown,
  presence = presenceReport() as unknown,
  healthOk = true,
  presenceOk = true,
} = {}) {
  const mock = jest.fn(async (url: string) => {
    const target = String(url);
    if (target.includes("/api/admin/health")) return { ok: healthOk, json: async () => health } as unknown as Response;
    if (target.includes("/api/admin/presence")) return { ok: presenceOk, json: async () => presence } as unknown as Response;
    if (target.includes("/api/admin/analytics")) return { ok: true, json: async () => TRAFFIC } as unknown as Response;
    if (target.includes("/api/admin/revenue")) {
      return { ok: true, json: async () => ({ available: false, reason: "no-backend", message: "No ledger here." }) } as unknown as Response;
    }
    return { ok: true, json: async () => ROSTER } as unknown as Response;
  });

  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  setVisibility("visible");
});

describe("People on the site, on the overview", () => {
  it("puts the live count at the head of the totals", async () => {
    serveOverview();

    render(<SuperAdminDashboard active="overview" />);

    // Waited on the hint rather than the label: the tile paints its label before the read lands.
    await waitFor(() => expect(screen.getByText("2 signed in · 1 visitors")).toBeInTheDocument());
    const tile = screen.getByText("On the site now").closest("div") as HTMLElement;
    expect(within(tile).getByText("3")).toBeInTheDocument();
  });

  it("keeps waiting rather than reporting an empty site when the store cannot be read", async () => {
    serveOverview({ presenceOk: false });

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Accounts")).toBeInTheDocument());
    const tile = screen.getByText("On the site now").closest("div") as HTMLElement;
    // "..." and not "0" — nobody on the site and no answer from the store are different statements.
    expect(within(tile).getByText("...")).toBeInTheDocument();
  });

  it("says nothing about presence when the table has not been created", async () => {
    serveOverview({ presence: { available: false, message: "The `live_sessions` table is missing." } });

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Accounts")).toBeInTheDocument());
    const tile = screen.getByText("On the site now").closest("div") as HTMLElement;
    expect(within(tile).getByText("...")).toBeInTheDocument();
  });
});

describe("System health, live, on the overview", () => {
  it("reports the measured figures beside the states", async () => {
    serveOverview();

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Checks passing")).toBeInTheDocument());
    expect(screen.getByText("1/2")).toBeInTheDocument();
    // Twice over: once as the slowest probe on the strip, once on the check it came from.
    expect(screen.getAllByText("142ms")).toHaveLength(2);
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("212 MB")).toBeInTheDocument();
    expect(screen.getByText("Node v22.19.0 · production")).toBeInTheDocument();
  });

  it("puts each probe's latency on the check it belongs to", async () => {
    serveOverview();

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Account store")).toBeInTheDocument());
    // The store was probed and answered in 142ms; email is a configuration flag with nothing to
    // probe, so it carries no number rather than a zero.
    const store = screen.getByText("Account store").closest("p") as HTMLElement;
    expect(within(store).getByText("142ms")).toBeInTheDocument();
    const mail = screen.getByText("Email").closest("p") as HTMLElement;
    expect(within(mail).queryByText(/ms$/)).not.toBeInTheDocument();
  });

  it("says how long ago it last probed, and counts up between probes", async () => {
    jest.useFakeTimers();
    serveOverview();

    render(<SuperAdminDashboard active="overview" />);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    expect(screen.getByText(/re-probed just now/)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });

    // The card refreshes itself, so it has to say how old what it is showing is — otherwise a
    // frozen page and a healthy one look exactly alike.
    expect(screen.getByText(/re-probed 8s ago/)).toBeInTheDocument();

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("re-probes on its own timer, and stops while nobody is looking", async () => {
    jest.useFakeTimers();
    const fetchMock = serveOverview();

    render(<SuperAdminDashboard active="overview" />);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    const probes = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/admin/health")).length;
    expect(probes()).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(probes()).toBe(2);

    setVisibility("hidden");
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    // Four windows' worth of a backgrounded dashboard, and not one query.
    expect(probes()).toBe(2);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("leaves the card waiting rather than half-drawn when the probe cannot be read", async () => {
    serveOverview({ healthOk: false });

    render(<SuperAdminDashboard active="overview" />);

    await waitFor(() => expect(screen.getByText("Checking integrations…")).toBeInTheDocument());
  });

  it("still draws the states when a report arrives without the measured half", async () => {
    const { stats, ...withoutStats } = healthReport();
    void stats;
    serveOverview({ health: withoutStats });

    render(<SuperAdminDashboard active="overview" />);

    // A panel whose job is reporting that something is wrong must not be the thing that breaks
    // when something is: no stats block, one strip fewer, everything else still there.
    await waitFor(() => expect(screen.getByText("Account store")).toBeInTheDocument());
    expect(screen.queryByText("Checks passing")).not.toBeInTheDocument();
  });
});
