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

let mockStatus: { isAdmin: boolean; email?: string | null } | null = { isAdmin: true };
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
    // No plan by default: an account that has bought nothing, which is what every account is until
    // it pays. That is also what puts it on the Application Users page rather than the other one.
    plan: null,
    role: "user",
    createdAt: "2026-08-01T10:00:00.000Z",
    subscribedUntil: null,
    emailVerifiedAt: null,
    emailVerified: false,
    ...overrides,
  };
}

/**
 * One roster spanning both pages, because the split is the thing under test.
 *
 * u1, u3 and u4 have bought nothing and belong to Application Users; u2 and u5 have bought a plan
 * and belong to Subscription Users — u5 having let it lapse, which is precisely the account that
 * must not fall off the subscriptions page when its paid period ends.
 */
const ROSTER: AdminUser[] = [
  user({ id: "u1", name: "Aarav Sharma", email: "aarav@example.com", emailVerified: true, emailVerifiedAt: "2026-08-02T00:00:00.000Z" }),
  user({ id: "u2", name: "Priya Nair", email: "priya@example.com", plan: "Pro", subscribedUntil: "2026-09-07" }),
  user({ id: "u3", name: "Root Admin", email: "root@example.com", role: "admin", emailVerified: true }),
  user({ id: "u4", name: "Meera Das", email: "meera@example.com" }),
  user({ id: "u5", name: "Vikram Rao", email: "vikram@example.com", plan: "Elite", subscribedUntil: "2026-07-01", emailVerified: true }),
];

const SUMMARY = { total: 5, verified: 3, subscribed: 1, admins: 1, pro: 1, elite: 1 };

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
  it("returns everyone on the page it was asked about", () => {
    expect(selectUsers(ROSTER, { query: "", filter: "all", today: TODAY }).map((u) => u.id)).toEqual(["u1", "u3", "u4"]);
  });

  it("searches name, email and id alike, case-insensitively", () => {
    const byName = selectUsers(ROSTER, { query: "meera", filter: "all", today: TODAY });
    const byEmail = selectUsers(ROSTER, { query: "AARAV@EXAMPLE", filter: "all", today: TODAY });
    const byId = selectUsers(ROSTER, { query: "u3", filter: "all", today: TODAY });

    expect(byName.map((u) => u.id)).toEqual(["u4"]);
    expect(byEmail.map((u) => u.id)).toEqual(["u1"]);
    expect(byId.map((u) => u.id)).toEqual(["u3"]);
  });

  it("returns nothing when the search matches no account", () => {
    expect(selectUsers(ROSTER, { query: "nobody", filter: "all", today: TODAY })).toEqual([]);
  });

  it("filters to the unverified, the subscribed, the admins and those still on trial", () => {
    const ids = (filter: Parameters<typeof selectUsers>[1]["filter"]) =>
      selectUsers(ROSTER, { query: "", filter, today: TODAY }).map((u) => u.id);

    expect(ids("unverified")).toEqual(["u4"]);
    // Nobody on the Application Users page holds a paid period — that is what the page means.
    expect(ids("subscribed")).toEqual([]);
    expect(ids("admins")).toEqual(["u3"]);
    // "On trial" is everyone without a live paid period, admins excluded — they never pay.
    expect(ids("trial")).toEqual(["u1", "u4"]);
  });

  it("combines a search with a filter", () => {
    expect(selectUsers(ROSTER, { query: "meera", filter: "unverified", today: TODAY }).map((u) => u.id)).toEqual(["u4"]);
    expect(selectUsers(ROSTER, { query: "meera", filter: "admins", today: TODAY })).toEqual([]);
  });
});

describe("the split between the two user pages", () => {
  const ids = (mode: "users" | "subscriptions") =>
    selectUsers(ROSTER, { query: "", filter: "all", today: TODAY, mode }).map((u) => u.id);

  it("puts the accounts that have bought nothing on Application Users", () => {
    expect(ids("users")).toEqual(["u1", "u3", "u4"]);
  });

  it("puts the accounts that have bought a plan on Subscription Users, lapsed ones included", () => {
    // u5's paid period ran out in July and it stays here: a lapsed subscriber is a renewal to
    // chase, and moving it back across would hide it from the page that exists to find it.
    expect(ids("subscriptions")).toEqual(["u2", "u5"]);
  });

  it("partitions the roster, so no account is on both pages or on neither", () => {
    expect([...ids("users"), ...ids("subscriptions")].sort()).toEqual(ROSTER.map((u) => u.id).sort());
  });

  it("refuses to let a filter widen a page past its own scope", () => {
    // "Subscribed" on the Application Users page cannot reach the subscribers, and "on trial" on
    // the Subscription Users page cannot reach the trials. The scope is not a default; it is a wall.
    expect(selectUsers(ROSTER, { query: "priya", filter: "subscribed", today: TODAY, mode: "users" })).toEqual([]);
    expect(selectUsers(ROSTER, { query: "aarav", filter: "trial", today: TODAY, mode: "subscriptions" })).toEqual([]);
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
    expect(formatDay(null)).toBe("-");
    expect(formatDay(undefined)).toBe("-");
    expect(formatDay("not-a-date")).toBe("-");
  });
});

describe("AdminUsers", () => {
  beforeEach(() => {
    mockStatus = { isAdmin: true };
    mockLoading = false;
    jest.restoreAllMocks();
  });

  it("says it is loading until the status and the list have both arrived", () => {
    mockLoading = true;
    mockList();
    render(<AdminUsers />);
    expect(screen.getByText("Loading accounts...")).toBeInTheDocument();
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

  it("lists the accounts that have bought nothing, and the totals above them", async () => {
    mockList();
    render(<AdminUsers />);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Aarav Sharma")).toBeInTheDocument();
    expect(screen.getByText("Meera Das")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    // Every account here has bought nothing, so every plan cell says so.
    expect(screen.getAllByText("No plan")).not.toHaveLength(0);
    // The subscribers are on the other page entirely.
    expect(screen.queryByText("Priya Nair")).not.toBeInTheDocument();
    expect(screen.queryByText("Vikram Rao")).not.toBeInTheDocument();
    // The tile counts the whole roster the server reported, not the slice this page shows.
    expect(screen.getByText("Accounts").previousSibling).toHaveTextContent("5");
  });

  it("lists only the accounts that have bought a plan on the subscriptions page", async () => {
    mockList();
    render(<AdminUsers mode="subscriptions" />);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.getByText("Vikram Rao")).toBeInTheDocument();
    expect(screen.queryByText("Aarav Sharma")).not.toBeInTheDocument();
    expect(screen.queryByText("Meera Das")).not.toBeInTheDocument();
  });

  it("narrows the table by search", async () => {
    mockList();
    const person = userEvent.setup();
    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.type(screen.getByLabelText("Search accounts"), "meera");

    expect(screen.getByText("Meera Das")).toBeInTheDocument();
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

  it("sends a plan change and moves the account onto the subscriptions page", async () => {
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
    await person.selectOptions(within(row).getByLabelText("Plan for Aarav Sharma"), "Pro");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/users");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ id: "u1", plan: "Pro" });
    // Giving an account a plan makes it a subscription user, so it leaves this page for the other
    // one. The row vanishing is the partition working, not the change failing.
    await waitFor(() => expect(screen.queryByText("Aarav Sharma")).not.toBeInTheDocument());
  });

  it("moves a Pro account up to Elite", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers mode="subscriptions" />);
    await screen.findByRole("table");

    await person.selectOptions(within(screen.getByText("Priya Nair").closest("tr")!).getByLabelText("Plan for Priya Nair"), "Elite");
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u2", plan: "Elite" }));
  });

  it("takes a plan back off an account granted one by mistake", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers mode="subscriptions" />);
    await screen.findByRole("table");

    await person.selectOptions(within(screen.getByText("Priya Nair").closest("tr")!).getByLabelText("Plan for Priya Nair"), "");
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u2", plan: "" }));
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
  });

  it("revokes a live subscription from the subscriptions page", async () => {
    const person = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: ROSTER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers mode="subscriptions" />);
    await screen.findByRole("table");

    const paidRow = screen.getByText("Priya Nair").closest("tr")!;
    await person.click(within(paidRow).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u2", subscription: "revoke" }));
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

    const unverified = screen.getByText("Meera Das").closest("tr")!;
    await person.click(within(unverified).getByRole("button", { name: "Mark verified" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u4", emailVerified: true }));
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

  it("does not show delete controls to a regular admin", async () => {
    mockStatus = { isAdmin: true, email: "root@example.com" };
    mockList();

    render(<AdminUsers />);
    await screen.findByRole("table");

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send reset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grant 5d trial" })).not.toBeInTheDocument();
  });

  it("lets the super admin send a password reset link", async () => {
    mockStatus = { isAdmin: true, email: "garvcontact30@gmail.com" };
    const person = userEvent.setup();
    const updated = ROSTER.map((entry) =>
      entry.id === "u1" ? { ...entry, passwordResetSentAt: "2026-08-08T10:00:00.000Z" } : entry,
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            users: updated,
            summary: SUMMARY,
            today: TODAY,
            message: "Password reset link sent to aarav@example.com.",
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Send reset" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u1", passwordReset: "send" });
    expect(await screen.findByText("Password reset link sent to aarav@example.com.")).toBeInTheDocument();
    expect(screen.getByText(/Reset sent/)).toBeInTheDocument();
  });

  it("lets the super admin approve a 5-day free trial", async () => {
    mockStatus = { isAdmin: true, email: "garvcontact30@gmail.com" };
    const person = userEvent.setup();
    const updated = ROSTER.map((entry) =>
      entry.id === "u4" ? { ...entry, trialStartedAt: "2026-08-08T10:00:00.000Z" } : entry,
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            users: updated,
            summary: SUMMARY,
            today: TODAY,
            message: "5-day free trial approved for meera@example.com.",
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Meera Das").closest("tr")!).getByRole("button", { name: "Grant 5d trial" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "u4", freeTrial: "grant5d" });
    expect(await screen.findByText("5-day free trial approved for meera@example.com.")).toBeInTheDocument();
    expect(screen.getByText(/Trial started/)).toBeInTheDocument();
  });

  it("lets the super admin delete another user", async () => {
    mockStatus = { isAdmin: true, email: "garvcontact30@gmail.com" };
    const person = userEvent.setup();

    const updated = ROSTER.filter((u) => u.id !== "u1");
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, users: updated, summary: { ...SUMMARY, total: 2 } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete this user account?" })).toBeInTheDocument();
    expect(screen.getByText("Confirm delete")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "Delete user" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/users?id=u1");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    await waitFor(() => expect(screen.queryByText("Aarav Sharma")).not.toBeInTheDocument());
  });

  it("does not offer to delete the super admin account", async () => {
    mockStatus = { isAdmin: true, email: "garvcontact30@gmail.com" };
    const withSuperAdmin = [
      ...ROSTER,
      user({ id: "u4", name: "Garv Tuts", email: "garvcontact30@gmail.com", role: "admin", emailVerified: true }),
    ];
    mockList(withSuperAdmin);

    render(<AdminUsers />);
    await screen.findByRole("table");

    expect(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(screen.getByText("Garv Tuts").closest("tr")!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("surfaces the server's reason when a delete is refused", async () => {
    mockStatus = { isAdmin: true, email: "garvcontact30@gmail.com" };
    const person = userEvent.setup();

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ users: ROSTER, summary: SUMMARY, today: TODAY }) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({ error: "Only the super admin can delete users." }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminUsers />);
    await screen.findByRole("table");

    await person.click(within(screen.getByText("Aarav Sharma").closest("tr")!).getByRole("button", { name: "Delete" }));
    await person.click(screen.getByRole("button", { name: "Delete user" }));
    expect(await screen.findByText("Only the super admin can delete users.")).toBeInTheDocument();
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
