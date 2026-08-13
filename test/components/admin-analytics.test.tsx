import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ActivityFeed,
  AdminAnalytics,
  DailyTraffic,
  EngagementTable,
  FeatureRanking,
  FunnelStrip,
  HourlyShape,
  RankedTable,
  activityDetail,
  activityLabel,
  deltaOf,
  formatDayShort,
  formatHour,
  formatMoment,
  formatNumber,
  formatPercent,
  matchesUser,
} from "../../app/components/admin-analytics";
import type {
  ActivityRow,
  AnalyticsReport,
  AnalyticsTotals,
  AnalyticsUserRow,
  DailyPoint,
  FeatureUsage,
  RankedRow,
} from "../../app/lib/analytics-report";

function day(index: number): DailyPoint {
  return {
    day: `2026-08-${String(index).padStart(2, "0")}`,
    visitors: index,
    views: index * 2,
    signins: 1,
    signups: 0,
    featureOpens: index,
    actions: index * 3,
  };
}

function totals(overrides: Partial<AnalyticsTotals> = {}): AnalyticsTotals {
  return {
    visitors: 8,
    views: 19,
    signins: 3,
    signups: 1,
    featureOpens: 11,
    blockedAttempts: 2,
    activeUsers: 4,
    guests: 4,
    actions: 26,
    sessions: 6,
    ...overrides,
  };
}

const FEATURES: FeatureUsage[] = [
  { key: "intel", label: "AI intelligence search", tier: "elite", opens: 30, users: 8, blocked: 4, share: 0.75, lastAt: "2026-08-12T10:00:00.000Z" },
  { key: "research", label: "AI stock research", tier: "pro", opens: 10, users: 3, blocked: 0, share: 0.25, lastAt: "2026-08-12T09:00:00.000Z" },
];

const RANKED: RankedRow[] = [
  { key: "stock.open", label: "Opened a stock's detail sheet", count: 30, users: 8, share: 0.75 },
  { key: "nav.section", label: "Opened a dashboard section", count: 10, users: 4, share: 0.25 },
];

const USERS: AnalyticsUserRow[] = [
  {
    id: "user_1",
    name: "Asha Rao",
    email: "asha@example.com",
    mobile: "9876543210",
    plan: "Pro",
    role: "user",
    emailVerified: true,
    subscribedUntil: "2026-09-01",
    createdAt: "2026-07-01T00:00:00.000Z",
    visits: 12,
    featureOpens: 30,
    signins: 4,
    actions: 44,
    lastSeen: "2026-08-12T10:00:00.000Z",
    topFeature: "AI intelligence search",
    topAction: "Opened a stock's detail sheet",
    device: "mobile",
  },
  {
    id: "user_2",
    name: "Bala Iyer",
    email: "bala@example.com",
    // The columns that are legitimately absent on a real account.
    mobile: null,
    plan: "Starter",
    role: "user",
    emailVerified: false,
    subscribedUntil: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    visits: 2,
    featureOpens: 0,
    signins: 1,
    actions: 0,
    lastSeen: null,
    topFeature: null,
    topAction: null,
    device: null,
  },
];

const ACTIVITY: ActivityRow[] = [
  {
    id: "e1",
    at: "2026-08-12T10:00:00.000Z",
    type: "action",
    feature: null,
    action: "Opened a stock's detail sheet",
    label: "RELIANCE",
    path: "/dashboard",
    referrer: null,
    device: "desktop",
    blocked: false,
    name: "Asha Rao",
    email: "asha@example.com",
    mobile: "9876543210",
    plan: "Pro",
  },
  {
    id: "e2",
    at: "2026-08-12T09:00:00.000Z",
    type: "visit",
    feature: null,
    action: null,
    label: null,
    path: "/news",
    referrer: "news.example.com",
    device: null,
    blocked: false,
    name: "Visitor (not signed in)",
    email: null,
    mobile: null,
    plan: null,
  },
  {
    id: "e3",
    at: "2026-08-12T08:00:00.000Z",
    type: "feature",
    feature: "AI intelligence search",
    action: null,
    label: null,
    path: null,
    referrer: null,
    device: "tablet",
    blocked: true,
    name: "Bala Iyer",
    email: "bala@example.com",
    mobile: null,
    plan: "Starter",
  },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 10 ? 40 : 0 }));

function report(overrides: Partial<AnalyticsReport> = {}): AnalyticsReport {
  return {
    backend: "file",
    range: { from: "2026-08-06", to: "2026-08-12", days: 7 },
    totals: totals({ visitors: 40, views: 90, signins: 12, signups: 3, featureOpens: 40 }),
    today: totals(),
    yesterday: totals({ visitors: 4, views: 30, signins: 3, signups: 0, featureOpens: 11, actions: 13 }),
    daily: [day(6), day(7), day(8), day(9), day(10), day(11), day(12)],
    features: FEATURES,
    trending: FEATURES[0],
    funnel: { visitors: 40, signups: 3, activeUsers: 9, aiUsers: 6, payers: 2, signupRate: 0.075, payRate: 0.667 },
    actions: RANKED,
    pages: [{ key: "/dashboard", label: "/dashboard", count: 50, users: 9, share: 1 }],
    stocks: [{ key: "RELIANCE", label: "RELIANCE", count: 12, users: 5, share: 1 }],
    sources: [{ key: "direct", label: "Direct / bookmarked", count: 60, users: 30, share: 1 }],
    devices: [{ key: "mobile", label: "mobile", count: 70, users: 25, share: 1 }],
    hours: HOURS,
    users: USERS,
    recent: ACTIVITY,
    ...overrides,
  };
}

/** Answers the dashboard's fetch with one report, and hands back the mock. */
function serve(payload: unknown, ok = true): jest.Mock {
  const mock = jest.fn(async () => ({ ok, json: async () => payload }) as unknown as Response);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** Waits for the report to paint. */
async function painted() {
  await waitFor(() => expect(screen.getByText("From arriving to paying")).toBeInTheDocument());
}

/** The card a heading belongs to — several tables list the same people, so assertions get scoped. */
function sectionOf(heading: string): HTMLElement {
  return screen.getByText(heading).closest("section") as HTMLElement;
}

describe("formatting", () => {
  it("groups numbers the Indian way", () => {
    expect(formatNumber(1234567)).toBe("12,34,567");
  });

  it("shortens a day, and leaves an unparseable one alone", () => {
    expect(formatDayShort("2026-08-12")).toBe("12 Aug");
    expect(formatDayShort("not-a-day")).toBe("not-a-day");
  });

  it("renders an instant in IST, and a dash when there is none", () => {
    expect(formatMoment("2026-08-12T10:00:00.000Z")).toContain("12 Aug 2026");
    expect(formatMoment(null)).toBe("-");
    expect(formatMoment("nonsense")).toBe("-");
  });

  it("rounds a share to whole percent", () => {
    expect(formatPercent(0.756)).toBe("76%");
  });

  it("writes an hour the way a person says it", () => {
    expect(formatHour(0)).toBe("12 am");
    expect(formatHour(9)).toBe("9 am");
    expect(formatHour(12)).toBe("12 pm");
    expect(formatHour(21)).toBe("9 pm");
  });
});

describe("deltaOf", () => {
  it("reports a rise, a fall and a flat day", () => {
    expect(deltaOf(120, 100)).toEqual({ direction: "up", text: "+20% vs yesterday" });
    expect(deltaOf(80, 100)).toEqual({ direction: "down", text: "−20% vs yesterday" });
    expect(deltaOf(100, 100)).toEqual({ direction: "flat", text: "no change" });
  });

  it("says 'new' rather than dividing by a yesterday that was zero", () => {
    expect(deltaOf(9, 0)).toEqual({ direction: "up", text: "new" });
    expect(deltaOf(0, 0)).toEqual({ direction: "flat", text: "no change" });
  });
});

describe("FunnelStrip", () => {
  it("sizes each stage and names the rate between them", () => {
    render(<FunnelStrip funnel={report().funnel} />);

    expect(screen.getByText("Visitors")).toBeInTheDocument();
    expect(screen.getByText("8% of visitors")).toBeInTheDocument();
    expect(screen.getByText("67% of sign-ups")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });
});

describe("DailyTraffic", () => {
  it("labels every bar for a short window and charts the chosen measure", () => {
    render(<DailyTraffic daily={[day(10), day(11), day(12)]} metric="visitors" />);

    expect(screen.getAllByText("10 Aug")).not.toHaveLength(0);
    expect(screen.getByText("12 Aug: 12 visitors")).toBeInTheDocument();
  });

  it("charts a different measure when asked for one", () => {
    render(<DailyTraffic daily={[day(12)]} metric="actions" />);

    expect(screen.getByText("12 Aug: 36 interactions")).toBeInTheDocument();
  });

  it("labels only the ends of a long window, where per-bar labels would collide", () => {
    render(<DailyTraffic daily={Array.from({ length: 20 }, (_, index) => day(index + 1))} metric="visitors" />);

    expect(screen.getByText("1 Aug")).toBeInTheDocument();
    expect(screen.getByText("20 Aug")).toBeInTheDocument();
    expect(screen.queryByText("10 Aug")).not.toBeInTheDocument();
  });

  it("names the peak for a reader who cannot see the bars", () => {
    render(<DailyTraffic daily={[{ ...day(1), visitors: 0 }, day(9)]} metric="visitors" />);

    expect(screen.getByRole("img", { name: "Visitors per day, peaking at 9" })).toBeInTheDocument();
  });
});

describe("HourlyShape", () => {
  it("charts all twenty-four hours and names the busiest", () => {
    render(<HourlyShape hours={HOURS} />);

    expect(screen.getByRole("img", { name: "Interactions by hour, busiest at 10 am" })).toBeInTheDocument();
    expect(screen.getByText("10 am: 40")).toBeInTheDocument();
    expect(screen.getByText("12 am")).toBeInTheDocument();
  });

  it("copes with a day on which nothing happened", () => {
    render(<HourlyShape hours={HOURS.map((slot) => ({ ...slot, count: 0 }))} />);

    expect(screen.getByRole("img", { name: /busiest at 12 am/ })).toBeInTheDocument();
  });
});

describe("RankedTable", () => {
  it("ranks rows with their count, reach and share", () => {
    render(<RankedTable rows={RANKED} heading="Interaction" unit="Times" empty="Nothing yet." />);

    const row = screen.getByText("Opened a stock's detail sheet").closest("tr") as HTMLElement;
    expect(within(row).getByText("30")).toBeInTheDocument();
    expect(within(row).getByText("8")).toBeInTheDocument();
    expect(within(row).getByText("75%")).toBeInTheDocument();
  });

  it("says so when there is nothing to rank", () => {
    render(<RankedTable rows={[]} heading="Interaction" unit="Times" empty="Nothing yet." />);

    expect(screen.getByText("Nothing yet.")).toBeInTheDocument();
  });
});

describe("FeatureRanking", () => {
  it("ranks features and reports opens, reach and refusals", () => {
    render(<FeatureRanking features={FEATURES} />);

    // The figures live in the table beside the donut, one column each, so each is assertable on
    // its own rather than as one concatenated caption.
    const row = screen.getByRole("row", { name: /AI intelligence search/ });
    expect(within(row).getByText("30")).toBeInTheDocument();
    expect(within(row).getByText("8")).toBeInTheDocument();
    expect(within(row).getByText("4")).toBeInTheDocument();

    expect(screen.getByRole("row", { name: /AI stock research/ })).toBeInTheDocument();
  });

  it("says so when nothing has been opened", () => {
    render(<FeatureRanking features={[]} />);

    expect(screen.getByText("No AI feature has been opened in this window yet.")).toBeInTheDocument();
  });
});

describe("matchesUser", () => {
  it("matches on name, address, mobile, plan or top feature, and passes everything on an empty search", () => {
    expect(matchesUser(USERS[0], "asha")).toBe(true);
    expect(matchesUser(USERS[0], "9876")).toBe(true);
    expect(matchesUser(USERS[0], "pro")).toBe(true);
    expect(matchesUser(USERS[0], "intelligence")).toBe(true);
    expect(matchesUser(USERS[0], "  ")).toBe(true);
    expect(matchesUser(USERS[1], "asha")).toBe(false);
    // An account with no mobile and no top feature still matches on what it does have.
    expect(matchesUser(USERS[1], "bala")).toBe(true);
  });
});

describe("EngagementTable", () => {
  it("shows the name, address, mobile and what the account does most", () => {
    render(<EngagementTable users={USERS} />);

    const row = screen.getByText("Asha Rao").closest("tr") as HTMLElement;
    expect(within(row).getByText("asha@example.com")).toBeInTheDocument();
    expect(within(row).getByText("9876543210")).toBeInTheDocument();
    expect(within(row).getByText("44")).toBeInTheDocument();
    expect(within(row).getByText("AI intelligence search")).toBeInTheDocument();
    expect(within(row).getByText("Opened a stock's detail sheet")).toBeInTheDocument();
    expect(within(row).getByText("mobile")).toBeInTheDocument();
  });

  it("dashes the columns an account has nothing in", () => {
    render(<EngagementTable users={USERS} />);

    const row = screen.getByText("Bala Iyer").closest("tr") as HTMLElement;
    expect(within(row).getAllByText("-")).toHaveLength(5);
  });

  it("says so when nothing matches", () => {
    render(<EngagementTable users={[]} />);

    expect(screen.getByText("No signed-in account matches this search.")).toBeInTheDocument();
  });
});

describe("ActivityFeed", () => {
  it("labels each kind of row in the admin's words", () => {
    expect(activityLabel({ ...ACTIVITY[1], type: "visit" })).toBe("Page visit");
    expect(activityLabel({ ...ACTIVITY[1], type: "signin" })).toBe("Signed in");
    expect(activityLabel({ ...ACTIVITY[1], type: "signup" })).toBe("Signed up");
    expect(activityLabel({ ...ACTIVITY[1], type: "feature" })).toBe("AI feature");
    expect(activityLabel({ ...ACTIVITY[1], type: "action" })).toBe("Interaction");
    // A named interaction speaks for itself, and a refusal outranks everything.
    expect(activityLabel(ACTIVITY[0])).toBe("Opened a stock's detail sheet");
    expect(activityLabel({ ...ACTIVITY[0], blocked: true })).toBe("AI feature (blocked)");
  });

  it("shows the label, then the feature, then the path, then nothing", () => {
    expect(activityDetail(ACTIVITY[0])).toBe("RELIANCE");
    expect(activityDetail(ACTIVITY[2])).toBe("AI intelligence search");
    expect(activityDetail(ACTIVITY[1])).toBe("/news");
    expect(activityDetail({ ...ACTIVITY[1], path: null })).toBe("-");
  });

  it("names a signed-out arrival rather than showing a blank row", () => {
    render(<ActivityFeed rows={ACTIVITY} />);

    const guest = screen.getByText("Visitor (not signed in)").closest("tr") as HTMLElement;
    expect(within(guest).getByText("No account")).toBeInTheDocument();
    expect(within(guest).getByText("/news")).toBeInTheDocument();
  });

  it("says so when nothing of this kind has happened", () => {
    render(<ActivityFeed rows={[]} />);

    expect(screen.getByText("Nothing of this kind has been recorded in this window yet.")).toBeInTheDocument();
  });
});

describe("AdminAnalytics", () => {
  it("asks for thirty days and renders the whole report", async () => {
    const fetchMock = serve(report());

    render(<AdminAnalytics />);
    await painted();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/analytics?days=30", expect.anything());
    expect(screen.getByText("Today — 2026-08-12")).toBeInTheDocument();
    expect(screen.getByText("What people do")).toBeInTheDocument();
    expect(screen.getByText("Companies they look into")).toBeInTheDocument();
    expect(screen.getByText("When they are here")).toBeInTheDocument();
    expect(screen.getByText(/local JSON store/)).toBeInTheDocument();
  });

  it("compares today with yesterday on every tile", async () => {
    serve(report());

    render(<AdminAnalytics />);
    await painted();

    // 8 visitors today against 4 yesterday; 19 page views against 30.
    expect(screen.getAllByText("+100% vs yesterday").length).toBeGreaterThan(0);
    expect(screen.getByText("−37% vs yesterday")).toBeInTheDocument();
    expect(screen.getAllByText("no change").length).toBeGreaterThan(0);
  });

  it("charts a different measure when the reader picks one", async () => {
    serve(report());

    render(<AdminAnalytics />);
    await painted();

    // Scoped to the measure group: "Interactions" also names a sortable column on the table under
    // the same chart, and a filter option on the activity feed below.
    const measures = screen.getByRole("group", { name: "Chart measure" });
    await userEvent.click(within(measures).getByRole("button", { name: "Interactions" }));

    expect(screen.getByRole("img", { name: /Interactions per day/ })).toBeInTheDocument();
  });

  it("re-reads the window when the range changes", async () => {
    const fetchMock = serve(report());
    render(<AdminAnalytics />);
    await painted();

    await userEvent.click(screen.getByRole("button", { name: "7 days" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/analytics?days=7", expect.anything()));
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("re-reads on demand", async () => {
    const fetchMock = serve(report());
    render(<AdminAnalytics />);
    await painted();

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("filters the activity feed to one kind of event", async () => {
    serve(report());
    render(<AdminAnalytics />);
    await painted();

    // The feed's kind-of-event control is a dropdown now rather than a row of pills — there are
    // three filters on that table and three rows of pills would have buried the table itself.
    const feed = sectionOf("Recent activity");
    await userEvent.selectOptions(within(feed).getByLabelText("Event"), "visit");

    expect(within(feed).getByText("Visitor (not signed in)")).toBeInTheDocument();
    expect(within(feed).queryByText("Asha Rao")).not.toBeInTheDocument();
  });

  it("searches the accounts table", async () => {
    serve(report());
    render(<AdminAnalytics />);
    await painted();

    await userEvent.type(screen.getByLabelText("Search accounts"), "bala");

    const table = sectionOf("Who is using it");
    // The name now appears twice inside the section: once as a typeahead suggestion and once as
    // the row it matched. Both are the search working.
    expect(within(table).getAllByText("Bala Iyer").length).toBeGreaterThan(0);
    expect(within(table).getByRole("option", { name: "Bala Iyer" })).toBeInTheDocument();
    expect(within(table).queryByText("asha@example.com")).not.toBeInTheDocument();
  });

  it("names the Supabase store when that is where the figures came from", async () => {
    serve(report({ backend: "supabase" }));

    render(<AdminAnalytics />);

    await waitFor(() => expect(screen.getByText(/Supabase store/)).toBeInTheDocument());
  });

  it("shows the reason the server gave for refusing", async () => {
    serve({ error: "Admin access required." }, false);

    render(<AdminAnalytics />);

    await waitFor(() => expect(screen.getByText("Admin access required.")).toBeInTheDocument());
  });

  it("falls back to its own message when the server gives no reason", async () => {
    serve({}, false);

    render(<AdminAnalytics />);

    await waitFor(() => expect(screen.getByText("Couldn't load analytics.")).toBeInTheDocument());
  });

  it("reports a service it could not reach", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<AdminAnalytics />);

    await waitFor(() => expect(screen.getByText("Couldn't reach the analytics service.")).toBeInTheDocument());
  });

  it("says it is working while the report is in flight", async () => {
    serve(report());

    render(<AdminAnalytics />);

    expect(screen.getByText("Loading analytics...")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading analytics...")).not.toBeInTheDocument());
  });
});
