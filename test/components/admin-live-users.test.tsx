// Who is on the site right now, as the super admin sees it.
//
// The panel's job is to be *live* and to be honest about it: it must read on mount, keep reading on
// a timer, stop reading while nobody is looking, and never present a figure it could not get as
// though it had. The table under it is the same shared table every other admin surface uses, so
// what is tested here is the wiring — the columns, the filters and the paging over real rows —
// rather than the table mechanics themselves.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminLiveUsers, agoText, stayText } from "../../app/components/admin-live-users";
import type { LiveUserRow } from "../../app/lib/presence-report";

jest.mock("../../app/components/subscription-provider", () => ({
  authHeaders: () => ({ Authorization: "Bearer test-token" }),
}));

function row(overrides: Partial<LiveUserRow> = {}): LiveUserRow {
  return {
    key: "user:user_1",
    name: "Asha Rao",
    email: "asha@example.com",
    mobile: "9876543210",
    plan: "Pro",
    signedIn: true,
    path: "/dashboard",
    device: "desktop",
    tabs: 1,
    startedAt: "2026-08-14T09:30:00.000Z",
    lastSeenAt: "2026-08-14T10:00:00.000Z",
    minutes: 30,
    idleSeconds: 4,
    online: true,
    ...overrides,
  };
}

function report(rows: LiveUserRow[] = [row()]) {
  const here = rows.filter((entry) => entry.online);
  return {
    available: true,
    at: "2026-08-14T10:00:00.000Z",
    windowSeconds: 150,
    retentionMinutes: 60,
    summary: {
      online: here.length,
      signedIn: here.filter((entry) => entry.signedIn).length,
      guests: here.filter((entry) => !entry.signedIn).length,
      tabs: here.reduce((total, entry) => total + entry.tabs, 0),
      recent: rows.length,
    },
    pages: [{ key: "/dashboard", label: "/dashboard", people: here.length }],
    devices: [{ key: "desktop", label: "Desktop", people: here.length }],
    rows,
  };
}

/** Answers the panel's read with whatever payload is handed in. */
function serve(payload: unknown = report(), ok = true) {
  const mock = jest.fn(async () => ({ ok, json: async () => payload }) as unknown as Response);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  setVisibility("visible");
});

describe("agoText", () => {
  it("reads the way a person would say it", () => {
    expect(agoText(0)).toBe("just now");
    expect(agoText(4)).toBe("just now");
    expect(agoText(5)).toBe("5s ago");
    expect(agoText(59)).toBe("59s ago");
    expect(agoText(60)).toBe("1m ago");
    expect(agoText(3_599)).toBe("59m ago");
    expect(agoText(7_200)).toBe("2h ago");
  });
});

describe("stayText", () => {
  it("names a stay in the largest unit that still reads as a round number", () => {
    expect(stayText(0)).toBe("just arrived");
    expect(stayText(1)).toBe("1 min");
    expect(stayText(59)).toBe("59 min");
    expect(stayText(60)).toBe("1h");
    expect(stayText(95)).toBe("1h 35m");
  });
});

describe("AdminLiveUsers", () => {
  it("reads on mount and puts the headline figures up", async () => {
    serve(report([row(), row({ key: "visitor:guest", name: "Visitor (not signed in)", email: null, plan: null, signedIn: false })]));

    render(<AdminLiveUsers />);

    // Waited on a figure rather than a label: every tile paints its label before the first read
    // lands, so waiting for one asserts against the loading state.
    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
    const online = screen.getByText("On the site now").closest("div") as HTMLElement;
    expect(within(online).getByText("2")).toBeInTheDocument();
    // Scoped to the tile row: both words appear again as filter options and in the table itself,
    // and a query that matched those would pass on a panel whose tiles had stopped working.
    const tiles = online.parentElement as HTMLElement;
    expect(within(tiles).getByText("Signed in").closest("div")).toHaveTextContent("1");
    expect(within(tiles).getByText("Not signed in").closest("div")).toHaveTextContent("1");
  });

  it("asks the admin endpoint, with the caller's credentials", async () => {
    const fetchMock = serve();

    render(<AdminLiveUsers />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/presence",
        expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }),
      ),
    );
  });

  it("lists each person once, with where they are and how long they have been there", async () => {
    serve(report([row({ path: "/news", minutes: 95, tabs: 3 })]));

    render(<AdminLiveUsers />);

    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText("/news")).toBeInTheDocument();
    expect(screen.getByText("1h 35m")).toBeInTheDocument();
    // Three tabs, one person: the row is a person, not a sitting.
    expect(screen.getByRole("cell", { name: "3" })).toBeInTheDocument();
  });

  it("says who is still here and who has just left", async () => {
    serve(report([row(), row({ key: "visitor:gone", name: "Bharat Shah", online: false, idleSeconds: 600 })]));

    render(<AdminLiveUsers />);

    await waitFor(() => expect(screen.getByText("On the site")).toBeInTheDocument());
    expect(screen.getByText("Just left")).toBeInTheDocument();
  });

  it("pages the table rather than printing an unbounded list", async () => {
    const crowd = Array.from({ length: 24 }, (_, index) =>
      row({ key: `visitor:${index}`, name: `Reader ${String(index).padStart(2, "0")}`, email: `reader${index}@example.com` }),
    );
    serve(report(crowd));

    render(<AdminLiveUsers />);

    await waitFor(() => expect(screen.getByText("Reader 00")).toBeInTheDocument());
    // Ten to a page, and the count says so.
    expect(screen.getByText(/Showing 1–10 of 24/)).toBeInTheDocument();
    expect(screen.queryByText("Reader 10")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Reader 10")).toBeInTheDocument();
    expect(screen.getByText(/Showing 11–20 of 24/)).toBeInTheDocument();
  });

  it("narrows the list to the people who are actually here", async () => {
    serve(report([row(), row({ key: "visitor:gone", name: "Bharat Shah", online: false })]));

    render(<AdminLiveUsers />);
    await waitFor(() => expect(screen.getByText("Bharat Shah")).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText("Status"), "online");

    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByText("Bharat Shah")).not.toBeInTheDocument();
  });

  it("finds a person by what they are reading", async () => {
    serve(report([row({ path: "/news" }), row({ key: "visitor:two", name: "Bharat Shah", path: "/pricing" })]));

    render(<AdminLiveUsers />);
    await waitFor(() => expect(screen.getByText("Bharat Shah")).toBeInTheDocument());

    await userEvent.type(screen.getByRole("combobox", { name: "Search rows" }), "/pricing");

    expect(screen.getByText("Bharat Shah")).toBeInTheDocument();
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
  });

  it("names the pages people are on right now", async () => {
    serve(report());

    render(<AdminLiveUsers />);

    await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
    const pages = screen.getByText("Pages").closest("div") as HTMLElement;
    expect(within(pages).getByText("/dashboard")).toBeInTheDocument();
  });

  it("re-reads on its own timer, and stops while nobody is looking", async () => {
    jest.useFakeTimers();
    const fetchMock = serve();

    render(<AdminLiveUsers />);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    setVisibility("hidden");
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    // Six polls' worth of a backgrounded tab, and not one query: nobody is reading the figures.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("reads again the moment the admin comes back to the tab", async () => {
    jest.useFakeTimers();
    const fetchMock = serve();

    render(<AdminLiveUsers />);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const beforeReturn = fetchMock.mock.calls.length;

    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(fetchMock.mock.calls.length).toBe(beforeReturn + 1);

    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("re-reads on demand when asked", async () => {
    const fetchMock = serve();

    render(<AdminLiveUsers />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Refresh now" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("says so when the figures cannot be read at all", async () => {
    serve({}, false);

    render(<AdminLiveUsers />);

    await waitFor(() =>
      expect(screen.getByText("Couldn't read who is on the site right now.")).toBeInTheDocument(),
    );
  });

  it("keeps quiet about a dropped connection rather than blaming the admin", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    render(<AdminLiveUsers />);

    await waitFor(() =>
      expect(screen.getByText("Couldn't read who is on the site right now.")).toBeInTheDocument(),
    );
  });

  it("prints the store's own explanation when the table has not been created", async () => {
    serve({ available: false, message: "The `live_sessions` table has not been created in Supabase yet." });

    render(<AdminLiveUsers />);

    await waitFor(() =>
      expect(
        screen.getByText("The `live_sessions` table has not been created in Supabase yet."),
      ).toBeInTheDocument(),
    );
    // And nothing that would read as "nobody is on the site", which is a different statement.
    expect(screen.queryByText("On the site now")).not.toBeInTheDocument();
  });

  it("waits rather than showing a zero before the first read lands", () => {
    serve();

    render(<AdminLiveUsers />);

    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
    // Said in the header and again where the table would be, so both are checked as a group.
    expect(screen.getAllByText("Reading the live session store…").length).toBeGreaterThan(0);
  });

  it("says nobody is here when nobody is", async () => {
    serve(report([]));

    render(<AdminLiveUsers />);

    await waitFor(() => expect(screen.getByText("Nobody is on the site right now.")).toBeInTheDocument());
    expect(screen.getByText("Nobody has been on the site in the last hour.")).toBeInTheDocument();
  });

  it("dashes what a heartbeat did not carry rather than inventing it", async () => {
    serve(report([row({ path: null, device: null, plan: null, email: null, signedIn: false, name: "Visitor (not signed in)" })]));

    render(<AdminLiveUsers />);

    await waitFor(() => expect(screen.getByText("Visitor (not signed in)")).toBeInTheDocument());
    // A dash for the page, the plan and the device: unknown, not zero and not invented.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
