import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SubscriptionProvider,
  authHeaders,
  readToken,
  syncSessionCookie,
  useSubscription,
} from "../../app/components/subscription-provider";

const trialStatus = {
  state: "trial",
  allowed: true,
  isAdmin: false,
  tier: "pro",
  planName: "Pro",
  marketDaysUsed: 2,
  marketDaysLeft: 3,
  trialStartedAt: "2026-08-01T04:00:00.000Z",
  subscribedUntil: null,
  today: "2026-08-05",
  locks: { "top-picks": true },
  features: [{ key: "top-picks", label: "Today's AI picks" }],
  signedIn: true,
  name: "Aarav",
};

function Probe() {
  const { status, loading, canUse, isLocked, refresh, renew, setLock } = useSubscription();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="state">{status?.state ?? "none"}</span>
      <span data-testid="can-research">{String(canUse("research"))}</span>
      <span data-testid="can-top-picks">{String(canUse("top-picks"))}</span>
      <span data-testid="locked-top-picks">{String(isLocked("top-picks"))}</span>
      <button onClick={() => refresh()}>refresh</button>
      <button onClick={() => renew()}>renew</button>
      <button onClick={() => setLock("research", true)}>lock research</button>
    </div>
  );
}

function mockStatus(payload: unknown, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => payload } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = "stockers_session=; path=/; max-age=0";
});

describe("readToken", () => {
  it("reads the token out of the auth blob the sign-in form stores", () => {
    window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "tok-1", user: { name: "A" } }));
    expect(readToken()).toBe("tok-1");
    expect(authHeaders()).toEqual({ Authorization: "Bearer tok-1" });
  });

  it("returns null when signed out, when the blob is corrupt, or when it carries no token", () => {
    expect(readToken()).toBeNull();
    expect(authHeaders()).toEqual({});

    window.localStorage.setItem("stockers-auth", "not json");
    expect(readToken()).toBeNull();

    window.localStorage.setItem("stockers-auth", JSON.stringify({ user: {} }));
    expect(readToken()).toBeNull();
  });
});

describe("syncSessionCookie", () => {
  // The cookie is what lets the existing components reach gated endpoints without each one
  // attaching an Authorization header.
  it("mirrors the token into a cookie and clears it on sign-out", () => {
    window.localStorage.setItem("stockers-auth", JSON.stringify({ token: "tok-2" }));
    syncSessionCookie();
    expect(document.cookie).toContain("stockers_session=tok-2");

    window.localStorage.clear();
    syncSessionCookie();
    expect(document.cookie).not.toContain("stockers_session=tok-2");
  });
});

describe("SubscriptionProvider", () => {
  it("exposes the fetched status and applies admin feature locks", async () => {
    mockStatus(trialStatus);
    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("trial"));
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("can-research")).toHaveTextContent("true");
    // Locked by an admin, so unusable even though the trial is still live.
    expect(screen.getByTestId("can-top-picks")).toHaveTextContent("false");
    expect(screen.getByTestId("locked-top-picks")).toHaveTextContent("true");
  });

  it("locks every AI feature once the trial has expired", async () => {
    mockStatus({ ...trialStatus, state: "expired", allowed: false, tier: null, planName: null, marketDaysLeft: 0, locks: {} });
    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("expired"));
    expect(screen.getByTestId("can-research")).toHaveTextContent("false");
  });

  it("locks features above the active plan tier", async () => {
    mockStatus({ ...trialStatus, state: "active", allowed: true, tier: "starter", planName: "Starter", locks: {} });
    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("active"));
    expect(screen.getByTestId("can-research")).toHaveTextContent("false");
  });

  // An admin must keep working even on features they have locked for everyone else.
  it("lets an admin through every lock", async () => {
    mockStatus({ ...trialStatus, state: "admin", isAdmin: true, locks: { "top-picks": true, research: true } });
    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("admin"));
    expect(screen.getByTestId("can-research")).toHaveTextContent("true");
    expect(screen.getByTestId("can-top-picks")).toHaveTextContent("true");
  });

  // The server guard is the real boundary, so a failed status check must not blank the UI.
  it("fails open when the status request fails", async () => {
    mockStatus({}, false);
    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("state")).toHaveTextContent("none");
    expect(screen.getByTestId("can-research")).toHaveTextContent("true");
  });

  it("fails open when the status request rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("can-research")).toHaveTextContent("true");
  });

  it("renews and re-reads the status", async () => {
    const user = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => trialStatus } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ ...trialStatus, state: "active", allowed: true }) } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("trial"));

    await user.click(screen.getByText("renew"));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("active"));
    expect(fetchMock).toHaveBeenCalledWith("/api/subscription/renew", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces a renewal failure instead of pretending it worked", async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => trialStatus } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Please sign in." }) } as Response) as unknown as typeof fetch;

    function RenewProbe() {
      const { renew } = useSubscription();
      return (
        <button
          onClick={async () => {
            const result = await renew();
            document.title = result.ok ? "ok" : result.error;
          }}
        >
          go
        </button>
      );
    }

    render(
      <SubscriptionProvider>
        <RenewProbe />
      </SubscriptionProvider>,
    );
    await user.click(screen.getByText("go"));
    await waitFor(() => expect(document.title).toBe("Please sign in."));
  });

  it("reports a renewal network failure", async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => trialStatus } as Response)
      .mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    function RenewProbe() {
      const { renew } = useSubscription();
      return (
        <button
          onClick={async () => {
            const result = await renew();
            document.title = result.ok ? "ok" : result.error;
          }}
        >
          go
        </button>
      );
    }

    render(
      <SubscriptionProvider>
        <RenewProbe />
      </SubscriptionProvider>,
    );
    await user.click(screen.getByText("go"));
    await waitFor(() => expect(document.title).toBe("Couldn't reach the subscription service."));
  });

  it("posts a lock change and refreshes", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => trialStatus } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <SubscriptionProvider>
        <Probe />
      </SubscriptionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("trial"));

    await user.click(screen.getByText("lock research"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/feature-locks",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ feature: "research", locked: true }) }),
      ),
    );
  });
});

describe("useSubscription outside a provider", () => {
  // A missing provider must never blank out a page, so the fallback is fully permissive.
  it("behaves as fully unlocked", async () => {
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("none");
    expect(screen.getByTestId("can-research")).toHaveTextContent("true");
    expect(screen.getByTestId("locked-top-picks")).toHaveTextContent("false");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    const user = userEvent.setup();
    await user.click(screen.getByText("refresh"));
    await user.click(screen.getByText("renew"));
    await user.click(screen.getByText("lock research"));
  });
});

describe("renewal error handling", () => {
  // A failing renewal that carries no message must still say something useful.
  it("falls back to a generic message when the server sends no error text", async () => {
    const user = userEvent.setup();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => trialStatus } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response) as unknown as typeof fetch;

    function RenewProbe() {
      const { renew } = useSubscription();
      return (
        <button
          onClick={async () => {
            const result = await renew();
            document.title = result.ok ? "ok" : result.error;
          }}
        >
          go
        </button>
      );
    }

    render(
      <SubscriptionProvider>
        <RenewProbe />
      </SubscriptionProvider>,
    );
    await user.click(screen.getByText("go"));
    await waitFor(() => expect(document.title).toBe("Couldn't renew right now."));
  });
});

describe("storage failures", () => {
  // Private-mode browsers throw on localStorage; that must read as "signed out", not crash.
  it("treats a throwing localStorage as no session", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(readToken()).toBeNull();
    expect(() => syncSessionCookie()).not.toThrow();

    spy.mockRestore();
  });
});
