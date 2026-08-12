import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { AiGate, FeatureLockToggle, GatedSection, LockPanel } from "../../app/components/ai-gate";
import { SubscriptionProvider } from "../../app/components/subscription-provider";

type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
};

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: MockLinkProps) => (
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
  trialEndsAt: "2026-08-04",
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
    expect(screen.getByText("Choose a plan")).toBeInTheDocument();
    // The children are no longer mounted behind the blur. A panel fetches the moment it renders,
    // and every one of those calls is a 402 the reader never asked for — the console filled with
    // them and the blur only ever covered the resulting error state.
    expect(screen.queryByText("the feature")).not.toBeInTheDocument();
  });

  // The status decides whether a panel may run at all, so nothing runs until it has landed.
  it("holds the feature back until the status says it is allowed", async () => {
    let release: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    ) as unknown as typeof fetch;

    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );

    expect(screen.queryByText("the feature")).not.toBeInTheDocument();

    release({ ok: true, json: async () => baseStatus });
    expect(await screen.findByText("the feature")).toBeInTheDocument();
  });

  // The plans open in place rather than at the end of a link: a visitor who has no account still
  // picks a plan here, and the sign-up form is what the chosen plan carries them into.
  it("offers the plans and sign-in to a visitor who has no account", async () => {
    mockStatus({ state: "expired", allowed: false, tier: null, planName: null, signedIn: false });
    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );

    expect(await screen.findByRole("button", { name: "Choose a plan" })).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toHaveAttribute("href", "/signin");
  });

  it("opens a compact buy modal from the lock with the plan that unlocks the feature", async () => {
    const user = userEvent.setup();
    mockStatus({ state: "expired", allowed: false, tier: null, planName: null });
    renderGated(
      <AiGate feature="research" label="AI stock research">
        <p>the feature</p>
      </AiGate>,
    );

    await user.click(await screen.findByRole("button", { name: "Choose a plan" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Buy Plan");
    expect(dialog).toHaveTextContent("Pro");
    expect(dialog).toHaveTextContent("AI stock research is available on Pro; choose any plan.");
    expect(within(dialog).getByRole("combobox", { name: "Subscription plan" })).toHaveTextContent("Pro");
    expect(within(dialog).getByRole("combobox", { name: "Billing cycle" })).toHaveTextContent("Yearly");
    expect(dialog).toHaveTextContent("Payable now");
    expect(dialog).not.toHaveTextContent("For an active investor running their own screens");
    expect(dialog).not.toHaveTextContent("Starter");
    expect(screen.getByRole("button", { name: "Buy Pro" })).toBeInTheDocument();

    // Closing it puts the reader back on the locked panel rather than on another page.
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("AI stock research is locked")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Choose a plan" })).toBeInTheDocument();
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
