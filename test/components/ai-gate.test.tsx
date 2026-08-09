import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiGate, FeatureLockToggle, GatedSection, LockPanel } from "../../app/components/ai-gate";
import { SubscriptionProvider } from "../../app/components/subscription-provider";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const baseStatus = {
  state: "trial",
  allowed: true,
  isAdmin: false,
  tier: "pro",
  planName: "Pro",
  marketDaysUsed: 1,
  marketDaysLeft: 4,
  trialStartedAt: "2026-08-01T04:00:00.000Z",
  subscribedUntil: null,
  today: "2026-08-05",
  locks: {},
  features: [{ key: "research", label: "AI stock research" }],
  signedIn: true,
  name: "Aarav",
};

function mockStatus(overrides: Record<string, unknown> = {}) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...baseStatus, ...overrides }) } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderGated(ui: React.ReactNode) {
  return render(<SubscriptionProvider>{ui}</SubscriptionProvider>);
}

describe("AiGate", () => {
  it("renders the feature while the trial is live", async () => {
    mockStatus();
    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );
    expect(await screen.findByText("the feature")).toBeInTheDocument();
  });

  it("blurs the feature with a plan prompt once the current plan does not include it", async () => {
    mockStatus({ state: "expired", allowed: false, tier: null, planName: null, marketDaysLeft: 0 });
    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );

    expect(await screen.findByText("AI stock research is locked")).toBeInTheDocument();
    expect(screen.getByText(/Pro is required for AI stock research/)).toBeInTheDocument();
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("2 star Rank 2")).toBeInTheDocument();
    expect(screen.getByText("See plans")).toHaveAttribute("href", "/#pricing");
    expect(screen.getByText("the feature")).toBeInTheDocument();
  });

  it("offers sign-up and sign-in to a visitor who has no account", async () => {
    mockStatus({ state: "expired", allowed: false, tier: null, planName: null, signedIn: false });
    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );

    expect(await screen.findByText("Start free trial")).toHaveAttribute("href", "/signup");
    expect(screen.getByText("Sign in")).toHaveAttribute("href", "/signin");
  });

  // An admin lock is a different situation from an expired trial, and must not ask for money.
  it("explains an admin lock without prompting to subscribe", async () => {
    mockStatus({ locks: { research: true } });
    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );

    expect(await screen.findByText(/An administrator has turned this feature off/)).toBeInTheDocument();
    expect(screen.queryByText("See plans")).not.toBeInTheDocument();
    expect(screen.queryByText("Start free trial")).not.toBeInTheDocument();
  });
});

describe("LockPanel", () => {
  // Rendered with no status at all — the panel must still be readable and treat the visitor as
  // signed out rather than assuming an account exists.
  it("treats an unknown session as signed out", () => {
    render(<LockPanel feature="research" label="AI stock research" />);

    expect(screen.getByText("AI stock research is locked")).toBeInTheDocument();
    expect(screen.getByText("Start free trial")).toHaveAttribute("href", "/signup");
    expect(screen.getByText("Sign in")).toHaveAttribute("href", "/signin");
  });
});

describe("FeatureLockToggle", () => {
  it("renders nothing for a non-admin", async () => {
    mockStatus();
    const { container } = renderGated(<FeatureLockToggle feature="research" label="AI stock research" />);
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });

  it("lets an admin lock a feature and reflects the state", async () => {
    const user = userEvent.setup();
    const fetchMock = mockStatus({ isAdmin: true, state: "admin" });
    renderGated(<FeatureLockToggle feature="research" label="AI stock research" />);

    const toggle = await screen.findByRole("button", { name: "Disable AI stock research" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).not.toHaveTextContent(/^Lock$/);

    await user.click(toggle);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/feature-locks",
        expect.objectContaining({ body: JSON.stringify({ feature: "research", locked: true }) }),
      ),
    );
  });

  it("shows a locked feature as locked and offers to unlock it", async () => {
    mockStatus({ isAdmin: true, state: "admin", locks: { research: true } });
    renderGated(<FeatureLockToggle feature="research" label="AI stock research" />);

    const toggle = await screen.findByRole("button", { name: "Enable AI stock research" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).not.toHaveTextContent("Locked");
  });
});

describe("GatedSection", () => {
  it("shows no admin controls to an ordinary user", async () => {
    mockStatus();
    renderGated(
      <GatedSection id="research" feature="research" label="AI stock research">
        <p>the feature</p>
      </GatedSection>,
    );

    expect(await screen.findByText("the feature")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI stock research/ })).not.toBeInTheDocument();
    expect(document.getElementById("research")).toBeInTheDocument();
  });

  it("shows the lock switch to an admin", async () => {
    mockStatus({ isAdmin: true, state: "admin" });
    renderGated(
      <GatedSection feature="research" label="AI stock research">
        <p>the feature</p>
      </GatedSection>,
    );

    expect(await screen.findByRole("button", { name: "Disable AI stock research" })).toBeInTheDocument();
    expect(screen.getByText("the feature")).toBeInTheDocument();
  });

  // The market pulse is only partly AI: its exchange data must stay on screen even when the AI
  // half is withheld, so that section opts out of the gate.
  it("keeps children visible when gating is switched off", async () => {
    mockStatus({ state: "expired", allowed: false });
    renderGated(
      <GatedSection feature="market-pulse" label="AI market pulse" gate={false}>
        <p>exchange data</p>
      </GatedSection>,
    );

    expect(await screen.findByText("exchange data")).toBeInTheDocument();
    expect(screen.queryByText("AI market pulse is locked")).not.toBeInTheDocument();
  });
});
