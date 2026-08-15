import { render, screen } from "@testing-library/react";
import { TrialStatusCard, formatTrialDate } from "../../app/components/trial-status-card";
import { useSubscription } from "../../app/components/subscription-provider";

jest.mock("../../app/components/subscription-provider", () => ({
  useSubscription: jest.fn(),
}));

const subscription = useSubscription as jest.MockedFunction<typeof useSubscription>;

type Status = Partial<{
  state: string;
  signedIn: boolean;
  marketDaysLeft: number;
  trialEndsAt: string | null;
  subscribedUntil: string | null;
  planName: string | null;
}>;

const withStatus = (status: Status | null) => {
  subscription.mockReturnValue({ status } as unknown as ReturnType<typeof useSubscription>);
};

describe("formatTrialDate", () => {
  /**
   * The dates on the status are IST calendar days. Parsing them as local time would render the
   * previous day for anybody behind UTC, which is the whole reason the helper pins the timezone.
   */
  it("renders an IST calendar date as the day the server meant", () => {
    expect(formatTrialDate("2026-08-18")).toBe("18 August 2026");
  });

  it("returns null for a missing or unparseable date rather than 'Invalid Date'", () => {
    expect(formatTrialDate(null)).toBeNull();
    expect(formatTrialDate("not-a-date")).toBeNull();
  });
});

describe("TrialStatusCard", () => {
  // Nothing to say, and three ways of having nothing to say.
  it.each([
    ["the status has not landed yet", null],
    ["the reader is signed out", { state: "trial", signedIn: false, marketDaysLeft: 3 }],
    ["the reader is an admin, who stands outside the paywall", { state: "admin", signedIn: true }],
  ])("draws nothing when %s", (_case, status) => {
    withStatus(status as Status | null);
    const { container } = render(<TrialStatusCard />);

    expect(container).toBeEmptyDOMElement();
  });

  describe("on a live trial", () => {
    it("states the days left and the date the trial ends", () => {
      withStatus({ state: "trial", signedIn: true, marketDaysLeft: 3, trialEndsAt: "2026-08-18" });
      render(<TrialStatusCard />);

      expect(screen.getByText("3 days left")).toBeInTheDocument();
      expect(screen.getByText(/unlocked until 18 August 2026/)).toBeInTheDocument();
    });

    // "1 day left" is not "1 days left", and the difference is the one a reader notices.
    it("says day rather than days on the final day", () => {
      withStatus({ state: "trial", signedIn: true, marketDaysLeft: 1, trialEndsAt: "2026-08-16" });
      render(<TrialStatusCard />);

      expect(screen.getByText("1 day left")).toBeInTheDocument();
    });

    it("still renders without an end date, rather than showing an empty sentence", () => {
      withStatus({ state: "trial", signedIn: true, marketDaysLeft: 2, trialEndsAt: null });
      render(<TrialStatusCard />);

      expect(screen.getByText("2 days left")).toBeInTheDocument();
      expect(screen.getByText(/unlocked for now/)).toBeInTheDocument();
    });

    /**
     * The call to action sharpens on the last day. On day three "See plans" is an invitation; on
     * the final day the reader is about to lose something, and the label should say so.
     */
    it("sharpens the call to action on the last day", () => {
      withStatus({ state: "trial", signedIn: true, marketDaysLeft: 3, trialEndsAt: "2026-08-18" });
      const { unmount } = render(<TrialStatusCard />);
      expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing");
      unmount();

      withStatus({ state: "trial", signedIn: true, marketDaysLeft: 1, trialEndsAt: "2026-08-16" });
      render(<TrialStatusCard />);
      expect(screen.getByRole("link", { name: "Keep your access" })).toHaveAttribute("href", "/pricing");
    });

    it("warms from emerald through amber to rose as the trial runs out", () => {
      const tone = (daysLeft: number) => {
        withStatus({ state: "trial", signedIn: true, marketDaysLeft: daysLeft, trialEndsAt: "2026-08-18" });
        const { container, unmount } = render(<TrialStatusCard />);
        const className = container.querySelector("section")!.className;
        unmount();
        return className;
      };

      expect(tone(3)).toContain("emerald");
      expect(tone(2)).toContain("amber");
      expect(tone(1)).toContain("rose");
    });
  });

  describe("once the trial has ended", () => {
    it("names the date it ended and points at the plans", () => {
      withStatus({ state: "expired", signedIn: true, trialEndsAt: "2026-08-10" });
      render(<TrialStatusCard />);

      expect(screen.getByText(/ran to 10 August 2026/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Choose a plan" })).toHaveAttribute("href", "/pricing");
    });

    /**
     * The boards are public and stay public. Saying so is more honest than a message that reads as
     * though the whole product has been withdrawn — and it is the difference between a reader who
     * keeps using the site and one who leaves.
     */
    it("says the account stepped down to Starter, not that everything stopped", () => {
      withStatus({ state: "expired", signedIn: true, trialEndsAt: "2026-08-10" });
      render(<TrialStatusCard />);

      expect(screen.getByText(/keeps its Starter AI features/)).toBeInTheDocument();
    });

    it("copes with no recorded end date", () => {
      withStatus({ state: "expired", signedIn: true, trialEndsAt: null });
      render(<TrialStatusCard />);

      expect(screen.getByText("Your trial has ended.")).toBeInTheDocument();
    });
  });

  describe("on a paid plan", () => {
    it("names the plan and the date it runs to, in one line", () => {
      withStatus({ state: "active", signedIn: true, planName: "Pro", subscribedUntil: "2026-09-15" });
      render(<TrialStatusCard />);

      expect(screen.getByText(/is active until 15 September 2026/)).toBeInTheDocument();
      expect(screen.getByText("Pro")).toBeInTheDocument();
    });

    it("falls back to a generic name when the plan is not recorded", () => {
      withStatus({ state: "active", signedIn: true, planName: null, subscribedUntil: "2026-09-15" });
      render(<TrialStatusCard />);

      expect(screen.getByText("Your plan")).toBeInTheDocument();
    });

    // Nothing truthful to say without a date, so it says nothing rather than inventing one.
    it("draws nothing when there is no renewal date to report", () => {
      withStatus({ state: "active", signedIn: true, planName: "Pro", subscribedUntil: null });
      const { container } = render(<TrialStatusCard />);

      expect(container).toBeEmptyDOMElement();
    });
  });
});
