import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AdminUsers,
  formatDay,
  isSubscribed,
  selectUsers,
  USER_FILTERS,
  type AdminUser,
} from "../../app/components/admin-users";

const TODAY = "2026-08-08";

let mockStatus: { isAdmin: boolean } | null = { isAdmin: true };
let mockLoading = false;

jest.mock("../../app/components/subscription-provider", () => ({
  authHeaders: () => ({ Authorization: "Bearer test-token" }),
  useSubscription: () => ({ status: mockStatus, loading: mockLoading }),
}));

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    name: "Aarav Sharma",
    email: "aarav@example.com",
    plan: "Starter",
    role: "user",
    createdAt: "2026-08-01T10:00:00.000Z",
    subscribedUntil: null,
    emailVerifiedAt: null,
    emailVerified: false,
    ...overrides,
  };
}

const ROSTER: AdminUser[] = [
  user({ id: "u1", name: "Aarav Sharma", email: "aarav@example.com", emailVerified: true, emailVerifiedAt: "2026-08-02T00:00:00.000Z" }),
  user({ id: "u2", name: "Priya Nair", email: "priya@example.com", plan: "Pro", subscribedUntil: "2026-09-07" }),
  user({ id: "u3", name: "Root Admin", email: "root@example.com", role: "admin", emailVerified: true }),
];

const SUMMARY = { total: 3, verified: 2, subscribed: 1, admins: 1, pro: 1 };

function mockList(users: AdminUser[] = ROSTER) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ users, summary: SUMMARY, today: TODAY }),
    }),
  ) as unknown as typeof fetch;
}

describe("selectUsers", () => {
  it("returns everyone when nothing is asked of it", () => {
    expect(selectUsers(ROSTER, { query: "", filter: "all", today: TODAY })).toHaveLength(3);
  });

  it("searches name, email and id alike, case-insensitively", () => {
    const byName = selectUsers(ROSTER, { query: "priya", filter: "all", today: TODAY });
    const byEmail = selectUsers(ROSTER, { query: "AARAV@EXAMPLE", filter: "all", today: TODAY });
    const byId = selectUsers(ROSTER, { query: "u3", filter: "all", today: TODAY });

    expect(byName.map((u) => u.id)).toEqual(["u2"]);
    expect(byEmail.map((u) => u.id)).toEqual(["u1"]);
    expect(byId.map((u) => u.id)).toEqual(["u3"]);
  });

  it("returns nothing when the search matches no account", () => {
    expect(selectUsers(ROSTER, { query: "nobody", filter: "all", today: TODAY })).toEqual([]);
  });

  it("filters to the unverified, the subscribed, the admins and those still on trial", () => {
    const ids = (filter: Parameters<typeof selectUsers>[1]["filter"]) =>
      selectUsers(ROSTER, { query: "", filter, today: TODAY }).map((u) => u.id);

    expect(ids("unverified")).toEqual(["u2"]);
    expect(ids("subscribed")).toEqual(["u2"]);
    expect(ids("admins")).toEqual(["u3"]);
    // "On trial" is everyone without a live paid period, admins excluded — they never pay.
    expect(ids("trial")).toEqual(["u1"]);
  });

  it("combines a search with a filter", () => {
    expect(selectUsers(ROSTER, { query: "priya", filter: "unverified", today: TODAY }).map((u) => u.id)).toEqual(["u2"]);
    expect(selectUsers(ROSTER, { query: "priya", filter: "admins", today: TODAY })).toEqual([]);
  });
});

describe("isSubscribed", () => {
  it("counts a period ending today as still live, and yesterday's as lapsed", () => {
    expect(isSubscribed(user({ subscribedUntil: TODAY }), TODAY)).toBe(true);
    expect(isSubscribed(user({ subscribedUntil: "2026-08-07" }), TODAY)).toBe(false);
    expect(isSubscribed(user({ subscribedUntil: null }), TODAY)).toBe(false);
  });
});

describe("formatDay", () => {
  it("prints a readable date, and a dash for anything absent or unparseable", () => {
    expect(formatDay("2026-08-08T00:00:00.000Z")).toMatch(/2026/);
    expect(formatDay(null)).toBe("—");
    expect(formatDay(undefined)).toBe("—");
    expect(formatDay("not-a-date")).toBe("—");
  });
});

describe("AdminUsers", () => {
  beforeEach(() => {
    mockStatus = { isAdmin: true };
    mockLoading = false;
  });

  it("says it is loading until the status and the list have both arrived", () => {
    mockLoading = true;
    mockList();
    render(<AdminUsers />);
    expect(screen.getByText("Loading accounts…")).toBeInTheDocument();
  });

  it("turns a non-admin away rather than rendering the roster", async () => {
    mockStatus = { isAdmin: false };
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: "Admin access required." }) }),
    ) as unknown as typeof fetch;

    render(<AdminUsers />);
    expect(await screen.findByText("Administrators only")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists every account with its standing, and the totals above it", async () => {
    mockList();
    render(<AdminUsers />);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.getAllByText("verified")).toHaveLength(2);
    expect(screen.getByText("unverified")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("subscribed")).toBeInTheDocument();
    expect(screen.getByText("Accounts").previousSibling).toHaveTextContent("3");
  });

  it("narrows the table by search", async () => {
    mockList();
    const person = userEvent.setup();
    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.type(screen.getByLabelText("Search accounts"), "priya");

    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.queryByText("Aarav Sharma")).not.toBeInTheDocument();
  });

  it("narrows the table by filter", async () => {
    mockList();
    const person = userEvent.setup();
    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(screen.getByRole("button", { name: "Admins" }));

    expect(screen.getByText("Root Admin")).toBeInTheDocument();
    expect(screen.queryByText("Priya Nair")).not.toBeInTheDocument();
  });

  it("says so when a search matches nothing", async () => {
    mockList();
    const person = userEvent.setup();
    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.type(screen.getByLabelText("Search accounts"), "zzzz");
    expect(screen.getByText("No account matches this search.")).toBeInTheDocument();
  });

  it("offers every documented filter", () => {
    expect(USER_FILTERS.map((f) => f.key)).toEqual(["all", "unverified", "subscribed", "trial", "admins"]);
  });

  it("sends a plan change and re-renders from the server's answer", async () => {
    const person = userEvent.setup();
    const updated = ROSTER.map((u) => (u.id === "u1" ? { ...u, plan: "Pro" as const } : u));

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: updated }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    const row = screen.getByText("Aarav Sharma").closest("tr")!;
    await person.click(within(row).getByRole("button", { name: "→ Pro" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/users");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ id: "u1", plan: "Pro" });
    // The button now offers the opposite move, proving the table re-rendered from the response.
    await waitFor(() => expect(within(row).getByRole("button", { name: "→ Starter" })).toBeInTheDocument());
  });

  it("moves a Pro account back down to Starter", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    // Priya is the Pro account, so her button offers the downgrade.
    await person.click(within(screen.getByText("Priya Nair").closest("tr")!).getByRole("button", { name: "→ Starter" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u2", plan: "Starter" }));
  });

  it("empties the table rather than crashing if a change comes back without a roster", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText("No account matches this search.")).toBeInTheDocument();
  });

  it("grants and revokes a subscription from the same button", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    const trialRow = screen.getByText("Aarav Sharma").closest("tr")!;
    await person.click(within(trialRow).getByRole("button", { name: "Grant 30d" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u1", subscription: "grant" }));

    const paidRow = screen.getByText("Priya Nair").closest("tr")!;
    await person.click(within(paidRow).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ id: "u2", subscription: "revoke" }));
  });

  it("marks an unverified account verified, and offers that only where it applies", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    const verified = screen.getByText("Aarav Sharma").closest("tr")!;
    expect(within(verified).queryByRole("button", { name: "Mark verified" })).not.toBeInTheDocument();

    const unverified = screen.getByText("Priya Nair").closest("tr")!;
    await person.click(within(unverified).getByRole("button", { name: "Mark verified" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u2", emailVerified: true }));
  });

  it("promotes and demotes admins", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Make admin" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u1", role: "admin" }));

    await person.click(within(screen.getByText("Root Admin").closest("tr")!).getByRole("button", { name: "Remove admin" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ id: "u3", role: "user" }));
  });

  it("surfaces the server's reason when a change is refused", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({ error: "You cannot remove your own admin access." }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Root Admin").closest("tr")!).getByRole("button", { name: "Remove admin" }));
    expect(await screen.findByText("You cannot remove your own admin access.")).toBeInTheDocument();
  });

  it("falls back to its own wording when a refusal carries no reason", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: () => Promise.resolve({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText("That change was refused.")).toBeInTheDocument();
  });

  it("reports a network failure while changing, without losing the table", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockRejectedValueOnce(new Error("offline"));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText("Couldn't reach the server.")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("reports a failure to load the list at all", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    render(<AdminUsers />);
    expect(await screen.findByText("Couldn't load the user list. Please try again.")).toBeInTheDocument();
  });

  it("reports a non-403 error response from the list endpoint", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    ) as unknown as typeof fetch;

    render(<AdminUsers />);
    expect(await screen.findByText("Couldn't load the user list. Please try again.")).toBeInTheDocument();
  });

  it("copes with a response that carries neither users nor a summary", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
    ) as unknown as typeof fetch;

    render(<AdminUsers />);
    expect(await screen.findByText("No account matches this search.")).toBeInTheDocument();
  });
});
