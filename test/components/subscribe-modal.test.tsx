import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { SubscribeModal } from "../../app/components/subscribe-modal";
import { SubscriptionProvider } from "../../app/components/subscription-provider";

// The subscribe button navigates once a payment confirms — the session it holds was minted before
// the purchase, so the reader is signed back in to pick the new plan up. Outside an app-router
// context  throws, and this suite renders that button.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
}));


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
  state: "expired",
  allowed: false,
  isAdmin: false,
  tier: null,
  planName: null,
  marketDaysUsed: 5,
  marketDaysLeft: 0,
  trialStartedAt: "2026-08-01T04:00:00.000Z",
  subscribedUntil: null,
  today: "2026-08-12",
  locks: {},
  features: [],
  signedIn: true,
  name: "Aarav",
};

function mockStatus(overrides: Record<string, unknown> = {}) {
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ...baseStatus, ...overrides }) } as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderModal(ui: React.ReactNode) {
  return render(<SubscriptionProvider>{ui}</SubscriptionProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("SubscribeModal", () => {
  it("stays out of the document until it is opened", () => {
    mockStatus();
    renderModal(<SubscribeModal open={false} onClose={() => {}} feature="research" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the required plan and offers every unsubscribed plan in the dropdown", async () => {
    const user = userEvent.setup();
    mockStatus();
    renderModal(<SubscribeModal open onClose={() => {}} feature="intel" />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Buy Plan");
    expect(within(dialog).getByText("Elite")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("AI intelligence search is available on Elite; choose any plan.");
    expect(within(dialog).getByText("Payable now")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Subscription plan" })).toHaveTextContent("Elite");
    expect(within(dialog).getByRole("combobox", { name: "Billing cycle" })).toHaveTextContent("Yearly");
    expect(within(dialog).getByRole("button", { name: "Buy Elite" })).toBeInTheDocument();
    expect(within(dialog).getByText("\u20b98,091")).toBeInTheDocument();
    expect(within(dialog).getByText("\u20b9674/mo")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "Subscription plan" }));
    expect(within(dialog).getByRole("option", { name: "Starter" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "Pro" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("option", { name: "Pro" }));
    expect(within(dialog).getByText("\u20b93,591")).toBeInTheDocument();
    expect(within(dialog).getByText("\u20b9299/mo")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Buy Pro" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "Subscription plan" }));
    await user.click(within(dialog).getByRole("option", { name: "Starter" }));
    expect(within(dialog).getByText("\u20b91,341")).toBeInTheDocument();
    expect(within(dialog).getByText("\u20b9112/mo")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Buy Starter" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("Direct line to the desk");
  });

  it("uses the required Starter plan when a Starter feature is locked", async () => {
    mockStatus();
    renderModal(<SubscribeModal open onClose={() => {}} feature="news" />);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Starter")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Subscription plan" })).toHaveTextContent("Starter");

    await userEvent.click(within(dialog).getByRole("combobox", { name: "Subscription plan" }));
    expect(within(dialog).getByRole("option", { name: "Pro" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "Elite" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Buy Starter" })).toBeInTheDocument();
  });

  it("offers the plans plainly when it was not opened from a lock", async () => {
    mockStatus();
    renderModal(<SubscribeModal open onClose={() => {}} />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Choose a plan and billing to continue.");
    expect(within(dialog).queryByText(/Unlocks/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Subscription plan" })).toHaveTextContent("Pro");
  });

  it("recalculates the payable card when plan and billing dropdowns change", async () => {
    const user = userEvent.setup();
    mockStatus();
    renderModal(<SubscribeModal open onClose={() => {}} feature="research" />);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("₹3,591")).toBeInTheDocument();
    expect(within(dialog).getAllByText("₹299/mo")).toHaveLength(1);
    expect(dialog).toHaveTextContent("Annual billing saves ₹1,197.");

    await user.click(within(dialog).getByRole("combobox", { name: "Billing cycle" }));
    await user.click(within(dialog).getByRole("option", { name: "Monthly" }));
    expect(within(dialog).getByText("₹399")).toBeInTheDocument();
    expect(within(dialog).getByText("Monthly billing renews each month.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "Subscription plan" }));
    await user.click(within(dialog).getByRole("option", { name: "Elite" }));
    expect(within(dialog).getByText("₹899")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Buy Elite" })).toBeInTheDocument();
  });

  it("applies a promo code quote instantly in the buy modal", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn((url: string) => {
      if (String(url).endsWith("/quote")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            amountRupees: 2873,
            baseAmountRupees: 3591,
            discountRupees: 718,
            discountPercent: 20,
            discountLabel: "20% promo discount",
            appliedCode: "SAVE20",
            message: "20% promo discount applied.",
          }),
        });
      }

      return Promise.resolve({ ok: true, json: async () => ({ ...baseStatus, referralCode: "STKME1234", referralUrl: "https://www.stockersai.com/signup?ref=STKME1234" }) });
    }) as unknown as typeof fetch;

    renderModal(<SubscribeModal open onClose={() => {}} feature="research" />);
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Promo code"), "save20");

    expect(await within(dialog).findByText("\u20b92,873")).toBeInTheDocument();
    expect(within(dialog).getByText("20% promo discount saved \u20b9718.")).toBeInTheDocument();
    expect(within(dialog).getByText("20% promo discount applied.")).toBeInTheDocument();
    expect(within(dialog).getByText(/gives 10% off/)).toBeInTheDocument();
    expect(within(dialog).getByText("STKME1234")).toBeInTheDocument();
  });

  it("names the plan the caller already holds and offers every other plan", async () => {
    mockStatus({ planName: "Pro", tier: "pro", allowed: true, state: "active", subscribedUntil: "2026-09-01" });
    renderModal(<SubscribeModal open onClose={() => {}} feature="intel" />);

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/You are on Pro/)).toBeInTheDocument();
    expect(within(dialog).getByText("Elite")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("combobox", { name: "Subscription plan" }));
    expect(within(dialog).queryByRole("option", { name: "Pro" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "Starter" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Buy Elite" })).toBeInTheDocument();
  });

  it("points a signed-out visitor at sign-in, and sends each plan through sign-up", async () => {
    mockStatus({ signedIn: false });
    renderModal(<SubscribeModal open onClose={() => {}} feature="research" />);

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Sign in")).toHaveAttribute("href", "/signin");
    expect(within(dialog).getByText("Create account & buy")).toHaveAttribute(
      "href",
      "/signup?subscribe=1&plan=pro&cycle=yearly",
    );
  });

  // Once the payment lands the status refetches and the feature unlocks underneath the dialog.
  // Leaving it open would make the reader close a sales page they have already bought from.
  it("confirms and closes itself once the feature is unlocked", async () => {
    const onClose = jest.fn();
    mockStatus({ isAdmin: true, state: "admin", allowed: true, tier: "elite", planName: "Elite" });
    renderModal(<SubscribeModal open onClose={onClose} feature="research" />);

    expect(await screen.findByText(/AI stock research is unlocked/)).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 4000 });
  });

  it("closes when the sheet's own close button is used", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    mockStatus();
    renderModal(<SubscribeModal open onClose={onClose} feature="research" />);

    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
